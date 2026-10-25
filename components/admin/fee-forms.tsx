'use client'

import { useRef, useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { createClient } from '@/lib/supabase/client'
import { financialPolicySchema } from '@/lib/admin/financial-policy'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export interface FeeLoanOption {
  id: string
  loan_number: string | null
  bank_id: string
  currency: string | null
}
export interface FeeReceipt {
  id: string
  status: string
  currency: string
  fee_amount: number
  policy_revision: number
}

export function FeeCreateForm({
  loans,
  onRecorded,
  onBusyChange,
}: {
  loans: FeeLoanOption[]
  onRecorded: (receipt: FeeReceipt) => Promise<void>
  onBusyChange: (busy: boolean) => void
}) {
  const {
    data: version,
    error: policyError,
    mutate,
  } = usePageQuery(['fee-execution-policy'], async () => {
    const { data, error } = await createClient()
      .from('financial_policy_versions')
      .select('revision,policy')
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error('Could not load the financial policy.')
    return data
      ? {
          revision: Number(data.revision),
          policy: financialPolicySchema.parse(data.policy),
        }
      : null
  })
  const [form, setForm] = useState({
    loanId: '',
    type: 'upfront',
    date: new Date().toISOString().slice(0, 10),
    start: '',
    end: '',
    balanceId: '',
    notes: '',
  })
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null)
  const loan = loans.find((item) => item.id === form.loanId)
  const outstanding =
    version?.policy.fees.base === 'outstanding_guaranteed_principal'
  const { data: balances = [], error: balanceError } = usePageQuery(
    loan && outstanding && form.type === 'quarterly' && form.end
      ? ['fee-balance-evidence', loan.id, form.end]
      : null,
    async () => {
      if (!loan || !outstanding || form.type !== 'quarterly' || !form.end)
        return []
      const { data: reports, error: reportError } = await createClient()
        .from('guarantee_reports')
        .select('id,report_month')
        .eq('bank_id', loan.bank_id)
        .eq('status', 'approved')
        .eq('report_type', 'monthly')
        .order('report_month', { ascending: false })
      if (reportError)
        throw new Error('Could not load approved balance evidence.')
      if (!reports?.length) return []
      const { data, error } = await createClient()
        .from('guarantee_report_loans')
        .select('id,report_id,outstanding_principal,currency')
        .eq('loan_application_id', loan.id)
        .in(
          'report_id',
          reports.map((report) => report.id),
        )
      if (error) throw new Error('Could not load approved balance evidence.')
      return (data ?? [])
        .map((row) => ({
          ...row,
          month:
            reports.find((report) => report.id === row.report_id)
              ?.report_month ?? '',
        }))
        .filter((row) => {
          const month = new Date(row.month + 'T00:00:00Z')
          return (
            new Date(
              Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
            )
              .toISOString()
              .slice(0, 10) === form.end
          )
        })
    },
  )

  async function submit() {
    if (!version || !confirmed || busyRef.current) return
    if (
      !loan ||
      form.notes.trim().length < 3 ||
      !form.date ||
      (form.type === 'quarterly' &&
        (!form.start || !form.end || form.end <= form.start)) ||
      (outstanding && (form.type === 'upfront' || !form.balanceId))
    ) {
      setError(
        'Provide the loan, dates, reason and required balance evidence. Outstanding-balance policy supports recurring fees only.',
      )
      return
    }
    busyRef.current = true
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const input = {
        p_loan_id: loan.id,
        p_type: form.type,
        p_date: form.date,
        p_start: form.type === 'quarterly' ? form.start : null,
        p_end: form.type === 'quarterly' ? form.end : null,
        p_balance_row_id: outstanding ? form.balanceId : null,
        p_notes: form.notes.trim(),
        p_expected_revision: version.revision,
      }
      const fingerprint = JSON.stringify(input)
      if (attempt.current?.fingerprint !== fingerprint)
        attempt.current = { fingerprint, id: crypto.randomUUID() }
      const { data, error } = await createClient().rpc('cgf_create_fee', {
        p_fee_id: attempt.current.id,
        ...input,
      })
      if (error) throw new Error(error.message)
      if (
        !data ||
        data.id !== attempt.current.id ||
        data.status !== 'pending' ||
        data.policy_revision !== version.revision
      )
        throw new Error(
          'Fee not confirmed. Retry unchanged fields; do not create a different request.',
        )
      await onRecorded(data as FeeReceipt)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Fee not confirmed. Retry unchanged fields.',
      )
    } finally {
      busyRef.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed">
        {version
          ? `Policy revision ${version.revision}: ${version.policy.fees.base.replaceAll('_', ' ')}; upfront ${version.policy.fees.upfront_rate_percent}%; recurring ${version.policy.fees.recurring_rate_percent}% ${version.policy.fees.recurring_rate_basis}; ${version.policy.fees.proration.replaceAll('_', ' ')}; half-up to ${version.policy.fees.decimal_places} decimal places.`
          : 'Loading approved policy…'}{' '}
        The database calculates the final fee from signed terms. No manual base,
        rate or FX override is accepted.
      </p>
      {(error || policyError || version === null || balanceError) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error ??
              (version === null
                ? 'Save a financial policy in Settings before creating fees.'
                : 'Could not load policy or balance evidence.')}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void mutate()}
            >
              Reload policy
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <fieldset disabled={busy || !version} className="flex flex-col gap-4">
        <legend className="sr-only">Fee assessment inputs</legend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fee-loan">Loan application</FieldLabel>
            <Select
              value={form.loanId}
              onValueChange={(loanId) => {
                setForm((value) => ({ ...value, loanId, balanceId: '' }))
                setConfirmed(false)
              }}
            >
              <SelectTrigger id="fee-loan">
                <SelectValue placeholder="Select loan with an issued guarantee" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {loans.map((loan) => (
                    <SelectItem key={loan.id} value={loan.id}>
                      {loan.loan_number ?? loan.id} ·{' '}
                      {loan.currency ?? 'currency unavailable'}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="fee-type">Fee type</FieldLabel>
            <Select
              value={form.type}
              onValueChange={(type) => {
                setForm((value) => ({ ...value, type, balanceId: '' }))
                setConfirmed(false)
              }}
            >
              <SelectTrigger id="fee-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="upfront" disabled={outstanding}>
                    Upfront · once per loan
                  </SelectItem>
                  <SelectItem value="quarterly">
                    Recurring · quarterly billing
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Annual recurring rates are billed quarterly using the configured
              day-count method.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="fee-date">Assessment date</FieldLabel>
            <Input
              id="fee-date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={form.date}
              onChange={(event) =>
                setForm((value) => ({ ...value, date: event.target.value }))
              }
            />
          </Field>
          {form.type === 'quarterly' && (
            <>
              <Field>
                <FieldLabel htmlFor="fee-start">
                  Period start · inclusive
                </FieldLabel>
                <Input
                  id="fee-start"
                  type="date"
                  value={form.start}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      start: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="fee-end">
                  Period end · exclusive
                </FieldLabel>
                <Input
                  id="fee-end"
                  type="date"
                  value={form.end}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      end: event.target.value,
                      balanceId: '',
                    }))
                  }
                />
                <FieldDescription>
                  Use a completed period within one calendar quarter.
                  No-proration policy requires a full quarter. For
                  July–September, use July 1 to October 1.
                </FieldDescription>
              </Field>
            </>
          )}
          {outstanding && (
            <Field>
              <FieldLabel htmlFor="fee-balance">
                Approved month-end principal evidence
              </FieldLabel>
              <Select
                value={form.balanceId}
                onValueChange={(balanceId) =>
                  setForm((value) => ({ ...value, balanceId }))
                }
              >
                <SelectTrigger id="fee-balance">
                  <SelectValue placeholder="Select approved report row" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {balances.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.month} · {row.outstanding_principal ?? 'missing'}{' '}
                        {row.currency}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Only approved monthly reports ending immediately before the
                exclusive period end are offered. The database applies the
                original signed guarantee ratio.
              </FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="fee-notes">
              Assessment reason / authority evidence
            </FieldLabel>
            <Textarea
              id="fee-notes"
              minLength={3}
              maxLength={2000}
              value={form.notes}
              onChange={(event) =>
                setForm((value) => ({ ...value, notes: event.target.value }))
              }
            />
          </Field>
        </FieldGroup>
        <div className="flex items-start gap-3">
          <Checkbox
            id="fee-confirm"
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
          />
          <Label htmlFor="fee-confirm">
            I authorize the policy-calculated assessment. Its calculation,
            signed terms, currency and policy revision are immutable.
          </Label>
        </div>
        <Button
          disabled={
            !confirmed ||
            busy ||
            !loan ||
            form.notes.trim().length < 3 ||
            (outstanding && !form.balanceId)
          }
          onClick={() => void submit()}
        >
          {busy ? 'Creating fee…' : 'Create policy-backed fee'}
        </Button>
      </fieldset>
    </div>
  )
}

