'use client'

import { useI18n } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n/translations'

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n()
  const label = { en: 'Language', ru: 'Язык', tj: 'Забон' }[locale]
  return (
    <select
      aria-label={label}
      value={locale}
      onChange={event => setLocale(event.target.value as Locale)}
      className="max-w-28 rounded-md border border-input bg-background px-2 py-2 font-sans text-sm text-foreground"
    >
      <option value="en">English</option>
      <option value="ru">Русский</option>
      <option value="tj">Тоҷикӣ</option>
    </select>
  )
}
