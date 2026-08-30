import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BrokerProfile,
  CaptureFile,
  ConnectionConfig,
  MqttMessageRecord,
  MqttPacketFlowRecord,
  MqttPublishProperties,
  MqttQos,
  ReplayOptions,
  ReplayProgress,
  StatusEvent,
  TlsFileKind
} from '../../../shared/contracts'
import { MAX_CAPTURE_MESSAGES } from '../../../shared/capture'
import {
  MQTT5_PUBLISH_PROPERTIES_VERSION_ERROR,
  toMqttPublishProperties
} from '../../../shared/mqtt-properties'
import { publishTopicError } from '../../../shared/mqtt-topic'
import { createReplayPlan, replayDelay, replayTimingScale } from '../../../shared/replay'
import { updateMqttPacketFlows } from '../../../shared/packet-flow'
import { defaultMqttLastWill } from '../../../shared/mqtt-will'
import { defaultMqttWebSocketAuth } from '../../../shared/websocket-auth'
import { MqttController } from '../lib/mqtt-controller'
import { readWebProfiles, webSafeConfig, writeWebProfiles } from '../lib/web-profiles'

// Each record keeps the payload twice (Base64 + text), so cap the retained
// wire bytes as well or huge payloads exhaust renderer memory long before
// the message-count limit is reached.
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024
const PROFILES_UPDATED_EVENT = 'mqttape:profiles-updated'

interface ReplayControl {
  cancelled: boolean
  paused: boolean
  wake?: () => void
}

const idleReplay: ReplayProgress = { state: 'idle', sent: 0, total: 0 }

class ReplayCancelledError extends Error {}

async function waitUntilReplayResumes(control: ReplayControl): Promise<void> {
  if (!control.paused) return
  await new Promise<void>((resolve) => {
    control.wake = resolve
  })
  control.wake = undefined
}

async function waitForReplayDelay(milliseconds: number, control: ReplayControl): Promise<void> {
  let remaining = milliseconds
  while (remaining > 0) {
    if (control.cancelled) throw new ReplayCancelledError()
    await waitUntilReplayResumes(control)
    if (control.cancelled) throw new ReplayCancelledError()

    const slice = Math.min(remaining, 100)
    await new Promise((resolve) => window.setTimeout(resolve, slice))
    if (!control.paused) remaining -= slice
  }
}

function captureConnection(config: ConnectionConfig): CaptureFile['connection'] {
  const safeConfig: Partial<ConnectionConfig> = { ...config }
  delete safeConfig.password
  delete safeConfig.caPath
  delete safeConfig.clientCertificatePath
  delete safeConfig.clientKeyPath
  delete safeConfig.clientKeyPassphrase
  delete safeConfig.websocketAuth
  delete safeConfig.websocketHeaders
  delete safeConfig.websocketQueryParameters
  delete safeConfig.will
  return safeConfig as CaptureFile['connection']
}

function defaultConfig(isDesktop: boolean): ConnectionConfig {
  return {
    name: '',
    protocol: isDesktop ? 'mqtt' : 'wss',
    host: '',
    port: isDesktop ? 1883 : 8084,
    path: 'mqtt',
    clientId: `mqttape_${Math.random().toString(16).slice(2, 10)}`,
    username: '',
    password: '',
    mqttVersion: 5,
    clean: true,
    keepalive: 60,
    reconnectPeriod: 1_000,
    rejectUnauthorized: true,
    caPath: '',
    clientCertificatePath: '',
    clientKeyPath: '',
    clientKeyPassphrase: '',
    websocketAuth: defaultMqttWebSocketAuth(),
    websocketHeaders: [],
    websocketQueryParameters: [],
    will: defaultMqttLastWill()
  }
}

