import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CaptureFile,
  ConnectionConfig,
  MqttSessionId,
  PublishRequest,
  SaveBrokerProfileRequest,
  SubscribeRequest,
  TlsFileKind
} from '../shared/contracts'
import { isCaptureFile } from '../shared/capture'
import { mqttConnectionConfigError } from '../shared/connection-config'
import { MqttService } from './mqtt-service'
import { ProfileStore } from './profile-store'
import { UpdateService } from './update-service'
import { resolveUpdateSupport } from './update-support'
import {
  isLoRaWanDownlinkHistoryFile,
  type LoRaWanDownlinkHistoryFile
} from '../shared/lorawan-downlink-history'

let mainWindow: BrowserWindow | null = null
let updateService: UpdateService | null = null

const MAX_MQTT_SESSIONS = 8
const mqttServices = new Map<MqttSessionId, MqttService>()
const selectedTlsFiles = new Set<string>()

function assertSessionId(sessionId: MqttSessionId): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) throw new Error('Invalid MQTT session identifier.')
}

function mqttServiceFor(sessionId: MqttSessionId): MqttService {
  assertSessionId(sessionId)
  const current = mqttServices.get(sessionId)
  if (current) return current
  if (mqttServices.size >= MAX_MQTT_SESSIONS) {
    throw new Error(`Up to ${MAX_MQTT_SESSIONS} MQTT sessions can be open at the same time.`)
  }
  const service = new MqttService(
    (status) => mainWindow?.webContents.send('mqttape:status', sessionId, status),
    (message) => mainWindow?.webContents.send('mqttape:message', sessionId, message),
    (event) => mainWindow?.webContents.send('mqttape:packet', sessionId, event)
  )
  mqttServices.set(sessionId, service)
  return service
}

// Only the connect handler may create a session slot; every other call must not
// resurrect a session the renderer already destroyed.
function existingMqttService(sessionId: MqttSessionId): MqttService | undefined {
  assertSessionId(sessionId)
  return mqttServices.get(sessionId)
}

async function destroyMqttSession(sessionId: MqttSessionId): Promise<void> {
  assertSessionId(sessionId)
  const service = mqttServices.get(sessionId)
  if (!service) return
  mqttServices.delete(sessionId)
  await service.disconnect()
}

async function disconnectAllMqttSessions(): Promise<void> {
  const services = [...mqttServices.values()]
  mqttServices.clear()
  await Promise.all(services.map((service) => service.disconnect()))
}

async function assertTrustedTlsPaths(
  config: ConnectionConfig,
  profileStore: ProfileStore
): Promise<void> {
  const paths = [config.caPath, config.clientCertificatePath, config.clientKeyPath]
  for (const path of paths) {
    if (!path || selectedTlsFiles.has(path) || await profileStore.isTrustedTlsPath(path)) continue
    throw new Error('Select TLS files through MQTTape before connecting or saving a profile.')
  }
}

