'use client'

import type { Locale } from '@/lib/i18n/translations'
import { DOCUMENT_LOCALES, documentText, localizeDocumentTemplate } from '@/lib/i18n/document-translations'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportFormat = 'pdf' | 'excel' | 'word' | 'csv'
export type SortDirection = 'asc' | 'desc'
export type ConditionalOperator = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'contains'
export type ConditionalStyle = 'highlight' | 'bold' | 'italic' | 'red' | 'green' | 'yellow'

export interface DocumentColumn {
  key: string
  label: string
  type: 'text' | 'number' | 'currency' | 'date' | 'percent' | 'badge'
  visible: boolean
  width?: number
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  format?: string
}

export interface DocumentFilter {
  id: string
  column: string
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith'
  value: string
  enabled: boolean
}

export interface SortRule {
  column: string
  direction: SortDirection
}

export interface ConditionalRule {
  id: string
  column: string
  operator: ConditionalOperator
  value: string
  style: ConditionalStyle
  enabled: boolean
}

export interface HeaderFooterConfig {
  headerLeft: string
  headerCenter: string
  headerRight: string
  footerLeft: string
  footerCenter: string
  footerRight: string
  showDate: boolean
  showPageNumber: boolean
  showLogo: boolean
}

export interface DocumentTemplate {
  locale?: Locale
  id: string
  name: string
  description: string
  dataSource: string
  columns: DocumentColumn[]
  filters: DocumentFilter[]
  sortRules: SortRule[]
  conditionalRules: ConditionalRule[]
  headerFooter: HeaderFooterConfig
  pageSize: 'A4' | 'A3' | 'Letter' | 'Legal'
  orientation: 'portrait' | 'landscape'
  includeTitle: boolean
  includeSummary: boolean
  includeTotals: boolean
  createdAt: string
  updatedAt: string
}

export interface ExportJob {
  id: string
  templateName: string
  format: ExportFormat
  recordCount: number
  status: 'queued' | 'processing' | 'done' | 'error'
  startedAt: string
  completedAt?: string
  fileSize?: string
  downloadUrl?: string
}

