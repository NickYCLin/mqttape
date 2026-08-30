import { describe, expect, it } from 'vitest'
import type { ConnectionConfig } from './contracts'
import {
  MAX_MQTT_RECONNECT_PERIOD,
  isConnectionConfigCore,
  mqttConnectionConfigError
} from './connection-config'

function config(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    name: 'Local broker',
    protocol: 'mqtt',
    host: '127.0.0.1',
    port: 1883,
    path: 'mqtt',
    clientId: 'mqttape_validation',
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
    ...overrides
  }
}

describe('MQTT connection config', () => {
  it('recognizes render-safe stored connection config fields', () => {
    expect(isConnectionConfigCore(config())).toBe(true)
    expect(isConnectionConfigCore(config({ protocol: 'mqtt' }), ['ws', 'wss'])).toBe(false)
    expect(isConnectionConfigCore({ ...config(), host: 127 })).toBe(false)
    expect(isConnectionConfigCore({ ...config(), reconnectPeriod: '1000' })).toBe(false)
  })

  it('accepts the MQTT Keep Alive boundary values', () => {
    expect(mqttConnectionConfigError(config({ keepalive: 0 }))).toBeNull()
    expect(mqttConnectionConfigError(config({ keepalive: 65_535 }))).toBeNull()
  })

  it.each([-1, 1.5, 65_536, Number.NaN])(
    'rejects invalid Keep Alive value %s',
    (keepalive) => {
      expect(mqttConnectionConfigError(config({ keepalive })))
        .toBe('Keep Alive must be a whole number from 0 to 65535 seconds.')
    }
  )

  it.each([0, 1.5, 65_536, Number.NaN])('rejects invalid Broker port %s', (port) => {
    expect(mqttConnectionConfigError(config({ port })))
      .toBe('Broker port must be a whole number from 1 to 65535.')
  })

  it('requires a non-empty Broker host', () => {
    expect(mqttConnectionConfigError(config({ host: '  ' })))
      .toBe('Broker host is required.')
  })

  it('requires a Client ID for persistent sessions', () => {
    expect(mqttConnectionConfigError(config({ clean: false, clientId: '  ' })))
      .toBe('Client ID is required when Clean Session is disabled.')
    expect(mqttConnectionConfigError(config({ clean: false, clientId: 'persistent-client' })))
      .toBeNull()
  })

  it('rejects reconnect periods that Node timers cannot represent safely', () => {
    expect(mqttConnectionConfigError(config({ reconnectPeriod: 0 }))).toBeNull()
    expect(mqttConnectionConfigError(config({
      reconnectPeriod: MAX_MQTT_RECONNECT_PERIOD
    }))).toBeNull()
    expect(mqttConnectionConfigError(config({ reconnectPeriod: -1 })))
      .toContain('Reconnect period')
    expect(mqttConnectionConfigError(config({
      reconnectPeriod: MAX_MQTT_RECONNECT_PERIOD + 1
    }))).toContain('Reconnect period')
  })

  it('rejects malformed runtime values before the MQTT client sees them', () => {
    expect(mqttConnectionConfigError(null)).toBe('Connection settings are invalid.')
    expect(mqttConnectionConfigError({ ...config(), protocol: 'ftp' }))
      .toBe('Connection settings are invalid.')
    expect(mqttConnectionConfigError({ ...config(), clean: 'yes' }))
      .toBe('Connection settings are invalid.')
  })
})
