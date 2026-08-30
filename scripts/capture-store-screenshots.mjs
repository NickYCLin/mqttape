import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Aedes } from 'aedes'
import { _electron as electron } from '@playwright/test'
import mqtt from 'mqtt'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requestedWindowWidth = 1600
const requestedWindowHeight = 1030
const minimumScreenshotWidth = 1440
const minimumScreenshotHeight = 900
const maximumScreenshotBytes = 50 * 1024 * 1024

const locales = [
  {
    language: 'zh-TW',
    directory: 'zh-TW',
    profileName: '智慧工廠展示',
    clientId: 'mqttape_store_demo_zh_tw',
    labels: {
      advanced: '進階設定',
      clientId: '用戶端 ID',
      connect: '連線',
      disconnect: '中斷連線',
      host: '主機',
      mqttVersion: 'MQTT 版本',
      packetFlows: '封包流程',
      port: '連接埠',
      profileName: '設定檔名稱',
      publish: '發布',
      publishPayload: '發布 Payload',
      publishQos: '發布 QoS',
      publishTopic: '發布 Topic',
      subscriptionAdd: '新增',
      subscriptionQos: '訂閱 QoS',
      subscriptionTopic: '訂閱 Topic'
    }
  },
  {
    language: 'en',
    directory: 'en-US',
    profileName: 'Smart Factory Demo',
    clientId: 'mqttape_store_demo_en',
    labels: {
      advanced: 'Advanced settings',
      clientId: 'Client ID',
      connect: 'Connect',
      disconnect: 'Disconnect',
      host: 'Host',
      mqttVersion: 'MQTT version',
      packetFlows: 'Packets',
      port: 'Port',
      profileName: 'Profile name',
      publish: 'Publish',
      publishPayload: 'Publish payload',
      publishQos: 'Publish QoS',
      publishTopic: 'Publish topic',
      subscriptionAdd: 'Add',
      subscriptionQos: 'Subscription QoS',
      subscriptionTopic: 'Subscription topic'
    }
  }
]

const demoMessages = [
  ['factory/line-7/status', {
    line: 7,
    state: 'running',
    mode: 'automatic',
    updatedBy: 'store-demo'
  }],
  ['factory/line-7/temperature', {
    value: 23.8,
    unit: 'celsius',
    withinTarget: true
  }],
  ['factory/line-7/throughput', {
    unitsPerMinute: 148,
    target: 150,
    efficiencyPercent: 98.7
  }],
  ['factory/line-7/quality', {
    inspected: 1200,
    accepted: 1196,
    rejected: 4
  }],
  ['factory/warehouse/environment', {
    temperature: 21.4,
    humidityPercent: 46,
    airQuality: 'good'
  }],
  ['factory/energy/current', {
    powerKw: 42.6,
    voltage: 380,
    source: 'grid'
  }]
]

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit'
    })
    child.once('error', rejectPromise)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(
        `${command} ${args.join(' ')} failed (${signal ? `signal ${signal}` : `exit ${code}`}).`
      ))
    })
  })
}

async function buildDesktop() {
  process.stdout.write('Building the current source before capturing Store screenshots.\n')
  await run('npm', ['run', 'build'])
}

async function startBroker() {
  const broker = await Aedes.createBroker()
  const sockets = new Set()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    broker.handle(socket)
  })

  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', resolvePromise)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('The isolated MQTT broker did not expose a TCP port.')
  }

  return {
    port: address.port,
    async close() {
      sockets.forEach((socket) => socket.destroy())
      await new Promise((resolvePromise) => server.close(resolvePromise))
      await new Promise((resolvePromise) => broker.close(resolvePromise))
    }
  }
}

async function connectPublisher(port, clientId) {
  const client = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
    clientId,
    protocolVersion: 4,
    reconnectPeriod: 0
  })

  await new Promise((resolvePromise, rejectPromise) => {
    client.once('connect', resolvePromise)
    client.once('error', rejectPromise)
  })

  return client
}

async function publish(client, topic, payload, qos = 1) {
  await new Promise((resolvePromise, rejectPromise) => client.publish(
    topic,
    typeof payload === 'string' ? payload : JSON.stringify(payload),
    { qos, retain: false },
    (error) => error ? rejectPromise(error) : resolvePromise()
  ))
}

async function closePublisher(client) {
  if (!client) return
  await new Promise((resolvePromise, rejectPromise) => client.end(false, {}, (error) => {
    if (error) rejectPromise(error)
    else resolvePromise()
  }))
}

