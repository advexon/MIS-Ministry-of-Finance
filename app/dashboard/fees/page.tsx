'use client'

import { useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { usePermissions } from '@/lib/contexts/permission-context'
import { useI18n } from '@/lib/i18n/context'
import { createClient } from '@/lib/supabase/client'
import {
  FeeActionForm,
  FeeCreateForm,
  type FeeLoanOption,
  type FeeReceipt,
} from '@/components/admin/fee-forms'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, Plus, Printer, RefreshCw } from 'lucide-react'
import type { Fee } from '@/lib/types/database'
import { one } from '@/lib/utils/supabase-relation'
import { renderFeeInvoice } from '@/lib/utils/fee-invoice'
import { toCSV, downloadCSV } from '@/lib/utils/export'

interface FeeRow extends Omit<Fee, 'status'> {
  status: string
  currency: string | null
  policy_revision: number | null
  policy_id: string | null
  calculation_inputs: Record<string, unknown> | null
  loan_application: {
    loan_number: string | null
    currency: string | null
    borrower: { name: string } | null
    bank: { name_en: string } | null
  } | null
}
function feeCurrency(fee: FeeRow) {
  return fee.currency ?? fee.loan_application?.currency ?? null
}
function money(amount: number | null | undefined, currency: string | null) {
  return amount == null
    ? '—'
    : currency
      ? `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount)} ${currency}`
      : `${amount} · currency unavailable`
}
function totals(fees: FeeRow[], predicate: (fee: FeeRow) => boolean) {
  const grouped = new Map<string, number>()
  for (const fee of fees.filter(predicate)) {
    const currency = feeCurrency(fee) ?? 'Unknown'
    grouped.set(
      currency,
      (grouped.get(currency) ?? 0) + Number(fee.fee_amount ?? fee.amount ?? 0),
    )
  }
  return (
    [...grouped]
      .map(([currency, amount]) => money(amount, currency))
      .join(' · ') || 'No records'
  )
}

