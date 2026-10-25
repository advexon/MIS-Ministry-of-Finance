import { one } from '@/lib/utils/supabase-relation'

export interface ReportBank {
  id: string
  name_en: string
  code: string
}

export interface ReportLoan {
  status: string | null
  approved_amount: number | null
  disbursed_amount: number | null
  disbursement_date: string | null
  banks: Pick<ReportBank, 'name_en' | 'code'> | Pick<ReportBank, 'name_en' | 'code'>[] | null
  sectors: { name_en: string } | { name_en: string }[] | null
}

type AmountCount = { count: number; amount: number }
type BankTotals = AmountCount & { name: string; outstanding: number }

export function aggregatePortfolioReport(
  loans: readonly ReportLoan[],
  claims: readonly { claim_amount: number | null }[],
  fees: readonly { amount: number | null }[],
) {
  const sectors = new Map<string, AmountCount>()
  const banks = new Map<string, BankTotals>()
  const months = new Map<string, AmountCount & { month: string }>()
  const statuses = new Map<string, number>()

  for (const loan of loans) {
    const sector = one(loan.sectors)?.name_en || 'Other'
    const sectorTotals = sectors.get(sector) ?? { count: 0, amount: 0 }
    sectorTotals.count++
    sectorTotals.amount += loan.approved_amount || 0
    sectors.set(sector, sectorTotals)

    const bank = one(loan.banks)
    const code = bank?.code || 'Unknown'
    const bankTotals = banks.get(code) ?? { name: bank?.name_en || 'Unknown', count: 0, amount: 0, outstanding: 0 }
    bankTotals.count++
    bankTotals.amount += loan.approved_amount || 0
    bankTotals.outstanding += loan.disbursed_amount || 0
    banks.set(code, bankTotals)

    if (loan.disbursement_date) {
      const month = loan.disbursement_date.slice(0, 7)
      const monthTotals = months.get(month) ?? { month, count: 0, amount: 0 }
      monthTotals.count++
      monthTotals.amount += loan.approved_amount || 0
      months.set(month, monthTotals)
    }

    const status = loan.status || 'unknown'
    statuses.set(status, (statuses.get(status) ?? 0) + 1)
  }

  return {
    summaryStats: {
      totalLoans: loans.length,
      totalAmount: loans.reduce((sum, loan) => sum + (loan.approved_amount || 0), 0),
      totalOutstanding: loans.reduce((sum, loan) => sum + (loan.disbursed_amount || 0), 0),
      totalClaims: claims.reduce((sum, claim) => sum + (claim.claim_amount || 0), 0),
      totalFees: fees.reduce((sum, fee) => sum + (fee.amount || 0), 0),
    },
    sectorData: Array.from(sectors, ([sector, totals]) => ({ sector, ...totals })).sort((a, b) => b.amount - a.amount),
    bankData: Array.from(banks, ([code, totals]) => ({ code, ...totals })).sort((a, b) => b.amount - a.amount),
    monthlyData: Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month)),
    statusData: Array.from(statuses, ([name, value]) => ({ name: name.replace('_', ' '), value })),
  }
}

export type PortfolioReport = ReturnType<typeof aggregatePortfolioReport>

export function reportExportRows<T extends object>(data: readonly T[]) {
  const headers = data.length ? Object.keys(data[0]) as (keyof T & string)[] : []
  return { headers, rows: data.map(row => headers.map(header => row[header])) }
}