export function FeeActionForm({
  fee,
  action,
  onRecorded,
  onBusyChange,
}: {
  fee: FeeReceipt
  action: 'invoice' | 'pay'
  onRecorded: (receipt: FeeReceipt) => Promise<void>
  onBusyChange: (busy: boolean) => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    if (
      !confirmed ||
      busyRef.current ||
      reason.trim().length < 3 ||
      !date ||
      (action === 'pay' && !reference.trim())
    )
      return
    busyRef.current = true
    setBusy(true)
    onBusyChange(true)
    setError(null)
    try {
      const { data, error } = await createClient().rpc('cgf_fee_action', {
        p_fee_id: fee.id,
        p_action: action,
        p_date: date,
        p_reference: action === 'pay' ? reference.trim() : null,
        p_reason: reason.trim(),
      })
      if (error) throw new Error(error.message)
      if (
        !data ||
        data.id !== fee.id ||
        data.status !== (action === 'invoice' ? 'invoiced' : 'paid') ||
        (action === 'pay'
          ? data.payment_date !== date ||
            data.payment_reference !== reference.trim()
          : data.invoice_date !== date)
      )
        throw new Error('Action not confirmed. Retry unchanged details.')
      await onRecorded(data as FeeReceipt)
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Action not confirmed. Retry unchanged details.',
      )
    } finally {
      busyRef.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed">
        Fee {fee.fee_amount} {fee.currency} · policy revision{' '}
        {fee.policy_revision}.{' '}
        {action === 'invoice'
          ? 'The due date uses this fee’s saved policy, not the current policy.'
          : 'This records a full external receipt; it does not initiate a bank transfer. Paid history cannot be edited.'}
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <legend className="sr-only">Fee action evidence</legend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fee-action-date">
              {action === 'invoice' ? 'Invoice date' : 'Payment date'}
            </FieldLabel>
            <Input
              id="fee-action-date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          {action === 'pay' && (
            <Field>
              <FieldLabel htmlFor="fee-reference">Payment reference</FieldLabel>
              <Input
                id="fee-reference"
                maxLength={200}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="fee-action-reason">
              Reason / supporting evidence
            </FieldLabel>
            <Textarea
              id="fee-action-reason"
              minLength={3}
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="flex items-start gap-3">
          <Checkbox
            id="fee-action-confirm"
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
          />
          <Label htmlFor="fee-action-confirm">
            I confirm this action and its supporting evidence.
          </Label>
        </div>
        <Button
          disabled={
            busy ||
            !confirmed ||
            !date ||
            reason.trim().length < 3 ||
            (action === 'pay' && !reference.trim())
          }
          onClick={() => void submit()}
        >
          {busy
            ? 'Recording…'
            : action === 'invoice'
              ? 'Issue audited invoice'
              : 'Record full fee payment'}
        </Button>
      </fieldset>
    </div>
  )
}
