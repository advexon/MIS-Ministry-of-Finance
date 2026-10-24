'use client'

import { useState } from 'react'
import useSWR from 'swr'
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

async function loadControls() {
  const supabase = createClient()
  const [settings, people, delegations, sectors] = await Promise.all([
    supabase.from('system_settings').select('key,value').in('key', ['committee_operations_members', 'committee_director_threshold_tjs', 'direct_officer_submission', 'pipeline_max_guarantee_tjs']),
    supabase.from('profiles').select('id,first_name,last_name,role:roles(code)').eq('is_active', true),
    supabase.from('signature_delegations').select('id,delegate_id,starts_at,ends_at,reason,revoked_at').order('created_at', { ascending: false }),
    supabase.from('sectors').select('id,name_en,is_prohibited').order('name_en'),
  ])
  if (settings.error || people.error || delegations.error || sectors.error) throw new Error('Could not load CGF controls')
  const values = Object.fromEntries((settings.data ?? []).map((row) => [row.key, row.value]))
  const members = (people.data ?? []).map((person) => ({ ...person, role: one<{ code: string }>(person.role) }))
  return { direct: values.direct_officer_submission === 'true', cap: values.pipeline_max_guarantee_tjs ?? '0', sectors: sectors.data ?? [], count: values.committee_operations_members ?? '3', threshold: values.committee_director_threshold_tjs ?? '1000000', members: members.filter((person) => ['deputy_director', 'prsf_analyst', 'credit_risk_officer', 'compliance_officer'].includes(person.role?.code ?? '')), delegations: delegations.data ?? [] }
}