// ─── Built-in Templates ───────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: Omit<DocumentTemplate, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'loan-portfolio',
    name: 'Loan Portfolio Report',
    description: 'Full portfolio listing with outstanding balances, statuses and guarantee coverage',
    dataSource: 'loan_applications',
    pageSize: 'A4',
    orientation: 'landscape',
    includeTitle: true,
    includeSummary: true,
    includeTotals: true,
    columns: [
      { key: 'loan_number', label: 'Loan #', type: 'text', visible: true, width: 100 },
      { key: 'borrower_name', label: 'Borrower', type: 'text', visible: true, width: 180 },
      { key: 'bank_name', label: 'Bank', type: 'text', visible: true, width: 140 },
      { key: 'sector', label: 'Sector', type: 'badge', visible: true, width: 100 },
      { key: 'approved_amount', label: 'Approved', type: 'currency', visible: true, align: 'right', width: 120 },
      { key: 'disbursed_amount', label: 'Disbursed', type: 'currency', visible: true, align: 'right', width: 120 },
      { key: 'outstanding_balance', label: 'Outstanding', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'guarantee_coverage', label: 'Coverage %', type: 'percent', visible: true, align: 'right', width: 100 },
      { key: 'interest_rate', label: 'Rate %', type: 'percent', visible: true, align: 'right', width: 80 },
      { key: 'maturity_date', label: 'Maturity', type: 'date', visible: true, width: 100 },
      { key: 'status', label: 'Status', type: 'badge', visible: true, width: 100 },
      { key: 'balance_as_of', label: 'Balance As Of', type: 'date', visible: true, width: 110 },
    ],
    filters: [],
    sortRules: [{ column: 'approved_amount', direction: 'desc' }],
    conditionalRules: [
      { id: '1', column: 'outstanding_balance', operator: 'gt', value: '100000', style: 'bold', enabled: true },
      { id: '2', column: 'status', operator: 'eq', value: 'overdue', style: 'red', enabled: true },
    ],
    headerFooter: {
      headerLeft: 'Credit Guarantee Fund',
      headerCenter: 'Loan Portfolio Report',
      headerRight: '',
      footerLeft: 'Confidential',
      footerCenter: '',
      footerRight: 'Page {page} of {total}',
      showDate: true,
      showPageNumber: true,
      showLogo: true,
    },
  },
  {
    id: 'guarantee-report',
    name: 'Guarantee Report Summary',
    description: 'Monthly guarantee report with disbursements and outstanding balances',
    dataSource: 'guarantee_reports',
    pageSize: 'A4',
    orientation: 'portrait',
    includeTitle: true,
    includeSummary: true,
    includeTotals: true,
    columns: [
      { key: 'report_month', label: 'Month', type: 'date', visible: true, width: 100 },
      { key: 'bank_name', label: 'Bank', type: 'text', visible: true, width: 160 },
      { key: 'report_type', label: 'Type', type: 'badge', visible: true, width: 100 },
      { key: 'total_loans', label: 'Loans', type: 'number', visible: true, align: 'right', width: 80 },
      { key: 'total_outstanding_principal', label: 'Outstanding', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'total_guarantee_amount', label: 'Guarantee Amt', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'status', label: 'Status', type: 'badge', visible: true, width: 110 },
      { key: 'submission_date', label: 'Submitted', type: 'date', visible: true, width: 110 },
    ],
    filters: [],
    sortRules: [{ column: 'report_month', direction: 'desc' }],
    conditionalRules: [
      { id: '1', column: 'status', operator: 'eq', value: 'approved', style: 'green', enabled: true },
      { id: '2', column: 'status', operator: 'eq', value: 'rejected', style: 'red', enabled: true },
    ],
    headerFooter: {
      headerLeft: 'Credit Guarantee Fund',
      headerCenter: 'Guarantee Reports',
      headerRight: '',
      footerLeft: 'Confidential',
      footerCenter: '',
      footerRight: 'Page {page} of {total}',
      showDate: true,
      showPageNumber: true,
      showLogo: true,
    },
  },
  {
    id: 'delinquency',
    name: 'Delinquency Report',
    description: 'Overdue loans with days past due and recovery status',
    dataSource: 'loan_applications',
    pageSize: 'A4',
    orientation: 'landscape',
    includeTitle: true,
    includeSummary: true,
    includeTotals: true,
    columns: [
      { key: 'loan_number', label: 'Loan #', type: 'text', visible: true, width: 100 },
      { key: 'borrower_name', label: 'Borrower', type: 'text', visible: true, width: 180 },
      { key: 'bank_name', label: 'Bank', type: 'text', visible: true, width: 140 },
      { key: 'outstanding_balance', label: 'Outstanding', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'days_overdue', label: 'Days Overdue', type: 'number', visible: true, align: 'right', width: 110 },
      { key: 'overdue_principal', label: 'Overdue Principal', type: 'currency', visible: true, align: 'right', width: 140 },
      { key: 'overdue_interest', label: 'Overdue Interest', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'last_payment_date', label: 'Last Payment', type: 'date', visible: true, width: 110 },
      { key: 'balance_as_of', label: 'Report As Of', type: 'date', visible: true, width: 110 },
    ],
    filters: [
      { id: '1', column: 'days_overdue', operator: 'gt', value: '0', enabled: true },
    ],
    sortRules: [{ column: 'days_overdue', direction: 'desc' }],
    conditionalRules: [
      { id: '1', column: 'days_overdue', operator: 'gt', value: '90', style: 'red', enabled: true },
      { id: '2', column: 'days_overdue', operator: 'gt', value: '30', style: 'yellow', enabled: true },
    ],
    headerFooter: {
      headerLeft: 'Credit Guarantee Fund',
      headerCenter: 'Delinquency Report',
      headerRight: '',
      footerLeft: 'Confidential',
      footerCenter: '',
      footerRight: 'Page {page} of {total}',
      showDate: true,
      showPageNumber: true,
      showLogo: false,
    },
  },
  {
    id: 'claims-report',
    name: 'Claims Report',
    description: 'Guarantee claims filed, processed and paid',
    dataSource: 'claims',
    pageSize: 'A4',
    orientation: 'portrait',
    includeTitle: true,
    includeSummary: true,
    includeTotals: true,
    columns: [
      { key: 'claim_number', label: 'Claim #', type: 'text', visible: true, width: 100 },
      { key: 'bank_name', label: 'Bank', type: 'text', visible: true, width: 160 },
      { key: 'loan_number', label: 'Loan #', type: 'text', visible: true, width: 120 },
      { key: 'claim_amount', label: 'Claim Amount', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'approved_amount', label: 'Approved', type: 'currency', visible: true, align: 'right', width: 120 },
      { key: 'paid_amount', label: 'Paid', type: 'currency', visible: true, align: 'right', width: 110 },
      { key: 'filing_date', label: 'Filed', type: 'date', visible: true, width: 100 },
      { key: 'status', label: 'Status', type: 'badge', visible: true, width: 100 },
    ],
    filters: [],
    sortRules: [{ column: 'filing_date', direction: 'desc' }],
    conditionalRules: [
      { id: '1', column: 'status', operator: 'eq', value: 'paid', style: 'green', enabled: true },
      { id: '2', column: 'status', operator: 'eq', value: 'rejected', style: 'red', enabled: true },
    ],
    headerFooter: {
      headerLeft: 'Credit Guarantee Fund',
      headerCenter: 'Claims Report',
      headerRight: '',
      footerLeft: 'Confidential',
      footerCenter: '',
      footerRight: 'Page {page} of {total}',
      showDate: true,
      showPageNumber: true,
      showLogo: false,
    },
  },
  {
    id: 'fee-income',
    name: 'Fee Income Report',
    description: 'Guarantee fee income by bank and period',
    dataSource: 'fees',
    pageSize: 'A4',
    orientation: 'portrait',
    includeTitle: true,
    includeSummary: false,
    includeTotals: true,
    columns: [
      { key: 'bank_name', label: 'Bank', type: 'text', visible: true, width: 180 },
      { key: 'period', label: 'Period', type: 'text', visible: true, width: 100 },
      { key: 'fee_rate', label: 'Rate %', type: 'percent', visible: true, align: 'right', width: 80 },
      { key: 'guarantee_amount', label: 'Fee Base', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'fee_amount', label: 'Fee Amount', type: 'currency', visible: true, align: 'right', width: 120 },
      { key: 'due_date', label: 'Due Date', type: 'date', visible: true, width: 100 },
      { key: 'paid_date', label: 'Paid Date', type: 'date', visible: true, width: 100 },
      { key: 'status', label: 'Status', type: 'badge', visible: true, width: 100 },
    ],
    filters: [],
    sortRules: [{ column: 'bank_name', direction: 'asc' }],
    conditionalRules: [
      { id: '1', column: 'status', operator: 'eq', value: 'overdue', style: 'red', enabled: true },
    ],
    headerFooter: {
      headerLeft: 'Credit Guarantee Fund',
      headerCenter: 'Fee Income Report',
      headerRight: '',
      footerLeft: 'Confidential',
      footerCenter: '',
      footerRight: 'Page {page} of {total}',
      showDate: true,
      showPageNumber: true,
      showLogo: false,
    },
  },
]