export default function FeesPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const { role, profile } = usePermissions()
  const canManage =
    !!profile?.is_active &&
    !!role?.is_active &&
    ['super_admin', 'prsf_admin', 'accountant'].includes(role.code) &&
    !profile.bank_id
  const [tab, setTab] = useState('all')
  const [dialog, setDialog] = useState<
    { action: 'create' } | { action: 'invoice' | 'pay'; fee: FeeRow } | null
  >(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const {
    data: fees = [],
    error,
    isLoading,
    isValidating,
    mutate,
  } = usePageQuery<FeeRow[]>(['fees'], async () => {
    const { data, error } = await supabase
      .from('fees')
      .select(
        '*,loan_application:loan_applications!loan_application_id(loan_number,currency,borrower:borrowers(name),bank:banks(name_en))',
      )
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((fee) => {
      const loan = one(fee.loan_application)
      return {
        ...fee,
        loan_application: loan
          ? { ...loan, borrower: one(loan.borrower), bank: one(loan.bank) }
          : null,
      }
    })
  })
  const { data: loans = [], error: loanError } = usePageQuery<FeeLoanOption[]>(
    canManage ? ['fee-loan-options'] : null,
    async () => {
      const { data, error } = await createClient()
        .from('loan_applications')
        .select('id,loan_number,bank_id,currency')
        .in('status', [
          'guarantee_issued',
          'approved',
          'disbursed',
          'active',
          'defaulted',
          'claim_pending',
          'claim_paid',
          'settled',
          'closed',
        ])
        .order('loan_number')
      if (error) throw error
      return data ?? []
    },
  )
  const visible =
    tab === 'all' ? fees : fees.filter((fee) => fee.fee_type === tab)
  async function recorded(receipt: FeeReceipt) {
    setDialog(null)
    setMessage(
      `Fee ${receipt.id}: ${receipt.status} confirmed and audited · ${money(receipt.fee_amount, receipt.currency)} · policy revision ${receipt.policy_revision}.`,
    )
    try {
      await mutate(undefined, { throwOnError: true })
    } catch {
      setMessage(
        `Fee ${receipt.id} was confirmed and audited, but the register could not refresh. Refresh the list; do not repeat the financial action.`,
      )
    }
  }
  function exportCSV() {
    const headers = [
      'Loan',
      'Borrower',
      'Bank',
      'Type',
      'Period start inclusive',
      'Period end exclusive (policy fees)',
      'Base',
      'Rate (%)',
      'Fee',
      'Currency',
      'Policy revision',
      'Invoice',
      'Invoice date',
      'Due date',
      'Status',
      'Payment date',
      'Payment reference',
    ]
    const rows = visible.map((fee) => [
      fee.loan_application?.loan_number ?? '',
      fee.loan_application?.borrower?.name ?? '',
      fee.loan_application?.bank?.name_en ?? '',
      fee.fee_type,
      fee.period_start ?? '',
      fee.period_end ?? '',
      fee.base_amount,
      fee.fee_rate == null ? '' : fee.fee_rate * 100,
      fee.fee_amount ?? fee.amount,
      feeCurrency(fee) ?? '',
      fee.policy_revision ?? 'Legacy / unverified',
      fee.invoice_number ?? '',
      fee.invoice_date ?? '',
      fee.due_date ?? '',
      fee.status,
      fee.payment_date ?? fee.paid_date ?? '',
      fee.payment_reference ?? '',
    ])
    downloadCSV(
      toCSV(headers, rows),
      `fees-${tab}-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }
  function printInvoice(fee: FeeRow) {
    const html = renderFeeInvoice({
      invoiceNumber: fee.invoice_number ?? 'Unissued',
      date: fee.invoice_date ?? 'Not issued',
      loanReference: fee.loan_application?.loan_number ?? '—',
      bank: fee.loan_application?.bank?.name_en ?? '—',
      borrower: fee.loan_application?.borrower?.name ?? '—',
      description: `${fee.fee_type === 'upfront' ? 'Upfront guarantee fee' : 'Recurring guarantee fee'}${fee.period_start ? ` (${fee.period_start} to ${fee.period_end}${fee.policy_id ? ', end exclusive' : ''})` : ''} · policy ${fee.policy_revision ?? 'legacy / unverified'}`,
      baseAmount: money(fee.base_amount, feeCurrency(fee)),
      rate: fee.fee_rate == null ? '—' : `${fee.fee_rate * 100}%`,
      feeAmount: money(fee.fee_amount ?? fee.amount, feeCurrency(fee)),
    })
    const win = window.open('', '_blank')
    if (win) {
      win.opener = null
      win.document.write(html)
      win.document.close()
      win.print()
    }
  }
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-balance text-2xl font-bold">{t.fees.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Policy-backed guarantee fees, invoices and external payment receipts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button
              onClick={() => setDialog({ action: 'create' })}
              disabled={!!loanError}
            >
              <Plus data-icon="inline-start" />
              New Fee Record
            </Button>
          )}
          <Button
            variant="outline"
            disabled={isLoading || isValidating || !!error || !visible.length}
            onClick={exportCSV}
          >
            <Download data-icon="inline-start" />
            Export
          </Button>
          <Button
            variant="outline"
            aria-label="Refresh fees"
            disabled={isValidating}
            onClick={() => void mutate()}
          >
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
        </div>
      </header>
      <Alert>
        <AlertTitle>Saved policy governs new assessments</AlertTitle>
        <AlertDescription>
          No 0.5% fallback, manual amount override or cross-currency total is
          used. Signed guarantee evidence is mandatory. Outstanding-balance
          policy additionally needs an approved month-end report. FX conversion
          and legacy reconciliation are not available here.
        </AlertDescription>
      </Alert>
      {message && (
        <p role="status" className="text-sm leading-relaxed">
          {message}
        </p>
      )}
      {(error || loanError) && (
        <Alert variant="destructive">
          <AlertTitle>Data could not load</AlertTitle>
          <AlertDescription>
            {error
              ? 'The fee register is unavailable; old values are hidden.'
              : 'Loan choices could not load. Refresh before creating a fee.'}
          </AlertDescription>
        </Alert>
      )}
      {!error && (
        <>
          <section
            aria-label="Fee totals by currency"
            className="grid gap-4 md:grid-cols-3"
          >
            {[
              ['Total collected', totals(fees, (fee) => fee.status === 'paid')],
              [
                'Invoiced · awaiting receipt',
                totals(
                  fees,
                  (fee) =>
                    fee.status === 'invoiced' || fee.status === 'overdue',
                ),
              ],
              [
                'Pending collection',
                totals(fees, (fee) =>
                  ['pending', 'invoiced', 'overdue'].includes(fee.status),
                ),
              ],
            ].map(([title, value]) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>
                    Separate totals by recorded currency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold">
                    {isLoading ? 'Loading…' : value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">All ({fees.length})</TabsTrigger>
              <TabsTrigger value="upfront">Upfront</TabsTrigger>
              <TabsTrigger value="quarterly">Recurring</TabsTrigger>
            </TabsList>
          </Tabs>
          <Card>
            <CardHeader>
              <CardTitle>Fee register</CardTitle>
              <CardDescription>
                Policy-backed periods include the start and exclude the end.
                Legacy rows retain their original period convention and cannot
                be settled without reconciliation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan / borrower</TableHead>
                      <TableHead>Type / period</TableHead>
                      <TableHead>Base / rate</TableHead>
                      <TableHead>Fee amount</TableHead>
                      <TableHead>Policy / invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions / evidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7}>Loading fees…</TableCell>
                      </TableRow>
                    ) : !visible.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center">
                          No fee records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      visible.map((fee) => (
                        <TableRow key={fee.id}>
                          <TableCell>
                            {fee.loan_application?.loan_number ?? '—'}
                            <p className="text-sm text-muted-foreground">
                              {fee.loan_application?.borrower?.name ?? '—'}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{fee.fee_type}</Badge>
                            <p className="text-sm">
                              {fee.period_start
                                ? `${fee.period_start} → ${fee.period_end}`
                                : 'One-time'}
                            </p>
                          </TableCell>
                          <TableCell>
                            {money(fee.base_amount, feeCurrency(fee))}
                            <p className="text-sm">
                              {fee.fee_rate == null
                                ? '—'
                                : `${fee.fee_rate * 100}%`}
                            </p>
                          </TableCell>
                          <TableCell>
                            {money(
                              fee.fee_amount ?? fee.amount,
                              feeCurrency(fee),
                            )}
                          </TableCell>
                          <TableCell>
                            {fee.policy_revision
                              ? `Revision ${fee.policy_revision}`
                              : 'Legacy / unverified'}
                            <p className="text-sm">
                              {fee.invoice_number ?? 'Not invoiced'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Due {fee.due_date ?? '—'}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{fee.status}</Badge>
                            {fee.payment_reference && (
                              <p className="text-sm">{fee.payment_reference}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              {canManage &&
                                fee.policy_id &&
                                fee.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setDialog({ action: 'invoice', fee })
                                    }
                                  >
                                    Invoice
                                  </Button>
                                )}
                              {canManage &&
                                fee.policy_id &&
                                ['invoiced', 'overdue'].includes(
                                  fee.status,
                                ) && (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      setDialog({ action: 'pay', fee })
                                    }
                                  >
                                    Record payment
                                  </Button>
                                )}
                              {fee.invoice_number && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => printInvoice(fee)}
                                >
                                  <Printer data-icon="inline-start" />
                                  Print
                                </Button>
                              )}
                            </div>
                            {fee.calculation_inputs && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-sm">
                                  Calculation evidence
                                </summary>
                                <pre className="max-w-xs overflow-auto text-sm">
                                  {JSON.stringify(
                                    fee.calculation_inputs,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog(null)
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === 'create'
                ? 'Create policy-backed fee'
                : dialog?.action === 'invoice'
                  ? 'Issue fee invoice'
                  : 'Record fee payment'}
            </DialogTitle>
            <DialogDescription>
              Every confirmed action is attributed to your identity and
              committed with its audit entry.
            </DialogDescription>
          </DialogHeader>
          {dialog?.action === 'create' ? (
            <FeeCreateForm
              loans={loans}
              onRecorded={recorded}
              onBusyChange={setBusy}
            />
          ) : (
            dialog && (
              <FeeActionForm
                key={`${dialog.fee.id}:${dialog.action}`}
                fee={{
                  id: dialog.fee.id,
                  status: dialog.fee.status,
                  currency: feeCurrency(dialog.fee) ?? '',
                  fee_amount: dialog.fee.fee_amount,
                  policy_revision: dialog.fee.policy_revision ?? 0,
                }}
                action={dialog.action}
                onRecorded={recorded}
                onBusyChange={setBusy}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