export function CgfWorkflowControls() {
  const { role, user } = usePermissions()
  const admin = ['super_admin', 'prsf_admin'].includes(role?.code ?? '')
  const visible = admin || ['auditor', 'fkg_management'].includes(role?.code ?? '')
  const { data, error: loadError, mutate } = useSWR(visible ? ['cgf-controls', user?.id] : null, loadControls)
  const [direct, setDirect] = useState<boolean | null>(null)
  const [cap, setCap] = useState<string | null>(null)
  const [count, setCount] = useState<string | null>(null)
  const [threshold, setThreshold] = useState<string | null>(null)
  const [form, setForm] = useState({ delegate: '', start: '', end: '', reason: '' })
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

  async function saveRules() {
    const members = Number(count ?? data?.count)
    const amount = Number(threshold ?? data?.threshold)
    if (![2, 3].includes(members) || !Number.isFinite(amount) || amount <= 0) throw new Error('Choose 2 or 3 members and a positive Director threshold.')
    const { error } = await createClient().from('system_settings').upsert([
      { key: 'committee_operations_members', value: String(members), updated_by: user.id },
      { key: 'committee_director_threshold_tjs', value: String(amount), updated_by: user.id },
    ], { onConflict: 'key' })
    if (error) throw new Error(error.message)
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
    <Card><CardHeader><CardTitle>Submission and automatic stop factors</CardTitle><CardDescription>Manager review is required by default. Stop factors use the latest MIS delinquency reports, active products and sectors, and the monetary cap configured here. External credit-bureau data is not connected.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><fieldset className="flex flex-col gap-3" disabled={!admin || busy || !data}><div className="flex items-center gap-3"><Checkbox id="direct-officer-submission" checked={direct ?? data?.direct ?? false} onCheckedChange={(value) => setDirect(value === true)} /><Label htmlFor="direct-officer-submission">Allow direct submission by bank officers</Label></div><Label htmlFor="pipeline-cap">Maximum guarantee (TJS; 0 means no monetary cap)</Label><Input id="pipeline-cap" type="number" min="0" step="0.01" value={cap ?? data?.cap ?? ''} onChange={(event) => setCap(event.target.value)} /><p className="text-sm text-muted-foreground">A zero cap does not enforce a monetary limit. Configure the approved limit before production use.</p></fieldset><fieldset className="flex flex-col gap-3" disabled={!admin || busy}><legend className="text-sm font-medium">Prohibited sectors</legend>{data?.sectors.map((sector) => <div key={sector.id} className="flex items-center gap-3"><Checkbox id={`prohibited-${sector.id}`} checked={sector.is_prohibited} onCheckedChange={(value) => void run(async () => { const { error } = await createClient().from('sectors').update({ is_prohibited: value === true }).eq('id', sector.id); if (error) throw new Error(error.message) }, 'Sector screening rule saved')} /><Label htmlFor={`prohibited-${sector.id}`}>{sector.name_en}</Label></div>)}</fieldset></CardContent><CardFooter>{admin && <Button disabled={busy || !data} onClick={() => void run(async () => { const amount = Number(cap ?? data?.cap); if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a nonnegative limit.'); const { error } = await createClient().from('system_settings').upsert([{ key: 'direct_officer_submission', value: String(direct ?? data?.direct ?? false) }, { key: 'pipeline_max_guarantee_tjs', value: String(amount) }], { onConflict: 'key' }); if (error) throw new Error(error.message) }, 'Submission and screening rules saved')}>Save submission rules</Button>}</CardFooter></Card>
    <Card><CardHeader><CardTitle>Committee composition and thresholds</CardTitle><CardDescription>Applied when the next sitting is created. Existing assigned members, deadlines and signed protocols never change with these settings.</CardDescription></CardHeader><CardContent>
      <fieldset className="flex flex-col gap-3" disabled={!admin || busy || !data}><Label htmlFor="operations-seat-count">Operations members (2 or 3)</Label><Select value={count ?? data?.count ?? '3'} onValueChange={setCount} disabled={!admin || busy}><SelectTrigger id="operations-seat-count"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="2">2 operations members</SelectItem><SelectItem value="3">3 operations members</SelectItem></SelectGroup></SelectContent></Select><Label htmlFor="director-tjs-threshold">Director joins above (TJS)</Label><Input id="director-tjs-threshold" type="number" min="0.01" step="0.01" value={threshold ?? data?.threshold ?? ''} onChange={(event) => setThreshold(event.target.value)} /></fieldset>
    </CardContent><CardFooter>{admin && <Button disabled={busy || !data} onClick={() => void run(saveRules, 'Committee settings saved and audited')}>Save committee rules</Button>}</CardFooter></Card>
    <Card><CardHeader><CardTitle>Temporary guarantee-signature delegation</CardTitle><CardDescription>Delegations expire automatically, may be revoked immediately, and last no more than 90 days. They do not grant committee votes or Director decision rights. A deputy cannot sign a file they confirmed.</CardDescription></CardHeader><CardContent className="flex flex-col gap-6">
      {admin && <fieldset className="flex flex-col gap-3" disabled={busy}><Label htmlFor="signature-delegate">Employee</Label><Select value={form.delegate} onValueChange={(delegate) => setForm((current) => ({ ...current, delegate }))}><SelectTrigger id="signature-delegate"><SelectValue placeholder="Select employee" /></SelectTrigger><SelectContent><SelectGroup>{data?.members.map((person) => <SelectItem key={person.id} value={person.id}>{[person.first_name, person.last_name].filter(Boolean).join(' ') || person.id.slice(0, 8)} · {person.role?.code}</SelectItem>)}</SelectGroup></SelectContent></Select><Label htmlFor="delegation-start">Starts (your local time)</Label><Input id="delegation-start" type="datetime-local" value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} /><Label htmlFor="delegation-end">Expires (your local time)</Label><Input id="delegation-end" type="datetime-local" value={form.end} onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))} /><Label htmlFor="delegation-reason">Reason</Label><Input id="delegation-reason" maxLength={2000} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} /><Button className="self-start" disabled={busy || !form.delegate || !form.start || !form.end || form.reason.trim().length < 3} onClick={() => void run(delegate, 'Temporary signing authority granted and audited')}>Grant temporary authority</Button></fieldset>}
      <ul className="flex flex-col gap-3">{data?.delegations.map((delegation) => { const person = data.members.find((person) => person.id === delegation.delegate_id); return <li key={delegation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : delegation.delegate_id.slice(0, 8)}</p><p className="text-sm text-muted-foreground">{new Date(delegation.starts_at).toLocaleString()} — {new Date(delegation.ends_at).toLocaleString()} · {delegation.revoked_at ? 'revoked' : new Date(delegation.ends_at).getTime() <= Date.now() ? 'expired' : 'scheduled / active'}</p><p className="text-sm">{delegation.reason}</p></div>{admin && !delegation.revoked_at && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const { error } = await createClient().rpc('cgf_manage_signature_delegation', { p_revoke: delegation.id }); if (error) throw new Error(error.message) }, 'Delegation revoked and audited')}>Revoke</Button>}</li> })}</ul>
      {data?.delegations.length === 0 && <p className="text-sm text-muted-foreground">No signature delegations have been granted.</p>}
    </CardContent></Card>
  </section>
}
