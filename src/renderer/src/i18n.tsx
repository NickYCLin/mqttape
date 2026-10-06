import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import {
  readLanguage,
  translate,
  translateKnownMessage,
  writeLanguage,
  type Language,
  type TranslationKey,
  type TranslationParameters
} from './lib/i18n'

interface I18nContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, parameters?: TranslationParameters) => string
  translateMessage: (message: string) => string
  formatNumber: (value: number) => string
  formatDateTime: (value: string | number | Date) => string
  formatTime: (value: string | number | Date, milliseconds?: boolean) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readLanguage(window.localStorage))

  useEffect(() => {
    document.documentElement.lang = language
    // The desktop shell localizes its native menu and tray from this value.
    window.mqttape?.setInterfaceLanguage(language)
  }, [language])

  const setLanguage = useCallback((nextLanguage: Language): void => {
    writeLanguage(window.localStorage, nextLanguage)
    document.documentElement.lang = nextLanguage
    setLanguageState(nextLanguage)
  }, [])

  const t = useCallback(
    (key: TranslationKey, parameters?: TranslationParameters) =>
      translate(language, key, parameters),
    [language]
  )
  const localizeMessage = useCallback(
    (message: string) => translateKnownMessage(language, message),
    [language]
  )
  const formatNumber = useCallback(
    (value: number) => new Intl.NumberFormat(language).format(value),
    [language]
  )
  const formatDateTime = useCallback(
    (value: string | number | Date) => new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    }).format(new Date(value)),
    [language]
  )
  const formatTime = useCallback(
    (value: string | number | Date, milliseconds = false) => new Intl.DateTimeFormat(language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...(milliseconds ? { fractionalSecondDigits: 3 as const } : {}),
      hour12: false
    }).format(new Date(value)),
    [language]
  )

  const context = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t,
    translateMessage: localizeMessage,
    formatNumber,
    formatDateTime,
    formatTime
  }), [formatDateTime, formatNumber, formatTime, language, localizeMessage, setLanguage, t])

  return <I18nContext.Provider value={context}>{children}</I18nContext.Provider>
}

// This co-located hook keeps every consumer tied to the provider's private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside LanguageProvider.')
  return context
}
