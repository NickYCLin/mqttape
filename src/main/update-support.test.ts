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

  it('keeps the Windows portable build on manual downloads', () => {
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'x64',
      portableExecutableDirectory: 'C:\\Tools\\MQTTape'
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

  it('keeps unsigned macOS and unsupported packages on manual downloads', () => {
    expect(resolveUpdateSupport({ isPackaged: true, platform: 'darwin', arch: 'x64' })).toEqual({
      mode: 'manual',
      reason: 'unsigned-macos'
    })
    expect(resolveUpdateSupport({ isPackaged: true, platform: 'darwin', arch: 'arm64' })).toEqual({
      mode: 'manual',
      reason: 'unsigned-macos'
    })
    expect(resolveUpdateSupport({ isPackaged: true, platform: 'freebsd', arch: 'x64' })).toEqual({
      mode: 'manual',
      reason: 'unsupported-package'
    })
  })

  it('keeps ARM64 packages on architecture-specific manual downloads', () => {
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'arm64'
    })).toEqual({ mode: 'manual', reason: 'unsupported-architecture' })
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'linux',
      arch: 'arm64',
      appImagePath: '/opt/MQTTape-arm64.AppImage'
    })).toEqual({ mode: 'manual', reason: 'unsupported-architecture' })
    expect(resolveUpdateSupport({
      isPackaged: true,
      platform: 'win32',
      arch: 'ia32'
    })).toEqual({ mode: 'manual', reason: 'unsupported-package' })
  })
})
