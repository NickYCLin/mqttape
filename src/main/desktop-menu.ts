import type { MenuItemConstructorOptions } from 'electron'
import type { InterfaceLanguage } from '../shared/contracts'

export const REPOSITORY_URL = 'https://github.com/NickYCLin/mqttape'

const labels = {
  en: {
    file: 'File',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    help: 'Help',
    about: 'About MQTTape',
    hide: 'Hide MQTTape',
    hideOthers: 'Hide Others',
    showAll: 'Show All',
    closeWindow: 'Close Window',
    quit: 'Quit MQTTape',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullScreen: 'Toggle Full Screen',
    reload: 'Reload',
    devTools: 'Toggle Developer Tools',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front',
    closeToTray: 'Keep Running in Tray When Closed',
    minimizeToTray: 'Hide to Tray When Minimized',
    website: 'MQTTape on GitHub',
    reportIssue: 'Report an Issue',
    show: 'Show MQTTape',
    trayTooltip: 'MQTTape',
    trayActiveSessions: 'Connected Brokers: {count}',
    backgroundTitle: 'MQTTape is still running',
    backgroundBody: 'Connections stay open. Open MQTTape again from the tray icon.'
  },
  'zh-TW': {
    file: '檔案',
    edit: '編輯',
    view: '檢視',
    window: '視窗',
    help: '說明',
    about: '關於 MQTTape',
    hide: '隱藏 MQTTape',
    hideOthers: '隱藏其他',
    showAll: '全部顯示',
    closeWindow: '關閉視窗',
    quit: '結束 MQTTape',
    undo: '復原',
    redo: '重做',
    cut: '剪下',
    copy: '複製',
    paste: '貼上',
    selectAll: '全選',
    resetZoom: '實際大小',
    zoomIn: '放大',
    zoomOut: '縮小',
    fullScreen: '切換全螢幕',
    reload: '重新載入',
    devTools: '切換開發人員工具',
    minimize: '最小化',
    zoom: '縮放',
    front: '全部移至最前',
    closeToTray: '關閉視窗時在系統匣繼續執行',
    minimizeToTray: '最小化時隱藏到系統匣',
    website: 'GitHub 上的 MQTTape',
    reportIssue: '回報問題',
    show: '顯示 MQTTape',
    trayTooltip: 'MQTTape',
    trayActiveSessions: '已連線 Broker：{count}',
    backgroundTitle: 'MQTTape 仍在背景執行',
    backgroundBody: '連線會持續保留，可從系統匣圖示重新開啟。'
  }
} satisfies Record<InterfaceLanguage, Record<string, string>>

export type DesktopLabelKey = keyof typeof labels.en

export function desktopLabel(
  language: InterfaceLanguage,
  key: DesktopLabelKey,
  parameters: Record<string, string | number> = {}
): string {
  return labels[language][key].replace(/\{(\w+)\}/g, (match, name: string) =>
    name in parameters ? String(parameters[name]) : match
  )
}

export interface TrayPreferenceItems {
  closeToTray: boolean
  minimizeToTray: boolean
  onToggleCloseToTray: (enabled: boolean) => void
  onToggleMinimizeToTray: (enabled: boolean) => void
}

export interface ApplicationMenuOptions extends TrayPreferenceItems {
  language: InterfaceLanguage
  platform: NodeJS.Platform
  isDevelopment: boolean
  // Tray preferences are hidden when the platform could not create a tray icon,
  // otherwise closing the window would leave no visible way back.
  trayAvailable: boolean
  onOpenExternal: (url: string) => void
}

function trayPreferenceItems(
  language: InterfaceLanguage,
  options: TrayPreferenceItems
): MenuItemConstructorOptions[] {
  return [
    {
      label: desktopLabel(language, 'closeToTray'),
      type: 'checkbox',
      checked: options.closeToTray,
      click: (item) => options.onToggleCloseToTray(item.checked)
    },
    {
      label: desktopLabel(language, 'minimizeToTray'),
      type: 'checkbox',
      checked: options.minimizeToTray,
      click: (item) => options.onToggleMinimizeToTray(item.checked)
    }
  ]
}

export function buildApplicationMenuTemplate(
  options: ApplicationMenuOptions
): MenuItemConstructorOptions[] {
  const { language, platform } = options
  const label = (key: DesktopLabelKey): string => desktopLabel(language, key)
  const isMac = platform === 'darwin'
  const trayItems: MenuItemConstructorOptions[] = options.trayAvailable
    ? [...trayPreferenceItems(language, options), { type: 'separator' }]
    : []

  const template: MenuItemConstructorOptions[] = []
  if (isMac) {
    template.push({
      label: 'MQTTape',
      submenu: [
        { role: 'about', label: label('about') },
        { type: 'separator' },
        ...trayItems,
        { role: 'hide', label: label('hide') },
        { role: 'hideOthers', label: label('hideOthers') },
        { role: 'unhide', label: label('showAll') },
        { type: 'separator' },
        { role: 'quit', label: label('quit') }
      ]
    })
  }

  template.push({
    label: label('file'),
    submenu: isMac
      ? [{ role: 'close', label: label('closeWindow') }]
      : [
          ...trayItems,
          { role: 'close', label: label('closeWindow') },
          { role: 'quit', label: label('quit') }
        ]
  })

  template.push({
    label: label('edit'),
    submenu: [
      { role: 'undo', label: label('undo') },
      { role: 'redo', label: label('redo') },
      { type: 'separator' },
      { role: 'cut', label: label('cut') },
      { role: 'copy', label: label('copy') },
      { role: 'paste', label: label('paste') },
      { role: 'selectAll', label: label('selectAll') }
    ]
  })

  template.push({
    label: label('view'),
    submenu: [
      ...(options.isDevelopment
        ? [
            { role: 'reload', label: label('reload') },
            { role: 'toggleDevTools', label: label('devTools') },
            { type: 'separator' }
          ] satisfies MenuItemConstructorOptions[]
        : []),
      { role: 'resetZoom', label: label('resetZoom') },
      { role: 'zoomIn', label: label('zoomIn') },
      { role: 'zoomOut', label: label('zoomOut') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: label('fullScreen') }
    ]
  })

  template.push({
    label: label('window'),
    submenu: isMac
      ? [
          { role: 'minimize', label: label('minimize') },
          { role: 'zoom', label: label('zoom') },
          { type: 'separator' },
          { role: 'front', label: label('front') }
        ]
      : [{ role: 'minimize', label: label('minimize') }]
  })

  template.push({
    label: label('help'),
    role: 'help',
    submenu: [
      { label: label('website'), click: () => options.onOpenExternal(REPOSITORY_URL) },
      {
        label: label('reportIssue'),
        click: () => options.onOpenExternal(`${REPOSITORY_URL}/issues/new`)
      }
    ]
  })

  return template
}

export interface TrayMenuOptions extends TrayPreferenceItems {
  language: InterfaceLanguage
  connectedSessions: number
  onShow: () => void
  onQuit: () => void
}

export function buildTrayMenuTemplate(options: TrayMenuOptions): MenuItemConstructorOptions[] {
  const { language } = options
  return [
    { label: desktopLabel(language, 'show'), click: options.onShow },
    {
      label: desktopLabel(language, 'trayActiveSessions', { count: options.connectedSessions }),
      enabled: false
    },
    { type: 'separator' },
    ...trayPreferenceItems(language, options),
    { type: 'separator' },
    { label: desktopLabel(language, 'quit'), click: options.onQuit }
  ]
}
