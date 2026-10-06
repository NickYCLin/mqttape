import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  safeStorage,
  session,
  shell,
  Tray
} from 'electron'
import { accessSync, constants as fsConstants, existsSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type {
  CaptureFile,
  ConnectionConfig,
  ConnectionState,
  InterfaceLanguage,
  MqttSessionId,
  PublishRequest,
  SaveBrokerProfileRequest,
  SubscribeRequest,
  TlsFileKind
} from '../shared/contracts'
import { isCaptureFile } from '../shared/capture'
import { mqttConnectionConfigError } from '../shared/connection-config'
import {
  buildApplicationMenuTemplate,
  buildTrayMenuTemplate,
  desktopLabel
} from './desktop-menu'
import { MqttService } from './mqtt-service'
import { ProfileStore } from './profile-store'
import { PackageReplacementUpdater } from './package-replacement-updater'
import { UpdateService } from './update-service'
import { resolveUpdateSupport, type UpdateSupport } from './update-support'
import { WindowPreferenceStore } from './window-preferences'
import {
  isLoRaWanDownlinkHistoryFile,
  type LoRaWanDownlinkHistoryFile
} from '../shared/lorawan-downlink-history'
import trayIconPath from '../../build/icon.png?asset'
import trayIconWindowsPath from '../../build/icon.ico?asset'

let mainWindow: BrowserWindow | null = null
let updateService: UpdateService | null = null
let windowPreferences: WindowPreferenceStore | null = null
let tray: Tray | null = null
let interfaceLanguage: InterfaceLanguage = 'zh-TW'
let isQuitting = false
let backgroundNoticeShown = false

const MAX_MQTT_SESSIONS = 8
const mqttServices = new Map<MqttSessionId, MqttService>()
const selectedTlsFiles = new Set<string>()
const sessionStates = new Map<MqttSessionId, ConnectionState>()

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
    (status) => {
      if (mqttServices.get(sessionId) === service) {
        sessionStates.set(sessionId, status.state)
        refreshTrayMenu()
      }
      mainWindow?.webContents.send('mqttape:status', sessionId, status)
    },
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
  sessionStates.delete(sessionId)
  refreshTrayMenu()
  await service.disconnect()
}

async function disconnectAllMqttSessions(): Promise<void> {
  const services = [...mqttServices.values()]
  mqttServices.clear()
  sessionStates.clear()
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
      const config = request && typeof request === 'object' ? request.config : undefined
      const connectionError = mqttConnectionConfigError(config)
      if (connectionError) throw new Error(connectionError)
      await assertTrustedTlsPaths(config as ConnectionConfig, profileStore)
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
  ipcMain.handle('mqttape:install-update', () => {
    // The updater quits through window close events, which must not be
    // redirected to the tray.
    isQuitting = true
    const installing = updater.installUpdate()
    if (!installing) isQuitting = false
    return installing
  })
  ipcMain.on('mqttape:set-interface-language', (_event, language: unknown) => {
    if (language !== 'en' && language !== 'zh-TW') return
    if (language === interfaceLanguage) return
    interfaceLanguage = language
    refreshApplicationMenu()
    refreshTrayMenu()
  })
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  mainWindow.setSkipTaskbar(false)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function quitApplication(): void {
  isQuitting = true
  app.quit()
}

async function updateWindowPreferences(
  changes: Parameters<WindowPreferenceStore['update']>[0]
): Promise<void> {
  if (!windowPreferences) return
  try {
    await windowPreferences.update(changes)
  } catch (error) {
    console.error('Failed to save MQTTape window preferences.', error)
  }
  refreshApplicationMenu()
  refreshTrayMenu()
}

function trayPreferenceOptions() {
  const preferences = windowPreferences?.value ?? { closeToTray: false, minimizeToTray: false }
  return {
    ...preferences,
    onToggleCloseToTray: (enabled: boolean) => {
      void updateWindowPreferences({ closeToTray: enabled })
    },
    onToggleMinimizeToTray: (enabled: boolean) => {
      void updateWindowPreferences({ minimizeToTray: enabled })
    }
  }
}

function refreshApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenuTemplate({
    ...trayPreferenceOptions(),
    language: interfaceLanguage,
    platform: process.platform,
    isDevelopment: !app.isPackaged,
    trayAvailable: tray !== null,
    onOpenExternal: (url) => void shell.openExternal(url)
  })))
}