// ─── Mock Preview Data ────────────────────────────────────────────────────────

export const MOCK_PREVIEW_ROWS: Record<string, Record<string, unknown>[]> = {
  'loan_applications': [
    { loan_number: 'LA-2026-0142', borrower_name: 'Rahimov Enterprises LLC', bank_name: 'Agroinvestbank', sector: 'Agriculture', approved_amount: 450000, disbursed_amount: 450000, outstanding_balance: 382500, guarantee_coverage: 50, interest_rate: 18.5, maturity_date: '2028-03-15', status: 'active' },
    { loan_number: 'LA-2026-0139', borrower_name: 'Karimov Trading Co', bank_name: 'Bank Eskhata', sector: 'Trade', approved_amount: 280000, disbursed_amount: 280000, outstanding_balance: 196000, guarantee_coverage: 60, interest_rate: 21.0, maturity_date: '2027-09-01', status: 'active' },
    { loan_number: 'LA-2025-0981', borrower_name: 'Nasimov Manufacturing', bank_name: 'Spitamen Bank', sector: 'Manufacturing', approved_amount: 870000, disbursed_amount: 870000, outstanding_balance: 522000, guarantee_coverage: 50, interest_rate: 19.5, maturity_date: '2029-01-20', status: 'overdue' },
    { loan_number: 'LA-2025-0902', borrower_name: 'Tursunova Pharmacy', bank_name: 'IMON International', sector: 'Services', approved_amount: 150000, disbursed_amount: 150000, outstanding_balance: 75000, guarantee_coverage: 70, interest_rate: 24.0, maturity_date: '2027-06-30', status: 'active' },
    { loan_number: 'LA-2025-0845', borrower_name: 'Dushanbe Builders LLC', bank_name: 'Amonatbonk', sector: 'Construction', approved_amount: 1200000, disbursed_amount: 900000, outstanding_balance: 720000, guarantee_coverage: 50, interest_rate: 17.0, maturity_date: '2030-12-31', status: 'active' },
    { loan_number: 'LA-2025-0790', borrower_name: 'Northern Transport Co', bank_name: 'Agroinvestbank', sector: 'Transport', approved_amount: 320000, disbursed_amount: 320000, outstanding_balance: 256000, guarantee_coverage: 55, interest_rate: 20.5, maturity_date: '2028-08-15', status: 'overdue' },
  ],
  'guarantee_reports': [
    { report_month: '2026-01-01', bank_name: 'Agroinvestbank', report_type: 'disbursements', total_loans: 42, total_outstanding_principal: 18500000, total_guarantee_amount: 9250000, status: 'approved', submission_date: '2026-02-05' },
    { report_month: '2026-01-01', bank_name: 'Bank Eskhata', report_type: 'disbursements', total_loans: 28, total_outstanding_principal: 11200000, total_guarantee_amount: 6720000, status: 'submitted', submission_date: '2026-02-08' },
    { report_month: '2026-01-01', bank_name: 'Spitamen Bank', report_type: 'blank_guarantee', total_loans: 15, total_outstanding_principal: 5800000, total_guarantee_amount: 2900000, status: 'under_review', submission_date: '2026-02-10' },
    { report_month: '2025-12-01', bank_name: 'Agroinvestbank', report_type: 'disbursements', total_loans: 39, total_outstanding_principal: 17200000, total_guarantee_amount: 8600000, status: 'approved', submission_date: '2026-01-06' },
    { report_month: '2025-12-01', bank_name: 'IMON International', report_type: 'disbursements', total_loans: 22, total_outstanding_principal: 8900000, total_guarantee_amount: 5340000, status: 'approved', submission_date: '2026-01-09' },
  ],
  'claims': [
    { claim_number: 'CLM-2026-008', bank_name: 'Agroinvestbank', loan_number: 'LA-2025-0420', claim_amount: 185000, approved_amount: 185000, paid_amount: 185000, filing_date: '2026-01-12', status: 'paid' },
    { claim_number: 'CLM-2026-007', bank_name: 'Bank Eskhata', loan_number: 'LA-2025-0388', claim_amount: 92000, approved_amount: 92000, paid_amount: 0, filing_date: '2026-01-08', status: 'approved' },
    { claim_number: 'CLM-2025-031', bank_name: 'Spitamen Bank', loan_number: 'LA-2024-1102', claim_amount: 240000, approved_amount: 200000, paid_amount: 200000, filing_date: '2025-11-20', status: 'paid' },
    { claim_number: 'CLM-2025-029', bank_name: 'IMON International', loan_number: 'LA-2024-0987', claim_amount: 67500, approved_amount: 0, paid_amount: 0, filing_date: '2025-11-05', status: 'rejected' },
  ],
  'fees': [
    { bank_name: 'Agroinvestbank', period: 'Q1 2026', fee_rate: 1.5, guarantee_amount: 9250000, fee_amount: 138750, due_date: '2026-03-31', paid_date: null, status: 'pending' },
    { bank_name: 'Bank Eskhata', period: 'Q1 2026', fee_rate: 1.5, guarantee_amount: 6720000, fee_amount: 100800, due_date: '2026-03-31', paid_date: null, status: 'pending' },
    { bank_name: 'Agroinvestbank', period: 'Q4 2025', fee_rate: 1.5, guarantee_amount: 8900000, fee_amount: 133500, due_date: '2025-12-31', paid_date: '2025-12-28', status: 'paid' },
    { bank_name: 'Spitamen Bank', period: 'Q4 2025', fee_rate: 1.5, guarantee_amount: 5100000, fee_amount: 76500, due_date: '2025-12-31', paid_date: null, status: 'overdue' },
  ],
}

