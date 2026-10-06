import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  findChecksum,
  isNewerVersion,
  PackageReplacementUpdater,
  replacementAssetName,
  type Fetch
} from './package-replacement-updater'
import type { ReplacementTarget } from './update-support'

const temporaryDirectories: string[] = []

async function stagingDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mqttape-replacement-'))
  temporaryDirectories.push(directory)
  return join(directory, 'staging')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ))
})

const portableTarget: ReplacementTarget = {
  kind: 'windows-portable',
  arch: 'x64',
  executablePath: 'D:\\Tools\\MQTTape-0.14.0-portable-x64.exe'
}

function releaseFetch(files: Record<string, string | Uint8Array>, tag = 'v0.15.0'): Fetch {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/releases/latest')) {
      return Response.json({ tag_name: tag, draft: false, prerelease: false })
    }
    const name = url.slice(url.lastIndexOf('/') + 1)
    const body = files[name]
    if (body === undefined) return new Response('not found', { status: 404 })
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : new Uint8Array(body)
    return new Response(bytes, { headers: { 'content-length': String(bytes.byteLength) } })
  })
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function recordEvents(updater: PackageReplacementUpdater): string[] {
  const events: string[] = []
  for (const name of [
    'checking-for-update',
    'update-available',
    'download-progress',
    'update-downloaded',
    'update-not-available',
    'error'
  ]) {
    updater.on(name, () => events.push(name))
  }
  return events
}

describe('release helpers', () => {
  it('compares stable versions numerically', () => {
    expect(isNewerVersion('0.15.0', '0.14.0')).toBe(true)
    expect(isNewerVersion('v0.14.10', '0.14.9')).toBe(true)
    expect(isNewerVersion('0.14.0', '0.14.0')).toBe(false)
    expect(isNewerVersion('0.13.9', '0.14.0')).toBe(false)
    expect(isNewerVersion('0.15.0-beta.1', '0.14.0')).toBe(false)
  })

  it('names the release asset for each replaceable package', () => {
    expect(replacementAssetName(portableTarget, '0.15.0')).toBe('MQTTape-0.15.0-portable-x64.exe')
    expect(replacementAssetName(
      { kind: 'macos-bundle', arch: 'arm64', bundlePath: '/Applications/MQTTape.app' },
      '0.15.0'
    )).toBe('MQTTape-0.15.0-mac-arm64.zip')
  })

  it('reads sha256sum output in text and binary modes', () => {
    const hash = 'a'.repeat(64)
    const checksums = `${'b'.repeat(64)}  other.exe\n${hash} *MQTTape-0.15.0-portable-x64.exe\n`
    expect(findChecksum(checksums, 'MQTTape-0.15.0-portable-x64.exe')).toBe(hash)
    expect(findChecksum(checksums, 'missing.exe')).toBeNull()
  })
})

