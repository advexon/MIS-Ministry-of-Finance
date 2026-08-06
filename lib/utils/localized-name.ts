import type { Locale } from '@/lib/i18n/translations'

/**
 * Shape shared by every lookup record in the database (roles, sectors,
 * loan_products, ...). These tables store one column per supported locale
 * instead of a single `name` column.
 */
export interface LocalizedNameFields {
  name_en: string
  name_ru?: string | null
  name_tj?: string | null
}

/**
 * Resolves the display name for a localized record.
 *
 * The database has no `name` column — reading `record.name` yields `undefined`
 * and renders an empty label. Always route display names through this helper.
 * Falls back to English whenever the active locale has no translation.
 */
export function getLocalizedName(
  item: LocalizedNameFields | null | undefined,
  locale: Locale,
): string {
  if (!item) return ''
  if (locale === 'ru' && item.name_ru) return item.name_ru
  if (locale === 'tj' && item.name_tj) return item.name_tj
  return item.name_en ?? ''
}
