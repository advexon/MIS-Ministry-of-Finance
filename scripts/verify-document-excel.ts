import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseExcelFile } from '@/lib/utils/excel-parser'
import { toCSV } from '@/lib/utils/export'
import { validateLoan, validatePayment, validateReport } from '@/lib/utils/validation'
import {
  BUILT_IN_TEMPLATES, applyFilters, applySorting, buildExcelWorkbook,
  type DocumentTemplate,
} from '@/lib/utils/document-engine'

async function main() {
const template: DocumentTemplate = {
  ...BUILT_IN_TEMPLATES[0], createdAt: '', updatedAt: '',
}
const loans = [
  { loan_number: 'LA-001', borrower_name: 'ООО "Хилол"', currency: 'TJS', approved_amount: 1234.56, disbursed_amount: 1000.25, status: 'active' },
  { loan_number: 'LA-002', borrower_name: 'ООО "Хилол"', currency: 'TJS', approved_amount: 2500.99, disbursed_amount: 2000.50, status: 'active' },
  { loan_number: 'LA-003', borrower_name: 'Другой заёмщик', currency: 'TJS', approved_amount: 0, disbursed_amount: 0, status: 'closed' },
]
const rows = applySorting(applyFilters(loans, template.filters), template.sortRules)
const workbook = await buildExcelWorkbook(template, rows)
const reopened = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
assert.deepEqual(reopened.SheetNames, ['Data', 'Summary'])
const sheet = reopened.Sheets.Data
const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
assert.equal(table.length, loans.length + 2)
assert.deepEqual(table.slice(1, 4).map(row => row[0]), ['LA-002', 'LA-001', 'LA-003'])
assert.deepEqual(table.slice(1, 3).map(row => row[1]), ['ООО "Хилол"', 'ООО "Хилол"'])
assert.equal(sheet.E2.t, 'n')
assert.equal(sheet.E2.v, 2500.99)
assert.equal(sheet.F2.v, 2000.50)
assert.equal(sheet.F3.v, 1000.25)
assert.equal(sheet.F4.v, 0)
assert.equal(sheet.E5.v, 3735.55)
assert.equal(sheet.F5.v, 3000.75)
assert.equal(sheet['!autofilter']?.ref, 'A1:L4')
assert.equal(workbook.Sheets.Data.E2.z, '#,##0.00 "TJS"')
assert.equal(reopened.Sheets.Summary.B3.v, 3)

const filtered = applySorting(applyFilters(loans, [
  { id: 'active', column: 'status', operator: 'eq', value: 'active', enabled: true },
]), template.sortRules)
assert.equal(XLSX.utils.sheet_to_json((await buildExcelWorkbook(template, filtered)).Sheets.Data).length, 3)

const minimal = await buildExcelWorkbook({ ...template, includeSummary: false, includeTotals: false }, loans)
assert.deepEqual(minimal.SheetNames, ['Data'])
assert.equal(XLSX.utils.sheet_to_json(minimal.Sheets.Data).length, 3)
const empty = await buildExcelWorkbook({ ...template, includeTotals: false }, [])
assert.equal(empty.SheetNames[0], 'Data')
assert.equal(XLSX.utils.sheet_to_json(empty.Sheets.Data).length, 0)
await assert.rejects(buildExcelWorkbook({
  ...template, columns: template.columns.map(column => ({ ...column, visible: false })),
}, loans), /Select at least one column/)
const importWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(importWorkbook, XLSX.utils.json_to_sheet([{
  'Рақами қарз': 'LA-001',
  'Номи муштарӣ': 'ООО "Хилол"',
  'Маблағи тасдиқшуда': '1,234.56',
  'Branch Name': 'Dushanbe',
  'Outstanding Principal': 1000.25,
  'Disbursement Date': '2026-01-01',
  'Maturity Date': '2027-01-01',
}]), 'Guaranteed Loans')
XLSX.utils.book_append_sheet(importWorkbook, XLSX.utils.json_to_sheet([{
  'Loan Number': 'LA-001', 'Installment No': 1, 'Payment Date': '2026-02-01',
  Principal: 100, Interest: 10, Total: 110, 'Remaining Balance': 900.25,
}]), 'Payment Schedule')
const imported = await parseExcelFile(new File([
  new Uint8Array(XLSX.write(importWorkbook, { type: 'array', bookType: 'xlsx' })),
], 'report.xlsx'))
assert.deepEqual(imported.errors, [])
assert.equal(imported.loans.length, 1)
assert.equal(imported.payments.length, 1)
assert.equal(imported.loans[0].customer_name, 'ООО "Хилол"')
assert.equal(imported.loans[0].approved_amount, 1234.56)
assert.equal(imported.loans[0].outstanding_principal, 1000.25)
assert.equal(imported.payments[0].total_amount, 110)
assert.deepEqual(validateReport({
  bankId: 'bank-1', reportMonth: '2026-01', reportType: 'disbursements',
  loans: imported.loans, payments: imported.payments,
}), { isValid: true, errors: [] })
assert.ok(validateLoan({ ...imported.loans[0], approved_amount: 0 }, 'blank_guarantee')
  .some(error => error.field === 'approved_amount'))
assert.ok(validateLoan({ ...imported.loans[0], maturity_date: '2025-01-01' }, 'disbursements')
  .some(error => error.field === 'maturity_date'))
assert.ok(validatePayment({ ...imported.payments[0], total_amount: 111 })
  .some(error => error.field === 'total_amount'))
assert.equal(toCSV(['name', 'notes'], [['ООО "Хилол"', 'First line\nSecond, line'], [null, undefined]]),
  '"name","notes"\r\n"ООО ""Хилол""","First line\nSecond, line"\r\n"",""')
console.log('Document Excel export and import: itemized rows, numeric amounts, totals, filters, multilingual fields, validation and CSV quoting passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
