import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  BUILT_IN_TEMPLATES, applyFilters, applySorting, buildExcelWorkbook,
  type DocumentTemplate,
} from '@/lib/utils/document-engine'

async function main() {
const template: DocumentTemplate = {
  ...BUILT_IN_TEMPLATES[0], createdAt: '', updatedAt: '',
}
const loans = [
  { loan_number: 'LA-001', borrower_name: 'ООО "Хилол"', approved_amount: 1234.56, disbursed_amount: 1000.25, status: 'active' },
  { loan_number: 'LA-002', borrower_name: 'ООО "Хилол"', approved_amount: 2500.99, disbursed_amount: 2000.50, status: 'active' },
  { loan_number: 'LA-003', borrower_name: 'Другой заёмщик', approved_amount: 0, disbursed_amount: 0, status: 'closed' },
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
assert.equal(sheet['!autofilter']?.ref, 'A1:K4')
assert.equal(workbook.Sheets.Data.E2.z, '#,##0.00')
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
console.log('Document Excel export: itemized loans, numeric amounts, totals, filters, empty data and first-sheet order passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