export function useMqttSession(sessionId = 'default') {
  const [controller] = useState(() => new MqttController(sessionId))

  const [config, setConfig] = useState<ConnectionConfig>(() => defaultConfig(controller.isDesktop))
  const [status, setStatus] = useState<StatusEvent>({ state: 'disconnected' })
  const [messages, setMessages] = useState<MqttMessageRecord[]>([])
  // Monotonic count of every message this session ever received; the buffer
  // above is trimmed, so its length cannot drive unread badges.
  const [totalMessageCount, setTotalMessageCount] = useState(0)
  const [packetFlows, setPacketFlows] = useState<MqttPacketFlowRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<Map<string, MqttQos>>(new Map())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyOperationsRef = useRef(0)
  const [profiles, setProfiles] = useState<BrokerProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [replayProgress, setReplayProgress] = useState<ReplayProgress>(idleReplay)
  const replayControlRef = useRef<ReplayControl | null>(null)

  useEffect(() => {
    controller.activate()
    const removeStatus = controller.onStatus(setStatus)
    const removeMessage = controller.onMessage((message) => {
      setTotalMessageCount((count) => count + 1)
      setMessages((current) => {
        const next = [message, ...current]
        let retained = next.length > MAX_CAPTURE_MESSAGES ? MAX_CAPTURE_MESSAGES : next.length
        let bytes = 0
        for (let index = 0; index < retained; index += 1) {
          bytes += next[index].size
          if (bytes > MAX_MESSAGE_BYTES && index > 0) {
            retained = index
            break
          }
        }
        return retained < next.length ? next.slice(0, retained) : next
      })
    })
    const removePacket = controller.onPacket((event) => {
      setPacketFlows((current) => updateMqttPacketFlows(current, event))
    })

    return () => {
      if (replayControlRef.current) {
        replayControlRef.current.cancelled = true
        replayControlRef.current.wake?.()
      }
      removeStatus()
      removeMessage()
      removePacket()
      controller.destroy()
    }
  }, [controller])

  useEffect(() => {
    let mounted = true
    const loadProfiles = async (): Promise<void> => {
      try {
        const loaded = window.mqttape
          ? await window.mqttape.listProfiles()
          : readWebProfiles(window.localStorage)
        if (mounted) setProfiles(loaded)
      } catch (reason) {
        if (mounted) setError(reason instanceof Error ? reason.message : String(reason))
      }
    }
    void loadProfiles()
    const handleProfilesUpdated = (): void => { void loadProfiles() }
    window.addEventListener(PROFILES_UPDATED_EVENT, handleProfilesUpdated)
    return () => {
      mounted = false
      window.removeEventListener(PROFILES_UPDATED_EVENT, handleProfilesUpdated)
    }
  }, [])

  const run = useCallback(async (operation: () => Promise<void>): Promise<boolean> => {
    busyOperationsRef.current += 1
    setBusy(true)
    setError('')
    try {
      await operation()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    } finally {
      busyOperationsRef.current = Math.max(0, busyOperationsRef.current - 1)
      if (busyOperationsRef.current === 0) setBusy(false)
    }
  }, [])

  const selectProfile = useCallback((id: string) => {
    setSelectedProfileId(id)
    if (!id) {
      setConfig(defaultConfig(controller.isDesktop))
      return
    }
    const profile = profiles.find((candidate) => candidate.id === id)
    if (profile) setConfig({ ...profile.config })
  }, [controller.isDesktop, profiles])

  const saveProfile = useCallback(async () => {
    if (!config.name.trim()) {
      setError('Profile name is required.')
      return false
    }

    let savedProfile: BrokerProfile | undefined
    const succeeded = await run(async () => {
      if (window.mqttape) {
        savedProfile = await window.mqttape.saveProfile({
          id: selectedProfileId || undefined,
          config
        })
        return
      }

      savedProfile = {
        id: selectedProfileId || window.crypto.randomUUID(),
        config: webSafeConfig({ ...config, name: config.name.trim() }),
        secretsStored: false
      }
      const next = profiles.filter((profile) => profile.id !== savedProfile!.id)
      next.push(savedProfile)
      writeWebProfiles(window.localStorage, next)
    })

    if (!succeeded || !savedProfile) return false
    setProfiles((current) => {
      const next = current.filter((profile) => profile.id !== savedProfile!.id)
      next.push(savedProfile!)
      return next.sort((left, right) => left.config.name.localeCompare(right.config.name))
    })
    setSelectedProfileId(savedProfile.id)
    window.dispatchEvent(new Event(PROFILES_UPDATED_EVENT))
    if (
      window.mqttape &&
      (
        config.password ||
        config.clientKeyPassphrase ||
        config.will?.payload ||
        config.websocketAuth?.secret ||
        config.websocketHeaders?.some(({ value }) => value) ||
        config.websocketQueryParameters?.some(({ value }) => value)
      ) &&
      !savedProfile.secretsStored
    ) {
      setError('Profile saved, but secure OS storage is unavailable; secrets were not stored.')
    }
    return true
  }, [config, profiles, run, selectedProfileId])

  const deleteProfile = useCallback(async () => {
    if (!selectedProfileId) return false
    const succeeded = await run(async () => {
      if (window.mqttape) await window.mqttape.deleteProfile(selectedProfileId)
      else {
        const next = profiles.filter((profile) => profile.id !== selectedProfileId)
        writeWebProfiles(window.localStorage, next)
      }
    })
    if (succeeded) {
      setProfiles((current) => current.filter((profile) => profile.id !== selectedProfileId))
      setSelectedProfileId('')
      setConfig(defaultConfig(controller.isDesktop))
      window.dispatchEvent(new Event(PROFILES_UPDATED_EVENT))
    }
    return succeeded
  }, [controller.isDesktop, profiles, run, selectedProfileId])

  const selectTlsFile = useCallback(async (kind: TlsFileKind): Promise<string | null> => {
    if (!window.mqttape) return null
    try {
      return await window.mqttape.selectTlsFile(kind)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return null
    }
  }, [])

  // Snapshot of the config that actually established the current/most recent
  // connection; live config edits must not affect consumers such as the
  // downlink-history storage namespace.
  const [lastConnectedConfig, setLastConnectedConfig] = useState<ConnectionConfig | null>(null)

  const connect = useCallback(async () => {
    if (await run(() => controller.connect(config))) setLastConnectedConfig(config)
  }, [config, controller, run])

  const disconnect = useCallback(async () => {
    if (await run(() => controller.disconnect())) setSubscriptions(new Map())
  }, [controller, run])

  const subscribe = useCallback(
    async (topic: string, qos: MqttQos) => {
      const normalized = topic.trim()
      if (!normalized) {
        setError('Subscription topic is required.')
        return false
      }
      const succeeded = await run(() => controller.subscribe({ topic: normalized, qos }))
      if (succeeded) {
        setSubscriptions((current) => new Map(current).set(normalized, qos))
      }
      return succeeded
    },
    [controller, run]
  )

  const unsubscribe = useCallback(
    async (topic: string) => {
      const succeeded = await run(() => controller.unsubscribe(topic))
      if (succeeded) {
        setSubscriptions((current) => {
          const next = new Map(current)
          next.delete(topic)
          return next
        })
      }
    },
    [controller, run]
  )

  const publish = useCallback(
    async (
      topic: string,
      payload: string,
      qos: MqttQos,
      retain: boolean,
      properties?: MqttPublishProperties
    ) => {
      const normalizedTopic = topic.trim()
      const topicError = publishTopicError(normalizedTopic)
      if (topicError) {
        setError(topicError)
        return false
      }
      return run(() => controller.publish({
        topic: normalizedTopic,
        payload,
        qos,
        retain,
        properties
      }))
    },
    [controller, run]
  )

  const startReplay = useCallback(
    async (capture: CaptureFile, options: ReplayOptions) => {
      if (status.state !== 'connected') {
        setError('Connect to a broker before replaying a capture.')
        return false
      }
      if (replayControlRef.current) {
        setError('A replay is already running.')
        return false
      }

      const replayPlan = createReplayPlan(capture.messages, options)
      if (replayPlan.length === 0) {
        setError('Select at least one message direction that exists in this capture.')
        return false
      }
      const invalidPlanItem = replayPlan
        .map((item) => ({ item, error: publishTopicError(item.topic) }))
        .find(({ error: topicError }) => topicError)
      if (invalidPlanItem) {
        setError(`Invalid replay topic "${invalidPlanItem.item.topic}": ${invalidPlanItem.error}`)
        return false
      }
      const hasMqtt5PublishProperties = replayPlan.some(({ message }) =>
        toMqttPublishProperties(message.properties) !== undefined
      )
      if (hasMqtt5PublishProperties && config.mqttVersion !== 5) {
        setError(MQTT5_PUBLISH_PROPERTIES_VERSION_ERROR)
        return false
      }

      const control: ReplayControl = { cancelled: false, paused: false }
      replayControlRef.current = control
      setBusy(true)
      setError('')
      setReplayProgress({ state: 'running', sent: 0, total: replayPlan.length })

      try {
        const messagesToReplay = replayPlan.map(({ message }) => message)
        const timingScale = replayTimingScale(messagesToReplay)
        let previousTimestamp = replayPlan[0].message.timestamp

        for (const [index, planItem] of replayPlan.entries()) {
          const { message, topic } = planItem
          if (control.cancelled) throw new ReplayCancelledError()
          if (index > 0) {
            await waitForReplayDelay(
              replayDelay(previousTimestamp, message.timestamp, timingScale, options.speed),
              control
            )
          }

          await waitUntilReplayResumes(control)
          if (control.cancelled) throw new ReplayCancelledError()
          setReplayProgress((current) => ({
            ...current,
            state: 'running',
            currentTopic: topic
          }))
          await controller.publish({
            topic,
            payload: message.payloadText,
            payloadBase64: message.payloadBase64,
            qos: message.qos,
            retain: message.retain,
            properties: toMqttPublishProperties(message.properties)
          })
          previousTimestamp = message.timestamp
          setReplayProgress({
            state: 'running',
            sent: index + 1,
            total: replayPlan.length,
            currentTopic: topic
          })
        }

        setReplayProgress({
          state: 'completed',
          sent: replayPlan.length,
          total: replayPlan.length
        })
        return true
      } catch (reason) {
        if (reason instanceof ReplayCancelledError) {
          setReplayProgress((current) => ({ ...current, state: 'cancelled' }))
          return false
        }
        setError(reason instanceof Error ? reason.message : String(reason))
        setReplayProgress((current) => ({ ...current, state: 'cancelled' }))
        return false
      } finally {
        if (replayControlRef.current === control) replayControlRef.current = null
        setBusy(false)
      }
    },
    [config.mqttVersion, controller, status.state]
  )

  const pauseReplay = useCallback(() => {
    const control = replayControlRef.current
    if (!control || control.paused) return
    control.paused = true
    setReplayProgress((current) => ({ ...current, state: 'paused' }))
  }, [])

  const resumeReplay = useCallback(() => {
    const control = replayControlRef.current
    if (!control || !control.paused) return
    control.paused = false
    control.wake?.()
    setReplayProgress((current) => ({ ...current, state: 'running' }))
  }, [])

  const cancelReplay = useCallback(() => {
    const control = replayControlRef.current
    if (!control) return
    control.cancelled = true
    control.paused = false
    control.wake?.()
  }, [])

  const resetReplay = useCallback(() => {
    if (!replayControlRef.current) setReplayProgress(idleReplay)
  }, [])

  const stats = useMemo(() => {
    let incoming = 0
    let outgoing = 0
    let bytes = 0
    for (const message of messages) {
      if (message.direction === 'incoming') incoming += 1
      else outgoing += 1
      bytes += message.size
    }
    return { incoming, outgoing, bytes }
  }, [messages])

  const makeCapture = useCallback((): CaptureFile => {
    return {
      format: 'mqttape-capture',
      version: 1,
      exportedAt: new Date().toISOString(),
      connection: captureConnection(config),
      messages: [...messages].reverse()
    }
  }, [config, messages])

  return {
    isDesktop: controller.isDesktop,
    config,
    setConfig,
    profiles,
    selectedProfileId,
    selectProfile,
    saveProfile,
    deleteProfile,
    selectTlsFile,
    status,
    messages,
    totalMessageCount,
    lastConnectedConfig,
    packetFlows,
    subscriptions,
    stats,
    error,
    clearError: () => setError(''),
    reportError: setError,
    busy,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    publish,
    replayProgress,
    startReplay,
    pauseReplay,
    resumeReplay,
    cancelReplay,
    resetReplay,
    clearMessages: () => setMessages([]),
    clearPacketFlows: () => setPacketFlows([]),
    makeCapture
  }
}
