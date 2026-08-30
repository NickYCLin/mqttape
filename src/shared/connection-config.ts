import type { ConnectionConfig, MqttProtocol } from './contracts'

export const MAX_MQTT_KEEPALIVE = 65_535
export const MAX_MQTT_RECONNECT_PERIOD = 2_147_483_647
export const MAX_BROKER_PROFILES = 100
const MQTT_PROTOCOLS: readonly MqttProtocol[] = ['mqtt', 'mqtts', 'ws', 'wss']

export type ConnectionConfigCore = Pick<
  ConnectionConfig,
  | 'name'
  | 'protocol'
  | 'host'
  | 'port'
  | 'path'
  | 'clientId'
  | 'username'
  | 'mqttVersion'
  | 'clean'
  | 'keepalive'
  | 'reconnectPeriod'
  | 'rejectUnauthorized'
>

export function isConnectionConfigCore(
  value: unknown,
  allowedProtocols: readonly MqttProtocol[] = MQTT_PROTOCOLS
): value is ConnectionConfigCore {
  if (!value || typeof value !== 'object') return false
  const config = value as Partial<ConnectionConfigCore>
  return Boolean(
    typeof config.name === 'string' && config.name.trim() &&
    allowedProtocols.includes(config.protocol as MqttProtocol) &&
    typeof config.host === 'string' &&
    typeof config.port === 'number' && Number.isFinite(config.port) &&
    typeof config.path === 'string' &&
    typeof config.clientId === 'string' &&
    typeof config.username === 'string' &&
    (config.mqttVersion === 4 || config.mqttVersion === 5) &&
    typeof config.clean === 'boolean' &&
    typeof config.keepalive === 'number' && Number.isFinite(config.keepalive) &&
    typeof config.reconnectPeriod === 'number' && Number.isFinite(config.reconnectPeriod) &&
    typeof config.rejectUnauthorized === 'boolean'
  )
}

export function mqttConnectionConfigError(config: unknown): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return 'Connection settings are invalid.'
  }
  const candidate = config as Partial<ConnectionConfig>
  if (
    !MQTT_PROTOCOLS.includes(candidate.protocol as MqttProtocol) ||
    typeof candidate.path !== 'string' ||
    typeof candidate.clientId !== 'string' ||
    typeof candidate.username !== 'string' ||
    typeof candidate.password !== 'string' ||
    (candidate.mqttVersion !== 4 && candidate.mqttVersion !== 5) ||
    typeof candidate.clean !== 'boolean' ||
    typeof candidate.rejectUnauthorized !== 'boolean' ||
    typeof candidate.caPath !== 'string' ||
    typeof candidate.clientCertificatePath !== 'string' ||
    typeof candidate.clientKeyPath !== 'string' ||
    typeof candidate.clientKeyPassphrase !== 'string'
  ) {
    return 'Connection settings are invalid.'
  }
  if (typeof candidate.host !== 'string' || !candidate.host.trim()) {
    return 'Broker host is required.'
  }
  if (!Number.isInteger(candidate.port) || Number(candidate.port) < 1 || Number(candidate.port) > 65_535) {
    return 'Broker port must be a whole number from 1 to 65535.'
  }
  if (
    !Number.isInteger(candidate.keepalive) ||
    Number(candidate.keepalive) < 0 ||
    Number(candidate.keepalive) > MAX_MQTT_KEEPALIVE
  ) {
    return 'Keep Alive must be a whole number from 0 to 65535 seconds.'
  }
  if (
    !Number.isInteger(candidate.reconnectPeriod) ||
    Number(candidate.reconnectPeriod) < 0 ||
    Number(candidate.reconnectPeriod) > MAX_MQTT_RECONNECT_PERIOD
  ) {
    return 'Reconnect period must be a whole number from 0 to 2147483647 milliseconds.'
  }
  if (!candidate.clean && !candidate.clientId.trim()) {
    return 'Client ID is required when Clean Session is disabled.'
  }
  return null
}
