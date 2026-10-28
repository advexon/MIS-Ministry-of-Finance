"use client"

import { Loader2, Lock, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { resolveRequired, type FormDef, type FormFieldDef, type RequirementOverrides } from "@/lib/forms/field-requirements"
import { useUiTranslation } from "@/lib/i18n/ui-text"
import { cn } from "@/lib/utils"

interface RequirementFormCardProps {
  form: FormDef
  visibleFields: FormFieldDef[]
  overrides: RequirementOverrides
  canEdit: boolean
  savingKey: string | null
  onUpdate: (form: FormDef, field: FormFieldDef, required: boolean | null) => Promise<void>
}

export function RequirementFormCard({ form, visibleFields, overrides, canEdit, savingKey, onUpdate }: RequirementFormCardProps) {
  const uiText = useUiTranslation()
  const requiredCount = form.fields.filter(field => resolveRequired(field, overrides)).length

  return (
    <Card className={cn("overflow-hidden", form.fields.length > 10 && "xl:col-span-2")}>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-2">
          <CardTitle><h3 className="text-base leading-6 text-balance">{uiText(form.name)}</h3></CardTitle>
          <CardDescription>{uiText("{0} of {1} fields mandatory", requiredCount, form.fields.length)}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <FieldGroup className={cn("gap-2", form.fields.length > 10 && "grid md:grid-cols-2")}>
          {visibleFields.map(field => {
            const required = resolveRequired(field, overrides)
            const overridden = field.key in overrides && !field.locked
            const busy = savingKey === `${form.id}.${field.key}`
            const switchId = `req-${form.id}-${field.key}`
            const descriptionId = `${switchId}-description`
            return (
              <Field key={field.key} aria-busy={busy} className={cn("rounded-lg border p-3 transition-colors", required ? "border-primary/20 bg-primary/5 text-foreground" : "bg-background text-foreground")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <FieldLabel htmlFor={switchId} className="cursor-pointer text-sm leading-6">
                      {uiText(field.label)}{required && <span className="text-primary" aria-hidden="true"> *</span>}
                    </FieldLabel>
                    <div id={descriptionId} className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {field.locked ? (
                        <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden="true" />{uiText("Always required")}</span>
                      ) : (
                        <>
                          <span>{required ? uiText("Mandatory") : uiText("Optional")}</span>
                          {overridden && <Badge variant="outline">{uiText("Customized")}</Badge>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
                    {overridden && canEdit && (
                      <Button variant="ghost" size="icon" className="size-8" disabled={savingKey !== null}
                        onClick={() => onUpdate(form, field, null)}
                        aria-label={uiText("Reset {0} to default", uiText(field.label))}
                        title={uiText("Reset to default: {0}", field.defaultRequired ? uiText("Mandatory") : uiText("Optional"))}>
                        <RotateCcw aria-hidden="true" />
                      </Button>
                    )}
                    <Switch id={switchId} checked={required} disabled={!canEdit || field.locked || savingKey !== null}
                      aria-describedby={descriptionId} onCheckedChange={checked => onUpdate(form, field, checked)} />
                  </div>
                </div>
              </Field>
            )
          })}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
