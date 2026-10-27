'use client'

import { useCallback } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { translateInterface } from '@/lib/i18n/interface-text'

export function useUiTranslation() {
  const { locale } = useI18n()
  return useCallback(<T,>(value: T, ...parameters: unknown[]): T => translateInterface(locale, value, ...parameters), [locale])
}
