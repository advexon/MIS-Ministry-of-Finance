'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { financialPolicySchema } from '@/lib/admin/financial-policy'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface RecoveryReceipt { id: string; prsf_share: number; bank_share: number; documented_costs: number; currency: string; policy_revision: number }

export const RECOVERY_METHODS: Record<string, string> = { cash: 'Cash', collateral_sale: 'Collateral Sale', court_order: 'Court Order', voluntary: 'Voluntary Payment', insurance: 'Insurance', other: 'Other' }

export function RecoveryForm({ claim, onRecorded }: { claim: { id: string; loan_application?: { currency?: string | null } | null }; onRecorded: (receipt: RecoveryReceipt) => Promise<void> }) {
  const { data: version, error: policyError, mutate } = useSWR('recovery-execution-policy', async () => {
    const { data, error } = await createClient().from('financial_policy_versions').select('revision,policy').order('revision', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error('Could not load the recovery policy.')
    return data ? { revision: Number(data.revision), policy: financialPolicySchema.parse(data.policy) } : null
  })
  const [form, setForm] = useState({ gross: '', costs: '0', date: new Date().toISOString().slice(0, 10), reference: '', costEvidence: '', notes: '', method: 'cash' })
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null)
  const currency = claim.loan_application?.currency
  const rule = version?.policy.recoveries
  const costsAllowed = rule?.costs === 'deduct_documented_costs'

  async function submit() {
    if (!version || !currency || !confirmed || busyRef.current) return
    const gross = Number(form.gross)
    const costs = costsAllowed ? Number(form.costs) : 0
    if (!Number.isFinite(gross) || gross <= 0 || gross > 1_000_000_000_000 || !Number.isFinite(costs) || costs < 0 || costs > gross) { setError('Enter a positive gross recovery and documented costs no greater than the recovery.'); return }
    if (costs > 0 && form.costEvidence.trim().length < 3) { setError('Provide the supporting document reference for deducted costs.'); return }
    busyRef.current = true; setBusy(true); setError(null)
    try {
      const input = { p_method: form.method, p_claim_id: claim.id, p_gross: gross, p_costs: costs, p_currency: currency, p_date: form.date, p_reference: form.reference.trim(), p_cost_evidence: costs > 0 ? form.costEvidence.trim() : null, p_notes: form.notes.trim(), p_expected_revision: version.revision }
      const fingerprint = JSON.stringify(input)
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() }
      const { data, error } = await createClient().rpc('cgf_record_recovery', { p_recovery_id: attempt.current.id, ...input })
      if (error) throw new Error(error.message)
      if (!data || data.id !== attempt.current.id) throw new Error('Receipt not confirmed. Retry unchanged fields and the same reference; do not create another recovery.')
      await onRecorded(data as RecoveryReceipt)
    } catch (error) { setError(error instanceof Error ? error.message : 'Recovery not confirmed. Retry unchanged fields and the same reference.') }
    finally { busyRef.current = false; setBusy(false) }
  }

  return <div className="flex flex-col gap-4">
    <p className="text-sm leading-relaxed">{version ? `Policy revision ${version.revision}: ${rule?.allocation.replaceAll('_', ' ')}${rule?.allocation === 'fixed_percentage' ? ` (${rule.fund_share_percent}% Fund)` : ''}.` : 'Loading the approved recovery rules…'} Allocation is calculated by the database from original signed terms and reconciled payments. The cumulative Fund share cannot exceed the amount actually paid. Excess net proceeds go to the bank.</p>
    <p className="text-sm text-muted-foreground">Only original-currency settlement is supported. No FX rate is assumed. Historical recoveries and paid claims without reconciled ledger evidence require a controlled reconciliation first.</p>
    {(error || policyError || version === null) && <Alert variant="destructive"><AlertDescription>{error ?? (version === null ? 'Save a financial policy in Settings before recording recoveries.' : 'Could not load the recovery policy.')}<Button variant="outline" size="sm" disabled={busy} onClick={() => void mutate()}>Reload policy</Button></AlertDescription></Alert>}
    <fieldset disabled={busy || !version || !currency} className="flex flex-col gap-4"><legend className="sr-only">Recovery allocation</legend><FieldGroup>
      <Field><FieldLabel htmlFor="recovery-gross">Gross recovered ({currency ?? 'currency unavailable'})</FieldLabel><Input id="recovery-gross" type="number" min="0.01" max="1000000000000" step="0.01" value={form.gross} onChange={(event) => setForm((current) => ({ ...current, gross: event.target.value }))} /></Field>
      <Field><FieldLabel htmlFor="recovery-date">Recovery date</FieldLabel><Input id="recovery-date" type="date" max={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /><FieldDescription>Cannot precede any claim payment or previously recorded recovery.</FieldDescription></Field>
      {costsAllowed ? <><Field><FieldLabel htmlFor="recovery-costs">Documented recovery costs ({currency})</FieldLabel><Input id="recovery-costs" type="number" min="0" step="0.01" value={form.costs} onChange={(event) => setForm((current) => ({ ...current, costs: event.target.value }))} /></Field><Field><FieldLabel htmlFor="recovery-cost-evidence">Cost evidence / document reference</FieldLabel><Input id="recovery-cost-evidence" maxLength={2000} value={form.costEvidence} onChange={(event) => setForm((current) => ({ ...current, costEvidence: event.target.value }))} /><FieldDescription>Required for any positive deduction. Costs are removed before splitting the remaining proceeds.</FieldDescription></Field></> : <p className="text-sm text-muted-foreground">This policy does not permit recovery-cost deductions.</p>}
      <Field><FieldLabel htmlFor="recovery-method">Recovery method</FieldLabel><Select value={form.method} onValueChange={(method) => setForm((current) => ({ ...current, method }))}><SelectTrigger id="recovery-method"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Object.entries(RECOVERY_METHODS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="recovery-reference">Receipt / bank transaction reference</FieldLabel><Input id="recovery-reference" maxLength={200} value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} /><FieldDescription>Unique per bank and currency, ignoring letter case and surrounding spaces.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="recovery-reason">Recording reason / authority evidence</FieldLabel><Textarea id="recovery-reason" minLength={3} maxLength={2000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /><FieldDescription>The receipt records your identity, reason, original terms, calculation inputs and policy revision atomically.</FieldDescription></Field>
    </FieldGroup><div className="flex items-start gap-3"><Checkbox id="recovery-confirm" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><Label htmlFor="recovery-confirm">I confirm the recovered funds and supporting evidence. This immutable receipt cannot be edited or deleted.</Label></div><Button disabled={busy || !confirmed || !form.gross || !form.date || !form.reference.trim() || form.notes.trim().length < 3} onClick={() => void submit()}>{busy ? 'Recording recovery…' : 'Record policy-backed recovery'}</Button></fieldset>
  </div>
}
