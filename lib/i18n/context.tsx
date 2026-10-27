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
  const [{ locale, t }, setLanguage] = useState<{ locale: Locale; t: TranslationType }>({
    locale: 'en',
    t: enTranslations.en,
  })
  const localeRequest = useRef(0)

  const applyLocale = useCallback(async (newLocale: Locale) => {
    const request = ++localeRequest.current
    try {
      const loaded = await loadLocale(newLocale)
      if (localeRequest.current === request) {
        setLanguage({ locale: newLocale, t: loaded })
      }
    } catch {
      // Keep the currently usable language if a translation chunk cannot load.
    }
  }, [])

  useEffect(() => {
    const requests = localeRequest
    const request = ++requests.current
    try {
      const saved = localStorage.getItem('cgf-locale')
      if (saved === 'en' || saved === 'ru' || saved === 'tj') {
        loadLocale(saved).then(loaded => {
          if (requests.current === request) {
            setLanguage({ locale: saved, t: loaded })
          }
        }).catch(() => {
          // Keep English if the saved language cannot load.
        })
      }
    } catch {
      // Silently ignore storage access errors
    }
    return () => { requests.current++ }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'tj' ? 'tg' : locale
  }, [locale])

  const setLocale = useCallback((newLocale: Locale) => {
    try {
      localStorage.setItem('cgf-locale', newLocale)
    } catch {
      // Silently ignore storage errors
    }
    void applyLocale(newLocale)
  }, [applyLocale])

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
