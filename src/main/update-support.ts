import type { UpdateMode, UpdateSupportReason } from '../shared/contracts'

export interface UpdateEnvironment {
  isPackaged: boolean
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  windowsStore?: boolean
  portableExecutableDirectory?: string
  portableExecutableFile?: string
  appImagePath?: string
  linuxPackageType?: string
  macBundlePath?: string
  macBundleWritable?: boolean
}

export type ReplacementTarget =
  | { kind: 'windows-portable'; arch: 'x64' | 'arm64'; executablePath: string }
  | { kind: 'macos-bundle'; arch: 'x64' | 'arm64'; bundlePath: string }

export interface UpdateSupport {
  mode: UpdateMode
  reason?: UpdateSupportReason
  // electron-updater reads `latest.yml` for both Windows architectures unless
  // the channel is set; ARM64 Setup builds publish `latest-arm64.yml`.
  channel?: string
  // Packages electron-updater cannot handle (portable executables and unsigned
  // macOS bundles) are updated by replacing the package file itself.
  replacement?: ReplacementTarget
}

export const WINDOWS_ARM64_UPDATE_CHANNEL = 'latest-arm64'

function isMacBundleLocationUpdatable(bundlePath: string): boolean {
  // Gatekeeper App Translocation and mounted disk images are read-only copies.
  return !bundlePath.includes('/AppTranslocation/') && !bundlePath.startsWith('/Volumes/')
}

export function resolveUpdateSupport(environment: UpdateEnvironment): UpdateSupport {
  if (!environment.isPackaged) return { mode: 'disabled', reason: 'development' }

  // Microsoft Store owns the MSIX update lifecycle. Running electron-updater
  // here could otherwise offer the unrelated NSIS package to Store users.
  if (environment.platform === 'win32' && environment.windowsStore) {
    return { mode: 'disabled', reason: 'microsoft-store' }
  }

  const { arch } = environment
  if (arch !== 'x64' && arch !== 'arm64') return { mode: 'manual', reason: 'unsupported-package' }

  if (environment.platform === 'darwin') {
    const bundlePath = environment.macBundlePath
    if (!bundlePath || !isMacBundleLocationUpdatable(bundlePath) || !environment.macBundleWritable) {
      return { mode: 'manual', reason: 'read-only-location' }
    }
    return { mode: 'automatic', replacement: { kind: 'macos-bundle', arch, bundlePath } }
  }

  if (environment.platform === 'win32') {
    if (environment.portableExecutableFile) {
      return {
        mode: 'automatic',
        replacement: {
          kind: 'windows-portable',
          arch,
          executablePath: environment.portableExecutableFile
        }
      }
    }
    if (environment.portableExecutableDirectory) return { mode: 'manual', reason: 'portable' }
    return arch === 'arm64'
      ? { mode: 'automatic', channel: WINDOWS_ARM64_UPDATE_CHANNEL }
      : { mode: 'automatic' }
  }

  if (environment.platform === 'linux') {
    // electron-updater already reads `latest-linux-arm64.yml` on ARM64.
    if (environment.appImagePath || environment.linuxPackageType === 'deb') {
      return { mode: 'automatic' }
    }
    return { mode: 'manual', reason: 'unsupported-package' }
  }

  return { mode: 'manual', reason: 'unsupported-package' }
}
