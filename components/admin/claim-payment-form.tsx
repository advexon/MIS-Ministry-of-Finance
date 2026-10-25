'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Claim } from '@/lib/types/database'
import { financialPolicySchema } from '@/lib/admin/financial-policy'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

export function ClaimPaymentForm({ claim, onRecorded }: { claim: Claim; onRecorded: () => Promise<unknown> }) {
  const { data: version, error: policyError, mutate } = useSWR('claim-payment-policy', async () => {
    const { data, error } = await createClient().from('financial_policy_versions').select('revision,policy').order('revision', { ascending: false }).limit(1).maybeSingle()
    if (error) throw new Error('Could not load financial policy')
    return data ? { revision: data.revision as number, policy: financialPolicySchema.parse(data.policy) } : null
  })
  const [form, setForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), reference: '', notes: '' })
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null)
  const currency = claim.loan_application?.currency
  const outstanding = (claim.approved_amount ?? 0) - (claim.paid_amount ?? 0)

  async function submit() {
    if (!version || !currency || !confirmed) return
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) { setError('Enter a positive amount within the outstanding approval.'); return }
    setBusy(true); setError(null)
    try {
      const fingerprint = JSON.stringify({ claim: claim.id, form, revision: version.revision, currency })
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() }
      const { data, error } = await createClient().rpc('cgf_record_claim_payment', { p_payment_id: attempt.current.id, p_claim_id: claim.id, p_amount: amount, p_currency: currency, p_payment_date: form.date, p_reference: form.reference.trim(), p_notes: form.notes.trim(), p_expected_revision: version.revision })
      if (error) throw new Error(error.message)
      if (!data || data.id !== attempt.current.id) throw new Error('Payment confirmation was not received. Retry with the unchanged fields to avoid a duplicate.')
      await onRecorded()
    } catch (error) { setError(error instanceof Error ? error.message : 'Payment could not be confirmed. Retry unchanged fields.'); await mutate() }
    finally { setBusy(false) }
  }

  return <div className="flex flex-col gap-4">
    <p className="text-sm leading-relaxed">Outstanding approval: {outstanding.toLocaleString()} {currency ?? '(loan currency unavailable)'}. {version ? `Using policy revision ${version.revision}.` : 'A saved financial policy is required.'} This records MIS payment authorization, not an external bank transfer.</p>
    {(error || policyError || version === null) && <Alert variant="destructive"><AlertDescription>{error ?? (version === null ? 'Save an approved financial policy in Settings before recording a payment.' : 'Could not load the current policy.')}</AlertDescription></Alert>}
    <fieldset disabled={busy || !version || !currency} className="flex flex-col gap-4"><legend className="sr-only">Claim payment authorization</legend><FieldGroup>
      <Field><FieldLabel htmlFor="claim-payment-amount">Payment amount ({currency})</FieldLabel><Input id="claim-payment-amount" type="number" min="0.01" max={outstanding} step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /></Field>
      <Field><FieldLabel htmlFor="claim-payment-date">Payment date</FieldLabel><Input id="claim-payment-date" type="date" max={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></Field>
      <Field><FieldLabel htmlFor="claim-payment-reference">Payment reference</FieldLabel><Input id="claim-payment-reference" maxLength={200} value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} /></Field>
      <Field><FieldLabel htmlFor="claim-payment-notes">Authorization reason / evidence reference</FieldLabel><Textarea id="claim-payment-notes" minLength={3} maxLength={2000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /><FieldDescription>Super Administrator exceptions to designated-actor or separation-of-duties rules are attributed to you and audited with this reason.</FieldDescription></Field>
    </FieldGroup><div className="flex items-start gap-3"><Checkbox id="claim-payment-confirm" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><Label htmlFor="claim-payment-confirm">I authorize this payment against the signed committee decision and original guarantee. The immutable receipt cannot be edited.</Label></div><Button disabled={busy || !confirmed || !form.reference.trim() || form.notes.trim().length < 3 || !form.amount} onClick={() => void submit()}>{busy ? 'Recording payment…' : 'Authorize and record payment'}</Button></fieldset>
  </div>
}
