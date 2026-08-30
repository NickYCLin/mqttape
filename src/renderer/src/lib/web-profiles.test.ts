import { describe, expect, it } from 'vitest'
import type { BrokerProfile, ConnectionConfig } from '../../../shared/contracts'
import {
  readWebProfiles,
  WEB_PROFILE_STORAGE_KEY,
  writeWebProfiles
} from './web-profiles'

function config(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    name: 'Production broker',
    protocol: 'wss',
    host: 'broker.example.com',
    port: 8084,
    path: 'mqtt',
    clientId: 'mqttape_profile',
    username: 'device',
    password: 'broker-secret',
    mqttVersion: 5,
    clean: true,
    keepalive: 60,
    reconnectPeriod: 1_000,
    rejectUnauthorized: false,
    caPath: '/secret/ca.pem',
    clientCertificatePath: '/secret/client.pem',
    clientKeyPath: '/secret/client.key',
    clientKeyPassphrase: 'key-secret',
    websocketAuth: { mode: 'bearer', username: '', secret: 'bearer-secret' },
    websocketHeaders: [{ name: 'X-API-Key', value: 'header-secret' }],
    websocketQueryParameters: [{ name: 'access_token', value: 'query-secret' }],
    will: {
      enabled: true,
      topic: 'devices/status',
      payload: 'will-secret',
      payloadFormat: 'text',
      qos: 1,
      retain: true
    },
    ...overrides
  }
}

function profile(id: string, overrides: Partial<ConnectionConfig> = {}): BrokerProfile {
  return { id, config: config(overrides), secretsStored: false }
}

function storage(initial?: unknown) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(WEB_PROFILE_STORAGE_KEY, JSON.stringify(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  }
}

describe('Web broker profiles', () => {
  it('writes profiles without secrets or desktop-only paths', () => {
    const target = storage()
    writeWebProfiles(target, [profile('profile-1')])

    const raw = target.getItem(WEB_PROFILE_STORAGE_KEY) ?? ''
    expect(raw).not.toContain('broker-secret')
    expect(raw).not.toContain('key-secret')
    expect(raw).not.toContain('bearer-secret')
    expect(raw).not.toContain('header-secret')
    expect(raw).not.toContain('query-secret')
    expect(raw).not.toContain('will-secret')
    expect(raw).not.toContain('/secret/')
  })

  it('keeps valid profiles when another profile has malformed optional fields', () => {
    const malformed = {
      ...profile('malformed'),
      config: {
        ...config({ name: 'Recoverable profile' }),
        websocketAuth: 'invalid',
        websocketHeaders: 'invalid',
        websocketQueryParameters: [{ name: 'region', value: 123 }],
        will: 'invalid'
      }
    }
    const profiles = readWebProfiles(storage([profile('valid'), malformed]))

    expect(profiles.map(({ id }) => id)).toEqual(['valid', 'malformed'])
    expect(profiles[1].config.websocketAuth).toEqual({ mode: 'none', username: '', secret: '' })
    expect(profiles[1].config.websocketHeaders).toEqual([])
    expect(profiles[1].config.websocketQueryParameters).toEqual([
      { name: 'region', value: '' }
    ])
    expect(profiles[1].config.will).toBeUndefined()
  })

  it('skips malformed and duplicate profile identities without hiding valid profiles', () => {
    const profiles = readWebProfiles(storage([
      null,
      { id: '', config: config() },
      { id: 'missing-config' },
      { id: 'invalid-port', config: { ...config(), port: '1883' } },
      { id: 'out-of-range-port', config: { ...config(), port: 0 } },
      { id: 'invalid-keepalive', config: { ...config(), keepalive: -1 } },
      { id: 'timer-overflow', config: { ...config(), reconnectPeriod: 2_147_483_648 } },
      { id: 'persistent-without-id', config: { ...config(), clean: false, clientId: '' } },
      profile('valid'),
      profile('valid', { name: 'Duplicate' })
    ]))

    expect(profiles).toHaveLength(1)
    expect(profiles[0].config.name).toBe('Production broker')
  })

  it('returns an empty list for unreadable storage', () => {
    expect(readWebProfiles({ getItem: () => '{invalid-json' })).toEqual([])
    expect(readWebProfiles({ getItem: () => { throw new Error('blocked') } })).toEqual([])
  })

  it('limits Web profiles on both read and write', () => {
    const profiles = Array.from({ length: 101 }, (_value, index) => profile(`profile-${index}`))
    expect(readWebProfiles(storage(profiles))).toHaveLength(100)
    expect(() => writeWebProfiles(storage(), profiles)).toThrow(
      'A maximum of 100 broker profiles is supported.'
    )
  })

  it('refuses to persist profiles that cannot connect', () => {
    expect(() => writeWebProfiles(storage(), [profile('invalid', { port: 0 })]))
      .toThrow('Broker port must be a whole number from 1 to 65535.')
    expect(() => writeWebProfiles(storage(), [profile('invalid', {
      clean: false,
      clientId: ''
    })])).toThrow('Client ID is required when Clean Session is disabled.')
    expect(() => writeWebProfiles(storage(), [profile('invalid', {
      websocketQueryParameters: [{ name: '', value: 'value' }]
    })])).toThrow('WebSocket query parameter names are required.')
    expect(() => writeWebProfiles(storage(), [profile('invalid', {
      will: { ...config().will!, topic: 'devices/+' }
    })])).toThrow('Last Will topics cannot contain MQTT wildcards')
  })
})
