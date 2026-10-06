import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultWindowPreferences,
  normalizeWindowPreferences,
  WindowPreferenceStore
} from './window-preferences'

const temporaryDirectories: string[] = []

async function preferencePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mqttape-window-preferences-'))
  temporaryDirectories.push(directory)
  return join(directory, 'window-preferences.json')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('window preferences', () => {
  it('keeps running in the tray by default except on Linux', () => {
    expect(defaultWindowPreferences('win32')).toEqual({ closeToTray: true, minimizeToTray: false })
    expect(defaultWindowPreferences('darwin').closeToTray).toBe(true)
    expect(defaultWindowPreferences('linux').closeToTray).toBe(false)
  })

  it('falls back to defaults for unknown versions and damaged fields', () => {
    expect(normalizeWindowPreferences({ version: 2, closeToTray: false }, 'win32'))
      .toEqual(defaultWindowPreferences('win32'))
    expect(normalizeWindowPreferences(
      { version: 1, closeToTray: 'yes', minimizeToTray: true },
      'win32'
    )).toEqual({ closeToTray: true, minimizeToTray: true })
  })

  it('persists changes and restores them', async () => {
    const path = await preferencePath()
    const store = new WindowPreferenceStore(path, 'win32')
    expect(await store.load()).toEqual(defaultWindowPreferences('win32'))

    await store.update({ closeToTray: false, minimizeToTray: true })
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({
      version: 1,
      closeToTray: false,
      minimizeToTray: true
    })
    expect(await new WindowPreferenceStore(path, 'win32').load())
      .toEqual({ closeToTray: false, minimizeToTray: true })
  })

  it('ignores a malformed preference file', async () => {
    const path = await preferencePath()
    await writeFile(path, '{not json', 'utf8')
    expect(await new WindowPreferenceStore(path, 'linux').load())
      .toEqual(defaultWindowPreferences('linux'))
  })
})
