import type { ConnectionConfig, MqttProtocol } from './contracts'

export const MAX_MQTT_KEEPALIVE = 65_535
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

export function mqttConnectionConfigError(config: ConnectionConfig): string | null {
  if (typeof config.host !== 'string' || !config.host.trim()) {
    return 'Broker host is required.'
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
    return 'Broker port must be a whole number from 1 to 65535.'
  }
  if (
    !Number.isInteger(config.keepalive) ||
    config.keepalive < 0 ||
    config.keepalive > MAX_MQTT_KEEPALIVE
  ) {
    return 'Keep Alive must be a whole number from 0 to 65535 seconds.'
  }
  return null
}
