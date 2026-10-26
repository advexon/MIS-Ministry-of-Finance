'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/contexts/permission-context'
import { OPERATIONAL_SETTINGS, effectiveOperationalValues, validateOperationalValue, type OperationalSettings } from '@/lib/admin/operational-settings'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'

export async function loadOperationalSettings() {
  const { data, error } = await createClient().from('system_settings').select('key,value').in('key', OPERATIONAL_SETTINGS.map((item) => item.key))
  if (error) throw new Error('Could not load operational configuration')
  return Object.fromEntries((data ?? []).map((item) => [item.key, item.value])) as OperationalSettings
}

function Editor({ current, unavailable, refresh }: { current: OperationalSettings; unavailable: boolean; refresh: () => Promise<unknown> }) {
  const uiText = useUiTranslation()

  const [baseline, setBaseline] = useState(current)
  const [draft, setDraft] = useState(effectiveOperationalValues(current))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stale = !refreshRequired && OPERATIONAL_SETTINGS.some(({ key }) => current[key] !== baseline[key])
  const changed = OPERATIONAL_SETTINGS.filter(({ key }) => draft[key] !== effectiveOperationalValues(baseline)[key])

  async function save() {
    if (pending.current || stale || refreshRequired || unavailable || !changed.length || reason.trim().length < 3 || reason.trim().length > 2000) return
    setError(null); setMessage(null)
    if (changed.some(({ key }) => !validateOperationalValue(key, draft[key]))) { setError('Check the numeric ranges and whole-day/member values.'); return }
    pending.current = true
    setBusy(true)
    try {
      const { error } = await createClient().rpc('cgf_save_settings', { p_reason: reason.trim(), p_changes: changed.map(({ key }) => ({ key, value: draft[key], expected_value: baseline[key] ?? null })) })
      if (error) {
        setError(error.code === '40001' ? 'Another administrator changed these values. Your draft is preserved; reload before retrying.' : 'Save could not be confirmed; reload before retrying.')
        setRefreshRequired(true)
        return
      }
      const next = { ...baseline, ...Object.fromEntries(changed.map(({ key }) => [key, draft[key]])) }
      setBaseline(next); setReason(''); setMessage('Settings saved and audited. Future actions use the new values; historical evidence is unchanged.')
      try { await refresh() }
      catch {
        setRefreshRequired(true)
        setError('Settings were saved and audited, but the latest configuration could not load. Refresh before making another change.')
      }
    } catch {
      setRefreshRequired(true)
      setError('Save could not be confirmed; reload before retrying.')
    }
    finally { pending.current = false; setBusy(false) }
  }

  async function refreshLatest() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      await refresh()
      setRefreshRequired(false)
      setError(null)
    } catch { setRefreshRequired(true); setError('Could not refresh settings. Your draft is preserved.') }
    finally { pending.current = false; setBusy(false) }
  }

  return <Card><CardHeader><CardTitle>{uiText("Operational rules")}</CardTitle><CardDescription>{uiText("Only controls with an implemented runtime consumer are editable. Saves validate and commit every changed value with a reason and before/after audit records, or roll back entirely.")}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-6">
      {stale && <Alert><AlertDescription>{uiText("A newer configuration is available. Your draft has not been overwritten.")}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><AlertDescription>{uiText(error)}</AlertDescription></Alert>}
      {message && <p role="status" className="text-sm">{uiText(message)}</p>}
      <fieldset disabled={busy} className="flex flex-col gap-6"><legend className="sr-only">{uiText("Operational configuration")}</legend><FieldGroup>
        {OPERATIONAL_SETTINGS.map((setting) => <Field key={setting.key}><FieldLabel htmlFor={setting.key}>{uiText(setting.label)} · {uiText(setting.unit)}</FieldLabel>{setting.kind === 'boolean' ? <Switch id={setting.key} checked={draft[setting.key] === 'true'} onCheckedChange={(value) => setDraft((current) => ({ ...current, [setting.key]: String(value) }))} /> : <Input id={setting.key} type="number" min={setting.min} max={setting.max} step={['assessment_sla_days', 'committee_voting_days', 'committee_operations_members'].includes(setting.key) ? '1' : 'any'} value={draft[setting.key]} onChange={(event) => setDraft((current) => ({ ...current, [setting.key]: event.target.value }))} />}<FieldDescription>{uiText(setting.description)}</FieldDescription></Field>)}
        <Field><FieldLabel htmlFor="configuration-reason">{uiText("Change reason / approval reference")}</FieldLabel><Textarea id="configuration-reason" maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      </FieldGroup></fieldset>
    </CardContent>
    <CardFooter className="flex flex-wrap gap-3"><Button disabled={busy || stale || refreshRequired || unavailable || !changed.length || reason.trim().length < 3} onClick={() => void save()}>{uiText("Save audited configuration")}</Button><Button variant="outline" disabled={busy || refreshRequired || unavailable} onClick={() => { if (pending.current || refreshRequired || unavailable) return; setBaseline(current); setDraft(effectiveOperationalValues(current)); setReason(''); setError(null); setMessage(null) }}>{uiText("Discard draft and load latest")}</Button><Button variant="outline" disabled={busy} onClick={() => void refreshLatest()}>{uiText("Refresh")}</Button></CardFooter>
  </Card>
}

export function OperationalSettingsControls() {
  const uiText = useUiTranslation()

  const { role, user } = usePermissions()
  const admin = ['super_admin', 'prsf_admin'].includes(role?.code ?? '')
  const { data, error, mutate } = useSWR(admin ? ['operational-settings', user.id] : null, loadOperationalSettings)
  if (!admin) return <Alert><AlertDescription>{uiText("Active administrator access is required.")}</AlertDescription></Alert>
  if (error && !data) return <Alert variant="destructive"><AlertDescription>{uiText("Could not load the configuration. No editable fallback is shown.")}</AlertDescription></Alert>
  if (!data) return <Skeleton className="h-40" />
  return <div className="flex flex-col gap-4">
    {error && <Alert variant="destructive"><AlertDescription>{uiText("Could not refresh settings. Your draft is preserved.")}</AlertDescription></Alert>}
    <Editor current={data} unavailable={Boolean(error)} refresh={() => mutate(loadOperationalSettings(), { revalidate: false })} />
  </div>
}
