import assert from 'node:assert/strict'
import { aggregatePortfolioReport, reportExportRows, type ReportLoan } from '@/lib/utils/portfolio-report'
import { toCSV } from '@/lib/utils/export'

const loan = (overrides: Partial<ReportLoan> = {}): ReportLoan => ({
  status: 'approved', approved_amount: 100, disbursed_amount: 60,
  disbursement_date: '2026-02-10', banks: { name_en: 'Bank A', code: 'A' },
  sectors: { name_en: 'Agriculture' }, ...overrides,
})

assert.deepEqual(aggregatePortfolioReport([], [], []), {
  summaryStats: { totalLoans: 0, totalAmount: 0, totalOutstanding: 0, totalClaims: 0, totalFees: 0 },
  sectorData: [], bankData: [], monthlyData: [], statusData: [],
})

const loans = [
  loan(),
  loan({ approved_amount: 200, disbursed_amount: 80, disbursement_date: '2026-01-15', banks: [{ name_en: 'Bank A', code: 'A' }], sectors: [{ name_en: 'Agriculture' }] }),
  loan({ status: 'under_review', approved_amount: 500, disbursed_amount: 250, disbursement_date: '2026-01-25', banks: { name_en: 'Bank B', code: 'B' }, sectors: { name_en: 'Services' } }),
  loan({ status: null, approved_amount: null, disbursed_amount: null, disbursement_date: null, banks: null, sectors: null }),
]
const original = structuredClone(loans)
const report = aggregatePortfolioReport(loans, [{ claim_amount: 25 }, { claim_amount: null }, { claim_amount: 75 }], [{ amount: 10 }, { amount: null }, { amount: 15 }])
assert.deepEqual(loans, original)
assert.deepEqual(report.summaryStats, { totalLoans: 4, totalAmount: 800, totalOutstanding: 390, totalClaims: 100, totalFees: 25 })
assert.deepEqual(report.sectorData, [
  { sector: 'Services', count: 1, amount: 500 },
  { sector: 'Agriculture', count: 2, amount: 300 },
  { sector: 'Other', count: 1, amount: 0 },
])
assert.deepEqual(report.bankData, [
  { code: 'B', name: 'Bank B', count: 1, amount: 500, outstanding: 250 },
  { code: 'A', name: 'Bank A', count: 2, amount: 300, outstanding: 140 },
  { code: 'Unknown', name: 'Unknown', count: 1, amount: 0, outstanding: 0 },
])
assert.deepEqual(report.monthlyData, [
  { month: '2026-01', count: 2, amount: 700 },
  { month: '2026-02', count: 1, amount: 100 },
])
assert.deepEqual(report.statusData, [{ name: 'approved', value: 2 }, { name: 'under review', value: 1 }, { name: 'unknown', value: 1 }])

const objects = aggregatePortfolioReport([loan()], [], [])
assert.deepEqual(aggregatePortfolioReport([loan({ banks: [{ name_en: 'Bank A', code: 'A' }], sectors: [{ name_en: 'Agriculture' }] })], [], []), objects)
assert.deepEqual(aggregatePortfolioReport([loan({ banks: [{ name_en: 'Bank A', code: 'A' }, { name_en: 'Ignored', code: 'X' }], sectors: [{ name_en: 'Agriculture' }, { name_en: 'Ignored' }] })], [], []), objects)
for (const missing of [null, []]) {
  const result = aggregatePortfolioReport([loan({ banks: missing, sectors: missing })], [], [])
  assert.equal(result.bankData[0].code, 'Unknown')
  assert.equal(result.sectorData[0].sector, 'Other')
}
for (const key of ['__proto__', 'constructor', 'toString']) {
  const result = aggregatePortfolioReport([loan({ status: key, banks: { name_en: key, code: key }, sectors: { name_en: key } })], [], [])
  assert.equal(result.bankData[0].code, key)
  assert.equal(result.bankData[0].amount, 100)
  assert.equal(result.sectorData[0].sector, key)
  assert.equal(result.sectorData[0].count, 1)
  assert.equal(result.statusData[0].value, 1)
}
assert.deepEqual(reportExportRows([]), { headers: [], rows: [] })
const exported = reportExportRows(report.bankData)
assert.deepEqual(exported.headers, ['code', 'name', 'count', 'amount', 'outstanding'])
assert.deepEqual(exported.rows, [['B', 'Bank B', 1, 500, 250], ['A', 'Bank A', 2, 300, 140], ['Unknown', 'Unknown', 1, 0, 0]])
assert.equal(toCSV(exported.headers, exported.rows), '"code","name","count","amount","outstanding"\r\n"B","Bank B","1","500","250"\r\n"A","Bank A","2","300","140"\r\n"Unknown","Unknown","1","0","0"')
const special = reportExportRows([{ name: 'Bank, A', sector: 'Text "quoted"\nline' }])
const csv = toCSV(special.headers, special.rows)
assert.ok(csv.includes('"Bank, A"'))
assert.ok(csv.includes('Text ""quoted""\nline'))
console.log('Portfolio report checks passed: empty/null inputs, totals, relation shapes, sort order, grouping keys, immutability and CSV columns/escaping')