// ─── Data Processing ──────────────────────────────────────────────────────────

export function applyFilters(
  rows: Record<string, unknown>[],
  filters: DocumentFilter[]
): Record<string, unknown>[] {
  const active = filters.filter(f => f.enabled && f.column && f.value)
  if (!active.length) return rows

  return rows.filter(row =>
    active.every(f => {
      const val = row[f.column]
      if (val === null || val === undefined || val === '') return false
      const fVal = f.value.toLowerCase()
      const numVal = Number(val)
      const numFVal = Number(f.value)

      switch (f.operator) {
        case 'eq': return String(val).toLowerCase() === fVal
        case 'neq': return String(val).toLowerCase() !== fVal
        case 'gt': return numVal > numFVal
        case 'lt': return numVal < numFVal
        case 'gte': return numVal >= numFVal
        case 'lte': return numVal <= numFVal
        case 'contains': return String(val).toLowerCase().includes(fVal)
        case 'startsWith': return String(val).toLowerCase().startsWith(fVal)
        default: return true
      }
    })
  )
}

export function applySorting(
  rows: Record<string, unknown>[],
  sortRules: SortRule[]
): Record<string, unknown>[] {
  if (!sortRules.length) return rows
  return [...rows].sort((a, b) => {
    for (const rule of sortRules) {
      const aVal = a[rule.column]
      const bVal = b[rule.column]
      const mult = rule.direction === 'asc' ? 1 : -1
      if (aVal === bVal) continue
      if (typeof aVal === 'number' && typeof bVal === 'number') return (aVal - bVal) * mult
      return String(aVal).localeCompare(String(bVal)) * mult
    }
    return 0
  })
}

