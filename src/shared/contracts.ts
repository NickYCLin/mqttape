import type { LoRaWanDownlinkHistoryFile } from './lorawan-downlink-history'

export type MqttProtocol = 'mqtt' | 'mqtts' | 'ws' | 'wss'
export type MqttQos = 0 | 1 | 2
export type MqttVersion = 4 | 5
export type MqttSessionId = string
export type MqttWillPayloadFormat = 'text' | 'hex' | 'base64'
export type MqttWebSocketAuthMode = 'none' | 'basic' | 'bearer'
export type TlsFileKind = 'ca' | 'certificate' | 'key'
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'error'

export interface ConnectionConfig {
  name: string
  protocol: MqttProtocol
  host: string
  port: number
  path: string
  clientId: string
  username: string
  password: string
  mqttVersion: MqttVersion
  clean: boolean
  keepalive: number
  reconnectPeriod: number
  rejectUnauthorized: boolean
  caPath: string
  clientCertificatePath: string
  clientKeyPath: string
  clientKeyPassphrase: string
  websocketAuth?: MqttWebSocketAuth
  websocketHeaders?: MqttWebSocketNameValue[]
  websocketQueryParameters?: MqttWebSocketNameValue[]
  will?: MqttLastWillConfig
}

export interface MqttWebSocketAuth {
  mode: MqttWebSocketAuthMode
  username: string
  secret: string
}

export interface MqttWebSocketNameValue {
  name: string
  value: string
}

export interface MqttLastWillConfig {
  enabled: boolean
  topic: string
  payload: string
  payloadFormat: MqttWillPayloadFormat
  qos: MqttQos
  retain: boolean
  willDelayInterval?: number
  messageExpiryInterval?: number
  contentType?: string
}

export interface PublishRequest {
  topic: string
  payload: string
  payloadBase64?: string
  qos: MqttQos
  retain: boolean
  properties?: MqttPublishProperties
}

export interface SubscribeRequest {
  topic: string
  qos: MqttQos
}

export interface MqttUserProperty {
  name: string
  value: string
}

export interface MqttPublishProperties {
  payloadFormatIndicator?: boolean
  messageExpiryInterval?: number
  responseTopic?: string
  correlationDataBase64?: string
  userProperties?: MqttUserProperty[]
  contentType?: string
}

export interface MqttMessageProperties extends MqttPublishProperties {
  topicAlias?: number
  subscriptionIdentifiers?: number[]
}

export interface MqttMessageRecord {
  id: string
  direction: 'incoming' | 'outgoing'
  timestamp: string
  topic: string
  qos: MqttQos
  retain: boolean
  duplicate: boolean
  payloadBase64: string
  payloadText: string
  size: number
  properties?: MqttMessageProperties
}

export type MqttPacketCommand = 'publish' | 'puback' | 'pubrec' | 'pubrel' | 'pubcomp'
export type MqttPacketDirection = 'sent' | 'received'
export type MqttPacketFlowState = 'pending' | 'completed' | 'failed'

export interface MqttPacketEvent {
  id: string
  timestamp: string
  direction: MqttPacketDirection
  command: MqttPacketCommand
  messageId?: number
  qos?: MqttQos
  topic?: string
  duplicate?: boolean
  reasonCode?: number
}

export interface MqttPacketFlowRecord {
  id: string
  messageId?: number
  messageDirection: MqttMessageRecord['direction']
  topic: string
  qos: MqttQos
  startedAt: string
  updatedAt: string
  completedAt?: string
  state: MqttPacketFlowState
  steps: MqttPacketEvent[]
}

export interface StatusEvent {
  state: ConnectionState
  detail?: string
}

export interface CaptureFile {
  format: 'mqttape-capture'
  version: 1
  exportedAt: string
  connection: Omit<
    ConnectionConfig,
    | 'password'
    | 'caPath'
    | 'clientCertificatePath'
    | 'clientKeyPath'
    | 'clientKeyPassphrase'
    | 'websocketAuth'
    | 'websocketHeaders'
    | 'websocketQueryParameters'
    | 'will'
  >
  messages: MqttMessageRecord[]
}

export interface BrokerProfile {
  id: string
  config: ConnectionConfig
  secretsStored: boolean
}

export interface SaveBrokerProfileRequest {
  id?: string
  config: ConnectionConfig
}

export interface ReplayOptions {
  includeIncoming: boolean
  includeOutgoing: boolean
  speed: number
  topicRemap?: ReplayTopicRemap
}

export interface ReplayPreset {
  id: string
  name: string
  options: ReplayOptions
}

export interface ReplayTopicRemap {
  fromPrefix: string
  toPrefix: string
}

export type ReplayState = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled'

export type UpdateMode = 'automatic' | 'manual' | 'disabled'
export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
export type UpdateSupportReason =
  | 'development'
  | 'microsoft-store'
  | 'portable'
  | 'unsupported-architecture'
  | 'unsigned-macos'
  | 'unsupported-package'

export interface AppUpdateStatus {
  mode: UpdateMode
  state: UpdateState
  currentVersion: string
  targetVersion?: string
  progress?: number
  reason?: UpdateSupportReason
}

export interface ReplayProgress {
  state: ReplayState
  sent: number
  total: number
  currentTopic?: string
}

export interface MqttapeBridge {
  connect(sessionId: MqttSessionId, config: ConnectionConfig): Promise<void>
  disconnect(sessionId: MqttSessionId): Promise<void>
  destroySession(sessionId: MqttSessionId): Promise<void>
  subscribe(sessionId: MqttSessionId, request: SubscribeRequest): Promise<void>
  unsubscribe(sessionId: MqttSessionId, topic: string): Promise<void>
  publish(sessionId: MqttSessionId, request: PublishRequest): Promise<void>
  saveCapture(capture: CaptureFile): Promise<boolean>
  saveDownlinkHistory(history: LoRaWanDownlinkHistoryFile): Promise<boolean>
  listProfiles(): Promise<BrokerProfile[]>
  saveProfile(request: SaveBrokerProfileRequest): Promise<BrokerProfile>
  deleteProfile(id: string): Promise<void>
  selectTlsFile(kind: TlsFileKind): Promise<string | null>
  getUpdateStatus(): Promise<AppUpdateStatus>
  checkForUpdates(): Promise<AppUpdateStatus>
  installUpdate(): Promise<boolean>
  onStatus(listener: (sessionId: MqttSessionId, event: StatusEvent) => void): () => void
  onMessage(listener: (sessionId: MqttSessionId, message: MqttMessageRecord) => void): () => void
  onPacket(listener: (sessionId: MqttSessionId, event: MqttPacketEvent) => void): () => void
  onUpdateStatus(listener: (status: AppUpdateStatus) => void): () => void
}
