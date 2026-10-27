import type { Locale } from './translations'
import catalog from './interface-catalog.json' with { type: 'json' }
import { interfaceOverrides } from '@/lib/i18n/interface-overrides'

export const interfaceCatalog: Readonly<Record<string, readonly string[]>> = { ...catalog, ...interfaceOverrides }

export function translateInterface<T>(locale: Locale, value: T, ...parameters: unknown[]): T {
  if (typeof value !== 'string') return value
  const key = value.replace(/\s+/g, ' ').trim()
  const entry = interfaceCatalog[key]
  const translated = locale === 'en' || !entry
    ? value
    : `${value.match(/^\s*/)?.[0] ?? ''}${entry[locale === 'ru' ? 0 : 1]}${value.match(/\s*$/)?.[0] ?? ''}`
  const result = parameters.length
    ? translated.replace(/\{(\d+)\}/g, (placeholder, index: string) => Number(index) < parameters.length ? String(parameters[Number(index)] ?? '') : placeholder)
    : translated
  return result as T
}
