'use client'

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
      { key: 'application_number', label: 'Loan #', type: 'text', visible: true, width: 100 },
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
      { key: 'application_number', label: 'Loan #', type: 'text', visible: true, width: 100 },
      { key: 'borrower_name', label: 'Borrower', type: 'text', visible: true, width: 180 },
      { key: 'bank_name', label: 'Bank', type: 'text', visible: true, width: 140 },
      { key: 'outstanding_balance', label: 'Outstanding', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'days_overdue', label: 'Days Overdue', type: 'number', visible: true, align: 'right', width: 110 },
      { key: 'overdue_principal', label: 'Overdue Principal', type: 'currency', visible: true, align: 'right', width: 140 },
      { key: 'overdue_interest', label: 'Overdue Interest', type: 'currency', visible: true, align: 'right', width: 130 },
      { key: 'last_payment_date', label: 'Last Payment', type: 'date', visible: true, width: 110 },
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
      { key: 'guarantee_amount', label: 'Guarantee Amt', type: 'currency', visible: true, align: 'right', width: 130 },
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
    { application_number: 'LA-2026-0142', borrower_name: 'Rahimov Enterprises LLC', bank_name: 'Agroinvestbank', sector: 'Agriculture', approved_amount: 450000, disbursed_amount: 450000, outstanding_balance: 382500, guarantee_coverage: 50, interest_rate: 18.5, maturity_date: '2028-03-15', status: 'active' },
    { application_number: 'LA-2026-0139', borrower_name: 'Karimov Trading Co', bank_name: 'Bank Eskhata', sector: 'Trade', approved_amount: 280000, disbursed_amount: 280000, outstanding_balance: 196000, guarantee_coverage: 60, interest_rate: 21.0, maturity_date: '2027-09-01', status: 'active' },
    { application_number: 'LA-2025-0981', borrower_name: 'Nasimov Manufacturing', bank_name: 'Spitamen Bank', sector: 'Manufacturing', approved_amount: 870000, disbursed_amount: 870000, outstanding_balance: 522000, guarantee_coverage: 50, interest_rate: 19.5, maturity_date: '2029-01-20', status: 'overdue' },
    { application_number: 'LA-2025-0902', borrower_name: 'Tursunova Pharmacy', bank_name: 'IMON International', sector: 'Services', approved_amount: 150000, disbursed_amount: 150000, outstanding_balance: 75000, guarantee_coverage: 70, interest_rate: 24.0, maturity_date: '2027-06-30', status: 'active' },
    { application_number: 'LA-2025-0845', borrower_name: 'Dushanbe Builders LLC', bank_name: 'Amonatbonk', sector: 'Construction', approved_amount: 1200000, disbursed_amount: 900000, outstanding_balance: 720000, guarantee_coverage: 50, interest_rate: 17.0, maturity_date: '2030-12-31', status: 'active' },
    { application_number: 'LA-2025-0790', borrower_name: 'Northern Transport Co', bank_name: 'Agroinvestbank', sector: 'Transport', approved_amount: 320000, disbursed_amount: 320000, outstanding_balance: 256000, guarantee_coverage: 55, interest_rate: 20.5, maturity_date: '2028-08-15', status: 'overdue' },
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

const currFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 })
const numFmt = new Intl.NumberFormat('en-US')

