"use client"

import { useMemo, useState } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/lib/contexts/permission-context"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Lock, RotateCcw, Search, ShieldAlert } from "lucide-react"
import {
  FORM_DEFS,
  FORM_ENTITY_PREFIX,
  resolveRequired,
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
  const { role } = usePermissions()
  const { toast } = useToast()
  const [query, setQuery] = useState("")
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const { data: overrides, mutate, isLoading } = useSWR("form-requirements:all", fetchAllOverrides)

  // Matches the RLS write policy on column_configurations (roles.tier <= 2).
  const canEdit = typeof role?.tier === "number" && role.tier <= 2

  const forms = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ALL_FORM_DEFS
    return ALL_FORM_DEFS.map((def) => ({
      ...def,
      fields: def.name.toLowerCase().includes(q)
        ? def.fields
        : def.fields.filter((fl) => fl.label.toLowerCase().includes(q)),
    })).filter((def) => def.fields.length > 0)
  }, [query])

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Required fields</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-pretty">
          Choose which fields are mandatory on each form. A field marked with an asterisk (
          <span className="text-destructive">*</span>) must be filled in before the form can be submitted; fields
          without one are optional. Changes apply immediately for all users.
        </p>
      </div>

      {!canEdit && (
        <Alert>
          <ShieldAlert className="size-4" />
          <AlertDescription>Only administrators can change required fields. You are viewing them read-only.</AlertDescription>
        </Alert>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search forms or fields"
          className="pl-9"
          aria-label="Search forms or fields"
        />
      </div>

      {groups.map(([group, defs]) => (
        <section key={group} className="flex flex-col gap-3" aria-labelledby={`group-${group}`}>
          <h2 id={`group-${group}`} className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {group}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {defs.map((def) => {
              const formOverrides = overrides?.[def.id] ?? {}
              const requiredCount = def.fields.filter((fl) => resolveRequired(fl, formOverrides)).length
              return (
                <Card key={def.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{def.name}</CardTitle>
                    <CardDescription>
                      {requiredCount} of {def.fields.length} fields mandatory
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y">
                      {def.fields.map((field) => {
                        const required = resolveRequired(field, formOverrides)
                        const overridden = field.key in formOverrides && !field.locked
                        const busy = savingKey === `${def.id}.${field.key}`
                        const switchId = `req-${def.id}-${field.key}`
                        return (
                          <li key={field.key} className="flex items-center justify-between gap-3 px-6 py-2.5">
                            <label htmlFor={switchId} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                              <span className="truncate">
                                {field.label}
                                {required && <span className="ml-0.5 text-destructive">*</span>}
                              </span>
                              {field.locked && (
                                <Badge variant="secondary" className="gap-1 font-normal">
                                  <Lock className="size-3" aria-hidden="true" />
                                  Always required
                                </Badge>
                              )}
                              {overridden && (
                                <Badge variant="outline" className="font-normal">
                                  Changed
                                </Badge>
                              )}
                            </label>
                            <div className="flex shrink-0 items-center gap-1">
                              {overridden && canEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  disabled={busy}
                                  onClick={() => update(def, field, null)}
                                  aria-label={`Reset ${field.label} to default`}
                                  title="Reset to default"
                                >
                                  <RotateCcw className="size-4" />
                                </Button>
                              )}
                              <Switch
                                id={switchId}
                                checked={required}
                                disabled={!canEdit || field.locked || busy || isLoading}
                                onCheckedChange={(checked) => update(def, field, checked)}
                              />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 && <p className="text-sm text-muted-foreground">No forms or fields match your search.</p>}
    </div>
  )
}
