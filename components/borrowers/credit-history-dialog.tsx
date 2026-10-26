'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useState } from 'react'
import Link from 'next/link'
import { usePermissions } from '@/lib/contexts/permission-context'
import { useI18n } from '@/lib/i18n/context'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { createClient } from '@/lib/supabase/client'
import { canViewBorrowerCreditHistory, type BorrowerCreditHistory } from '@/lib/utils/borrower-credit-history'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const PAGE_SIZE = 20

export function CreditHistoryDialog({ borrower, onClose }: {
  borrower: { id: string; name: string }
  onClose: () => void
}) {
  const uiText = useUiTranslation()

  const { profile, role, can } = usePermissions()
  const { t, locale } = useI18n()
  const [page, setPage] = useState(0)
  const allowed = canViewBorrowerCreditHistory(profile, role)
  const { data, error, isLoading, isValidating, mutate } = usePageQuery<BorrowerCreditHistory>(
    allowed ? ['borrower-credit-history', borrower.id, page] : null,
    async () => {
      const { data, error } = await createClient().rpc('cgf_borrower_credit_history', {
        p_borrower_id: borrower.id,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      if (error) throw error
      return data as BorrowerCreditHistory
    },
  )
  if (!allowed) return null

  const busy = isLoading || isValidating
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat(locale === 'tj' ? 'tg' : locale, { timeZone: 'UTC' }).format(new Date(value))
    : '—'
  const formatAmount = (value: number | null) => value === null
    ? '—'
    : new Intl.NumberFormat(locale === 'tj' ? 'tg' : locale, { maximumFractionDigits: 2 }).format(value)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>{t.borrowers.loanHistory} — {borrower.name}</DialogTitle>
          <DialogDescription>{t.borrowers.historyScope}</DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              {t.borrowers.historyError}
              <Button variant="outline" onClick={() => void mutate()} disabled={busy}>{t.borrowers.retryHistory}</Button>
            </AlertDescription>
          </Alert>
        ) : busy ? (
          <p role="status" className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.guaranteeReports.loanNumber}</TableHead>
                    <TableHead>{t.guaranteeReports.bank}</TableHead>
                    <TableHead>{uiText(t.common.status)}</TableHead>
                    <TableHead>{t.guaranteeReports.approvedAmount}</TableHead>
                    <TableHead>{t.common.date}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell>
                        {can('loans', 'view') ? (
                          <Link href={`/dashboard/loans/${loan.id}`} className="font-medium text-primary underline underline-offset-4">
                            {loan.loan_number || loan.loan_request_id}
                          </Link>
                        ) : (loan.loan_number || loan.loan_request_id)}
                      </TableCell>
                      <TableCell>{loan.bank_name || '—'}</TableCell>
                      <TableCell>{loan.status || '—'}</TableCell>
                      <TableCell>{formatAmount(loan.approved_amount)} {loan.currency}</TableCell>
                      <TableCell>{formatDate(loan.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {!data?.items.length && <TableRow><TableCell colSpan={5}>{t.common.noData}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground" role="status">{t.common.total}: {data?.total ?? 0}</p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>{t.common.previous}</Button>
                <Button variant="outline" disabled={(page + 1) * PAGE_SIZE >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>{t.common.next}</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