export function formatCellValue(value: unknown, type: DocumentColumn['type']): string {
  if (value === null || value === undefined) return '—'
  switch (type) {
    case 'currency': return currFmt.format(Number(value))
    case 'percent': return `${Number(value).toFixed(1)}%`
    case 'number': return numFmt.format(Number(value))
    case 'date': return value ? new Date(String(value)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    default: return String(value)
  }
}

// ─── Export: Excel ────────────────────────────────────────────────────────────

export async function exportExcel(
  template: DocumentTemplate,
  rows: Record<string, unknown>[]
): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const visibleCols = template.columns.filter(c => c.visible)

  // Summary sheet
  if (template.includeSummary) {
    const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    const summaryData = [
      ['Report Name', template.name],
      ['Generated', now],
      ['Total Records', rows.length],
      ['Data Source', template.dataSource],
      ['Active Filters', template.filters.filter(f => f.enabled).length],
      ['Sort By', template.sortRules.map(s => `${s.column} ${s.direction}`).join(', ') || 'Default'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary')
  }

  // Main data sheet
  const headers = visibleCols.map(c => c.label)
  const dataRows = rows.map(row =>
    visibleCols.map(col => {
      const raw = row[col.key]
      if (col.type === 'currency' || col.type === 'number' || col.type === 'percent') return Number(raw) || 0
      if (col.type === 'date') return raw ? new Date(String(raw)).toLocaleDateString('en-GB') : ''
      return String(raw ?? '')
    })
  )

  // Totals row
  if (template.includeTotals) {
    const totalsRow = visibleCols.map(col => {
      if (col.type === 'currency' || col.type === 'number') {
        const total = rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0)
        return total
      }
      if (col.key === visibleCols[0].key) return 'TOTAL'
      return ''
    })
    dataRows.push(totalsRow)
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])

  // Column widths
  ws['!cols'] = visibleCols.map(c => ({ wch: Math.round((c.width || 120) / 7) }))

  XLSX.utils.book_append_sheet(wb, ws, 'Data')
  XLSX.writeFile(wb, `${template.name.replace(/\s+/g, '_')}_${Date.now()}.xlsx`)
}

// ─── Export: CSV ──────────────────────────────────────────────────────────────

export function exportCSV(template: DocumentTemplate, rows: Record<string, unknown>[]): void {
  const visibleCols = template.columns.filter(c => c.visible)
  const escape = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n')) ? `"${v.replace(/"/g, '""')}"` : v
  const lines = [
    visibleCols.map(c => escape(c.label)).join(','),
    ...rows.map(row =>
      visibleCols.map(col => escape(formatCellValue(row[col.key], col.type))).join(',')
    ),
  ]
  if (template.includeTotals) {
    const totalsRow = visibleCols.map(col => {
      if (col.type === 'currency' || col.type === 'number') {
        return escape(formatCellValue(rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0), col.type))
      }
      return col.key === visibleCols[0].key ? 'TOTAL' : ''
    })
    lines.push(totalsRow.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${template.name.replace(/\s+/g, '_')}_${Date.now()}.csv` })
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Export: PDF (via styled HTML print window) ───────────────────────────────

export function exportPDF(template: DocumentTemplate, rows: Record<string, unknown>[]): void {
  const visibleCols = template.columns.filter(c => c.visible)
  const hf = template.headerFooter
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
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
    const style = badgeColors[val] || '#f3f4f6;color:#374151'
    const [bg, fg] = style.split(';')
    return `background:${bg};${fg};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600`
  }

  const getRowStyle = (row: Record<string, unknown>) => {
    const styles = getConditionalStyles(row, template.conditionalRules)
    let css = ''
    if (styles.includes('red')) css += 'background:#fff1f2;'
    else if (styles.includes('green')) css += 'background:#f0fdf4;'
    else if (styles.includes('yellow')) css += 'background:#fefce8;'
    if (styles.includes('bold')) css += 'font-weight:700;'
    if (styles.includes('italic')) css += 'font-style:italic;'
    return css
  }

  const totalRows = template.includeTotals ? `
    <tr style="background:#1e3a5f;color:#fff;font-weight:700;">
      ${visibleCols.map((col, i) => {
    if (col.type === 'currency' || col.type === 'number') {
      const total = rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0)
      return `<td style="padding:8px 10px;text-align:${col.align || 'left'}">${formatCellValue(total, col.type)}</td>`
    }
    return `<td style="padding:8px 10px">${i === 0 ? 'TOTAL' : ''}</td>`
  }).join('')}
    </tr>` : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${template.name}</title>
  <style>
    @page { size: ${template.pageSize} ${template.orientation}; margin: 18mm 14mm; }
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
      <div class="org">${hf.headerLeft}</div>
      <h1>${hf.headerCenter || template.name}</h1>
    </div>
    <div class="meta">
      ${hf.showDate ? `<div>Generated: ${now}</div>` : ''}
      <div>Records: ${rows.length}</div>
    </div>
  </div>

  ${template.includeSummary ? `
  <div class="summary-grid">
    <div class="summary-card"><div class="label">Total Records</div><div class="value">${rows.length}</div></div>
    <div class="summary-card"><div class="label">Data Source</div><div class="value" style="font-size:12px">${template.dataSource.replace(/_/g, ' ')}</div></div>
    <div class="summary-card"><div class="label">Report Period</div><div class="value" style="font-size:12px">${now}</div></div>
  </div>` : ''}

  <table>
    <thead>
      <tr>
        ${visibleCols.map(c => `<th style="width:${colWidth}%;text-align:${c.align || 'left'}">${c.label}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map(row => `
        <tr style="${getRowStyle(row)}">
          ${visibleCols.map(col => {
    const raw = row[col.key]
    const formatted = formatCellValue(raw, col.type)
    const isRight = col.align === 'right' || col.type === 'currency' || col.type === 'number' || col.type === 'percent'
    if (col.type === 'badge') {
      return `<td style="text-align:${col.align || 'left'}"><span style="${getBadgeStyle(String(raw))}">${formatted}</span></td>`
    }
    return `<td style="text-align:${isRight ? 'right' : 'left'}">${formatted}</td>`
  }).join('')}
        </tr>
      `).join('')}
      ${totalRows}
    </tbody>
  </table>

  <div class="page-footer">
    <span>${hf.footerLeft}</span>
    <span>${hf.footerCenter}</span>
    <span>${hf.showPageNumber ? hf.footerRight : ''}</span>
  </div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  setTimeout(() => { win.print() }, 600)
}