function refreshTrayMenu(): void {
  if (!tray) return
  const connectedSessions = [...sessionStates.values()]
    .filter((state) => state === 'connected').length
  tray.setToolTip(desktopLabel(interfaceLanguage, 'trayTooltip'))
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate({
    ...trayPreferenceOptions(),
    language: interfaceLanguage,
    connectedSessions,
    onShow: showMainWindow,
    onQuit: quitApplication
  })))
}

function createTray(): void {
  try {
    const icon = process.platform === 'win32'
      ? nativeImage.createFromPath(trayIconWindowsPath)
      : nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
  } catch (error) {
    console.error('Failed to create the MQTTape tray icon.', error)
    tray = null
    return
  }
  // macOS opens the context menu on click; elsewhere a click restores the window.
  if (process.platform !== 'darwin') tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
  refreshTrayMenu()
}

function hideToTray(): void {
  if (!mainWindow) return
  mainWindow.setSkipTaskbar(true)
  mainWindow.hide()
  if (backgroundNoticeShown || process.platform !== 'win32' || !tray) return
  backgroundNoticeShown = true
  tray.displayBalloon({
    iconType: 'info',
    title: desktopLabel(interfaceLanguage, 'backgroundTitle'),
    content: desktopLabel(interfaceLanguage, 'backgroundBody')
  })
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

function macBundleLocation(): { macBundlePath?: string, macBundleWritable?: boolean } {
  if (process.platform !== 'darwin') return {}
  // Contents/MacOS/MQTTape -> MQTTape.app
  const bundlePath = resolve(process.execPath, '..', '..', '..')
  if (!bundlePath.endsWith('.app')) return {}
  try {
    accessSync(dirname(bundlePath), fsConstants.W_OK)
    accessSync(bundlePath, fsConstants.W_OK)
    return { macBundlePath: bundlePath, macBundleWritable: true }
  } catch {
    return { macBundlePath: bundlePath, macBundleWritable: false }
  }
}

function createUpdateService(support: UpdateSupport): UpdateService {
  const replacement = support.replacement
  return new UpdateService(
    app.getVersion(),
    support,
    (status) => mainWindow?.webContents.send('mqttape:update-status', status),
    replacement
      ? () => new PackageReplacementUpdater({
          currentVersion: app.getVersion(),
          target: replacement,
          stagingDirectory: join(app.getPath('temp'), 'mqttape-update'),
          fetch: (input, init) => net.fetch(input, init),
          quit: quitApplication
        })
      : undefined,
    support.channel
  )
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

  mainWindow.on('close', (event) => {
    if (isQuitting || !tray || !windowPreferences?.value.closeToTray) return
    event.preventDefault()
    hideToTray()
  })
  // Windows logoff and shutdown close windows without emitting before-quit.
  mainWindow.on('query-session-end', () => {
    isQuitting = true
  })
  mainWindow.on('minimize', () => {
    if (!tray || !windowPreferences?.value.minimizeToTray) return
    hideToTray()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) showMainWindow()
  })

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    const profileStore = new ProfileStore(join(app.getPath('userData'), 'profiles.json'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value)
    })
    updateService = createUpdateService(resolveUpdateSupport({
      isPackaged: app.isPackaged,
      platform: process.platform,
      arch: process.arch,
      windowsStore: process.windowsStore,
      portableExecutableDirectory: process.env.PORTABLE_EXECUTABLE_DIR,
      portableExecutableFile: process.env.PORTABLE_EXECUTABLE_FILE,
      appImagePath: process.env.APPIMAGE,
      linuxPackageType: readLinuxPackageType(),
      ...macBundleLocation()
    }))
    windowPreferences = new WindowPreferenceStore(
      join(app.getPath('userData'), 'window-preferences.json'),
      process.platform
    )
    await windowPreferences.load()
    registerIpcHandlers(profileStore, updateService)
    createTray()
    refreshApplicationMenu()
    createWindow()
    updateService.start()

    app.on('activate', () => showMainWindow())
  })
}

app.on('window-all-closed', () => {
  // Let every client flush its DISCONNECT packet before quitting; killing the
  // sockets abruptly would make brokers publish the sessions' Last Will.
  void disconnectAllMqttSessions().finally(() => {
    if (process.platform !== 'darwin') app.quit()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  updateService?.prepareForQuit()
  updateService?.dispose()
})

app.on('will-quit', () => {
  tray?.destroy()
  tray = null
})
