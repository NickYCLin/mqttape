import mqtt, {
  type IClientOptions,
  type IClientPublishOptions,
  type MqttClient,
  type Packet
} from 'mqtt'
import { readFile } from 'node:fs/promises'
import type {
  ConnectionConfig,
  MqttMessageRecord,
  MqttPacketEvent,
  MqttQos,
  PublishRequest,
  StatusEvent,
  SubscribeRequest
} from '../shared/contracts'
import { mqttConnectionConfigError } from '../shared/connection-config'
import { createMessageId } from '../shared/message'
import {
  mqttPublishPropertiesProtocolError,
  normalizeMqttPublishProperties,
  toMqttPublishPacketProperties,
  toMqttPublishProperties,
  type RawMqttPublishProperties
} from '../shared/mqtt-properties'
import { publishTopicError } from '../shared/mqtt-topic'
import { createMqttPacketEvent } from '../shared/packet-flow'
import { mqttLastWillOptions } from '../shared/mqtt-will'
import {
  appendWebSocketQueryParameters,
  activeWebSocketValues,
  defaultMqttWebSocketAuth,
  webSocketConnectionError
} from '../shared/websocket-auth'

type StatusListener = (event: StatusEvent) => void
type MessageListener = (message: MqttMessageRecord) => void
type PacketListener = (event: MqttPacketEvent) => void
type SecureClientOptions = IClientOptions & {
  passphrase?: string
  wsOptions?: { headers?: Record<string, string> }
}

export function buildBrokerUrl(config: ConnectionConfig): string {
  const rawHost = config.host.trim()
  const host = rawHost.includes(':') && !rawHost.startsWith('[') ? `[${rawHost}]` : rawHost
  const path = config.protocol === 'ws' || config.protocol === 'wss'
    ? `/${config.path.trim().replace(/^\/+/, '')}`
    : ''
  const endpoint = `${config.protocol}://${host}:${config.port}${path}`
  return config.protocol === 'ws' || config.protocol === 'wss'
    ? appendWebSocketQueryParameters(endpoint, config.websocketQueryParameters)
    : endpoint
}

export async function createClientOptions(config: ConnectionConfig): Promise<IClientOptions> {
  const webSocketError = webSocketConnectionError(config, true)
  if (webSocketError) throw new Error(webSocketError)
  const options: SecureClientOptions = {
    clientId: config.clientId || undefined,
    username: config.username || undefined,
    password: config.password || undefined,
    protocolVersion: config.mqttVersion,
    clean: config.clean,
    keepalive: config.keepalive,
    reconnectPeriod: config.reconnectPeriod,
    connectTimeout: 15_000,
    rejectUnauthorized: config.rejectUnauthorized,
    resubscribe: true
  }
  const will = mqttLastWillOptions(config.will, config.mqttVersion)
  if (will) {
    options.will = {
      ...will,
      payload: Buffer.from(will.payload)
    }
  }

  const secureProtocol = config.protocol === 'mqtts' || config.protocol === 'wss'
  const hasTlsFiles = Boolean(
    config.caPath || config.clientCertificatePath || config.clientKeyPath
  )
  if (hasTlsFiles && !secureProtocol) {
    throw new Error('Custom TLS files require mqtts or wss.')
  }
  if (Boolean(config.clientCertificatePath) !== Boolean(config.clientKeyPath)) {
    throw new Error('Client certificate and private key must be selected together.')
  }

  if (config.caPath) options.ca = await readFile(config.caPath)
  if (config.clientCertificatePath) options.cert = await readFile(config.clientCertificatePath)
  if (config.clientKeyPath) options.key = await readFile(config.clientKeyPath)
  if (config.clientKeyPassphrase) options.passphrase = config.clientKeyPassphrase

  if (config.protocol === 'ws' || config.protocol === 'wss') {
    const headers = Object.fromEntries(
      activeWebSocketValues(config.websocketHeaders).map(({ name, value }) => [name.trim(), value])
    )
    const auth = config.websocketAuth ?? defaultMqttWebSocketAuth()
    if (auth.mode === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.secret}`).toString('base64')}`
    } else if (auth.mode === 'bearer') {
      headers.Authorization = `Bearer ${auth.secret}`
    }
    if (Object.keys(headers).length > 0) options.wsOptions = { headers }
  }
  return options
}

export class MqttService {
  private client: MqttClient | undefined
  // Bumped by every disconnect so an in-flight connect can tell that the
  // session moved on while it was reading TLS files off disk.
  private connectEpoch = 0
  private statusListener: StatusListener
  private messageListener: MessageListener
  private packetListener: PacketListener

  constructor(
    statusListener: StatusListener,
    messageListener: MessageListener,
    packetListener: PacketListener = () => undefined
  ) {
    this.statusListener = statusListener
    this.messageListener = messageListener
    this.packetListener = packetListener
  }

