import type { UpdateMode, UpdateSupportReason } from '../shared/contracts'

export interface UpdateEnvironment {
  isPackaged: boolean
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  windowsStore?: boolean
  portableExecutableDirectory?: string
  appImagePath?: string
  linuxPackageType?: string
}

export interface UpdateSupport {
  mode: UpdateMode
  reason?: UpdateSupportReason
}

export function resolveUpdateSupport(environment: UpdateEnvironment): UpdateSupport {
  if (!environment.isPackaged) return { mode: 'disabled', reason: 'development' }

  // Microsoft Store owns the MSIX update lifecycle. Running electron-updater
  // here could otherwise offer the unrelated NSIS package to Store users.
  if (environment.platform === 'win32' && environment.windowsStore) {
    return { mode: 'disabled', reason: 'microsoft-store' }
  }

  // macOS builds are unsigned on every architecture, and that is the reason
  // users should see; the architecture check below would otherwise shadow it
  // on Apple Silicon.
  if (environment.platform === 'darwin') {
    return { mode: 'manual', reason: 'unsigned-macos' }
  }

  // Release metadata currently points at the x64 differential packages. ARM64
  // builds stay on explicit downloads until per-architecture feeds are split.
  if (environment.arch === 'arm64') {
    return { mode: 'manual', reason: 'unsupported-architecture' }
  }
  if (environment.arch !== 'x64') return { mode: 'manual', reason: 'unsupported-package' }

  if (environment.platform === 'win32') {
    return environment.portableExecutableDirectory
      ? { mode: 'manual', reason: 'portable' }
      : { mode: 'automatic' }
  }

  if (environment.platform === 'linux') {
    if (environment.appImagePath || environment.linuxPackageType === 'deb') {
      return { mode: 'automatic' }
    }
    return { mode: 'manual', reason: 'unsupported-package' }
  }

  return { mode: 'manual', reason: 'unsupported-package' }
}