// ─── Export: Word (via HTML blob) ─────────────────────────────────────────────

export function exportWord(template: DocumentTemplate, rows: Record<string, unknown>[]): void {
  const visibleCols = template.columns.filter(c => c.visible)
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><title>${template.name}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  h1 { font-size: 18pt; color: #1e3a5f; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e3a5f; color: white; padding: 6pt 8pt; font-size: 9pt; }
  td { padding: 5pt 8pt; border-bottom: 1pt solid #e2e8f0; font-size: 10pt; }
  tr:nth-child(even) td { background: #f8fafc; }
  .footer { margin-top: 14pt; color: #64748b; font-size: 9pt; }
</style>
</head>
<body>
  <h1>${template.name}</h1>
  <p style="color:#64748b;font-size:10pt">Generated: ${now} | Records: ${rows.length}</p>
  <br/>
  <table>
    <thead><tr>${visibleCols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map(row => `<tr>${visibleCols.map(col => `<td>${formatCellValue(row[col.key], col.type)}</td>`).join('')}</tr>`).join('')}
      ${template.includeTotals ? `<tr style="font-weight:bold;background:#1e3a5f;color:white">
        ${visibleCols.map((col, i) => {
    if (col.type === 'currency' || col.type === 'number') {
      const total = rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0)
      return `<td>${formatCellValue(total, col.type)}</td>`
    }
    return `<td>${i === 0 ? 'TOTAL' : ''}</td>`
  }).join('')}
      </tr>` : ''}
    </tbody>
  </table>
  <div class="footer">${template.headerFooter.footerLeft}</div>
</body>
</html>`

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${template.name.replace(/\s+/g, '_')}_${Date.now()}.doc` })
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Master Export Dispatcher ─────────────────────────────────────────────────

export async function runExport(
  template: DocumentTemplate,
  format: ExportFormat,
  rawRows: Record<string, unknown>[]
): Promise<void> {
  const filtered = applyFilters(rawRows, template.filters)
  const sorted = applySorting(filtered, template.sortRules)

  switch (format) {
    case 'excel': return exportExcel(template, sorted)
    case 'csv': return exportCSV(template, sorted)
    case 'pdf': return exportPDF(template, sorted)
    case 'word': return exportWord(template, sorted)
  }
}
