"use client"

import { useCallback, useMemo } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase/client"
import {
  FORM_DEFS,
  FORM_ENTITY_PREFIX,
  isEmptyValue,
  resolveRequired,
  type FormDef,
  type RequirementOverrides,
} from "@/lib/forms/field-requirements"

async function fetchOverrides(entityType: string): Promise<RequirementOverrides> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("column_configurations")
    .select("column_key, is_required")
    .eq("entity_type", entityType)
  if (error) throw error
  const rows = (data ?? []) as { column_key: string; is_required: boolean }[]
  return Object.fromEntries(rows.map((row) => [row.column_key, row.is_required]))
}

export function requirementsKey(formId: string) {
  return ["field-requirements", `${FORM_ENTITY_PREFIX}${formId}`] as const
}

/**
 * Returns whether each field of `formId` is mandatory, honouring admin
 * overrides. Until overrides load (or if they fail to), code defaults apply —
 * so a form never becomes looser than its defaults because of a network error.
 */
export function useFieldRequirements(form: string | FormDef) {
  const formId = typeof form === "string" ? form : form.id
  const inlineDef = typeof form === "string" ? undefined : form
  const def = useMemo(() => inlineDef ?? FORM_DEFS.find((d) => d.id === formId), [inlineDef, formId])
  const key = useMemo(() => requirementsKey(formId), [formId])
  const { data: overrides } = useSWR(key, ([, entityType]) => fetchOverrides(entityType), {
    revalidateOnFocus: false,
  })

  const isRequired = useCallback(
    (fieldKey: string) => {
      const field = def?.fields.find((x) => x.key === fieldKey)
      if (!field) return false
      return resolveRequired(field, overrides ?? {})
    },
    [def, overrides],
  )

  /** Labels of required fields whose value is empty. */
  const missingFields = useCallback(
    (values: Record<string, unknown>) =>
      (def?.fields ?? [])
        .filter((field) => field.key in values && isRequired(field.key) && isEmptyValue(values[field.key]))
        .map((field) => field.label),
    [def, isRequired],
  )

  return { isRequired, missingFields, overrides: overrides ?? {} }
}
