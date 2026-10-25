'use client'

import { useState } from 'react'
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
  if (!visible) return null

  async function run(work: () => Promise<void>, message: string) {
    setBusy(true); setError(null); setMessage(null)
    try { await work(); await mutate(); setMessage(message) }
    catch (error) { setError(error instanceof Error ? error.message : 'The change could not be saved') }
    finally { setBusy(false) }
  }

  async function delegate() {
    if (!form.delegate || !form.start || !form.end || form.reason.trim().length < 3) throw new Error('Provide the delegate, dates and a reason.')
    const { error } = await createClient().rpc('cgf_manage_signature_delegation', { p_delegate: form.delegate, p_start: new Date(form.start).toISOString(), p_end: new Date(form.end).toISOString(), p_reason: form.reason })
    if (error) throw new Error(error.message)
    setForm({ delegate: '', start: '', end: '', reason: '' })
  }

  return <section aria-label="CGF workflow controls" className="flex flex-col gap-6">
    {(error || loadError) && <Alert variant="destructive"><AlertDescription>{error ?? 'Could not load workflow controls'}</AlertDescription></Alert>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <Card><CardHeader><CardTitle>Prohibited sectors</CardTitle><CardDescription>Screening changes apply when files are next submitted or resubmitted. Enter an approval reference before changing a sector. Submission, threshold and deadline settings are in Operational rules.</CardDescription></CardHeader><CardContent><fieldset disabled={!admin || busy || !data} className="flex flex-col gap-4"><legend className="sr-only">Sector screening</legend><Field><FieldLabel htmlFor="sector-change-reason">Change reason / approval reference</FieldLabel><Input id="sector-change-reason" maxLength={2000} value={sectorReason} onChange={(event) => setSectorReason(event.target.value)} /></Field>{data?.sectors.map((sector) => <div key={sector.id} className="flex items-center gap-3"><Checkbox id={`prohibited-${sector.id}`} checked={sector.is_prohibited} disabled={sectorReason.trim().length < 3} onCheckedChange={(value) => void run(async () => { const { error } = await createClient().rpc('cgf_set_sector_prohibited', { p_sector: sector.id, p_expected: sector.is_prohibited, p_prohibited: value === true, p_reason: sectorReason.trim() }); if (error) throw new Error(error.message) }, 'Sector screening rule saved and audited')} /><Label htmlFor={`prohibited-${sector.id}`}>{sector.name_en}</Label></div>)}</fieldset></CardContent></Card>
    <Card><CardHeader><CardTitle>Temporary guarantee-signature delegation</CardTitle><CardDescription>Delegations expire automatically, may be revoked immediately and last no more than 90 days. They do not grant committee votes or Director decision rights. Super Administrator authority is inherent and does not require delegation.</CardDescription></CardHeader><CardContent className="flex flex-col gap-6">
      {admin && <fieldset disabled={busy} className="flex flex-col gap-4"><legend className="sr-only">Signing delegation</legend><FieldGroup>
        <Field><FieldLabel htmlFor="signature-delegate">Employee</FieldLabel><Select value={form.delegate} onValueChange={(delegate) => setForm((current) => ({ ...current, delegate }))}><SelectTrigger id="signature-delegate"><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent><SelectGroup>{data?.members.map((person) => <SelectItem key={person.id} value={person.id}>{[person.first_name, person.last_name].filter(Boolean).join(' ') || person.id.slice(0, 8)} · {person.role?.code}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel htmlFor="delegation-start">Starts (local time)</FieldLabel><Input id="delegation-start" type="datetime-local" value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} /></Field>
        <Field><FieldLabel htmlFor="delegation-end">Expires (local time)</FieldLabel><Input id="delegation-end" type="datetime-local" value={form.end} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} /></Field>
        <Field><FieldLabel htmlFor="delegation-reason">Grant / revocation reason</FieldLabel><Input id="delegation-reason" maxLength={2000} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /></Field>
      </FieldGroup><Button className="self-start" disabled={busy || !form.delegate || !form.start || !form.end || form.reason.trim().length < 3} onClick={() => void run(delegate, 'Temporary signing authority granted and audited')}>Grant temporary authority</Button></fieldset>}
      <ul className="flex flex-col gap-3">{data?.delegations.map((delegation) => { const person = data.members.find((person) => person.id === delegation.delegate_id); return <li key={delegation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : delegation.delegate_id.slice(0, 8)}</p><p className="text-sm text-muted-foreground">{new Date(delegation.starts_at).toLocaleString()} — {new Date(delegation.ends_at).toLocaleString()} · {delegationStatus(delegation.ends_at, delegation.revoked_at, now)}</p><p className="text-sm">{delegation.reason}</p></div>{admin && !delegation.revoked_at && <Button variant="outline" disabled={busy || form.reason.trim().length < 3} onClick={() => void run(async () => { const { error } = await createClient().rpc('cgf_manage_signature_delegation', { p_revoke: delegation.id, p_reason: form.reason }); if (error) throw new Error(error.message) }, 'Delegation revoked and audited')}>Revoke</Button>}</li> })}</ul>
      {data?.delegations.length === 0 && <p className="text-sm text-muted-foreground">No signature delegations have been granted.</p>}
    </CardContent><CardFooter><p className="text-sm text-muted-foreground">Ordinary delegates cannot sign files they confirmed as deputy. Signed guarantees remain historical evidence.</p></CardFooter></Card>
  </section>
}
