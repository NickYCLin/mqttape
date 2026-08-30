import type { IClientPublishOptions, MqttClient } from 'mqtt'
import { Buffer } from 'buffer'
import type {
  ConnectionConfig,
  MqttMessageRecord,
  MqttPacketEvent,
  MqttSessionId,
  PublishRequest,
  StatusEvent,
  SubscribeRequest
} from '../../../shared/contracts'
import { mqttConnectionConfigError } from '../../../shared/connection-config'
import {
  mqttPublishPropertiesProtocolError,
  normalizeMqttPublishProperties,
  toMqttPublishPacketProperties,
  toMqttPublishProperties
} from '../../../shared/mqtt-properties'
import { publishTopicError } from '../../../shared/mqtt-topic'
import { createMqttPacketEvent } from '../../../shared/packet-flow'
import { mqttLastWillOptions } from '../../../shared/mqtt-will'
import {
  appendWebSocketQueryParameters,
  webSocketConnectionError
} from '../../../shared/websocket-auth'

type StatusListener = (event: StatusEvent) => void
type MessageListener = (message: MqttMessageRecord) => void
type PacketListener = (event: MqttPacketEvent) => void

function forceCloseClient(client: MqttClient): void {
  client.end(true)
  client.stream.destroy()
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function brokerEndpoint(config: ConnectionConfig): string {
  const rawHost = config.host.trim()
  const host = rawHost.includes(':') && !rawHost.startsWith('[') ? `[${rawHost}]` : rawHost
  const path = `/${config.path.trim().replace(/^\/+/, '')}`
  return `${config.protocol}://${host}:${config.port}${path}`
}

function brokerUrl(config: ConnectionConfig): string {
  return appendWebSocketQueryParameters(
    brokerEndpoint(config),
    config.websocketQueryParameters
  )
}

export class MqttController {
  private webClient: MqttClient | undefined
  private abortPendingConnect: (() => void) | undefined
  // Invalidates lazy imports and MQTT handshakes when a Web Lite workspace is
  // disconnected or destroyed before the connection has finished.
  private connectEpoch = 0
  private statusListeners = new Set<StatusListener>()
  private messageListeners = new Set<MessageListener>()
  private packetListeners = new Set<PacketListener>()
  private bridgeCleanup: Array<() => void> = []

  constructor(private readonly sessionId: MqttSessionId = 'default') {}

  activate(): void {
    if (window.mqttape && this.bridgeCleanup.length === 0) {
      this.bridgeCleanup = [
        window.mqttape.onStatus((sessionId, event) => {
          if (sessionId === this.sessionId) this.emitStatus(event)
        }),
        window.mqttape.onMessage((sessionId, message) => {
          if (sessionId === this.sessionId) this.emitMessage(message)
        }),
        window.mqttape.onPacket((sessionId, event) => {
          if (sessionId === this.sessionId) this.emitPacket(event)
        })
      ]
    }
  }

  get isDesktop(): boolean {
    return Boolean(window.mqttape)
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onPacket(listener: PacketListener): () => void {
    this.packetListeners.add(listener)
    return () => this.packetListeners.delete(listener)
  }

  async connect(config: ConnectionConfig): Promise<void> {
    if (window.mqttape) {
      await window.mqttape.connect(this.sessionId, config)
      return
    }

    if (config.protocol !== 'ws' && config.protocol !== 'wss') {
      throw new Error('Web Lite only supports MQTT over WebSocket (ws/wss).')
    }
    const connectionError = mqttConnectionConfigError(config)
    if (connectionError) throw new Error(connectionError)
    const webSocketError = webSocketConnectionError(config, false)
    if (webSocketError) throw new Error(webSocketError)

    const epoch = this.connectEpoch + 1
    await this.disconnect()
    if (epoch !== this.connectEpoch) {
      throw new Error('The MQTT session was closed before the connection started.')
    }
    // Validate the Last Will before reporting "connecting": a thrown error after
    // that status would leave the session stuck with no way to retry.
    const will = mqttLastWillOptions(config.will, config.mqttVersion)
    this.emitStatus({ state: 'connecting', detail: brokerEndpoint(config) })

    let mqtt: typeof import('mqtt').default
    try {
      mqtt = (await import('mqtt')).default
    } catch (error) {
      if (epoch === this.connectEpoch) {
        this.emitStatus({
          state: 'error',
          detail: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
    if (epoch !== this.connectEpoch) {
      throw new Error('The MQTT session was closed before the connection started.')
    }
    const client = mqtt.connect(brokerUrl(config), {
      clientId: config.clientId || undefined,
      username: config.username || undefined,
      password: config.password || undefined,
      protocolVersion: config.mqttVersion,
      clean: config.clean,
      keepalive: config.keepalive,
      reconnectPeriod: config.reconnectPeriod,
      connectTimeout: 15_000,
      rejectUnauthorized: config.rejectUnauthorized,
      resubscribe: true,
      ...(will
        ? {
            will: {
              ...will,
              payload: Buffer.from(will.payload)
            }
          }
        : {})
    })
    this.webClient = client
    this.bindWebEvents(client, config)

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        rejectConnection(new Error('Connection timed out after 15 seconds.'))
      }, 15_000)
      const handleConnect = (): void => {
        cleanup()
        resolve()
      }
      const handleError = (error: Error): void => {
        rejectConnection(error)
      }
      const handleClose = (): void => {
        rejectConnection(
          new Error('The MQTT session was closed before the connection started.'),
          false
        )
      }
      const abort = (): void => {
        rejectConnection(new Error('The MQTT session was closed before the connection started.'))
      }
      const rejectConnection = (error: Error, forceClose = true): void => {
        cleanup()
        if (this.webClient === client) this.webClient = undefined
        if (forceClose) forceCloseClient(client)
        reject(error)
      }
      const cleanup = (): void => {
        window.clearTimeout(timeout)
        client.off('connect', handleConnect)
        client.off('error', handleError)
        client.off('close', handleClose)
        if (this.abortPendingConnect === abort) this.abortPendingConnect = undefined
      }

      this.abortPendingConnect = abort
      client.once('connect', handleConnect)
      client.once('error', handleError)
      client.once('close', handleClose)
    })
  }

  async disconnect(): Promise<void> {
    this.connectEpoch += 1
    if (window.mqttape) {
      await window.mqttape.disconnect(this.sessionId)
      return
    }

    const abortPendingConnect = this.abortPendingConnect
    if (abortPendingConnect) {
      abortPendingConnect()
      this.emitStatus({ state: 'disconnected' })
      return
    }
    const client = this.webClient
    this.webClient = undefined
    if (!client) return

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (error) reject(error)
        else resolve()
      }
      const timeout = window.setTimeout(() => {
        forceCloseClient(client)
        finish()
      }, 2_000)
      client.end(false, {}, (error) => finish(error ?? undefined))
    })
    this.emitStatus({ state: 'disconnected' })
  }

  async subscribe(request: SubscribeRequest): Promise<void> {
    if (window.mqttape) return window.mqttape.subscribe(this.sessionId, request)
    const client = this.requireWebClient()

    await new Promise<void>((resolve, reject) => {
      client.subscribe(request.topic, { qos: request.qos }, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  async unsubscribe(topic: string): Promise<void> {
    if (window.mqttape) return window.mqttape.unsubscribe(this.sessionId, topic)
    const client = this.requireWebClient()

    await new Promise<void>((resolve, reject) => {
      client.unsubscribe(topic, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  async publish(request: PublishRequest): Promise<void> {
    if (window.mqttape) return window.mqttape.publish(this.sessionId, request)
    const client = this.requireWebClient()
    const topic = request.topic.trim()
    const topicError = publishTopicError(topic)
    if (topicError) throw new Error(topicError)
    const mqttVersion = client.options.protocolVersion === 5 ? 5 : 4
    const propertiesError = mqttPublishPropertiesProtocolError(mqttVersion, request.properties)
    if (propertiesError) throw new Error(propertiesError)
    const properties = toMqttPublishPacketProperties(
      request.properties,
      (base64) => Buffer.from(base64, 'base64')
    )
    const options: IClientPublishOptions = {
      qos: request.qos,
      retain: request.retain,
      ...(properties ? { properties } : {})
    }
    const payload = request.payloadBase64
      ? Buffer.from(base64ToBytes(request.payloadBase64))
      : Buffer.from(request.payload, 'utf8')

    await new Promise<void>((resolve, reject) => {
      client.publish(
        topic,
        payload,
        options,
        (error) => {
          if (error) {
            reject(error)
            return
          }
          this.emitMessage({
            id: createId(),
            direction: 'outgoing',
            timestamp: new Date().toISOString(),
            topic,
            qos: request.qos,
            retain: request.retain,
            duplicate: false,
            payloadBase64: bytesToBase64(payload),
            payloadText: request.payloadBase64
              ? new TextDecoder().decode(payload)
              : request.payload,
            size: payload.byteLength,
            properties: toMqttPublishProperties(request.properties)
          })
          resolve()
        }
      )
    })
  }

  destroy(force = false): void {
    this.connectEpoch += 1
    this.bridgeCleanup.forEach((cleanup) => cleanup())
    this.bridgeCleanup = []
    if (window.mqttape) void window.mqttape.destroySession(this.sessionId).catch(() => {})
    else if (this.abortPendingConnect) this.abortPendingConnect()
    else this.webClient?.end(force)
    this.webClient = undefined
  }

  private bindWebEvents(client: MqttClient, config: ConnectionConfig): void {
    client.on('connect', () => {
      if (this.webClient === client) {
        this.emitStatus({ state: 'connected', detail: brokerEndpoint(config) })
      }
    })
    client.on('reconnect', () => {
      if (this.webClient === client) this.emitStatus({ state: 'reconnecting' })
    })
    client.on('offline', () => {
      if (this.webClient === client) this.emitStatus({ state: 'offline' })
    })
    client.on('close', () => {
      if (this.webClient === client) this.emitStatus({ state: 'disconnected' })
    })
    client.on('error', (error) => {
      if (this.webClient === client) {
        this.emitStatus({ state: 'error', detail: error.message })
      }
    })
    client.on('packetsend', (packet) => {
      if (this.webClient !== client) return
      const event = createMqttPacketEvent(packet, 'sent')
      if (event) this.emitPacket(event)
    })
    client.on('packetreceive', (packet) => {
      if (this.webClient !== client) return
      const event = createMqttPacketEvent(packet, 'received')
      if (event) this.emitPacket(event)
    })
    client.on('message', (topic, payload, packet) => {
      if (this.webClient !== client) return
      const bytes = new Uint8Array(payload)
      this.emitMessage({
        id: createId(),
        direction: 'incoming',
        timestamp: new Date().toISOString(),
        topic,
        qos: packet.qos,
        retain: packet.retain,
        duplicate: packet.dup,
        payloadBase64: bytesToBase64(bytes),
        payloadText: new TextDecoder().decode(bytes),
        size: bytes.byteLength,
        properties: normalizeMqttPublishProperties(packet.properties, bytesToBase64)
      })
    })
  }

  private requireWebClient(): MqttClient {
    if (!this.webClient?.connected) throw new Error('Connect to a broker first.')
    return this.webClient
  }

  private emitStatus(event: StatusEvent): void {
    this.statusListeners.forEach((listener) => listener(event))
  }

  private emitMessage(message: MqttMessageRecord): void {
    this.messageListeners.forEach((listener) => listener(message))
  }

  private emitPacket(event: MqttPacketEvent): void {
    this.packetListeners.forEach((listener) => listener(event))
  }
}
