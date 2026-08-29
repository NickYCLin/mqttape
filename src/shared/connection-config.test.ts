import { describe, expect, it } from 'vitest'
import type { ConnectionConfig } from './contracts'
import { mqttConnectionConfigError } from './connection-config'

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
})