function registerIpcHandlers(profileStore: ProfileStore, updater: UpdateService): void {
  ipcMain.handle('mqttape:connect', async (
    _event,
    sessionId: MqttSessionId,
    config: ConnectionConfig
  ) => {
    const connectionError = mqttConnectionConfigError(config)
    if (connectionError) throw new Error(connectionError)
    // Register the slot before any await so a destroy-session arriving during
    // the trusted-path check can find and tear it down.
    const service = mqttServiceFor(sessionId)
    await assertTrustedTlsPaths(config, profileStore)
    if (mqttServices.get(sessionId) !== service) {
      throw new Error('The MQTT session was closed before the connection started.')
    }
    return service.connect(config)
  })
  ipcMain.handle('mqttape:disconnect', (_event, sessionId: MqttSessionId) =>
    existingMqttService(sessionId)?.disconnect()
  )
  ipcMain.handle('mqttape:destroy-session', (_event, sessionId: MqttSessionId) =>
    destroyMqttSession(sessionId)
  )
  ipcMain.handle('mqttape:subscribe', (
    _event,
    sessionId: MqttSessionId,
    request: SubscribeRequest
  ) => {
    const service = existingMqttService(sessionId)
    if (!service) throw new Error('Connect to a broker first.')
    return service.subscribe(request)
  })
  ipcMain.handle('mqttape:unsubscribe', (_event, sessionId: MqttSessionId, topic: string) =>
    existingMqttService(sessionId)?.unsubscribe(topic)
  )
  ipcMain.handle('mqttape:publish', (
    _event,
    sessionId: MqttSessionId,
    request: PublishRequest
  ) => {
    const service = existingMqttService(sessionId)
    if (!service) throw new Error('Connect to a broker first.')
    return service.publish(request)
  })
  ipcMain.handle('mqttape:save-capture', async (_event, capture: CaptureFile) => {
    if (!isCaptureFile(capture)) throw new Error('The MQTTape capture is not valid.')
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export MQTTape capture',
      defaultPath: join(
        app.getPath('documents'),
        `mqttape-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      ),
      filters: [{ name: 'MQTTape capture', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, JSON.stringify(capture, null, 2), 'utf8')
    return true
  })
  ipcMain.handle(
    'mqttape:save-downlink-history',
    async (_event, history: LoRaWanDownlinkHistoryFile) => {
      if (!isLoRaWanDownlinkHistoryFile(history)) {
        throw new Error('The downlink history is not valid.')
      }
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Export MQTTape downlink history',
        defaultPath: join(
          app.getPath('documents'),
          `mqttape-downlinks-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        ),
        filters: [{ name: 'MQTTape downlink history', extensions: ['json'] }]
      })

      if (result.canceled || !result.filePath) return false
      await writeFile(result.filePath, JSON.stringify(history, null, 2), 'utf8')
      return true
    }
  )
  ipcMain.handle('mqttape:list-profiles', () => profileStore.list())
  ipcMain.handle(
    'mqttape:save-profile',
    async (_event, request: SaveBrokerProfileRequest) => {
      await assertTrustedTlsPaths(request.config, profileStore)
      return profileStore.save(request)
    }
  )
  ipcMain.handle('mqttape:delete-profile', (_event, id: string) => profileStore.delete(id))
  ipcMain.handle('mqttape:select-tls-file', async (_event, kind: TlsFileKind) => {
    const filters: Record<TlsFileKind, Electron.FileFilter[]> = {
      ca: [{ name: 'Certificate authority', extensions: ['pem', 'crt', 'cer'] }],
      certificate: [{ name: 'Client certificate', extensions: ['pem', 'crt', 'cer'] }],
      key: [{ name: 'Client private key', extensions: ['key', 'pem'] }]
    }
    if (!filters[kind]) throw new Error('Unsupported TLS file type.')
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select TLS file',
      properties: ['openFile'],
      filters: filters[kind]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const [path] = result.filePaths
    selectedTlsFiles.add(path)
    return path
  })
  ipcMain.handle('mqttape:get-update-status', () => updater.getStatus())
  ipcMain.handle('mqttape:check-for-updates', () => updater.checkForUpdates())
  ipcMain.handle('mqttape:install-update', () => updater.installUpdate())
}

function readLinuxPackageType(): string | undefined {
  if (process.platform !== 'linux') return undefined
  const packageTypePath = join(process.resourcesPath, 'package-type')
  if (!existsSync(packageTypePath)) return undefined
  try {
    return readFileSync(packageTypePath, 'utf8').trim()
  } catch {
    return undefined
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0b0f14',
    title: 'MQTTape',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    const profileStore = new ProfileStore(join(app.getPath('userData'), 'profiles.json'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value)
    })
    updateService = new UpdateService(
      app.getVersion(),
      resolveUpdateSupport({
        isPackaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch,
        windowsStore: process.windowsStore,
        portableExecutableDirectory: process.env.PORTABLE_EXECUTABLE_DIR,
        appImagePath: process.env.APPIMAGE,
        linuxPackageType: readLinuxPackageType()
      }),
      (status) => mainWindow?.webContents.send('mqttape:update-status', status)
    )
    registerIpcHandlers(profileStore, updateService)
    createWindow()
    updateService.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  // Let every client flush its DISCONNECT packet before quitting; killing the
  // sockets abruptly would make brokers publish the sessions' Last Will.
  void disconnectAllMqttSessions().finally(() => {
    if (process.platform !== 'darwin') app.quit()
  })
})

app.on('before-quit', () => updateService?.dispose())
