import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test, type Page } from '@playwright/test'
import { Aedes } from 'aedes'
import { generate, parser, type IPublishPacket } from 'mqtt-packet'
import mqtt from 'mqtt'
import { createWebSocketStream, WebSocketServer } from 'ws'
import {
  DOWNLINK_HISTORY_STORAGE_KEY,
  type LoRaWanDownlinkHistoryFile
} from '../../src/shared/lorawan-downlink-history'
import { WEB_PROFILE_STORAGE_KEY } from '../../src/renderer/src/lib/web-profiles'

async function selectEnglish(page: Page): Promise<void> {
  await page.getByLabel('介面語言').selectOption('en')
  await expect(page.getByLabel('Interface language')).toHaveValue('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
}

async function startWebSocketBroker() {
  const broker = await Aedes.createBroker()
  const server = createServer()
  const websocketServer = new WebSocketServer({ server, path: '/mqtt' })
  websocketServer.on('connection', (socket, request) => {
    broker.handle(createWebSocketStream(socket), request)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      websocketServer.clients.forEach((client) => client.terminate())
      await new Promise<void>((resolve) => websocketServer.close(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await new Promise<void>((resolve) => broker.close(resolve))
    }
  }
}

const downlinkHistory = {
  format: 'mqttape-downlink-history',
  version: 1,
  exportedAt: '2026-08-17T06:20:00.000Z',
  events: [
    {
      id: 'e2e-request',
      messageId: 'e2e-request',
      provider: 'the-things-stack',
      kind: 'request',
      status: 'requested',
      direction: 'outgoing',
      observedAt: '2026-08-17T06:18:00.000Z',
      occurredAt: '2026-08-17T06:18:00.000Z',
      topic: 'v3/demo/devices/sensor-01/down/push',
      applicationId: 'demo',
      deviceId: 'sensor-01',
      devEui: '4200000000000001',
      correlationIds: ['mqttape:e2e-history'],
      fPort: 10,
      confirmed: true
    },
    {
      id: 'e2e-ack',
      messageId: 'e2e-ack',
      provider: 'the-things-stack',
      kind: 'ack',
      status: 'acknowledged',
      direction: 'incoming',
      observedAt: '2026-08-17T06:19:00.000Z',
      occurredAt: '2026-08-17T06:19:00.000Z',
      topic: 'v3/demo/devices/sensor-01/down/ack',
      applicationId: 'demo',
      deviceId: 'sensor-01',
      devEui: '4200000000000001',
      correlationIds: ['mqttape:e2e-history'],
      fPort: 10,
      frameCounter: 25,
      confirmed: true
    }
  ]
} satisfies LoRaWanDownlinkHistoryFile

const storedWebProfileConfig = {
  name: 'Normal profile',
  protocol: 'wss',
  host: 'broker.example.com',
  port: 8084,
  path: 'mqtt',
  clientId: 'mqttape_stored_profile',
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
  websocketHeaders: [],
  websocketQueryParameters: []
} as const

test('Web Lite starts in Traditional Chinese and persists user-selected English', async ({
  page
}) => {
  await page.goto('/')

  await expect(page).toHaveTitle('MQTTape — MQTT 流量擷取、封包檢視與重播')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-TW')
  await expect(page.getByLabel('介面語言')).toHaveValue('zh-TW')
  await expect(page.getByRole('heading', { name: '連線' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText(
    'MQTT over Secure WebSocket · 8084 是部分 Broker 的常見預設 · 加密'
  )
  await expect(page.getByRole('note')).toContainText(
    '瀏覽器無法開啟原始 MQTT TCP Socket，因此 Web Lite 必須使用 WS 或 WSS。'
  )

  await page.getByLabel('通訊協定').selectOption('ws')
  await expect(page.getByLabel('連接埠')).toHaveValue('8083')
  await expect(page.getByRole('note')).toContainText(
    'MQTT over WebSocket · 8083 是部分 Broker 的常見預設 · 未加密'
  )

  await page.getByLabel('介面語言').selectOption('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Connection' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('8083 is a common Broker default')

  await page.reload()
  await expect(page.getByLabel('Interface language')).toHaveValue('en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { name: 'Connection' })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('This port is only a starting value')
})

test('Web Lite validates MQTT port and Keep Alive before connecting', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('主機').fill('broker.example.com')
  await page.getByLabel('連接埠').fill('65536')
  await page.getByRole('button', { name: '連線', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Broker 連接埠必須是 1 到 65535 的整數。'
  )

  await page.getByLabel('連接埠').fill('8084')
  await page.getByText('進階設定', { exact: true }).click()
  await page.getByLabel('Keep Alive（秒）').fill('65536')
  await page.getByRole('button', { name: '連線', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Keep Alive 必須是 0 到 65535 秒的整數。'
  )
})

test('Web Lite keeps multiple Broker workspaces isolated', async ({ page }) => {
  await page.goto('/')
  await selectEnglish(page)
  const activeWorkspace = page.locator('.session-workspace:not([hidden])')

  await activeWorkspace.getByLabel('Profile name').fill('Primary Broker')
  await activeWorkspace.getByLabel('Host').fill('primary.example.com')
  await expect(page.getByRole('tab', { name: 'Primary Broker' })).toBeVisible()

  await page.getByRole('button', { name: 'Add Broker' }).click()
  await expect(page.getByRole('tablist')).toContainText('Primary Broker')
  await expect(page.getByRole('tab', { name: 'Broker 2' })).toHaveAttribute('aria-selected', 'true')
  await expect(activeWorkspace.getByLabel('Host')).toHaveValue('')

  await activeWorkspace.getByLabel('Profile name').fill('Secondary Broker')
  await activeWorkspace.getByLabel('Host').fill('secondary.example.com')
  await page.getByRole('tab', { name: 'Primary Broker' }).click()
  await expect(activeWorkspace.getByLabel('Host')).toHaveValue('primary.example.com')

  await page.getByLabel('Close Secondary Broker').click()
  await expect(page.getByRole('tab', { name: 'Secondary Broker' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Primary Broker' })).toHaveAttribute('aria-selected', 'true')

  for (let index = 0; index < 7; index += 1) {
    await page.getByRole('button', { name: 'Add Broker' }).click()
  }
  await expect(page.getByRole('tab')).toHaveCount(8)
  await expect(page.getByRole('button', { name: 'Add Broker' })).toBeDisabled()
})

test('Web Lite recovers valid Broker profiles beside malformed stored data', async ({ page }) => {
  await page.addInitScript(({ key, config }) => {
    window.localStorage.setItem(key, JSON.stringify([
      { id: 'normal', config, secretsStored: false },
      {
        id: 'recoverable',
        config: {
          ...config,
          name: 'Recoverable profile',
          websocketHeaders: 'not-an-array'
        },
        secretsStored: false
      },
      { id: '', config, secretsStored: false }
    ]))
  }, { key: WEB_PROFILE_STORAGE_KEY, config: storedWebProfileConfig })
  await page.goto('/')

  const profilePicker = page.getByLabel('已儲存的 Broker 設定檔')
  await expect(profilePicker.locator('option')).toHaveText([
    '新增未儲存的設定檔',
    'Normal profile',
    'Recoverable profile'
  ])
  await profilePicker.selectOption('recoverable')
  await expect(page.getByLabel('設定檔名稱')).toHaveValue('Recoverable profile')
  await expect(page.getByLabel('主機')).toHaveValue('broker.example.com')
})

test('Web Lite configures URL authentication without persisting secret values', async ({ page }) => {
  await page.goto('/')
  await selectEnglish(page)
  await page.getByLabel('Profile name').fill('Query auth profile')
  await page.getByText('Advanced settings').click()

  await expect(page.getByRole('note').filter({ hasText: 'Browser handshake limitation' }))
    .toContainText('cannot set HTTP headers')
  await page.getByRole('button', { name: 'Add parameter' }).click()
  await page.getByLabel('WebSocket query parameter 1 name').fill('access_token')
  await page.getByLabel('WebSocket query parameter 1 value').fill('web-secret')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await page.reload()
  await page.getByLabel('Saved broker profile').selectOption({ label: 'Query auth profile' })
  await page.getByText('Advanced settings').click()
  await expect(page.getByLabel('WebSocket query parameter 1 name')).toHaveValue('access_token')
  await expect(page.getByLabel('WebSocket query parameter 1 value')).toHaveValue('')
})

test('Web Lite keeps two live Broker connections active in parallel', async ({ page }) => {
  const firstBroker = await startWebSocketBroker()
  const secondBroker = await startWebSocketBroker()

  try {
    await page.goto('/')
    await selectEnglish(page)
    const activeWorkspace = page.locator('.session-workspace:not([hidden])')
    await activeWorkspace.getByLabel('Profile name').fill('Live Broker A')
    await activeWorkspace.getByLabel('Protocol').selectOption('ws')
    await activeWorkspace.getByLabel('Host').fill('127.0.0.1')
    await activeWorkspace.getByLabel('Port').fill(String(firstBroker.port))
    await activeWorkspace.getByText('Advanced settings').click()
    await activeWorkspace.getByLabel('MQTT version').selectOption('4')
    await activeWorkspace.getByRole('button', { name: 'Connect' }).click()
    await expect(activeWorkspace.getByRole('button', { name: 'Disconnect' })).toBeVisible()
    await activeWorkspace.getByLabel('Subscription topic').fill('isolated/a')
    await activeWorkspace.getByRole('button', { name: 'Add', exact: true }).click()

    await page.getByRole('button', { name: 'Add Broker' }).click()
    await activeWorkspace.getByLabel('Profile name').fill('Live Broker B')
    await activeWorkspace.getByLabel('Protocol').selectOption('ws')
    await activeWorkspace.getByLabel('Host').fill('127.0.0.1')
    await activeWorkspace.getByLabel('Port').fill(String(secondBroker.port))
    await activeWorkspace.getByText('Advanced settings').click()
    await activeWorkspace.getByLabel('MQTT version').selectOption('4')
    await activeWorkspace.getByRole('button', { name: 'Connect' }).click()
    await expect(activeWorkspace.getByRole('button', { name: 'Disconnect' })).toBeVisible()
    await activeWorkspace.getByLabel('Subscription topic').fill('isolated/b')
    await activeWorkspace.getByRole('button', { name: 'Add', exact: true }).click()

    const publisherA = mqtt.connect(`ws://127.0.0.1:${firstBroker.port}/mqtt`, {
      protocolVersion: 4,
      reconnectPeriod: 0
    })
    await new Promise<void>((resolve, reject) => {
      publisherA.once('connect', () => resolve())
      publisherA.once('error', reject)
    })
    await new Promise<void>((resolve, reject) => publisherA.publish(
      'isolated/a',
      'message-from-a',
      { qos: 1 },
      (error) => error ? reject(error) : resolve()
    ))

    const firstTab = page.getByRole('tab').filter({ hasText: 'Live Broker A' })
    await expect(firstTab).toContainText('1')
    await expect(activeWorkspace.getByText('message-from-a', { exact: true })).toHaveCount(0)
    await firstTab.click()
    await expect(activeWorkspace.getByText('message-from-a', { exact: true })).toBeVisible()
    await expect(firstTab).not.toContainText('1')

    const secondTab = page.getByRole('tab').filter({ hasText: 'Live Broker B' })
    await expect(secondTab.locator('.status-dot')).toBeVisible()
    await new Promise<void>((resolve, reject) => publisherA.end(false, {}, (error) => {
      if (error) reject(error)
      else resolve()
    }))

    await activeWorkspace.getByRole('button', { name: 'Disconnect' }).click()
    await secondTab.click()
    await activeWorkspace.getByRole('button', { name: 'Disconnect' }).click()
  } finally {
    await page.close()
    await Promise.all([firstBroker.close(), secondBroker.close()])
  }
})

test('Web Lite configures and validates MQTT Last Will', async ({ page }) => {
  await page.goto('/')
  await selectEnglish(page)
  await page.getByLabel('Protocol').selectOption('ws')
  await page.getByLabel('Host').fill('127.0.0.1')
  await page.getByLabel('Port').fill('1')
  await page.getByText('Advanced settings').click()
  await page.getByLabel('Enable Last Will').check()

  await expect(page.getByLabel('Last Will topic')).toBeVisible()
  await expect(page.locator('.will-fields').getByLabel('Payload format')).toHaveValue('text')
  await expect(page.getByText('A normal MQTTape disconnect sends DISCONNECT')).toBeVisible()

  await page.getByLabel('Interface language').selectOption('zh-TW')
  await page.getByRole('button', { name: '連線' }).click()
  await expect(page.getByRole('alert')).toContainText('必須輸入 Last Will Topic')
})

test('Web Lite inspects MQTT 5 publish properties in both languages', async ({ page }) => {
  const packetOptions = { protocolVersion: 5 }
  const server = createServer()
  const websocketServer = new WebSocketServer({ server, path: '/mqtt' })
  const publishedPackets: IPublishPacket[] = []
  websocketServer.on('connection', (socket) => {
    const stream = createWebSocketStream(socket)
    const packetParser = parser(packetOptions)
    stream.on('data', (data) => packetParser.parse(data))
    packetParser.on('packet', (packet) => {
      if (packet.cmd === 'connect') {
        stream.write(generate({
          cmd: 'connack',
          reasonCode: 0,
          sessionPresent: false,
          properties: {}
        }, packetOptions))
        return
      }
      if (packet.cmd === 'subscribe') {
        stream.write(generate({
          cmd: 'suback',
          messageId: packet.messageId,
          granted: packet.subscriptions.map(({ qos }) => qos),
          properties: {}
        }, packetOptions))
        stream.write(generate({
          cmd: 'publish',
          topic: 'demo/mqtt5',
          payload: Buffer.from('{"temperature":24.8}'),
          qos: 0,
          dup: false,
          retain: false,
          properties: {
            payloadFormatIndicator: true,
            messageExpiryInterval: 120,
            responseTopic: 'demo/replies',
            correlationData: Buffer.from([0xde, 0xad, 0xbe, 0xef]),
            contentType: 'application/json',
            subscriptionIdentifier: [7, 12],
            userProperties: { source: ['gateway', 'e2e'] }
          }
        }, packetOptions))
        return
      }
      if (packet.cmd === 'publish') publishedPackets.push(packet)
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port

  try {
    await page.goto('/')
    await selectEnglish(page)
    await page.getByLabel('Protocol').selectOption('ws')
    await page.getByLabel('Host').fill('127.0.0.1')
    await page.getByLabel('Port').fill(String(port))
    await page.getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible()

    await page.getByText('MQTT 5 publish properties', { exact: true }).click()
    await page.getByLabel('Publish topic').fill('demo/mqtt5-outgoing')
    await page.getByLabel('Publish payload').fill('{"command":"start"}')
    await page.getByLabel('Payload format').selectOption('utf8')
    await page.getByLabel('Message expiry').fill('90')
    await page.getByLabel('Content type').fill('application/json')
    await page.getByLabel('Response topic').fill('demo/replies')
    await page.getByLabel('Correlation data format').selectOption('hex')
    await page.getByLabel('Correlation data', { exact: true }).fill('DE AD BE EF')
    await page.getByRole('button', { name: 'Add property' }).click()
    await page.getByRole('button', { name: 'Add property' }).click()
    await page.getByLabel('Name 1').fill('source')
    await page.getByLabel('Value 1').fill('mqttape')
    await page.getByLabel('Name 2').fill('source')
    await page.getByLabel('Value 2').fill('e2e')
    await page.getByRole('button', { name: 'Publish', exact: true }).click()

    await expect.poll(() => publishedPackets.length).toBe(1)
    expect(publishedPackets[0].topic).toBe('demo/mqtt5-outgoing')
    expect(publishedPackets[0].properties).toEqual({
      payloadFormatIndicator: true,
      messageExpiryInterval: 90,
      responseTopic: 'demo/replies',
      correlationData: Buffer.from([0xde, 0xad, 0xbe, 0xef]),
      contentType: 'application/json',
      userProperties: { source: ['mqttape', 'e2e'] }
    })
    const outgoingMessage = page.getByRole('button', { name: /demo\/mqtt5-outgoing.*MQTT 5/ })
    await expect(outgoingMessage).toBeVisible()
    await page.getByText('MQTT 5 publish properties', { exact: true }).click()

    await page.getByLabel('MQTTape capture file').setInputFiles({
      name: 'mqtt5-replay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        format: 'mqttape-capture',
        version: 1,
        exportedAt: '2026-08-17T07:00:00.000Z',
        connection: { host: 'capture-broker' },
        messages: [{
          id: 'mqtt5-replay',
          direction: 'outgoing',
          timestamp: '2026-08-17T07:00:00.000Z',
          topic: 'demo/mqtt5-replay',
          qos: 0,
          retain: false,
          duplicate: false,
          payloadBase64: 'cmVwbGF5',
          payloadText: 'replay',
          size: 6,
          properties: {
            payloadFormatIndicator: true,
            contentType: 'text/plain',
            correlationDataBase64: 'AQIDBA==',
            topicAlias: 7,
            subscriptionIdentifiers: [12],
            userProperties: [
              { name: 'source', value: 'capture' },
              { name: 'source', value: 'replay' }
            ]
          }
        }]
      }))
    })
    await expect(page.getByText(
      '1 selected message(s) include publish-safe MQTT 5 properties.'
    )).toBeVisible()
    await expect(page.getByText(/Topic Alias and Subscription Identifier are omitted/))
      .toBeVisible()
    await page.getByRole('button', { name: 'Start replay' }).click()
    await expect.poll(() => publishedPackets.length).toBe(2)
    expect(publishedPackets[1]).toMatchObject({
      topic: 'demo/mqtt5-replay',
      payload: Buffer.from('replay'),
      properties: {
        payloadFormatIndicator: true,
        contentType: 'text/plain',
        correlationData: Buffer.from([1, 2, 3, 4]),
        userProperties: { source: ['capture', 'replay'] }
      }
    })
    expect(publishedPackets[1].properties).not.toHaveProperty('topicAlias')
    expect(publishedPackets[1].properties).not.toHaveProperty('subscriptionIdentifier')
    await expect(page.getByText('completed', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).last().click()

    await page.getByLabel('Subscription topic').fill('demo/mqtt5')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    const message = page.locator('button.msg-summary').filter({
      has: page.getByText('demo/mqtt5', { exact: true })
    })
    await expect(message).toBeVisible()
    await message.click()

    await expect(page.getByRole('heading', { name: 'Publish properties' })).toBeVisible()
    await expect(page.getByText('application/json', { exact: true })).toBeVisible()
    await expect(page.getByText('3q2+7w==', { exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'gateway', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'e2e', exact: true })).toBeVisible()

    await page.getByLabel('Interface language').selectOption('zh-TW')
    await expect(page.getByRole('heading', { name: '發布屬性' })).toBeVisible()
    await expect(page.getByText('關聯資料（4 位元組）', { exact: true })).toBeVisible()
  } finally {
    websocketServer.clients.forEach((client) => client.terminate())
    await new Promise<void>((resolve) => websocketServer.close(() => resolve()))
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('Downlink history survives reload, exports safely, and can be cleared', async ({ page }) => {
  await page.goto('/')
  await selectEnglish(page)
  await page.evaluate(([key, history]) => {
    window.localStorage.setItem(key, history)
  }, [DOWNLINK_HISTORY_STORAGE_KEY, JSON.stringify(downlinkHistory)])
  await page.reload()

  await page.getByRole('button', { name: 'Downlinks' }).click()
  await expect(page.getByText('sensor-01', { exact: true })).toBeVisible()
  await expect(page.getByText('Acknowledged', { exact: true })).toBeVisible()
  await expect(page.getByText('2 saved event(s)', { exact: true })).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Downlinks' }).click()
  await expect(page.getByText('sensor-01', { exact: true })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export history' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^mqttape-downlinks-.+\.json$/)
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exportedText = await readFile(downloadPath!, 'utf8')
  const exported = JSON.parse(exportedText) as LoRaWanDownlinkHistoryFile
  expect(exported).toMatchObject({
    format: 'mqttape-downlink-history',
    version: 1
  })
  expect(exported.events).toHaveLength(2)
  expect(exportedText).not.toContain('payload')
  expect(exportedText).not.toContain('password')

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('Clear all saved downlink history')
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Clear history' }).click()
  await expect(page.getByRole('heading', { name: 'No downlink events observed yet' }))
    .toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Downlinks' }).click()
  await expect(page.getByRole('heading', { name: 'No downlink events observed yet' }))
    .toBeVisible()
})
