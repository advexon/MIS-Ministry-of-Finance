import type { SupabaseClient } from '@supabase/supabase-js'
import { one } from '@/lib/utils/supabase-relation'

export type DocumentRow = Record<string, unknown>

export async function collectDocumentPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}>): Promise<T[]> {
  const rows: T[] = []
  let expected: number | undefined
  while (true) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + 499)
    if (error) throw new Error(error.message)
    if (count == null) throw new Error('Unable to verify the complete report record count. Please refresh.')
    if (expected !== undefined && expected !== count) throw new Error('Report data changed while loading. Please refresh.')
    expected = count
    if (!data?.length) {
      if (rows.length !== expected) throw new Error('The report is incomplete. Please refresh.')
      return rows
    }
    rows.push(...data)
    if (rows.length === expected) return rows
    if (rows.length > expected) throw new Error('Report data changed while loading. Please refresh.')
  }
}

interface Snapshot extends DocumentRow {
  id: string
  loan_application_id: string | null
  created_at: string
  currency: string | null
  report: { report_month: string; status: string } | { report_month: string; status: string }[] | null
}

export function latestApprovedSnapshots(snapshots: Snapshot[]) {
  const latest = new Map<string, Snapshot>()
  const sorted = [...snapshots].filter(row => one(row.report)?.status === 'approved').sort((a, b) =>
    (one(b.report)?.report_month ?? '').localeCompare(one(a.report)?.report_month ?? '') ||
    b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  )
  for (const row of sorted) {
    if (row.loan_application_id && !latest.has(row.loan_application_id)) latest.set(row.loan_application_id, row)
  }
  return latest
}

export function attachDocumentSnapshot(loan: DocumentRow, snapshot?: Snapshot): DocumentRow {
  const currencyMatches = !!snapshot?.currency && snapshot.currency === loan.currency
  return {
    ...loan,
    outstanding_balance: currencyMatches ? snapshot.outstanding_principal : null,
    days_overdue: currencyMatches ? snapshot.days_overdue : null,
    overdue_principal: currencyMatches ? snapshot.overdue_principal : null,
    overdue_interest: currencyMatches ? snapshot.overdue_interest : null,
    last_payment_date: currencyMatches ? snapshot.last_payment_date : null,
    balance_as_of: currencyMatches ? one(snapshot.report)?.report_month : null,
  }
}

export async function loadDocumentRows(supabase: SupabaseClient, source: string): Promise<DocumentRow[]> {
  switch (source) {
    case 'loan_applications': {
      const [loans, snapshots] = await Promise.all([
        collectDocumentPages((from, to) => supabase.from('loan_applications').select(`
          id,loan_number,approved_amount,disbursed_amount,guarantee_coverage,interest_rate,maturity_date,disbursement_date,status,currency,
          bank:banks(name_en),borrower:borrowers(name),sector:sectors(name_en)
        `, { count: 'exact' }).order('id').range(from, to)),
        collectDocumentPages((from, to) => supabase.from('guarantee_report_loans').select(`
          id,loan_application_id,created_at,currency,outstanding_principal,days_overdue,overdue_principal,overdue_interest,last_payment_date,
          report:guarantee_reports!inner(report_month,status)
        `, { count: 'exact' }).eq('report.status', 'approved').order('id').range(from, to)),
      ])
      const latest = latestApprovedSnapshots(snapshots)
      return loans.map(loan => attachDocumentSnapshot({
        ...loan,
        borrower_name: one(loan.borrower)?.name ?? null,
        bank_name: one(loan.bank)?.name_en ?? null,
        sector: one(loan.sector)?.name_en ?? null,
      }, latest.get(loan.id)))
    }
    case 'guarantee_reports': {
      const reports = await collectDocumentPages((from, to) => supabase.from('guarantee_reports').select(`
        id,report_month,report_type,total_loans,total_outstanding_principal,total_guarantee_amount,status,submission_date,bank:banks(name_en)
      `, { count: 'exact' }).order('report_month', { ascending: false }).order('id').range(from, to))
      return reports.map(report => ({ ...report, bank_name: one(report.bank)?.name_en ?? null, currency: null }))
    }
    case 'claims': {
      const claims = await collectDocumentPages((from, to) => supabase.from('claims').select(`
        id,claim_number,claim_amount,approved_amount,paid_amount,claim_date,default_date,status,days_delinquent,
        bank:banks(name_en),loan:loan_applications!claims_loan_application_id_fkey(loan_number,currency),
        legacy_loan:loan_applications!claims_loan_id_fkey(loan_number,currency)
      `, { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(from, to))
      return claims.map(claim => {
        const loan = one(claim.loan) ?? one(claim.legacy_loan)
        return { ...claim, bank_name: one(claim.bank)?.name_en ?? null, loan_number: loan?.loan_number ?? null,
          currency: loan?.currency ?? null, filing_date: claim.claim_date }
      })
    }
    case 'fees': {
      const fees = await collectDocumentPages((from, to) => supabase.from('fees').select(`
        id,amount,fee_amount,fee_rate,base_amount,period_start,period_end,due_date,paid_date,payment_date,status,
        bank:banks(name_en),loan:loan_applications!fees_loan_application_id_fkey(currency),
        legacy_loan:loan_applications!fees_loan_id_fkey(currency)
      `, { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(from, to))
      return fees.map(fee => ({ ...fee, bank_name: one(fee.bank)?.name_en ?? null,
        period: [fee.period_start, fee.period_end].filter(Boolean).join(' – ') || null,
        guarantee_amount: fee.base_amount, fee_amount: fee.fee_amount ?? fee.amount,
        paid_date: fee.payment_date ?? fee.paid_date,
        currency: (one(fee.loan) ?? one(fee.legacy_loan))?.currency ?? null,
      }))
    }
    default: throw new Error('This data source is not supported for live reports')
  }
}
