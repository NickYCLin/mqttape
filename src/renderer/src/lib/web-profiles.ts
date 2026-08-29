import type {
  BrokerProfile,
  ConnectionConfig,
  MqttLastWillConfig,
  MqttWebSocketAuth,
  MqttWebSocketNameValue
} from '../../../shared/contracts'
import { defaultMqttWebSocketAuth } from '../../../shared/websocket-auth'

export const WEB_PROFILE_STORAGE_KEY = 'mqttape:profiles:v1'

type ProfileReader = Pick<Storage, 'getItem'>
type ProfileWriter = Pick<Storage, 'setItem'>

function webSafeNameValues(value: unknown): MqttWebSocketNameValue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => (
    item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'
      ? [{ name: (item as { name: string }).name, value: '' }]
      : []
  ))
}

function webSafeAuth(value: unknown): MqttWebSocketAuth {
  if (!value || typeof value !== 'object') return defaultMqttWebSocketAuth()
  const auth = value as Partial<MqttWebSocketAuth>
  if (auth.mode !== 'none' && auth.mode !== 'basic' && auth.mode !== 'bearer') {
    return defaultMqttWebSocketAuth()
  }
  return {
    mode: auth.mode,
    username: typeof auth.username === 'string' ? auth.username : '',
    secret: ''
  }
}

function webSafeWill(value: unknown): MqttLastWillConfig | undefined {
  if (!value || typeof value !== 'object') return undefined
  const will = value as Partial<MqttLastWillConfig>
  if (
    typeof will.enabled !== 'boolean' ||
    typeof will.topic !== 'string' ||
    (will.payloadFormat !== 'text' && will.payloadFormat !== 'hex' &&
      will.payloadFormat !== 'base64') ||
    (will.qos !== 0 && will.qos !== 1 && will.qos !== 2) ||
    typeof will.retain !== 'boolean'
  ) return undefined

  return {
    enabled: will.enabled,
    topic: will.topic,
    payload: '',
    payloadFormat: will.payloadFormat,
    qos: will.qos,
    retain: will.retain,
    ...(typeof will.willDelayInterval === 'number'
      ? { willDelayInterval: will.willDelayInterval }
      : {}),
    ...(typeof will.messageExpiryInterval === 'number'
      ? { messageExpiryInterval: will.messageExpiryInterval }
      : {}),
    ...(typeof will.contentType === 'string' ? { contentType: will.contentType } : {})
  }
}

export function webSafeConfig(config: ConnectionConfig): ConnectionConfig {
  const will = webSafeWill(config.will)
  return {
    ...config,
    password: '',
    rejectUnauthorized: true,
    caPath: '',
    clientCertificatePath: '',
    clientKeyPath: '',
    clientKeyPassphrase: '',
    websocketAuth: webSafeAuth(config.websocketAuth),
    websocketHeaders: webSafeNameValues(config.websocketHeaders),
    websocketQueryParameters: webSafeNameValues(config.websocketQueryParameters),
    will
  }
}

function normalizeWebProfile(value: unknown): BrokerProfile | null {
  if (!value || typeof value !== 'object') return null
  const profile = value as Partial<BrokerProfile>
  const id = typeof profile.id === 'string' ? profile.id.trim() : ''
  if (!id) return null
  if (!profile.config || typeof profile.config !== 'object') return null
  const config = profile.config as Partial<ConnectionConfig>
  const name = typeof config.name === 'string' ? config.name.trim() : ''
  if (
    !name ||
    (config.protocol !== 'ws' && config.protocol !== 'wss') ||
    typeof config.host !== 'string' ||
    typeof config.port !== 'number' ||
    !Number.isFinite(config.port) ||
    typeof config.path !== 'string' ||
    typeof config.clientId !== 'string' ||
    typeof config.username !== 'string' ||
    (config.mqttVersion !== 4 && config.mqttVersion !== 5) ||
    typeof config.clean !== 'boolean' ||
    typeof config.keepalive !== 'number' ||
    !Number.isFinite(config.keepalive) ||
    typeof config.reconnectPeriod !== 'number' ||
    !Number.isFinite(config.reconnectPeriod)
  ) return null
  return {
    id,
    config: webSafeConfig({ ...profile.config, name }),
    secretsStored: false
  }
}

export function readWebProfiles(storage: ProfileReader): BrokerProfile[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(WEB_PROFILE_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []

    const profiles: BrokerProfile[] = []
    const ids = new Set<string>()
    for (const value of parsed) {
      const profile = normalizeWebProfile(value)
      if (!profile || ids.has(profile.id)) continue
      ids.add(profile.id)
      profiles.push(profile)
    }
    return profiles
  } catch {
    return []
  }
}

export function writeWebProfiles(storage: ProfileWriter, profiles: BrokerProfile[]): void {
  const safeProfiles = profiles.map((profile) => ({
    id: profile.id,
    config: webSafeConfig(profile.config),
    secretsStored: false
  }))
  storage.setItem(WEB_PROFILE_STORAGE_KEY, JSON.stringify(safeProfiles))
}
