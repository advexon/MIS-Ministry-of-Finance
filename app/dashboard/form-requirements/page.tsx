"use client"

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useMemo, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/lib/contexts/permission-context"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { RequirementFormCard } from "@/components/admin/requirement-form-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, Loader2, Lock, Search, ShieldAlert } from "lucide-react"
import {
  FORM_DEFS,
  FORM_ENTITY_PREFIX,
  type FormDef,
  type FormFieldDef,
  type RequirementOverrides,
} from "@/lib/forms/field-requirements"
import { requirementsKey } from "@/lib/hooks/use-field-requirements"
import { STEP_FORM_DEFS } from "@/components/workflow/step-forms"

const ALL_FORM_DEFS: FormDef[] = [...FORM_DEFS, ...STEP_FORM_DEFS]

type AllOverrides = Record<string, RequirementOverrides>

async function fetchAllOverrides(): Promise<AllOverrides> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("column_configurations")
    .select("entity_type, column_key, is_required")
    .like("entity_type", `${FORM_ENTITY_PREFIX}%`)
  if (error) throw error
  const out: AllOverrides = {}
  for (const row of data ?? []) {
    const formId = row.entity_type.slice(FORM_ENTITY_PREFIX.length)
    ;(out[formId] ??= {})[row.column_key] = row.is_required
  }
  return out
}

