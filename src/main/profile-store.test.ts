import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionConfig } from '../shared/contracts'
import { ProfileStore } from './profile-store'
import { defaultMqttLastWill } from '../shared/mqtt-will'

const temporaryDirectories: string[] = []

function config(): ConnectionConfig {
  return {
    name: 'Production broker',
    protocol: 'mqtts',
    host: 'broker.example.com',
    port: 8883,
    path: 'mqtt',
    clientId: 'mqttape_test',
    username: 'device',
    password: 'broker-secret',
    mqttVersion: 5,
    clean: true,
    keepalive: 60,
    reconnectPeriod: 1_000,
    rejectUnauthorized: true,
    caPath: 'C:/certs/ca.pem',
    clientCertificatePath: 'C:/certs/client.pem',
    clientKeyPath: 'C:/certs/client.key',
    clientKeyPassphrase: 'key-secret',
    websocketAuth: { mode: 'bearer', username: '', secret: 'bearer-secret' },
    websocketHeaders: [{ name: 'X-API-Key', value: 'header-secret' }],
    websocketQueryParameters: [{ name: 'access_token', value: 'query-secret' }],
    will: {
      ...defaultMqttLastWill(),
      enabled: true,
      topic: 'devices/gateway/status',
      payload: 'will-payload-secret',
      qos: 1,
      retain: true
    }
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('ProfileStore', () => {
  it('isolates malformed stored configs before they reach the renderer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqttape-profile-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'profiles.json')
    await writeFile(filePath, JSON.stringify({
      version: 1,
      profiles: [
        { id: 'valid', config: config() },
        { id: 'invalid-host', config: { ...config(), host: 127 } },
        { id: 'invalid-protocol', config: { ...config(), protocol: 'ftp' } }
      ]
    }))
    const store = new ProfileStore(filePath, {
      isAvailable: () => false,
      encrypt: () => Buffer.alloc(0),
      decrypt: () => ''
    })

    const loaded = await store.list()
    expect(loaded.map(({ id }) => id)).toEqual(['valid'])
    expect(loaded[0].config.host).toBe('broker.example.com')
  })

  it('normalizes profile identities, removes duplicates, and bounds stored data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqttape-profile-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'profiles.json')
    await writeFile(filePath, JSON.stringify({
      version: 1,
      profiles: [
        { id: ' duplicate ', config: { ...config(), caPath: 42 } },
        { id: 'duplicate', config: { ...config(), name: 'Duplicate copy' } },
        { id: '   ', config: config() },
        ...Array.from({ length: 105 }, (_value, index) => ({
          id: `profile-${index}`,
          config: { ...config(), name: `Profile ${index}` }
        }))
      ]
    }))
    const store = new ProfileStore(filePath, {
      isAvailable: () => false,
      encrypt: () => Buffer.alloc(0),
      decrypt: () => ''
    })

    const loaded = await store.list()
    expect(loaded).toHaveLength(100)
    expect(loaded.filter(({ id }) => id === 'duplicate')).toHaveLength(1)
    expect(loaded[0].config.name).toBe('Production broker')
    expect(loaded[0].config.caPath).toBe('')
    expect(loaded.some(({ id }) => id.trim() === '')).toBe(false)
  })

  it('encrypts secrets and restores the profile', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqttape-profile-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'profiles.json')
    const protector = {
      isAvailable: () => true,
      encrypt: (value: string) => Buffer.from(value.split('').reverse().join('')),
      decrypt: (value: Buffer) => value.toString().split('').reverse().join('')
    }
    const store = new ProfileStore(filePath, protector)

    const saved = await store.save({ config: config() })
    const rawFile = await readFile(filePath, 'utf8')
    const [loaded] = await store.list()

    expect(saved.secretsStored).toBe(true)
    expect(rawFile).not.toContain('broker-secret')
    expect(rawFile).not.toContain('key-secret')
    expect(rawFile).not.toContain('will-payload-secret')
    expect(rawFile).not.toContain('bearer-secret')
    expect(rawFile).not.toContain('header-secret')
    expect(rawFile).not.toContain('query-secret')
    expect(rawFile).toContain('X-API-Key')
    expect(rawFile).toContain('access_token')
    expect(loaded.config.password).toBe('broker-secret')
    expect(loaded.config.clientKeyPassphrase).toBe('key-secret')
    expect(loaded.config.will?.payload).toBe('will-payload-secret')
    expect(loaded.config.websocketAuth?.secret).toBe('bearer-secret')
    expect(loaded.config.websocketHeaders).toEqual([
      { name: 'X-API-Key', value: 'header-secret' }
    ])
    expect(loaded.config.websocketQueryParameters).toEqual([
      { name: 'access_token', value: 'query-secret' }
    ])
    expect(await store.isTrustedTlsPath('C:/certs/client.key')).toBe(true)
  })

  it('never falls back to plaintext when secure storage is unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqttape-profile-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'profiles.json')
    const store = new ProfileStore(filePath, {
      isAvailable: () => false,
      encrypt: () => Buffer.alloc(0),
      decrypt: () => ''
    })

    const saved = await store.save({ config: config() })
    const rawFile = await readFile(filePath, 'utf8')

    expect(saved.secretsStored).toBe(false)
    expect(rawFile).not.toContain('broker-secret')
    expect(rawFile).not.toContain('key-secret')
    expect(rawFile).not.toContain('will-payload-secret')
    expect(rawFile).not.toContain('bearer-secret')
    expect(rawFile).not.toContain('header-secret')
    expect(rawFile).not.toContain('query-secret')
  })

  it('removes previously encrypted secrets when they are cleared', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqttape-profile-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'profiles.json')
    const protector = {
      isAvailable: () => true,
      encrypt: (value: string) => Buffer.from(value.split('').reverse().join('')),
      decrypt: (value: Buffer) => value.toString().split('').reverse().join('')
    }
    const store = new ProfileStore(filePath, protector)

    const saved = await store.save({ config: config() })
    const cleared = await store.save({
      id: saved.id,
      config: {
        ...saved.config,
        password: '',
        clientKeyPassphrase: '',
        websocketAuth: saved.config.websocketAuth
          ? { ...saved.config.websocketAuth, secret: '' }
          : undefined,
        websocketHeaders: saved.config.websocketHeaders?.map(({ name }) => ({ name, value: '' })),
        websocketQueryParameters: saved.config.websocketQueryParameters
          ?.map(({ name }) => ({ name, value: '' })),
        will: saved.config.will ? { ...saved.config.will, payload: '' } : undefined
      }
    })
    const rawFile = await readFile(filePath, 'utf8')

    expect(cleared.secretsStored).toBe(false)
    expect(cleared.config.password).toBe('')
    expect(cleared.config.clientKeyPassphrase).toBe('')
    expect(cleared.config.websocketAuth?.secret).toBe('')
    expect(cleared.config.websocketHeaders?.[0].value).toBe('')
    expect(cleared.config.websocketQueryParameters?.[0].value).toBe('')
    expect(rawFile).not.toContain('encryptedSecrets')
  })
})
