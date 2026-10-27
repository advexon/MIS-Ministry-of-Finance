'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { useCurrentTime } from '@/hooks/use-current-time'
import { delegationStatus } from '@/lib/utils/display-time'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/contexts/permission-context'
import { one } from '@/lib/utils/supabase-relation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

type WorkflowAction =
  | { kind: 'sector'; id: string; label: string; expected: boolean; prohibited: boolean; reason: string }
  | { kind: 'grant'; delegate: string; label: string; start: string; end: string; reason: string }
  | { kind: 'revoke'; id: string; label: string; reason: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadControls() {
  const client = createClient()
  const [people, delegations, sectors] = await Promise.all([
    client.from('profiles').select('id,first_name,last_name,role:roles(code)').eq('is_active', true),
    client.from('signature_delegations').select('id,delegate_id,starts_at,ends_at,reason,revoked_at').order('created_at', { ascending: false }),
    client.from('sectors').select('id,name_en,is_prohibited').order('name_en'),
  ])
  if (people.error || delegations.error || sectors.error) throw new Error('Could not load CGF controls')
  const members = (people.data ?? []).map((person) => ({ ...person, role: one<{ code: string }>(person.role) })).filter((person) => ['deputy_director', 'prsf_analyst', 'credit_risk_officer', 'compliance_officer'].includes(person.role?.code ?? ''))
  return { members, delegations: delegations.data ?? [], sectors: sectors.data ?? [] }
}

export function CgfWorkflowControls() {
  const uiText = useUiTranslation()

  const now = useCurrentTime()
  const { role, user } = usePermissions()
  const admin = ['super_admin', 'prsf_admin'].includes(role?.code ?? '')
  const visible = admin || ['auditor', 'fkg_management'].includes(role?.code ?? '')
  const { data, error: loadError, mutate } = useSWR(visible ? ['cgf-controls', user.id] : null, loadControls)
  const [form, setForm] = useState({ delegate: '', start: '', end: '', reason: '' })
  const [sectorReason, setSectorReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [action, setAction] = useState<WorkflowAction | null>(null)
  const pending = useRef(false)
  const unavailable = !data || Boolean(loadError) || refreshRequired
  if (!visible) return null

  async function refreshLatest() {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    try {
      const latest = await mutate(loadControls(), { revalidate: false })
      if (!latest) throw new Error('Unconfirmed workflow controls')
      setRefreshRequired(false)
      setError(null)
    } catch {
      setRefreshRequired(true)
      setError('Could not refresh workflow controls. Your draft is preserved.')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  async function run(change: WorkflowAction) {
    if (pending.current || !admin || unavailable) return
    const reason = change.reason.trim()
    if (reason.length < 3 || reason.length > 2000) {
      setError('Enter a change reason of 3–2000 characters.')
      return
    }
    if (change.kind === 'grant') {
      const start = new Date(change.start).getTime()
      const end = new Date(change.end).getTime()
      if (!data?.members.some(person => person.id === change.delegate) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 90 * 86400000) {
        setError('Select an eligible employee and valid dates, with expiry after the start and within 90 days.')
        setAction(null)
        return
      }
    }
    pending.current = true
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = change.kind === 'sector'
        ? await createClient().rpc('cgf_set_sector_prohibited', { p_sector: change.id, p_expected: change.expected, p_prohibited: change.prohibited, p_reason: reason })
        : await createClient().rpc('cgf_manage_signature_delegation', change.kind === 'grant'
          ? { p_delegate: change.delegate, p_start: new Date(change.start).toISOString(), p_end: new Date(change.end).toISOString(), p_reason: reason }
          : { p_revoke: change.id, p_reason: reason })
      if (result.error) {
        setRefreshRequired(true)
        setError(result.error.code === '40001'
          ? 'Another administrator changed these values. Your draft is preserved; reload before retrying.'
          : 'Workflow change was not confirmed. Refresh and review sectors and delegation history before retrying; your draft is preserved.')
        return
      }
      if (change.kind !== 'sector' && (typeof result.data !== 'string' || !UUID.test(result.data) || (change.kind === 'revoke' && result.data !== change.id))) {
        setRefreshRequired(true)
        setError('Workflow change was not confirmed. Refresh and review sectors and delegation history before retrying; your draft is preserved.')
        return
      }
      setMessage(change.kind === 'sector' ? 'Sector screening rule saved and audited' : change.kind === 'grant' ? 'Temporary signing authority granted and audited' : 'Delegation revoked and audited')
      if (change.kind === 'sector') setSectorReason('')
      if (change.kind === 'grant') setForm({ delegate: '', start: '', end: '', reason: '' })
      try {
        const latest = await mutate(loadControls(), { revalidate: false })
        if (!latest) throw new Error('Unconfirmed workflow controls')
      } catch {
        setRefreshRequired(true)
        setError('The workflow change was saved and audited, but controls could not refresh. Refresh before another change.')
      }
    } catch {
      setRefreshRequired(true)
      setError('Workflow change was not confirmed. Refresh and review sectors and delegation history before retrying; your draft is preserved.')
    } finally {
      setAction(null)
      pending.current = false
      setBusy(false)
    }
  }

  return <section aria-label={uiText("CGF workflow controls")} className="flex flex-col gap-6">
    {(error || loadError) && <Alert variant="destructive"><AlertDescription>{uiText(error ?? 'Could not load workflow controls')}</AlertDescription></Alert>}
    {message && <p role="status" className="text-sm">{uiText(message)}</p>}
    <Button variant="outline" className="self-start" disabled={busy} onClick={() => void refreshLatest()}>{uiText('Refresh workflow controls')}</Button>
    {refreshRequired && <p className="text-sm text-muted-foreground">{uiText('Review refreshed sectors and delegation history before confirming another change. A previous request may already have succeeded.')}</p>}
    <AlertDialog open={action !== null} onOpenChange={open => { if (!open && !pending.current) setAction(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{uiText('Confirm workflow administration change')}</AlertDialogTitle><AlertDialogDescription>{uiText('This changes screening rules or signing authority and records your reason in the audit history. Signed guarantees remain unchanged.')}</AlertDialogDescription></AlertDialogHeader>
        {action && <div className="flex flex-col gap-2 text-sm"><p>{uiText(action.kind === 'sector' ? (action.prohibited ? 'Prohibit sector' : 'Allow sector') : action.kind === 'grant' ? 'Grant temporary authority' : 'Revoke')} · {action.label}</p>{action.kind === 'grant' && <p>{new Date(action.start).toLocaleString()} — {new Date(action.end).toLocaleString()}</p>}<p className="break-words">{action.reason}</p></div>}
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{uiText('Cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy || unavailable} onClick={event => { event.preventDefault(); if (action) void run(action) }}>{uiText('Confirm change')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Card><CardHeader><CardTitle>{uiText("Prohibited sectors")}</CardTitle><CardDescription>{uiText("Screening changes apply when files are next submitted or resubmitted. Enter an approval reference before changing a sector. Submission, threshold and deadline settings are in Operational rules.")}</CardDescription></CardHeader><CardContent><fieldset disabled={!admin || busy || unavailable} className="flex flex-col gap-4"><legend className="sr-only">{uiText("Sector screening")}</legend><Field><FieldLabel htmlFor="sector-change-reason">{uiText("Change reason / approval reference")}</FieldLabel><Input id="sector-change-reason" maxLength={2000} value={sectorReason} onChange={(event) => setSectorReason(event.target.value)} /></Field>{data?.sectors.map((sector) => <div key={sector.id} className="flex items-center gap-3"><Checkbox id={`prohibited-${sector.id}`} checked={sector.is_prohibited} disabled={sectorReason.trim().length < 3} onCheckedChange={(value) => { if (value !== 'indeterminate') setAction({ kind: 'sector', id: sector.id, label: sector.name_en, expected: sector.is_prohibited, prohibited: value, reason: sectorReason.trim() }) }} /><Label htmlFor={`prohibited-${sector.id}`}>{sector.name_en}</Label></div>)}</fieldset></CardContent></Card>
    <Card><CardHeader><CardTitle>{uiText("Temporary guarantee-signature delegation")}</CardTitle><CardDescription>{uiText("Delegations expire automatically, may be revoked immediately and last no more than 90 days. They do not grant committee votes or Director decision rights. Super Administrator authority is inherent and does not require delegation.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-6">
      {admin && <fieldset disabled={busy || unavailable} className="flex flex-col gap-4"><legend className="sr-only">{uiText("Signing delegation")}</legend><FieldGroup>
        <Field><FieldLabel htmlFor="signature-delegate">{uiText("Employee")}</FieldLabel><Select value={form.delegate} onValueChange={(delegate) => setForm((current) => ({ ...current, delegate }))}><SelectTrigger id="signature-delegate"><SelectValue placeholder={uiText("Select employee")} /></SelectTrigger><SelectContent><SelectGroup>{data?.members.map((person) => <SelectItem key={person.id} value={person.id}>{[person.first_name, person.last_name].filter(Boolean).join(' ') || person.id.slice(0, 8)} · {person.role?.code}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="delegation-start">{uiText("Starts (local time)")}</FieldLabel><Input id="delegation-start" type="datetime-local" value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} /></Field>
        <Field><FieldLabel htmlFor="delegation-end">{uiText("Expires (local time)")}</FieldLabel><Input id="delegation-end" type="datetime-local" value={form.end} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} /></Field>
        <Field><FieldLabel htmlFor="delegation-reason">{uiText("Grant / revocation reason")}</FieldLabel><Input id="delegation-reason" maxLength={2000} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></Field>
      </FieldGroup><Button className="self-start" disabled={busy || !form.delegate || !form.start || !form.end || form.reason.trim().length < 3} onClick={() => { const person = data?.members.find(person => person.id === form.delegate); setAction({ kind: 'grant', ...form, label: person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : form.delegate }) }}>{uiText("Grant temporary authority")}</Button></fieldset>}
      <ul className="flex flex-col gap-3">{data?.delegations.map((delegation) => { const person = data.members.find((person) => person.id === delegation.delegate_id); return <li key={delegation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : delegation.delegate_id.slice(0, 8)}</p><p className="text-sm text-muted-foreground">{new Date(delegation.starts_at).toLocaleString()} — {new Date(delegation.ends_at).toLocaleString()} · {delegationStatus(delegation.ends_at, delegation.revoked_at, now)}</p><p className="text-sm">{delegation.reason}</p></div>{admin && !delegation.revoked_at && <Button variant="outline" disabled={busy || unavailable || form.reason.trim().length < 3} onClick={() => setAction({ kind: 'revoke', id: delegation.id, label: person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : delegation.delegate_id.slice(0, 8), reason: form.reason.trim() })}>{uiText("Revoke")}</Button>}</li> })}</ul>
      {data?.delegations.length === 0 && <p className="text-sm text-muted-foreground">{uiText("No signature delegations have been granted.")}</p>}
    </CardContent><CardFooter><p className="text-sm text-muted-foreground">{uiText("Ordinary delegates cannot sign files they confirmed as deputy. Signed guarantees remain historical evidence.")}</p></CardFooter></Card>
  </section>
}