export function getConditionalStyles(
  row: Record<string, unknown>,
  rules: ConditionalRule[]
): ConditionalStyle[] {
  return rules
    .filter(r => r.enabled)
    .filter(r => {
      const val = row[r.column]
      if (val === null || val === undefined || val === '') return false
      const numVal = Number(val)
      const numFVal = Number(r.value)
      switch (r.operator) {
        case 'gt': return numVal > numFVal
        case 'lt': return numVal < numFVal
        case 'eq': return String(val).toLowerCase() === r.value.toLowerCase()
        case 'gte': return numVal >= numFVal
        case 'lte': return numVal <= numFVal
        case 'contains': return String(val).toLowerCase().includes(r.value.toLowerCase())
        default: return false
      }
    })
    .map(r => r.style)
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const numFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function currencyCode(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null
}

export function formatCellValue(value: unknown, type: DocumentColumn['type'], currency?: unknown, locale: Locale = 'en'): string {
  const numberFormat = locale === 'en' ? numFmt : new Intl.NumberFormat(DOCUMENT_LOCALES[locale], { maximumFractionDigits: 2 })
  if (value === null || value === undefined || value === '') return '—'
  if (['currency', 'number', 'percent'].includes(type) && !Number.isFinite(Number(value))) return '—'
  switch (type) {
    case 'currency': return `${numberFormat.format(Number(value))} ${currencyCode(currency) ?? documentText('(currency unspecified)', locale)}`
    case 'percent': return `${Number(value).toLocaleString(DOCUMENT_LOCALES[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    case 'number': return numberFormat.format(Number(value))
    case 'badge': return documentText(String(value), locale)
    case 'date': {
      const date = new Date(String(value))
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(DOCUMENT_LOCALES[locale], { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    }
    default: return String(value)
  }
}

export function selectDocumentRows(rows: Record<string, unknown>[], template: DocumentTemplate, search = '') {
  const sorted = applySorting(applyFilters(rows, template.filters), template.sortRules)
  const query = search.trim().toLowerCase()
  return query ? sorted.filter(row => template.columns.some(col => {
    const value = row[col.key]
    return value != null && String(value).toLowerCase().includes(query)
  })) : sorted
}

export function documentTotal(rows: Record<string, unknown>[], column: DocumentColumn, locale: Locale = 'en'): string {
  if (column.type !== 'currency' && column.type !== 'number') return ''
  const groups = column.type === 'currency'
    ? [...new Set(rows.map(row => currencyCode(row.currency)))] : [null]
  return groups.map(currency => {
    const group = column.type === 'currency' ? rows.filter(row => currencyCode(row.currency) === currency) : rows
    if ((column.type === 'currency' && !currency) || group.some(row => row[column.key] == null || row[column.key] === '' || !Number.isFinite(Number(row[column.key])))) {
      return currency ? `${documentText('Unavailable', locale)} (${currency})` : documentText('Unavailable', locale)
    }
    return formatCellValue(group.reduce((sum, row) => sum + Number(row[column.key]), 0), column.type, currency, locale)
  }).join(' / ')
}

// ─── Export: Excel ────────────────────────────────────────────────────────────

export async function buildExcelWorkbook(
  template: DocumentTemplate,
  rows: Record<string, unknown>[]
) {
  template = localizeDocumentTemplate(template, template.locale ?? 'en')
  const locale = template.locale!
  const text = (key: string) => documentText(key, locale)
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const visibleCols = template.columns.filter(c => c.visible)
  if (!visibleCols.length) throw new Error('Select at least one column to export')

  // Keep loan-level details first so Excel opens on borrowers and amounts, not metadata.
  // Main data sheet
  const headers = visibleCols.map(c => c.label)
  const dataRows = rows.map(row =>
    visibleCols.map(col => {
      const raw = row[col.key]
      if (col.type === 'currency' || col.type === 'number' || col.type === 'percent') return raw == null || raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw)
      if (col.type === 'date') return raw ? formatCellValue(raw, 'date', undefined, locale) : ''
      if (col.type === 'badge') return raw == null ? '' : documentText(String(raw), locale)
      return String(raw ?? '')
    })
  )

  // Totals row
  if (template.includeTotals) {
    const totalsRow = visibleCols.map(col => {
      if (col.type === 'currency' || col.type === 'number') {
        const formatted = documentTotal(rows, col, locale)
        const currencies = new Set(rows.map(row => currencyCode(row.currency)))
        const complete = rows.every(row => row[col.key] != null && row[col.key] !== '' && Number.isFinite(Number(row[col.key])))
        if (!complete || (col.type === 'currency' && (currencies.size !== 1 || currencies.has(null)))) return formatted
        const total = rows.reduce((sum, row) => sum + Number(row[col.key]), 0)
        return col.type === 'currency' ? Number(total.toFixed(2)) : total
      }
      if (col.key === visibleCols[0].key) return text('TOTAL')
      return ''
    })
    dataRows.push(totalsRow)
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])

  // Column widths
  ws['!cols'] = visibleCols.map(c => ({ wch: Math.round((c.width || 120) / 7) }))

  if (rows.length) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: rows.length, c: visibleCols.length - 1 },
    }) }
  }
  visibleCols.forEach((col, columnIndex) => {
    const format = col.type === 'currency' ? '#,##0.00'
      : col.type === 'number' ? '#,##0.########'
      : col.type === 'percent' ? '0.0"%"' : null
    if (!format) return
    for (let rowIndex = 1; rowIndex <= dataRows.length; rowIndex++) {
      const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })]
      if (cell?.t === 'n') {
        const currency = currencyCode(rows[rowIndex - 1]?.currency ?? rows[0]?.currency)
        cell.z = col.type === 'currency' ? `${format} "${currency ?? text('(currency unspecified)')}"` : format
      }
    }
  })

  XLSX.utils.book_append_sheet(wb, ws, text('Data'))

  if (template.includeSummary) {
    const now = new Date().toLocaleDateString(DOCUMENT_LOCALES[locale], { day: '2-digit', month: 'long', year: 'numeric' })
    const summaryData = [
      [text('Report Name'), template.name],
      [text('Generated'), now],
      [text('Total Records'), rows.length],
      [text('Data Source'), text(template.dataSource)],
      [text('Active Filters'), template.filters.filter(f => f.enabled).length],
      [text('Sort By'), template.sortRules.map(s => `${template.columns.find(c => c.key === s.column)?.label ?? s.column} ${text(s.direction)}`).join(', ') || text('Default')],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), text('Summary'))
  }

  return wb
}

export async function exportExcel(
  template: DocumentTemplate,
  rows: Record<string, unknown>[]
): Promise<void> {
  template = localizeDocumentTemplate(template, template.locale ?? 'en')
  const wb = await buildExcelWorkbook(template, rows)
  const XLSX = await import('xlsx')
  XLSX.writeFile(wb, `${template.name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`)
}

// ─── Export: CSV ──────────────────────────────────────────────────────────────

export function buildDocumentCSV(template: DocumentTemplate, rows: Record<string, unknown>[]): string {
  template = localizeDocumentTemplate(template, template.locale ?? 'en')
  const locale = template.locale!
  const visibleCols = template.columns.filter(c => c.visible)
  if (!visibleCols.length) throw new Error('Select at least one column to export')
  const escape = (value: string) => {
    const safe = /^[\s\p{Cc}]*[=+@-]|^[\t\r\n]/u.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
  }
  const lines = [
    visibleCols.map(col => escape(col.label)).join(','),
    ...rows.map(row => visibleCols.map(col => escape(formatCellValue(row[col.key], col.type, row.currency, locale))).join(',')),
  ]
  if (template.includeTotals) lines.push(visibleCols.map((col, index) =>
    escape(documentTotal(rows, col, locale) || (index === 0 ? documentText('TOTAL', locale) : '')),
  ).join(','))
  return '\ufeff' + lines.join('\r\n')
}

export function exportCSV(template: DocumentTemplate, rows: Record<string, unknown>[]): void {
  template = localizeDocumentTemplate(template, template.locale ?? 'en')
  downloadDocumentBlob(new Blob([buildDocumentCSV(template, rows)], { type: 'text/csv;charset=utf-8;' }), template.name, 'csv')
}

function downloadDocumentBlob(blob: Blob, name: string, extension: string) {
  const url = URL.createObjectURL(blob)
  const anchor = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\p{L}\p{N}_.-]+/gu, '_')}_${Date.now()}.${extension}` })
  document.body.appendChild(anchor)
  try { anchor.click() } finally {
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function escapeDocumentHTML(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function printCounterContent(value: string): string {
  return value.split(/(\{page\}|\{total\})/g).map(part => part === '{page}' ? 'counter(page)' : part === '{total}' ? 'counter(pages)'
    : `"${Array.from(part).map(char => `\\${char.codePointAt(0)!.toString(16)} `).join('')}"`).join(' ')
}

function safeAlignment(value: unknown) {
  return value === 'right' || value === 'center' ? value : 'left'
}

// ─── Export: PDF (via styled HTML print window) ───────────────────────────────

export function buildDocumentPDFHTML(template: DocumentTemplate, rows: Record<string, unknown>[]): string {
  template = localizeDocumentTemplate(template, template.locale ?? 'en')
  const locale = template.locale!
  const text = (key: string) => escapeDocumentHTML(documentText(key, locale))
  const visibleCols = template.columns.filter(c => c.visible)
  if (!visibleCols.length) throw new Error('Select at least one column to export')
  const hf = template.headerFooter
  const now = new Date().toLocaleDateString(DOCUMENT_LOCALES[locale], { day: '2-digit', month: 'long', year: 'numeric' })
  const colWidth = Math.floor(100 / visibleCols.length)

  const badgeColors: Record<string, string> = {
    active: '#dcfce7;color:#166534',
    approved: '#dcfce7;color:#166534',
    paid: '#dcfce7;color:#166534',
    overdue: '#fee2e2;color:#991b1b',
    rejected: '#fee2e2;color:#991b1b',
    submitted: '#dbeafe;color:#1e40af',
    under_review: '#fef9c3;color:#713f12',
    pending: '#fef9c3;color:#713f12',
    disbursements: '#ede9fe;color:#4c1d95',
    blank_guarantee: '#e0f2fe;color:#075985',
    Agriculture: '#dcfce7;color:#166534',
    Trade: '#dbeafe;color:#1e40af',
    Manufacturing: '#ede9fe;color:#4c1d95',
    Services: '#e0f2fe;color:#075985',
    Construction: '#fef3c7;color:#92400e',
    Transport: '#fce7f3;color:#9d174d',
  }

  const getBadgeStyle = (val: string) => {
    const style = Object.hasOwn(badgeColors, val) ? badgeColors[val] : '#f3f4f6;color:#374151'
    const [bg, fg] = style.split(';')
    return `background:${bg};${fg};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600`
  }

  const getRowStyle = (row: Record<string, unknown>) => {
    const styles = getConditionalStyles(row, template.conditionalRules)
    let css = ''
    if (styles.includes('red')) css += 'background:#fff1f2;'
    else if (styles.includes('green')) css += 'background:#f0fdf4;'
    else if (styles.includes('yellow')) css += 'background:#fefce8;'
    else if (styles.includes('highlight')) css += 'background:#eff6ff;'
    if (styles.includes('bold')) css += 'font-weight:700;'
    if (styles.includes('italic')) css += 'font-style:italic;'
    return css
  }

  const totalRows = template.includeTotals ? `
    <tr style="background:#1e3a5f;color:#fff;font-weight:700;">
      ${visibleCols.map((col, i) => {
    if (col.type === 'currency' || col.type === 'number') {
      return `<td style="padding:8px 10px;text-align:${safeAlignment(col.align)}">${escapeDocumentHTML(documentTotal(rows, col, locale))}</td>`
    }
    return `<td style="padding:8px 10px">${i === 0 ? text('TOTAL') : ''}</td>`
  }).join('')}
    </tr>` : ''

  const html = `<!DOCTYPE html>
<html lang="${locale === 'tj' ? 'tg' : locale}">
<head>
  <meta charset="UTF-8">
  <title>${escapeDocumentHTML(template.name)}</title>
  <style>
    @page { size: ${['A4', 'A3', 'Letter', 'Legal'].includes(template.pageSize) ? template.pageSize : 'A4'} ${template.orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 18mm 14mm;
      @bottom-right { content: ${hf.showPageNumber ? printCounterContent(hf.footerRight) : 'none'}; font: 10px Arial, sans-serif; }
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    td, th { overflow-wrap: anywhere; }
    .report-logo { width: 44px; height: 44px; object-fit: contain; }
    @media print { .screen-page-number { display: none; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #1e3a5f; margin-bottom: 16px; }
    .page-header .org { font-size: 10px; color: #64748b; }
    .page-header h1 { font-size: 18px; font-weight: 700; color: #1e3a5f; }
    .page-header .meta { text-align: right; font-size: 10px; color: #64748b; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
    .summary-card .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .summary-card .value { font-size: 16px; font-weight: 700; color: #1e3a5f; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    thead tr { background: #1e3a5f; }
    thead th { color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr { border-bottom: 1px solid #e2e8f0; }
    tbody td { padding: 7px 10px; vertical-align: middle; }
    .page-footer { display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #e2e8f0; margin-top: 16px; font-size: 10px; color: #94a3b8; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="page-header">
    <div>
      ${hf.showLogo ? `<img class="report-logo" src="/logo.png" alt="${text('Credit Guarantee Fund')}" />` : ''}
      <div class="org">${escapeDocumentHTML(hf.headerLeft)}</div>
      ${template.includeTitle ? `<h1>${escapeDocumentHTML(hf.headerCenter || template.name)}</h1>` : ''}
    </div>
    <div class="meta">
      <div>${escapeDocumentHTML(hf.headerRight)}</div>
      ${hf.showDate ? `<div>${text('Generated')}: ${now}</div>` : ''}
      <div>${text('Records')}: ${rows.length}</div>
    </div>
  </div>

  ${template.includeSummary ? `
  <div class="summary-grid">
    <div class="summary-card"><div class="label">${text('Total Records')}</div><div class="value">${rows.length}</div></div>
    <div class="summary-card"><div class="label">${text('Data Source')}</div><div class="value" style="font-size:12px">${text(template.dataSource)}</div></div>
    <div class="summary-card"><div class="label">${text('Report Period')}</div><div class="value" style="font-size:12px">${now}</div></div>
  </div>` : ''}

  <table>
    <thead>
      <tr>
        ${visibleCols.map(c => `<th style="width:${colWidth}%;text-align:${safeAlignment(c.align)}">${escapeDocumentHTML(c.label)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr style="${getRowStyle(row)}">
          ${visibleCols.map(col => {
    const raw = row[col.key]
    const formatted = escapeDocumentHTML(formatCellValue(raw, col.type, row.currency, locale))
    const isRight = col.align === 'right' || col.type === 'currency' || col.type === 'number' || col.type === 'percent'
    if (col.type === 'badge') {
      return `<td style="text-align:${safeAlignment(col.align)}"><span style="${getBadgeStyle(String(raw))}">${formatted}</span></td>`
    }
    return `<td style="text-align:${isRight ? 'right' : 'left'}">${formatted}</td>`
  }).join('')}
        </tr>
      `).join('')}
      ${totalRows}
    </tbody>
  </table>

  <div class="page-footer">
    <span>${escapeDocumentHTML(hf.footerLeft)}</span>
    <span>${escapeDocumentHTML(hf.footerCenter)}</span>
    <span class="screen-page-number">${hf.showPageNumber ? text('Page numbers are calculated when printing.') : ''}</span>
  </div>
</body>
</html>`

  return html
}

export async function exportPDF(template: DocumentTemplate, rows: Record<string, unknown>[]): Promise<void> {
  const html = buildDocumentPDFHTML(template, rows)
  const win = window.open('', '_blank')
  if (!win) throw new Error('The print window was blocked. Allow popups for this site and try again.')
  win.opener = null
  try {
    win.document.write(html)
    win.document.close()
    await win.document.fonts.ready
    await Promise.all(Array.from(win.document.images).map(image => image.decode()))
    if (win.closed) throw new Error('The print window was closed before it was ready.')
    win.focus()
    win.print()
  } catch (error) {
    win.close()
    throw error
  }
}

// ─── Export: Word (via HTML blob) ─────────────────────────────────────────────

export function buildDocumentWordHTML(template: DocumentTemplate, rows: Record<string, unknown>[]): string {
  template = localizeDocumentTemplate(template, template.locale ?? 'en')
  const html = buildDocumentPDFHTML(template, rows)
  const pageNumber = template.headerFooter.showPageNumber
    ? template.headerFooter.footerRight.split(/(\{page\}|\{total\})/g).map(part => part === '{page}'
      ? '<span style="mso-field-code:PAGE"></span>' : part === '{total}'
        ? '<span style="mso-field-code:NUMPAGES"></span>' : escapeDocumentHTML(part)).join('') : ''
  return html.replace('<html ', '<html xmlns:w="urn:schemas-microsoft-com:office:word" ')
    .replace(/<span class="screen-page-number">[\s\S]*?<\/span>/, () => `<span>${pageNumber}</span>`)
}

export async function exportWord(template: DocumentTemplate, rows: Record<string, unknown>[]): Promise<void> {
  template = localizeDocumentTemplate(template, template.locale ?? 'en')
  let html = buildDocumentWordHTML(template, rows)
  if (template.headerFooter.showLogo) {
    const response = await fetch('/logo.png')
    if (!response.ok) throw new Error('Unable to load the report logo. Disable the logo or try again.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    html = html.replace('src="/logo.png"', `src="data:image/png;base64,${encoded}"`)
  }
  downloadDocumentBlob(new Blob(['\ufeff', html], { type: 'application/msword' }), template.name, 'doc')
}

// ─── Master Export Dispatcher ─────────────────────────────────────────────────

export async function runExport(
  template: DocumentTemplate,
  format: ExportFormat,
  rawRows: Record<string, unknown>[],
  search = '',
  locale: Locale = template.locale ?? 'en'
): Promise<void> {
  template = localizeDocumentTemplate(template, locale)
  if (!template.columns.some(column => column.visible)) throw new Error('Select at least one column to export')
  const sorted = selectDocumentRows(rawRows, template, search)

  switch (format) {
    case 'excel': return exportExcel(template, sorted)
    case 'csv': return exportCSV(template, sorted)
    case 'pdf': return exportPDF(template, sorted)
    case 'word': return exportWord(template, sorted)
  }
}
