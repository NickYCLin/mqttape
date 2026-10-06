import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import {
  buildApplicationMenuTemplate,
  buildTrayMenuTemplate,
  desktopLabel,
  REPOSITORY_URL,
  type ApplicationMenuOptions
} from './desktop-menu'

function menuOptions(overrides: Partial<ApplicationMenuOptions> = {}): ApplicationMenuOptions {
  return {
    language: 'zh-TW',
    platform: 'win32',
    isDevelopment: false,
    trayAvailable: true,
    closeToTray: true,
    minimizeToTray: false,
    onToggleCloseToTray: vi.fn(),
    onToggleMinimizeToTray: vi.fn(),
    onOpenExternal: vi.fn(),
    ...overrides
  }
}

function submenu(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  return item.submenu as MenuItemConstructorOptions[]
}

function labels(items: MenuItemConstructorOptions[]): string[] {
  return items.filter((item) => item.type !== 'separator').map((item) => item.label ?? '')
}

describe('buildApplicationMenuTemplate', () => {
  it('localizes every top-level menu and item in Traditional Chinese', () => {
    const template = buildApplicationMenuTemplate(menuOptions())
    expect(labels(template)).toEqual(['檔案', '編輯', '檢視', '視窗', '說明'])
    expect(labels(submenu(template[0]))).toEqual([
      '關閉視窗時在系統匣繼續執行',
      '最小化時隱藏到系統匣',
      '關閉視窗',
      '結束 MQTTape'
    ])
    for (const item of template.flatMap(submenu)) {
      if (item.type !== 'separator') expect(item.label).toMatch(/[一-鿿]/)
    }
  })

  it('follows the English interface language', () => {
    const template = buildApplicationMenuTemplate(menuOptions({ language: 'en' }))
    expect(labels(template)).toEqual(['File', 'Edit', 'View', 'Window', 'Help'])
  })

  it('keeps developer reload tools out of packaged builds', () => {
    const roles = (isDevelopment: boolean) => buildApplicationMenuTemplate(
      menuOptions({ isDevelopment })
    ).flatMap(submenu).map((item) => item.role)
    expect(roles(false)).not.toContain('toggleDevTools')
    expect(roles(false)).not.toContain('reload')
    expect(roles(true)).toEqual(expect.arrayContaining(['reload', 'toggleDevTools']))
  })

  it('hides tray preferences when no tray icon could be created', () => {
    const template = buildApplicationMenuTemplate(menuOptions({ trayAvailable: false }))
    expect(labels(submenu(template[0]))).toEqual(['關閉視窗', '結束 MQTTape'])
  })

  it('puts tray preferences in the macOS application menu', () => {
    const template = buildApplicationMenuTemplate(menuOptions({ platform: 'darwin' }))
    expect(labels(template)[0]).toBe('MQTTape')
    expect(labels(submenu(template[0]))).toContain('關閉視窗時在系統匣繼續執行')
    expect(labels(submenu(template[1]))).toEqual(['關閉視窗'])
  })

  it('reports checkbox changes and opens the repository from Help', () => {
    const options = menuOptions()
    const template = buildApplicationMenuTemplate(options)
    const [closeToTray, minimizeToTray] = submenu(template[0])
    closeToTray.click?.({ checked: false } as Electron.MenuItem, undefined, {} as KeyboardEvent)
    minimizeToTray.click?.({ checked: true } as Electron.MenuItem, undefined, {} as KeyboardEvent)
    expect(options.onToggleCloseToTray).toHaveBeenCalledWith(false)
    expect(options.onToggleMinimizeToTray).toHaveBeenCalledWith(true)

    submenu(template[4])[0].click?.({} as Electron.MenuItem, undefined, {} as KeyboardEvent)
    expect(options.onOpenExternal).toHaveBeenCalledWith(REPOSITORY_URL)
  })
})

describe('buildTrayMenuTemplate', () => {
  it('shows the connected broker count and localized actions', () => {
    const onShow = vi.fn()
    const onQuit = vi.fn()
    const template = buildTrayMenuTemplate({
      language: 'zh-TW',
      connectedSessions: 2,
      closeToTray: true,
      minimizeToTray: true,
      onToggleCloseToTray: vi.fn(),
      onToggleMinimizeToTray: vi.fn(),
      onShow,
      onQuit
    })
    expect(labels(template)).toEqual([
      '顯示 MQTTape',
      '已連線 Broker：2',
      '關閉視窗時在系統匣繼續執行',
      '最小化時隱藏到系統匣',
      '結束 MQTTape'
    ])
    expect(template[1].enabled).toBe(false)
    expect(template.filter((item) => item.type === 'checkbox').map((item) => item.checked))
      .toEqual([true, true])
  })
})

describe('desktopLabel', () => {
  it('fills placeholders', () => {
    expect(desktopLabel('en', 'trayActiveSessions', { count: 3 })).toBe('Connected Brokers: 3')
  })
})
