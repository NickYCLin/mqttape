import type { ConnectionConfig } from './contracts'

export const MAX_MQTT_KEEPALIVE = 65_535

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
