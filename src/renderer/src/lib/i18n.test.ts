import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  readLanguage,
  translate,
  translateKnownMessage,
  writeLanguage
} from './i18n'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

describe('i18n', () => {
  it('defaults to Traditional Chinese when no supported language is stored', () => {
    const storage = new MemoryStorage()
    expect(DEFAULT_LANGUAGE).toBe('zh-TW')
    expect(readLanguage(storage)).toBe('zh-TW')

    storage.setItem(LANGUAGE_STORAGE_KEY, 'fr')
    expect(readLanguage(storage)).toBe('zh-TW')
  })

  it('persists and restores Traditional Chinese', () => {
    const storage = new MemoryStorage()
    writeLanguage(storage, 'zh-TW')

    expect(readLanguage(storage)).toBe('zh-TW')
  })

  it('persists English only after the user selects it', () => {
    const storage = new MemoryStorage()
    writeLanguage(storage, 'en')

    expect(readLanguage(storage)).toBe('en')
  })

  it('keeps language switching usable when storage is unavailable', () => {
    expect(readLanguage({ getItem: () => { throw new Error('blocked') } })).toBe('zh-TW')
    expect(() => writeLanguage({ setItem: () => { throw new Error('blocked') } }, 'en'))
      .not.toThrow()
  })

  it('interpolates translated interface messages', () => {
    expect(translate('en', 'session.filterResult', { visible: 2, total: 5 }))
      .toBe('Showing 2 of 5 messages')
    expect(translate('zh-TW', 'session.filterResult', { visible: 2, total: 5 }))
      .toBe('顯示 5 則訊息中的 2 則')
    expect(translate('zh-TW', 'connection.protocolGuide.wss'))
      .toContain('8084 是部分 Broker 的常見預設')
  })

  it('localizes known validation and dynamic preset messages', () => {
    expect(translateKnownMessage('zh-TW', 'Publish topic is required.'))
      .toBe('必須輸入發布 Topic。')
    expect(translateKnownMessage('zh-TW', 'Replay presets are limited to 50.'))
      .toBe('重播預設最多只能有 50 個。')
    expect(translateKnownMessage('zh-TW', 'Applied “正式轉沙箱”.'))
      .toBe('已套用「正式轉沙箱」。')
    expect(translateKnownMessage(
      'zh-TW',
      'MQTT 5 publish properties require an MQTT 5 connection.'
    )).toBe('MQTT 5 發布屬性需要 MQTT 5 連線。')
    expect(translateKnownMessage('zh-TW', 'Last Will topic is required.'))
      .toBe('必須輸入 Last Will Topic。')
    expect(translateKnownMessage(
      'zh-TW',
      'Broker port must be a whole number from 1 to 65535.'
    )).toBe('Broker 連接埠必須是 1 到 65535 的整數。')
    expect(translateKnownMessage(
      'zh-TW',
      'Keep Alive must be a whole number from 0 to 65535 seconds.'
    )).toBe('Keep Alive 必須是 0 到 65535 秒的整數。')
    expect(translateKnownMessage(
      'zh-TW',
      'Client ID is required when Clean Session is disabled.'
    )).toBe('關閉 Clean Session 時必須輸入 Client ID。')
    expect(translateKnownMessage('zh-TW', 'Last Will settings are invalid.'))
      .toBe('Last Will 設定資料無效。')
  })

  it('keeps unknown broker errors unchanged', () => {
    expect(translateKnownMessage('zh-TW', 'ECONNREFUSED 127.0.0.1:1883'))
      .toBe('ECONNREFUSED 127.0.0.1:1883')
  })
})
