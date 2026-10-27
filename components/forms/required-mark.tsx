'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'
export function RequiredMark({ show }: { show: boolean }) {
  const uiText = useUiTranslation()

  if (!show) return null
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-destructive">
        *
      </span>
      <span className="sr-only"> {uiText("(required)")}</span>
    </>
  )
}

export function missingFieldsMessage(labels: string[]) {
  return `Please fill in the required field${labels.length > 1 ? "s" : ""}: ${labels.join(", ")}`
}
