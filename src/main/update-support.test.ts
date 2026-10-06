import { describe, expect, it } from 'vitest'
import { resolveUpdateSupport } from './update-support'

describe('resolveUpdateSupport', () => {
  it('disables update checks for development builds', () => {
    expect(resolveUpdateSupport({ isPackaged: false, platform: 'win32', arch: 'x64' })).toEqual({
      mode: 'disabled',
      reason: 'development'
    })
  })

  it('enables automatic updates for an installed Windows build', () => {
    expect(resolveUpdateSupport({ isPackaged: true, platform: 'win32', arch: 'x64' })).toEqual({
      mode: 'automatic'
    })
  })

  it('leaves MSIX updates to Microsoft Store on every architecture', () => {
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'x64',
      windowsStore: true
    })).toEqual({ mode: 'disabled', reason: 'microsoft-store' })
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'arm64',
      windowsStore: true
    })).toEqual({ mode: 'disabled', reason: 'microsoft-store' })
  })

  it('replaces the Windows portable executable in place', () => {
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'arm64',
      portableExecutableDirectory: 'C:\\Tools',
      portableExecutableFile: 'C:\\Tools\\MQTTape.exe'
    })).toEqual({
      mode: 'automatic',
      replacement: {
        kind: 'windows-portable',
        arch: 'arm64',
        executablePath: 'C:\\Tools\\MQTTape.exe'
      }
    })
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'x64',
      portableExecutableDirectory: 'C:\\Tools'
    })).toEqual({ mode: 'manual', reason: 'portable' })
  })

  it('enables automatic updates for AppImage and Debian packages', () => {
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'linux',
      arch: 'x64',
      appImagePath: '/opt/MQTTape.AppImage'
    })).toEqual({ mode: 'automatic' })
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'linux',
      arch: 'x64',
      linuxPackageType: 'deb'
    })).toEqual({ mode: 'automatic' })
  })

  it('replaces writable macOS bundles and leaves read-only copies manual', () => {
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'darwin',
      arch: 'arm64',
      macBundlePath: '/Applications/MQTTape.app',
      macBundleWritable: true
    })).toEqual({
      mode: 'automatic',
      replacement: { kind: 'macos-bundle', arch: 'arm64', bundlePath: '/Applications/MQTTape.app' }
    })
    for (const macBundlePath of [
      '/Volumes/MQTTape 0.14.0/MQTTape.app',
      '/private/var/folders/x/AppTranslocation/1234/d/MQTTape.app'
    ]) {
      expect(resolveUpdateSupport({
        isPackaged: true,
        platform: 'darwin',
        arch: 'x64',
        macBundlePath,
        macBundleWritable: true
      })).toEqual({ mode: 'manual', reason: 'read-only-location' })
    }
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'darwin',
      arch: 'x64',
      macBundlePath: '/Applications/MQTTape.app',
      macBundleWritable: false
    })).toEqual({ mode: 'manual', reason: 'read-only-location' })
  })

  it('uses architecture-specific feeds for ARM64 installers', () => {
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'arm64'
    })).toEqual({ mode: 'automatic', channel: 'latest-arm64' })
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'linux',
      arch: 'arm64',
      appImagePath: '/opt/MQTTape-arm64.AppImage'
    })).toEqual({ mode: 'automatic' })
  })

  it('keeps unsupported platforms and architectures on manual downloads', () => {
    expect(resolveUpdateSupport({ isPackaged: true, platform: 'freebsd', arch: 'x64' })).toEqual({
      mode: 'manual',
      reason: 'unsupported-package'
    })
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'ia32'
    })).toEqual({ mode: 'manual', reason: 'unsupported-package' })
  })
})
