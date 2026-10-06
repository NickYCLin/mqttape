import { spawn, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { access, mkdir, open, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ReplacementTarget } from './update-support'

const RELEASES_API_URL = 'https://api.github.com/repos/NickYCLin/mqttape/releases/latest'
const RELEASE_DOWNLOAD_URL = 'https://github.com/NickYCLin/mqttape/releases/download'
const CHECKSUM_FILE = 'SHA256SUMS.txt'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ReplacementUpdaterOptions {
  currentVersion: string
  target: ReplacementTarget
  stagingDirectory: string
  fetch: Fetch
  quit: () => void
  processId?: number
  // Overridable for tests; production uses detached helpers and ditto.
  launchHelper?: (command: string, args: string[]) => void
  extractZip?: (archivePath: string, destination: string) => Promise<void>
}

interface PendingUpdate {
  version: string
  // The portable executable or the extracted MQTTape.app.
  stagedPath: string
}

export function parseVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate)
  const installed = parseVersion(current)
  if (!next || !installed) return false
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index]
  }
  return false
}

export function replacementAssetName(target: ReplacementTarget, version: string): string {
  return target.kind === 'windows-portable'
    ? `MQTTape-${version}-portable-${target.arch}.exe`
    : `MQTTape-${version}-mac-${target.arch}.zip`
}

export function findChecksum(checksums: string, fileName: string): string | null {
  for (const line of checksums.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim())
    if (match && match[2] === fileName) return match[1].toLowerCase()
  }
  return null
}

export const WINDOWS_REPLACEMENT_SCRIPT = `param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Target,
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [switch]$Relaunch
)
$ErrorActionPreference = 'Stop'
try { Wait-Process -Id $ProcessId -Timeout 60 -ErrorAction SilentlyContinue } catch {}
$incoming = "$Target.update"
Copy-Item -LiteralPath $Source -Destination $incoming -Force
# The portable launcher keeps the executable locked until it finishes cleaning up.
$deadline = (Get-Date).AddMinutes(2)
while ($true) {
  try {
    Move-Item -LiteralPath $incoming -Destination $Target -Force
    break
  } catch {
    if ((Get-Date) -gt $deadline) {
      Remove-Item -LiteralPath $incoming -Force -ErrorAction SilentlyContinue
      exit 1
    }
    Start-Sleep -Milliseconds 500
  }
}
Remove-Item -LiteralPath $Source -Force -ErrorAction SilentlyContinue
if ($Relaunch) { Start-Process -FilePath $Target }
`

export const MACOS_REPLACEMENT_SCRIPT = `#!/bin/bash
pid="$1"
target="$2"
staged="$3"
relaunch="$4"
while kill -0 "$pid" 2>/dev/null; do sleep 0.5; done
backup="$target.mqttape-previous"
rm -rf "$backup"
if mv "$target" "$backup"; then
  if mv "$staged" "$target"; then
    rm -rf "$backup"
  else
    mv "$backup" "$target"
  fi
fi
xattr -dr com.apple.quarantine "$target" 2>/dev/null
if [ "$relaunch" = "1" ]; then open "$target"; fi
`