export default function FormRequirementsPage() {
  const uiText = useUiTranslation()

  const { role } = usePermissions()
  const { toast } = useToast()
  const [query, setQuery] = useState("")
  const [activeGroup, setActiveGroup] = useState("all")
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const { data: overrides, mutate, isLoading, error } = useSWR("form-requirements:all", fetchAllOverrides)
  const categories = useMemo(() => {
    const map = new Map<string, FormDef[]>()
    for (const def of ALL_FORM_DEFS) map.set(def.group, [...(map.get(def.group) ?? []), def])
    return [...map.entries()]
  }, [])

  // Matches the RLS write policy on column_configurations (roles.tier <= 2).
  const canEdit = typeof role?.tier === "number" && role.tier <= 2

  const forms = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ALL_FORM_DEFS.filter(def => activeGroup === "all" || def.group === activeGroup).map((def) => ({
      ...def,
      fields: !q || uiText(def.name).toLowerCase().includes(q) || uiText(def.group).toLowerCase().includes(q)
        ? def.fields
        : def.fields.filter((fl) => uiText(fl.label).toLowerCase().includes(q)),
    })).filter((def) => def.fields.length > 0)
  }, [query, activeGroup, uiText])

  const groups = useMemo(() => {
    const map = new Map<string, FormDef[]>()
    for (const def of forms) map.set(def.group, [...(map.get(def.group) ?? []), def])
    return [...map.entries()]
  }, [forms])

  async function persist(def: FormDef, field: FormFieldDef, required: boolean | null) {
    const supabase = createClient()
    const entityType = `${FORM_ENTITY_PREFIX}${def.id}`
    const { data: auth } = await supabase.auth.getUser()
    const query =
      required === null
        ? supabase.from("column_configurations").delete().eq("entity_type", entityType).eq("column_key", field.key)
        : supabase.from("column_configurations").upsert(
            {
              entity_type: entityType,
              column_key: field.key,
              display_name_en: field.label,
              field_group: def.id,
              is_required: required,
              is_system_required: !!field.locked,
              is_visible_in_table: false,
              updated_by: auth.user?.id ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "entity_type,column_key" },
          )
    const { error } = await query
    if (error) throw error
  }

  async function update(def: FormDef, field: FormFieldDef, required: boolean | null) {
    const saveKey = `${def.id}.${field.key}`
    setSavingKey(saveKey)
    const previous = overrides
    const next: AllOverrides = { ...(overrides ?? {}), [def.id]: { ...(overrides?.[def.id] ?? {}) } }
    if (required === null) delete next[def.id][field.key]
    else next[def.id][field.key] = required
    mutate(next, { revalidate: false })
    try {
      await persist(def, field, required)
      await mutate()
      globalMutate(requirementsKey(def.id))
      toast({
        title: required === null ? "Reset to default" : required ? "Field is now mandatory" : "Field is now optional",
        description: `${def.name} — ${field.label}`,
      })
    } catch (err) {
      mutate(previous, { revalidate: false })
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 font-sans sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{uiText("Required fields")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {uiText("Set submission requirements for each form. Mandatory fields must be completed; optional fields can be left blank.")}
          </p>
        </div>
        <div role="status" className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {savingKey ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
          {savingKey ? uiText("Saving changes…") : uiText("Changes save automatically")}
        </div>
      </header>

      {!canEdit && (
        <Alert>
          <ShieldAlert className="size-4" />
          <AlertDescription>{uiText("Only administrators can change required fields. You are viewing them read-only.")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav aria-label={uiText("Form categories")} className="flex shrink-0 flex-col gap-3 lg:sticky lg:top-6 lg:w-56">
          <h2 className="text-sm font-medium text-muted-foreground">{uiText("Form categories")}</h2>
          <div className="flex flex-wrap gap-1 lg:flex-col">
            {[{ id: "all", label: "All forms", count: ALL_FORM_DEFS.length }, ...categories.map(([group, defs]) => ({ id: group, label: group, count: defs.length }))].map(category => (
              <Button key={category.id} variant={activeGroup === category.id ? "secondary" : "ghost"}
                className="h-auto justify-between gap-3 py-2.5" aria-pressed={activeGroup === category.id}
                onClick={() => setActiveGroup(category.id)}>
                <span className="text-left whitespace-normal">{uiText(category.label)}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{category.count}</span>
              </Button>
            ))}
          </div>
          <p className="hidden text-sm leading-relaxed text-muted-foreground lg:block">
            {uiText("Locked fields are required by the system and cannot be made optional.")}
          </p>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">{uiText(activeGroup === "all" ? "All forms" : activeGroup)}</h2>
              <p className="text-sm text-muted-foreground">{uiText("Forms shown: {0}", forms.length)}</p>
            </div>
            <Field className="sm:w-72">
              <FieldLabel htmlFor="requirement-search" className="sr-only">{uiText("Search forms or fields")}</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="requirement-search" value={query} onChange={e => setQuery(e.target.value)} placeholder={uiText("Search forms or fields")} className="pl-9" />
              </div>
            </Field>
          </div>

          {error ? (
            <Alert variant="destructive">
              <ShieldAlert className="size-4" />
              <AlertDescription className="flex flex-col items-start gap-3">
                {uiText("Could not load required field settings. Please try again.")}
                <Button variant="outline" size="sm" onClick={() => mutate()}>{uiText("Try again")}</Button>
              </AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex flex-col gap-3" role="status" aria-label={uiText("Loading settings")}>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : groups.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle><h3 className="text-base">{uiText("No forms or fields match your search.")}</h3></CardTitle>
                <CardDescription>{uiText("Try a different search or select another category.")}</CardDescription>
              </CardHeader>
              <CardContent><Button variant="outline" onClick={() => { setQuery(""); setActiveGroup("all") }}>{uiText("Clear filters")}</Button></CardContent>
            </Card>
          ) : groups.map(([group, defs]) => (
            <section key={group} className="flex flex-col gap-3" aria-label={uiText(group)}>
              {activeGroup === "all" && <h2 className="text-sm font-medium text-muted-foreground">{uiText(group)}</h2>}
              <div className="grid items-start gap-4 xl:grid-cols-2">
                {defs.map(def => (
                  <RequirementFormCard key={def.id} form={ALL_FORM_DEFS.find(form => form.id === def.id)!}
                    visibleFields={def.fields} overrides={overrides?.[def.id] ?? {}} canEdit={canEdit}
                    savingKey={savingKey} onUpdate={update} />
                ))}
              </div>
            </section>
          ))}
          <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {uiText("Changes apply immediately for all users. Locked fields always remain mandatory.")}
          </p>
        </div>
      </div>
    </div>
  )
}