async function waitForCount(locator, minimum, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds
  while (await locator.count() < minimum) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${minimum} matching UI items.`)
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
}

async function takeScreenshot(page, path) {
  await page.evaluate(async () => {
    await globalThis.document.fonts.ready
  })
  await page.screenshot({
    path,
    animations: 'disabled',
    caret: 'hide'
  })
}

async function validateScreenshot(path) {
  const [metadata, header] = await Promise.all([
    stat(path),
    readFile(path)
  ])
  const pngSignature = '89504e470d0a1a0a'
  if (header.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`${path} is not a PNG file.`)
  }
  const width = header.readUInt32BE(16)
  const height = header.readUInt32BE(20)
  if (width < minimumScreenshotWidth || height < minimumScreenshotHeight) {
    throw new Error(
      `${path} is ${width}x${height}; Store screenshots must be at least ${minimumScreenshotWidth}x${minimumScreenshotHeight}.`
    )
  }
  if (metadata.size >= maximumScreenshotBytes) {
    throw new Error(`${path} is ${metadata.size} bytes; the Store limit is below 50 MB.`)
  }
  process.stdout.write(`${path}: ${width}x${height}, ${metadata.size} bytes\n`)
}

async function captureLocale(locale, brokerPort) {
  const outputDirectory = join(repositoryRoot, 'store-listing', locale.directory, 'screenshots')
  const userDataDirectory = await mkdtemp(join(tmpdir(), `mqttape-store-${locale.directory}-`))
  const paths = {
    connection: join(outputDirectory, '01-connection-settings.png'),
    timeline: join(outputDirectory, '02-live-capture.png'),
    inspector: join(outputDirectory, '03-json-inspector.png'),
    packetFlow: join(outputDirectory, '04-qos-packet-flow.png')
  }
  let application
  let publisher

  await mkdir(outputDirectory, { recursive: true })

  try {
    application = await electron.launch({
      executablePath: electronPath,
      args: ['.', `--user-data-dir=${userDataDirectory}`],
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
      }
    })

    const page = await application.firstWindow()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await application.evaluate(({ BrowserWindow }, dimensions) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setContentSize(dimensions.width, dimensions.height)
      window.center()
    }, { width: requestedWindowWidth, height: requestedWindowHeight })

    await page.evaluate(({ language }) => {
      globalThis.window.localStorage.setItem('mqttape:language:v1', language)
      globalThis.window.localStorage.setItem('mqttape:theme:v1', 'midnight')
    }, { language: locale.language })
    await page.reload()
    await page.locator('html').waitFor()
    await page.waitForFunction(
      (language) => globalThis.document.documentElement.lang === language,
      locale.language
    )

    const viewport = await page.evaluate(() => ({
      width: globalThis.window.innerWidth,
      height: globalThis.window.innerHeight
    }))
    if (viewport.width < minimumScreenshotWidth || viewport.height < minimumScreenshotHeight) {
      throw new Error(
        `Electron content viewport is ${viewport.width}x${viewport.height}; expected at least ${minimumScreenshotWidth}x${minimumScreenshotHeight}.`
      )
    }

    const workspace = page.locator('.session-workspace:not([hidden])')
    const labels = locale.labels
    await workspace.getByLabel(labels.profileName).fill(locale.profileName)
    await workspace.getByLabel(labels.host).fill('broker.demo.local')
    await workspace.getByLabel(labels.port).fill('1883')
    await workspace.getByText(labels.advanced, { exact: true }).click()
    await workspace.getByLabel(labels.mqttVersion).selectOption('4')
    await workspace.getByLabel(labels.clientId).fill(locale.clientId)
    await takeScreenshot(page, paths.connection)

    await workspace.getByText(labels.advanced, { exact: true }).click()
    await workspace.getByLabel(labels.host).fill('127.0.0.1')
    await workspace.getByLabel(labels.port).fill(String(brokerPort))
    await workspace.getByRole('button', { name: labels.connect, exact: true }).click()
    await workspace.getByRole('button', { name: labels.disconnect, exact: true }).waitFor()

    await workspace.getByLabel(labels.subscriptionTopic).fill('factory/#')
    await workspace.getByLabel(labels.subscriptionQos).selectOption('1')
    await workspace.getByRole('button', { name: labels.subscriptionAdd, exact: true }).click()
    await workspace.locator('.subscribe-item').filter({ hasText: 'factory/#' }).waitFor()

    publisher = await connectPublisher(brokerPort, `${locale.clientId}_publisher`)
    for (const [topic, payload] of demoMessages) {
      await publish(publisher, topic, payload)
    }

    await workspace.getByLabel(labels.publishQos).selectOption('1')
    await workspace.getByLabel(labels.publishTopic).fill('factory/line-7/command')
    await workspace.getByLabel(labels.publishPayload).fill(JSON.stringify({
      command: 'calibrate',
      target: 'temperature-sensor',
      requestedBy: 'store-demo'
    }))
    await workspace.getByRole('button', { name: labels.publish, exact: true }).click()

    await waitForCount(workspace.locator('.msg'), demoMessages.length + 2)
    await takeScreenshot(page, paths.timeline)

    const inspectedMessage = workspace.locator('.msg-summary').filter({
      hasText: 'factory/line-7/status'
    }).first()
    await inspectedMessage.click()
    const expandedMessage = workspace.locator('.msg.expanded')
    await expandedMessage.waitFor()
    await expandedMessage.getByRole('tab', { name: 'JSON', exact: true }).click()
    await expandedMessage.evaluate((element) => {
      element.scrollIntoView({ block: 'start' })
    })
    await takeScreenshot(page, paths.inspector)

    await workspace.getByRole('button', { name: labels.packetFlows, exact: true }).click()
    await workspace.locator('.packet-flow-viewer').waitFor()
    await workspace.locator('.packet-flow.state-completed').first().waitFor()
    await takeScreenshot(page, paths.packetFlow)

    if (pageErrors.length > 0) {
      throw new Error(`Renderer errors while capturing ${locale.directory}: ${pageErrors.join(' | ')}`)
    }

    for (const path of Object.values(paths)) await validateScreenshot(path)
  } finally {
    try {
      await closePublisher(publisher)
    } finally {
      try {
        await application?.close()
      } finally {
        await rm(userDataDirectory, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200
        })
      }
    }
  }
}

async function main() {
  await buildDesktop()
  const broker = await startBroker()
  try {
    for (const locale of locales) await captureLocale(locale, broker.port)
  } finally {
    await broker.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
