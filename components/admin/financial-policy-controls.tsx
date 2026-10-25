'use client'

import { useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { usePermissions } from '@/lib/contexts/permission-context'
import { createClient } from '@/lib/supabase/client'
import { EMPTY_POLICY_DRAFT, PAYMENT_ROLES, POLICY_CURRENCIES, financialPolicySchema, type FinancialPolicy, type FinancialPolicyVersion } from '@/lib/admin/financial-policy'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

function numberInput(value: string) { return value.trim() === '' ? Number.NaN : Number(value) }
function displayNumber(value: number | null) { return value !== null && Number.isFinite(value) ? String(value) : '' }

function PolicySelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value} onValueChange={onChange}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
}

function PolicyNumber({ id, label, value, onChange, max = 100, step = 'any' }: { id: string; label: string; value: number | null; onChange: (value: number) => void; max?: number; step?: string }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Input id={id} type="number" min="0" max={max} step={step} value={displayNumber(value)} onChange={(event) => onChange(numberInput(event.target.value))} /></Field>
}

function PolicyEditor({ initial, admin, history, refresh }: { initial: FinancialPolicyVersion | null; admin: boolean; history: FinancialPolicyVersion[]; refresh: () => Promise<unknown> }) {
  const [baseline, setBaseline] = useState(initial)
  const [draft, setDraft] = useState<FinancialPolicy>(initial?.policy ?? EMPTY_POLICY_DRAFT)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [issues, setIssues] = useState<string[]>([])
  const latest = history[0] ?? null
  const stale = (latest?.revision ?? 0) > (baseline?.revision ?? 0)
  const claims = draft.claims
  const recoveries = draft.recoveries
  const fees = draft.fees
  const setClaims = (change: Partial<FinancialPolicy['claims']>) => setDraft((value) => ({ ...value, claims: { ...value.claims, ...change } }))
  const setRecoveries = (change: Partial<FinancialPolicy['recoveries']>) => setDraft((value) => ({ ...value, recoveries: { ...value.recoveries, ...change } }))
  const setFees = (change: Partial<FinancialPolicy['fees']>) => setDraft((value) => ({ ...value, fees: { ...value.fees, ...change } }))

  async function save() {
    setError(null); setMessage(null)
    const parsed = financialPolicySchema.safeParse(draft)
    if (!parsed.success) {
      setIssues(parsed.error.issues.map((issue) => `${issue.path.join(' → ')}: ${issue.message}`))
      return
    }
    setIssues([])
    if (!confirmed || reason.trim().length < 3) { setError('Review the policy and enter a change reason before saving.'); return }
    setBusy(true)
    try {
      const { data, error } = await createClient().rpc('cgf_save_financial_policy', { p_policy: parsed.data, p_reason: reason.trim(), p_expected_revision: baseline?.revision ?? 0 })
      if (error) throw new Error(error.code === '40001' ? 'Another administrator saved a new revision. Your draft is preserved; load the latest policy before trying again.' : 'Policy save was not confirmed. Reload the latest policy before retrying; your draft is preserved.')
      if (!data || typeof data.id !== 'string' || !Number.isSafeInteger(data.revision) || data.revision <= (baseline?.revision ?? 0) || JSON.stringify(financialPolicySchema.parse(data.policy)) !== JSON.stringify(parsed.data)) throw new Error('Policy save was not confirmed. Reload before retrying.')
      const saved: FinancialPolicyVersion = { id: data.id, revision: data.revision, policy: financialPolicySchema.parse(data.policy), reason: data.reason, created_at: data.created_at }
      setBaseline(saved); setDraft(saved.policy); setReason(''); setConfirmed(false)
      setMessage(`Policy revision ${saved.revision} saved and audited. Claim payments use this revision; recovery and fee execution integration remains pending.`)
      try { await refresh() } catch { setMessage(`Policy revision ${saved.revision} saved and audited; revision history could not refresh.`) }
    } catch (error) { setError(error instanceof Error ? error.message : 'Save not confirmed; reload before retrying.') }
    finally { setBusy(false) }
  }

  async function reload() {
    setBusy(true)
    try { await refresh(); setMessage('Latest history refreshed. Use “Discard draft and load latest” to replace your draft.'); setError(null) }
    catch { setError('Could not reload the latest policy. Your draft is preserved.') }
    finally { setBusy(false) }
  }

  return <section aria-label="Financial policy controls" className="flex flex-col gap-6">
    <Alert><AlertTitle>Administrator-owned policy · claim payments connected</AlertTitle><AlertDescription>Claim-payment authorization enforces the saved policy and snapshots its revision, terms and evidence. Super Administrator has inherent payment authority but cannot exceed the approved outstanding amount or bypass evidence and currency checks. Recovery allocation and fee execution are not yet connected; those settings remain configuration-only. Saving never recalculates historical transactions.</AlertDescription></Alert>
    {!baseline && <Alert><AlertTitle>No financial policy has been saved</AlertTitle><AlertDescription>The form is an unsaved draft. No legacy 50% recovery share or 0.5% fee rate is assumed to be approved. An empty payment authority list authorizes no ordinary payment role; verified Super Administrator authority remains inherent.</AlertDescription></Alert>}
    {message && <p role="status" className="text-sm leading-relaxed">{message}</p>}
    {(error || issues.length > 0) && <Alert variant="destructive"><AlertTitle>Policy not saved</AlertTitle><AlertDescription>{error}{issues.length > 0 && <ul className="list-disc pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</AlertDescription></Alert>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{baseline ? `Editing saved revision ${baseline.revision}` : 'Editing an unsaved draft'}{!admin && ' · read only'}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>Refresh history</Button>{admin && <Button type="button" variant="outline" disabled={busy} onClick={() => { setBaseline(latest); setDraft(latest?.policy ?? EMPTY_POLICY_DRAFT); setReason(''); setConfirmed(false); setIssues([]); setError(null); setMessage('Latest policy loaded; unsaved edits discarded.') }}>Discard draft and load latest</Button>}</div></div>
    {stale && <Alert><AlertTitle>A newer saved revision is available</AlertTitle><AlertDescription>Your unsaved edits have not been overwritten. Load the latest policy before saving.</AlertDescription></Alert>}
    <fieldset disabled={!admin || busy} className="flex min-w-0 flex-col gap-6">
      <legend className="sr-only">Approved financial rules</legend>
      <Card><CardHeader><CardTitle>Currency and settlement</CardTitle><CardDescription>Enable transaction currencies and define how settlement currency is determined.</CardDescription></CardHeader><CardContent><FieldGroup>
        <fieldset className="flex flex-col gap-3"><legend className="text-sm font-medium">Enabled transaction currencies</legend><div className="flex flex-wrap gap-6">{POLICY_CURRENCIES.map((currency) => <div key={currency} className="flex items-center gap-2"><Checkbox id={`policy-currency-${currency}`} checked={draft.currencies.includes(currency)} onCheckedChange={(checked) => setDraft((value) => ({ ...value, currencies: checked === true ? [...value.currencies, currency] : value.currencies.filter((item) => item !== currency) }))} /><Label htmlFor={`policy-currency-${currency}`}>{currency}</Label></div>)}</div></fieldset>
        <PolicySelect id="policy-settlement" label="Settlement currency" value={draft.settlement_currency} options={[["loan_currency", "Same as the original loan"], ["TJS", "TJS using a documented, approved exchange rate"]]} onChange={(settlement_currency) => setDraft((value) => ({ ...value, settlement_currency: settlement_currency as FinancialPolicy['settlement_currency'] }))} />
        <PolicySelect id="policy-fx-date" label="Exchange-rate valuation date (when conversion is required)" value={draft.fx_date} options={[["transaction_date", "Transaction date"], ["period_end", "Reporting period end"]]} onChange={(fx_date) => setDraft((value) => ({ ...value, fx_date: fx_date as FinancialPolicy['fx_date'] }))} />
        <FieldDescription>FX conversion will require an approved rate, source/reference and valuation date recorded with each transaction; no live rate feed is assumed. Different currencies must not be summed without conversion evidence.</FieldDescription>
      </FieldGroup></CardContent></Card>
      <Card><CardHeader><CardTitle>Claim-payment authority and limits</CardTitle><CardDescription>Limits are in each rule&apos;s settlement currency, not automatically converted to TJS. Committee approval remains a prerequisite and is separate from payment authority.</CardDescription></CardHeader><CardContent><FieldGroup>
        <div className="flex items-center gap-3"><Checkbox id="policy-partial" checked={claims.allow_partial_payments} onCheckedChange={(checked) => setClaims({ allow_partial_payments: checked === true })} /><Label htmlFor="policy-partial">Allow partial payments of an approved claim</Label></div>
        <div className="flex items-center gap-3"><Checkbox id="policy-separation" checked={claims.separate_payment_actor} onCheckedChange={(checked) => setClaims({ separate_payment_actor: checked === true })} /><Label htmlFor="policy-separation">Payment recorder must differ from the claim approver</Label></div>
        {claims.authorities.length === 0 && <p className="text-sm text-muted-foreground">No payment authority assigned.</p>}
        {claims.authorities.map((authority, index) => {
          const change = (patch: Partial<typeof authority>) => setClaims({ authorities: claims.authorities.map((item, row) => row === index ? { ...item, ...patch } : item) })
          return <fieldset key={index} className="flex flex-col gap-4 rounded-md border p-4"><legend className="px-1 text-sm font-medium">Authority rule {index + 1}</legend><PolicySelect id={`payment-role-${index}`} label="Payment role" value={authority.role_code} options={PAYMENT_ROLES.map((role) => [role.code, role.label] as const)} onChange={(role_code) => change({ role_code: role_code as typeof authority.role_code })} /><PolicySelect id={`payment-currency-${index}`} label="Limit currency" value={authority.currency} options={POLICY_CURRENCIES.map((currency) => [currency, currency] as const)} onChange={(currency) => change({ currency: currency as typeof authority.currency })} /><div className="grid gap-4 sm:grid-cols-2"><PolicyNumber id={`payment-limit-${index}`} label="Maximum single payment" value={authority.per_payment_limit} max={1_000_000_000_000} onChange={(per_payment_limit) => change({ per_payment_limit })} /><PolicyNumber id={`claim-limit-${index}`} label="Maximum cumulative paid per claim" value={authority.per_claim_limit} max={1_000_000_000_000} onChange={(per_claim_limit) => change({ per_claim_limit })} /></div><Button type="button" variant="outline" className="self-start" onClick={() => setClaims({ authorities: claims.authorities.filter((_, row) => row !== index) })}>Remove authority rule {index + 1}</Button></fieldset>
        })}
        {admin && <Button type="button" variant="outline" className="self-start" disabled={claims.authorities.length >= 12} onClick={() => setClaims({ authorities: [...claims.authorities, { role_code: 'accountant', currency: draft.currencies[0] ?? 'TJS', per_payment_limit: Number.NaN, per_claim_limit: Number.NaN }] })}>Add payment authority</Button>}
        <FieldDescription>IT administrators configure policy but cannot approve or pay claims. Auditors remain read-only. Amounts must stay within committee approval and outstanding payable balance; every payment needs a reference and an immutable audit record.</FieldDescription>
      </FieldGroup></CardContent></Card>
      <Card><CardHeader><CardTitle>Recovery allocation</CardTitle><CardDescription>Define the distribution of net recoveries between the Fund and partner bank.</CardDescription></CardHeader><CardContent><FieldGroup>
        <PolicySelect id="policy-recovery-allocation" label="Allocation method" value={recoveries.allocation} options={[["fixed_percentage", "Fixed Fund percentage; remainder to bank"], ["coverage_pro_rata", "Pro rata to the issued guarantee coverage"], ["fund_first", "Fund first up to its unrecovered claim payout"]]} onChange={(allocation) => setRecoveries({ allocation: allocation as typeof recoveries.allocation, fund_share_percent: null })} />
        {recoveries.allocation === 'fixed_percentage' && <PolicyNumber id="policy-fund-share" label="Fund share (%)" value={recoveries.fund_share_percent} onChange={(fund_share_percent) => setRecoveries({ fund_share_percent })} />}
        <PolicySelect id="policy-recovery-costs" label="Recovery costs" value={recoveries.costs} options={[["no_deduction", "No cost deduction; allocate the gross recovery"], ["deduct_documented_costs", "Deduct documented eligible costs before allocation"]]} onChange={(costs) => setRecoveries({ costs: costs as typeof recoveries.costs })} />
        <FieldDescription>The Fund allocation is always capped at its unrecovered paid claim amount; any excess goes to the bank. Cost deductions require evidence and cannot exceed the gross recovery. Policy changes must not recalculate historical allocations.</FieldDescription>
      </FieldGroup></CardContent></Card>
      <Card><CardHeader><CardTitle>Fee calculation and proration</CardTitle><CardDescription>Rates are percentages. Configure upfront and recurring fees separately; no historical fee rows change when saving a policy.</CardDescription></CardHeader><CardContent><FieldGroup>
        <PolicySelect id="policy-fee-base" label="Fee calculation base" value={fees.base} options={[["guarantee_amount", "Issued guarantee amount"], ["approved_loan_amount", "Approved loan amount"], ["outstanding_guaranteed_principal", "Outstanding guaranteed principal (requires balance evidence)"]]} onChange={(base) => setFees({ base: base as typeof fees.base })} />
        <div className="grid gap-4 sm:grid-cols-2"><PolicyNumber id="policy-upfront-rate" label="Upfront fee (%)" value={fees.upfront_rate_percent} onChange={(upfront_rate_percent) => setFees({ upfront_rate_percent })} /><PolicyNumber id="policy-recurring-rate" label="Recurring fee (%)" value={fees.recurring_rate_percent} onChange={(recurring_rate_percent) => setFees({ recurring_rate_percent })} /></div>
        <PolicySelect id="policy-rate-basis" label="Recurring rate basis" value={fees.recurring_rate_basis} options={[["quarterly", "Rate per quarter"], ["annual", "Annual rate billed quarterly"]]} onChange={(recurring_rate_basis) => setFees({ recurring_rate_basis: recurring_rate_basis as typeof fees.recurring_rate_basis })} />
        <PolicySelect id="policy-proration" label="Day-count proration" value={fees.proration} options={[["none", "No proration; full quarterly fee"], ["actual_365", "Actual days / 365"], ["actual_actual", "Actual days / days in the applicable calendar year"]]} onChange={(proration) => setFees({ proration: proration as typeof fees.proration })} />
        <FieldDescription>Prorated periods include the start date and exclude the end date. Quarterly rates are annualized by multiplying by four for day-count proration. Actual/Actual splits periods at year boundaries. Upfront fees are charged once without day-count proration.</FieldDescription>
        <div className="grid gap-4 sm:grid-cols-2"><PolicyNumber id="policy-decimals" label="Rounding decimal places (half up)" value={fees.decimal_places} max={4} step="1" onChange={(decimal_places) => setFees({ decimal_places })} /><PolicyNumber id="policy-due-days" label="Payment due after invoice (calendar days)" value={fees.due_days} max={365} step="1" onChange={(due_days) => setFees({ due_days })} /></div>
      </FieldGroup></CardContent><CardFooter><p className="text-sm leading-relaxed text-muted-foreground">Financial execution must snapshot the exact revision, base, period, currency, FX evidence and rounded result when each transaction is created.</p></CardFooter></Card>
      {admin && <Card><CardHeader><CardTitle>Save approved policy</CardTitle><CardDescription>Each save creates an immutable revision and an audit entry. Existing revisions are never edited or deleted.</CardDescription></CardHeader><CardContent><FieldGroup><Field><FieldLabel htmlFor="financial-policy-reason">Reason / approval reference</FieldLabel><Textarea id="financial-policy-reason" required minLength={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reference the approved financial rules and explain this change" /></Field><div className="flex items-center gap-3"><Checkbox id="financial-policy-confirm" checked={confirmed} onCheckedChange={(checked) => setConfirmed(checked === true)} /><Label htmlFor="financial-policy-confirm">I have reviewed these values against the approved policy, including any zero fee rates.</Label></div></FieldGroup></CardContent><CardFooter><Button type="button" disabled={busy || stale || !confirmed || reason.trim().length < 3} onClick={() => void save()}>{busy ? 'Saving policy…' : 'Save policy revision'}</Button></CardFooter></Card>}
    </fieldset>
    <Card><CardHeader><CardTitle>Saved policy history</CardTitle><CardDescription>Latest 20 immutable revisions. This is configuration history, not a payment ledger.</CardDescription></CardHeader><CardContent><ul className="flex flex-col gap-3">{history.map((version) => <li key={version.id}><details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Revision {version.revision} · {new Date(version.created_at).toLocaleString()} · {version.reason}</summary><pre className="mt-3 overflow-auto rounded-md bg-muted p-3 text-sm text-foreground">{JSON.stringify(version.policy, null, 2)}</pre></details></li>)}</ul>{history.length === 0 && <p className="text-sm text-muted-foreground">No saved policy revisions.</p>}</CardContent></Card>
  </section>
}

export function FinancialPolicyControls() {
  const { role, user } = usePermissions()
  const admin = ['super_admin', 'prsf_admin'].includes(role?.code ?? '')
  const visible = admin || ['accountant', 'auditor', 'fkg_management', 'deputy_director'].includes(role?.code ?? '')
  const { data, error, mutate } = usePageQuery<FinancialPolicyVersion[]>(visible ? ['financial-policy-versions'] : null, async () => {
    const { data, error } = await createClient().from('financial_policy_versions').select('id,revision,policy,reason,created_at').order('revision', { ascending: false }).limit(20)
    if (error) throw new Error('Could not load financial policy history')
    return (data ?? []).map((version) => ({ ...version, policy: financialPolicySchema.parse(version.policy) }))
  })
  if (!visible) return <Alert><AlertDescription>Financial policy configuration requires an authorized Fund role.</AlertDescription></Alert>
  if (error) return <Alert variant="destructive"><AlertTitle>Financial policy unavailable</AlertTitle><AlertDescription>No fallback policy has been loaded.</AlertDescription><Button type="button" variant="outline" onClick={() => void mutate()}>Retry loading policy</Button></Alert>
  if (!data) return <Skeleton className="h-40 w-full" />
  return <PolicyEditor key={`${user.id}:${role?.id}`} initial={data[0] ?? null} history={data} admin={admin} refresh={() => mutate()} />
}
