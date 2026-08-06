'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
// Only the English translations ship in the initial JS bundle.
// Russian and Tajik are loaded lazily when the user switches locale.
import { translations as enTranslations, type Locale } from './translations'

type TranslationType = typeof enTranslations.en

interface I18nContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: TranslationType
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

// Cache loaded locale modules so we never fetch them twice.
// The ru/tj bundles are structurally compatible with `en` but are inferred as
// distinct literal types, so the cache is widened to the shared shape.
const localeCache: Partial<Record<Locale, TranslationType>> = {
  en: enTranslations.en,
}

async function loadLocale(locale: Locale): Promise<TranslationType> {
  const cached = localeCache[locale]
  if (cached) return cached
  // Dynamic import splits ru/tj into separate webpack chunks (~0 cost for
  // users who never switch away from English)
  const mod = await import('./translations')
  const t = mod.translations[locale] as TranslationType
  localeCache[locale] = t
  return t
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')
  const [t, setT] = useState<TranslationType>(enTranslations.en)
  const pendingLocale = useRef<Locale>('en')

  useEffect(() => {
    // Restore saved preference from localStorage
    try {
      const saved = localStorage.getItem('cgf-locale') as Locale | null
      if (saved && (['en', 'ru', 'tj'] as string[]).includes(saved)) {
        setLocaleState(saved as Locale)
        loadLocale(saved as Locale).then(setT)
      }
    } catch {
      // Silently ignore storage access errors
    }
  }, [])

  const setLocale = useCallback((newLocale: Locale) => {
    pendingLocale.current = newLocale
    setLocaleState(newLocale)
    try {
      localStorage.setItem('cgf-locale', newLocale)
    } catch {
      // Silently ignore storage errors
    }
    loadLocale(newLocale).then((loaded) => {
      // Guard against a race where the user switches twice quickly
      if (pendingLocale.current === newLocale) setT(loaded)
    })
  }, [])

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