  async connect(config: ConnectionConfig): Promise<void> {
    await this.disconnect()
    const epoch = this.connectEpoch
    this.validateConfig(config)
    this.statusListener({ state: 'connecting', detail: this.describeEndpoint(config) })

    let options: IClientOptions
    try {
      options = await createClientOptions(config)
    } catch (error) {
      // Without a terminal status the session stays on "connecting" forever
      // and the Connect button never comes back.
      if (epoch === this.connectEpoch) {
        this.statusListener({
          state: 'error',
          detail: error instanceof Error ? error.message : String(error)
        })
      }
      throw error
    }
    if (epoch !== this.connectEpoch) {
      throw new Error('The MQTT session was closed before the connection started.')
    }

    const client = mqtt.connect(buildBrokerUrl(config), options)
    this.client = client
    this.bindEvents(client, config)

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        client.end(true)
        reject(new Error('Connection timed out after 15 seconds.'))
      }, 15_000)

      const handleConnect = (): void => {
        cleanup()
        resolve()
      }

      const handleError = (error: Error): void => {
        cleanup()
        client.end(true)
        reject(error)
      }

      const cleanup = (): void => {
        clearTimeout(timeout)
        client.off('connect', handleConnect)
        client.off('error', handleError)
      }

      client.once('connect', handleConnect)
      client.once('error', handleError)
    })
  }

  async disconnect(): Promise<void> {
    this.connectEpoch += 1
    const client = this.client
    this.client = undefined

    if (!client) return

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2_000)
      client.end(false, {}, () => {
        clearTimeout(timeout)
        resolve()
      })
    })
    this.statusListener({ state: 'disconnected' })
  }

  async subscribe(request: SubscribeRequest): Promise<void> {
    const client = this.requireConnectedClient()
    const topic = request.topic.trim()
    if (!topic) throw new Error('Subscription topic is required.')

    await new Promise<void>((resolve, reject) => {
      client.subscribe(topic, { qos: request.qos }, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  async unsubscribe(topic: string): Promise<void> {
    const client = this.requireConnectedClient()
    const normalized = topic.trim()
    if (!normalized) return

    await new Promise<void>((resolve, reject) => {
      client.unsubscribe(normalized, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  async publish(request: PublishRequest): Promise<void> {
    const client = this.requireConnectedClient()
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
      ? Buffer.from(request.payloadBase64, 'base64')
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

          this.messageListener({
            id: createMessageId(),
            direction: 'outgoing',
            timestamp: new Date().toISOString(),
            topic,
            qos: request.qos,
            retain: request.retain,
            duplicate: false,
            payloadBase64: payload.toString('base64'),
            payloadText: request.payloadBase64 ? payload.toString('utf8') : request.payload,
            size: payload.byteLength,
            properties: toMqttPublishProperties(request.properties)
          })
          resolve()
        }
      )
    })
  }

  private bindEvents(client: MqttClient, config: ConnectionConfig): void {
    client.on('connect', () => {
      this.statusListener({ state: 'connected', detail: this.describeEndpoint(config) })
    })
    client.on('reconnect', () => this.statusListener({ state: 'reconnecting' }))
    client.on('offline', () => this.statusListener({ state: 'offline' }))
    client.on('close', () => {
      if (this.client === client) this.statusListener({ state: 'disconnected' })
    })
    client.on('error', (error) => {
      if (this.client === client) this.statusListener({ state: 'error', detail: error.message })
    })
    client.on('packetsend', (packet) => {
      const event = createMqttPacketEvent(packet, 'sent')
      if (event) this.packetListener(event)
    })
    client.on('packetreceive', (packet) => {
      const event = createMqttPacketEvent(packet, 'received')
      if (event) this.packetListener(event)
    })
    client.on('message', (topic, payload, packet) => {
      this.messageListener(this.toIncomingMessage(topic, payload, packet))
    })
  }

  private toIncomingMessage(
    topic: string,
    payload: Buffer,
    packet: Packet
  ): MqttMessageRecord {
    const publishPacket = packet as Packet & {
      qos?: MqttQos
      retain?: boolean
      dup?: boolean
      properties?: RawMqttPublishProperties
    }

    return {
      id: createMessageId(),
      direction: 'incoming',
      timestamp: new Date().toISOString(),
      topic,
      qos: publishPacket.qos ?? 0,
      retain: publishPacket.retain ?? false,
      duplicate: publishPacket.dup ?? false,
      payloadBase64: payload.toString('base64'),
      payloadText: payload.toString('utf8'),
      size: payload.byteLength,
      properties: normalizeMqttPublishProperties(
        publishPacket.properties,
        (bytes) => Buffer.from(bytes).toString('base64')
      )
    }
  }

  private requireConnectedClient(): MqttClient {
    if (!this.client?.connected) throw new Error('Connect to a broker first.')
    return this.client
  }

  private validateConfig(config: ConnectionConfig): void {
    const connectionError = mqttConnectionConfigError(config)
    if (connectionError) throw new Error(connectionError)
    const webSocketError = webSocketConnectionError(config, true)
    if (webSocketError) throw new Error(webSocketError)
    mqttLastWillOptions(config.will, config.mqttVersion)
  }

  private describeEndpoint(config: ConnectionConfig): string {
    return `${config.protocol}://${config.host}:${config.port}`
  }
}
