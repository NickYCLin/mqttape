import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IClientOptions } from 'mqtt'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionConfig } from '../shared/contracts'
import { buildBrokerUrl, createClientOptions, MqttService } from './mqtt-service'
import { defaultMqttLastWill } from '../shared/mqtt-will'

const temporaryDirectories: string[] = []

function config(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    name: 'MQTT 5 broker',
    protocol: 'mqtts',
    host: 'broker.example.com',
    port: 8883,
    path: 'mqtt',
    clientId: 'mqttape_options',
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

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('MQTT client options', () => {
  it('rejects invalid Broker port and Keep Alive values before connecting', async () => {
    const service = new MqttService(() => undefined, () => undefined)

    await expect(service.connect(config({ port: 65_536 })))
      .rejects.toThrow('Broker port must be a whole number from 1 to 65535.')
    await expect(service.connect(config({ keepalive: 65_536 })))
      .rejects.toThrow('Keep Alive must be a whole number from 0 to 65535 seconds.')
  })

  it('passes MQTT 5 and mTLS material to the MQTT client', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mqttape-tls-'))
    temporaryDirectories.push(directory)
    const caPath = join(directory, 'ca.pem')
    const certificatePath = join(directory, 'client.pem')
    const keyPath = join(directory, 'client.key')
    await Promise.all([
      writeFile(caPath, 'test-ca'),
      writeFile(certificatePath, 'test-certificate'),
      writeFile(keyPath, 'test-key')
    ])

    const options = await createClientOptions(config({
      caPath,
      clientCertificatePath: certificatePath,
      clientKeyPath: keyPath,
      clientKeyPassphrase: 'test-passphrase'
    })) as IClientOptions & {
      protocolVersion: number
      ca: Buffer
      cert: Buffer
      key: Buffer
      passphrase: string
    }

    expect(options.protocolVersion).toBe(5)
    expect(options.ca.toString()).toBe('test-ca')
    expect(options.cert.toString()).toBe('test-certificate')
    expect(options.key.toString()).toBe('test-key')
    expect(options.passphrase).toBe('test-passphrase')
  })

  it('rejects TLS material on plaintext transports and incomplete client identities', async () => {
    await expect(createClientOptions(config({ protocol: 'mqtt', caPath: 'ca.pem' })))
      .rejects.toThrow('Custom TLS files require mqtts or wss.')
    await expect(createClientOptions(config({ clientCertificatePath: 'client.pem' })))
      .rejects.toThrow('Client certificate and private key must be selected together.')
  })

  it('passes binary Last Will data and MQTT 5 properties to the client', async () => {
    const options = await createClientOptions(config({
      will: {
        ...defaultMqttLastWill(),
        enabled: true,
        topic: 'devices/gateway/status',
        payload: 'DE AD BE EF',
        payloadFormat: 'hex',
        qos: 2,
        retain: true,
        willDelayInterval: 5,
        contentType: 'application/octet-stream'
      }
    }))

    expect(options.will).toMatchObject({
      topic: 'devices/gateway/status',
      qos: 2,
      retain: true,
      properties: {
        payloadFormatIndicator: false,
        willDelayInterval: 5,
        contentType: 'application/octet-stream'
      }
    })
    expect(options.will?.payload).toEqual(Buffer.from([0xde, 0xad, 0xbe, 0xef]))
  })

  it('builds WebSocket handshake authentication and encoded query parameters', async () => {
    const websocketConfig = config({
      protocol: 'wss',
      port: 8084,
      path: 'mqtt',
      websocketAuth: { mode: 'basic', username: 'device', secret: 'http-secret' },
      websocketHeaders: [{ name: 'X-Tenant-ID', value: 'taipei' }],
      websocketQueryParameters: [
        { name: 'region', value: '臺北 office' },
        { name: 'scope', value: 'read/write' }
      ]
    })
    const options = await createClientOptions(websocketConfig) as IClientOptions & {
      wsOptions: { headers: Record<string, string> }
    }

    expect(options.wsOptions.headers).toEqual({
      Authorization: 'Basic ZGV2aWNlOmh0dHAtc2VjcmV0',
      'X-Tenant-ID': 'taipei'
    })
    expect(buildBrokerUrl(websocketConfig)).toBe(
      'wss://broker.example.com:8084/mqtt?region=%E8%87%BA%E5%8C%97+office&scope=read%2Fwrite'
    )
  })
})
