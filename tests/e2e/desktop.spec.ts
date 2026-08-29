import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron, expect, test } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const packagedExecutable = process.env.MQTTAPE_E2E_EXECUTABLE

test('desktop shell starts with the restricted preload bridge', async () => {
  test.setTimeout(60_000)
  const userDataDirectory = await mkdtemp(join(tmpdir(), 'mqttape-e2e-'))
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined

  try {
    const storedConfig = {
      name: 'Stored desktop broker',
      protocol: 'mqtt',
      host: '127.0.0.1',
      port: 1883,
      path: 'mqtt',
      clientId: 'mqttape_desktop_profile',
      username: '',
      mqttVersion: 5,
      clean: true,
      keepalive: 60,
      reconnectPeriod: 1_000,
      rejectUnauthorized: true,
      caPath: '',
      clientCertificatePath: '',
      clientKeyPath: ''
    }
    await writeFile(join(userDataDirectory, 'profiles.json'), JSON.stringify({
      version: 1,
      profiles: [
        { id: 'stored-valid', config: storedConfig },
        { id: 'stored-invalid', config: { ...storedConfig, host: 127 } }
      ]
    }))
    application = await electron.launch({
      executablePath: packagedExecutable || electronPath,
      args: [
        ...(packagedExecutable ? [] : ['.']),
        `--user-data-dir=${userDataDirectory}`
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        ...(packagedExecutable && process.platform === 'win32'
          ? { PORTABLE_EXECUTABLE_DIR: userDataDirectory }
          : {})
      }
    })
    const window = await application.firstWindow()
    await expect(window).toHaveTitle('MQTTape')
    await expect(window.locator('html')).toHaveAttribute('lang', 'zh-TW')
    await expect(window.getByLabel('介面語言')).toHaveValue('zh-TW')
    await expect(window.getByTitle('桌面完整版')).toHaveText('桌面完整版')
    await expect(window.getByLabel('通訊協定')).toHaveValue('mqtt')
    await expect(window.getByLabel('連接埠')).toHaveValue('1883')
    await expect(window.getByLabel('已儲存的 Broker 設定檔').locator('option')).toHaveText([
      '新增未儲存的設定檔',
      'Stored desktop broker'
    ])
    await window.getByLabel('已儲存的 Broker 設定檔').selectOption('stored-valid')
    await expect(window.getByLabel('主機')).toHaveValue('127.0.0.1')
    await expect(window.getByRole('note')).toContainText(
      'MQTT over TCP · 登記連接埠 1883 · 未加密'
    )

    await window.getByLabel('介面語言').selectOption('en')
    await expect(window.locator('html')).toHaveAttribute('lang', 'en')
    await expect(window.getByLabel('Interface language')).toHaveValue('en')

    const bridgeMethods = await window.evaluate(() => Object.keys(window.mqttape ?? {}).sort())
    expect(bridgeMethods).toEqual(expect.arrayContaining([
      'connect',
      'destroySession',
      'getUpdateStatus',
      'onMessage',
      'onPacket',
      'saveCapture',
      'saveDownlinkHistory'
    ]))

    const updateStatus = await window.evaluate(() => window.mqttape!.getUpdateStatus())
    if (packagedExecutable) {
      expect(updateStatus.reason).not.toBe('development')
      expect(updateStatus.currentVersion).toMatch(/^\d+\.\d+\.\d+/)
    } else {
      expect(updateStatus).toMatchObject({ mode: 'disabled', reason: 'development' })
    }

    await window.getByLabel('Protocol').selectOption('wss')
    await window.getByText('Advanced settings').click()
    await window.getByLabel('HTTP Authorization preset').selectOption('basic')
    await expect(window.getByLabel('HTTP Basic username')).toBeVisible()
    await expect(window.getByLabel('HTTP Basic password')).toBeVisible()
    await window.getByRole('button', { name: 'Add header' }).click()
    await expect(window.getByLabel('WebSocket header 1 name')).toBeVisible()
    await window.getByRole('button', { name: 'Add parameter' }).click()
    await expect(window.getByLabel('WebSocket query parameter 1 name')).toBeVisible()

    await expect(window.getByTitle('127.0.0.1:8084')).toHaveText('127.0.0.1:8084')
    await expect(window.getByRole('note')).toContainText('8084 is a common Broker default')
    await expect(window.getByLabel('HTTP Basic username')).toBeVisible()
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
})
