'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

export function LocalizedText({ children }: { children: string }) {
  const uiText = useUiTranslation()
  return uiText(children)
}
