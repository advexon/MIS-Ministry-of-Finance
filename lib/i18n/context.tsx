'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { translations, type Locale } from './translations'

type TranslationType = typeof translations.en

interface I18nContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TranslationType
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    // Check localStorage for saved preference – wrapped in try/catch for
    // environments where storage access may be restricted (e.g. private browsing).
    try {
      const saved = localStorage.getItem('cgf-locale') as Locale | null
      if (saved && (['en', 'ru', 'tj'] as string[]).includes(saved)) {
        setLocaleState(saved as Locale)
      }
    } catch {
      // Silently ignore storage errors
    }
  }, [])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    try {
      localStorage.setItem('cgf-locale', newLocale)
    } catch {
      // Silently ignore storage errors
    }
  }, [])

  const t = translations[locale]

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}

export function useTranslations() {
  const { t } = useI18n()
  return t
}