function launchDetached(command: string, args: string[]): void {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

async function extractWithDitto(archivePath: string, destination: string): Promise<void> {
  await promisify(execFile)('/usr/bin/ditto', ['-x', '-k', archivePath, destination])
}

/**
 * Updates packages electron-updater cannot handle by downloading the next
 * GitHub release asset, verifying it against SHA256SUMS.txt, and swapping the
 * package file once MQTTape has exited. It exposes the subset of the
 * electron-updater AppUpdater interface that UpdateService relies on.
 */
export class PackageReplacementUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  autoRunAppAfterInstall = true
  allowPrerelease = false
  disableWebInstaller = true

  private pending: PendingUpdate | null = null
  private installing = false
  private readonly launchHelper: (command: string, args: string[]) => void
  private readonly extractZip: (archivePath: string, destination: string) => Promise<void>

  constructor(private readonly options: ReplacementUpdaterOptions) {
    super()
    this.launchHelper = options.launchHelper ?? launchDetached
    this.extractZip = options.extractZip ?? extractWithDitto
  }

  async checkForUpdates(): Promise<null> {
    this.emit('checking-for-update')
    try {
      const version = await this.latestVersion()
      if (!isNewerVersion(version, this.options.currentVersion)) {
        this.emit('update-not-available', { version })
        return null
      }
      if (this.pending?.version === version) {
        this.emit('update-downloaded', { version })
        return null
      }
      this.emit('update-available', { version })
      this.pending = await this.download(version)
      this.emit('update-downloaded', { version })
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    }
    return null
  }

  quitAndInstall(): void {
    if (!this.pending) return
    this.startReplacement(true)
    this.options.quit()
  }

  // Mirrors electron-updater's autoInstallOnAppQuit: a downloaded update is
  // applied when the user quits, without starting MQTTape again.
  installOnQuit(): void {
    if (!this.pending || !this.autoInstallOnAppQuit) return
    this.startReplacement(false)
  }

  private startReplacement(relaunch: boolean): void {
    if (!this.pending || this.installing) return
    this.installing = true
    const processId = String(this.options.processId ?? process.pid)
    const { target, stagingDirectory } = this.options
    if (target.kind === 'windows-portable') {
      this.launchHelper('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        join(stagingDirectory, 'replace-portable.ps1'),
        '-Source',
        this.pending.stagedPath,
        '-Target',
        target.executablePath,
        '-ProcessId',
        processId,
        ...(relaunch ? ['-Relaunch'] : [])
      ])
    } else {
      this.launchHelper('/bin/bash', [
        join(stagingDirectory, 'replace-bundle.sh'),
        processId,
        target.bundlePath,
        this.pending.stagedPath,
        relaunch ? '1' : '0'
      ])
    }
  }

  private async latestVersion(): Promise<string> {
    const response = await this.options.fetch(RELEASES_API_URL, {
      headers: { accept: 'application/vnd.github+json' }
    })
    if (!response.ok) throw new Error(`GitHub release lookup failed: HTTP ${response.status}`)
    const release = await response.json() as { tag_name?: unknown, draft?: unknown, prerelease?: unknown }
    if (typeof release.tag_name !== 'string' || release.draft || release.prerelease) {
      throw new Error('GitHub did not return a stable MQTTape release.')
    }
    const version = release.tag_name.replace(/^v/, '')
    if (!parseVersion(version)) throw new Error(`Unexpected release tag: ${release.tag_name}`)
    return version
  }

  private async download(version: string): Promise<PendingUpdate> {
    const { target, stagingDirectory } = this.options
    const assetName = replacementAssetName(target, version)
    const baseUrl = `${RELEASE_DOWNLOAD_URL}/v${version}`

    const checksumResponse = await this.options.fetch(`${baseUrl}/${CHECKSUM_FILE}`)
    if (!checksumResponse.ok) {
      throw new Error(`Checksum download failed: HTTP ${checksumResponse.status}`)
    }
    const expectedHash = findChecksum(await checksumResponse.text(), assetName)
    if (!expectedHash) throw new Error(`${CHECKSUM_FILE} does not list ${assetName}.`)

    await rm(stagingDirectory, { recursive: true, force: true })
    await mkdir(stagingDirectory, { recursive: true })
    const assetPath = join(stagingDirectory, assetName)
    const actualHash = await this.downloadAsset(`${baseUrl}/${assetName}`, assetPath)
    if (actualHash !== expectedHash) {
      await rm(assetPath, { force: true })
      throw new Error(`Checksum mismatch for ${assetName}.`)
    }

    if (target.kind === 'windows-portable') {
      await writeFile(
        join(stagingDirectory, 'replace-portable.ps1'),
        WINDOWS_REPLACEMENT_SCRIPT,
        'utf8'
      )
      return { version, stagedPath: assetPath }
    }

    const extracted = join(stagingDirectory, 'extracted')
    await this.extractZip(assetPath, extracted)
    const bundle = join(extracted, 'MQTTape.app')
    await access(join(bundle, 'Contents', 'Info.plist'))
    await rm(assetPath, { force: true })
    await writeFile(join(stagingDirectory, 'replace-bundle.sh'), MACOS_REPLACEMENT_SCRIPT, {
      encoding: 'utf8',
      mode: 0o755
    })
    return { version, stagedPath: bundle }
  }

  private async downloadAsset(url: string, destination: string): Promise<string> {
    const response = await this.options.fetch(url)
    if (!response.ok || !response.body) throw new Error(`Update download failed: HTTP ${response.status}`)
    const total = Number(response.headers.get('content-length')) || 0
    const hash = createHash('sha256')
    const file = await open(destination, 'w')
    let transferred = 0
    try {
      const reader = response.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        await file.write(value)
        transferred += value.byteLength
        if (total > 0) {
          this.emit('download-progress', {
            percent: (transferred / total) * 100,
            transferred,
            total
          })
        }
      }
    } finally {
      await file.close()
    }
    return hash.digest('hex')
  }
}