describe('PackageReplacementUpdater', () => {
  it('downloads and verifies a portable executable, then swaps it after quitting', async () => {
    const executable = new Uint8Array([0x4d, 0x5a, 1, 2, 3])
    const asset = 'MQTTape-0.15.0-portable-x64.exe'
    const staging = await stagingDirectory()
    const launchHelper = vi.fn()
    const quit = vi.fn()
    const updater = new PackageReplacementUpdater({
      currentVersion: '0.14.0',
      target: portableTarget,
      stagingDirectory: staging,
      fetch: releaseFetch({
        'SHA256SUMS.txt': `${sha256(executable)}  ${asset}\n`,
        [asset]: executable
      }),
      quit,
      processId: 4242,
      launchHelper
    })
    const events = recordEvents(updater)

    await updater.checkForUpdates()
    expect(events).toEqual([
      'checking-for-update',
      'update-available',
      'download-progress',
      'update-downloaded'
    ])
    expect(new Uint8Array(await readFile(join(staging, asset)))).toEqual(executable)
    expect(await readFile(join(staging, 'replace-portable.ps1'), 'utf8')).toContain('Move-Item')

    updater.quitAndInstall()
    expect(launchHelper).toHaveBeenCalledWith('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-WindowStyle',
      'Hidden',
      '-File',
      join(staging, 'replace-portable.ps1'),
      '-Source',
      join(staging, asset),
      '-Target',
      portableTarget.executablePath,
      '-ProcessId',
      '4242',
      '-Relaunch'
    ])
    expect(quit).toHaveBeenCalledOnce()

    // A later quit must not start a second replacement.
    updater.installOnQuit()
    expect(launchHelper).toHaveBeenCalledOnce()
  })

  it('installs on quit without relaunching', async () => {
    const asset = 'MQTTape-0.15.0-portable-x64.exe'
    const launchHelper = vi.fn()
    const updater = new PackageReplacementUpdater({
      currentVersion: '0.14.0',
      target: portableTarget,
      stagingDirectory: await stagingDirectory(),
      fetch: releaseFetch({ 'SHA256SUMS.txt': `${sha256('exe')}  ${asset}`, [asset]: 'exe' }),
      quit: vi.fn(),
      launchHelper
    })
    await updater.checkForUpdates()
    updater.installOnQuit()
    expect(launchHelper.mock.calls[0][1]).not.toContain('-Relaunch')
  })

  it('rejects a download whose checksum does not match', async () => {
    const asset = 'MQTTape-0.15.0-portable-x64.exe'
    const staging = await stagingDirectory()
    const launchHelper = vi.fn()
    const updater = new PackageReplacementUpdater({
      currentVersion: '0.14.0',
      target: portableTarget,
      stagingDirectory: staging,
      fetch: releaseFetch({
        'SHA256SUMS.txt': `${sha256('expected')}  ${asset}`,
        [asset]: 'tampered'
      }),
      quit: vi.fn(),
      launchHelper
    })
    const errors: Error[] = []
    updater.on('error', (error: Error) => errors.push(error))

    await updater.checkForUpdates()
    expect(errors[0]?.message).toContain('Checksum mismatch')
    await expect(stat(join(staging, asset))).rejects.toThrow()
    updater.quitAndInstall()
    expect(launchHelper).not.toHaveBeenCalled()
  })

  it('reports no update when the latest release is not newer', async () => {
    const fetch = releaseFetch({}, 'v0.14.0')
    const updater = new PackageReplacementUpdater({
      currentVersion: '0.14.0',
      target: portableTarget,
      stagingDirectory: await stagingDirectory(),
      fetch,
      quit: vi.fn()
    })
    const events = recordEvents(updater)
    await updater.checkForUpdates()
    expect(events).toEqual(['checking-for-update', 'update-not-available'])
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('extracts and validates a macOS bundle before staging the swap script', async () => {
    const asset = 'MQTTape-0.15.0-mac-arm64.zip'
    const staging = await stagingDirectory()
    const launchHelper = vi.fn()
    const extractZip = vi.fn(async (_archive: string, destination: string) => {
      await mkdir(join(destination, 'MQTTape.app', 'Contents'), { recursive: true })
      await writeFile(join(destination, 'MQTTape.app', 'Contents', 'Info.plist'), '<plist/>')
    })
    const updater = new PackageReplacementUpdater({
      currentVersion: '0.14.0',
      target: { kind: 'macos-bundle', arch: 'arm64', bundlePath: '/Applications/MQTTape.app' },
      stagingDirectory: staging,
      fetch: releaseFetch({ 'SHA256SUMS.txt': `${sha256('zip')}  ${asset}`, [asset]: 'zip' }),
      quit: vi.fn(),
      processId: 7,
      launchHelper,
      extractZip
    })

    await updater.checkForUpdates()
    expect(extractZip).toHaveBeenCalledWith(join(staging, asset), join(staging, 'extracted'))
    const script = join(staging, 'replace-bundle.sh')
    expect((await stat(script)).mode & 0o111).not.toBe(0)

    updater.quitAndInstall()
    expect(launchHelper).toHaveBeenCalledWith('/bin/bash', [
      script,
      '7',
      '/Applications/MQTTape.app',
      join(staging, 'extracted', 'MQTTape.app'),
      '1'
    ])
  })

  it('fails when the archive does not contain MQTTape.app', async () => {
    const asset = 'MQTTape-0.15.0-mac-x64.zip'
    const updater = new PackageReplacementUpdater({
      currentVersion: '0.14.0',
      target: { kind: 'macos-bundle', arch: 'x64', bundlePath: '/Applications/MQTTape.app' },
      stagingDirectory: await stagingDirectory(),
      fetch: releaseFetch({ 'SHA256SUMS.txt': `${sha256('zip')}  ${asset}`, [asset]: 'zip' }),
      quit: vi.fn(),
      extractZip: vi.fn(async () => undefined)
    })
    const events = recordEvents(updater)
    await updater.checkForUpdates()
    expect(events.at(-1)).toBe('error')
  })
})
