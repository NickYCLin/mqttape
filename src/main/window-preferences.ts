import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface WindowPreferences {
  closeToTray: boolean
  minimizeToTray: boolean
}

interface StoredWindowPreferences extends WindowPreferences {
  version: 1
}

// Some Linux desktops (GNOME without an AppIndicator extension) never show
// tray icons, so hiding the window there by default could strand the app.
export function defaultWindowPreferences(platform: NodeJS.Platform): WindowPreferences {
  return {
    closeToTray: platform !== 'linux',
    minimizeToTray: false
  }
}

export function normalizeWindowPreferences(
  value: unknown,
  platform: NodeJS.Platform
): WindowPreferences {
  const defaults = defaultWindowPreferences(platform)
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return defaults
  }
  const stored = value as Partial<StoredWindowPreferences>
  return {
    closeToTray: typeof stored.closeToTray === 'boolean' ? stored.closeToTray : defaults.closeToTray,
    minimizeToTray: typeof stored.minimizeToTray === 'boolean'
      ? stored.minimizeToTray
      : defaults.minimizeToTray
  }
}

export class WindowPreferenceStore {
  private current: WindowPreferences

  constructor(
    private readonly filePath: string,
    private readonly platform: NodeJS.Platform
  ) {
    this.current = defaultWindowPreferences(platform)
  }

  get value(): WindowPreferences {
    return { ...this.current }
  }

  async load(): Promise<WindowPreferences> {
    try {
      const contents = await readFile(this.filePath, 'utf8')
      this.current = normalizeWindowPreferences(JSON.parse(contents), this.platform)
    } catch {
      // A missing or unreadable file falls back to platform defaults.
      this.current = defaultWindowPreferences(this.platform)
    }
    return this.value
  }

  async update(changes: Partial<WindowPreferences>): Promise<WindowPreferences> {
    this.current = normalizeWindowPreferences(
      { version: 1, ...this.current, ...changes },
      this.platform
    )
    const stored: StoredWindowPreferences = { version: 1, ...this.current }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(stored, null, 2), 'utf8')
    return this.value
  }
}
