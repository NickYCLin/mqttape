import { EventEmitter } from 'node:events'
import type {
  AppUpdater,
  ProgressInfo,
  UpdateDownloadedEvent,
  UpdateInfo
} from 'electron-updater'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateStatus } from '../shared/contracts'
import { UpdateService } from './update-service'

function createUpdater() {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    autoRunAppAfterInstall: false,
    allowPrerelease: true,
    disableWebInstaller: false,
    checkForUpdates: vi.fn(async () => null),
    quitAndInstall: vi.fn()
  }) as unknown as AppUpdater
}

describe('UpdateService', () => {
  afterEach(() => vi.restoreAllMocks())

  it('tracks a downloaded automatic update and installs it on request', async () => {
    const updater = createUpdater()
    const statuses: AppUpdateStatus[] = []
    const service = new UpdateService(
      '0.7.0',
      { mode: 'automatic' },
      (status) => statuses.push(status),
      () => updater
    )

    service.start()
    expect(updater.autoDownload).toBe(true)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    expect(updater.disableWebInstaller).toBe(true)

    const updateInfo: UpdateInfo = {
      version: '0.8.0',
      files: [],
      path: '',
      sha512: '',
      releaseDate: '2026-08-17T00:00:00.000Z'
    }
    const progress: ProgressInfo = {
      percent: 51.6,
      total: 100,
      delta: 51.6,
      transferred: 51.6,
      bytesPerSecond: 10
    }
    const downloaded: UpdateDownloadedEvent = {
      ...updateInfo,
      downloadedFile: 'MQTTape-Setup-0.8.0-x64.exe'
    }
    updater.emit('update-available', updateInfo)
    updater.emit('download-progress', progress)
    updater.emit('update-downloaded', downloaded)

    expect(service.getStatus()).toEqual({
      mode: 'automatic',
      state: 'downloaded',
      currentVersion: '0.7.0',
      targetVersion: '0.8.0',
      progress: 100
    })
    expect(statuses.map((status) => status.state)).toEqual([
      'available',
      'downloading',
      'downloaded'
    ])
    expect(service.installUpdate()).toBe(true)
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    service.dispose()
  })

  it('checks on demand and leaves manual packages untouched', async () => {
    const automaticUpdater = createUpdater()
    const automatic = new UpdateService(
      '0.7.0',
      { mode: 'automatic' },
      () => undefined,
      () => automaticUpdater
    )
    automatic.start()
    await automatic.checkForUpdates()
    expect(automaticUpdater.checkForUpdates).toHaveBeenCalledOnce()
    automatic.dispose()

    const factory = vi.fn(() => createUpdater())
    const manual = new UpdateService(
      '0.7.0',
      { mode: 'manual', reason: 'portable' },
      () => undefined,
      factory
    )
    manual.start()
    expect(factory).not.toHaveBeenCalled()
    expect(await manual.checkForUpdates()).toEqual({
      mode: 'manual',
      state: 'idle',
      currentVersion: '0.7.0',
      reason: 'portable'
    })
  })

  it('pins ARM64 Setup builds to their own feed without allowing downgrades', () => {
    const updater = createUpdater()
    const service = new UpdateService(
      '0.14.0',
      { mode: 'automatic' },
      () => undefined,
      () => updater,
      'latest-arm64'
    )
    service.start()
    expect(updater.channel).toBe('latest-arm64')
    expect(updater.allowDowngrade).toBe(false)
    service.dispose()
  })

  it('applies a downloaded update when the app quits', () => {
    const installOnQuit = vi.fn()
    const updater = Object.assign(createUpdater(), { installOnQuit })
    const service = new UpdateService('0.14.0', { mode: 'automatic' }, () => undefined, () => updater)
    service.start()
    service.prepareForQuit()
    expect(installOnQuit).not.toHaveBeenCalled()

    updater.emit('update-downloaded', { version: '0.15.0' } as UpdateDownloadedEvent)
    service.prepareForQuit()
    expect(installOnQuit).toHaveBeenCalledOnce()
    service.dispose()
  })
})
