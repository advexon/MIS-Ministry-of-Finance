import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  BUILT_IN_TEMPLATES, buildDocumentCSV, buildDocumentPDFHTML, buildDocumentWordHTML,
  buildExcelWorkbook, documentTotal, formatCellValue, runExport, selectDocumentRows,
  type DocumentTemplate,
} from '@/lib/utils/document-engine'
import { attachDocumentSnapshot, collectDocumentPages, latestApprovedSnapshots, loadDocumentRows } from '@/lib/utils/document-data'

async function main() {
  const template: DocumentTemplate = structuredClone({ ...BUILT_IN_TEMPLATES[0], createdAt: '', updatedAt: '' })
  const amountColumn = template.columns.find(col => col.key === 'approved_amount')!
  const rows = [
    { loan_number: 'LOAN-1', borrower_name: 'ООО Заёмщик', approved_amount: 500, currency: 'USD', status: 'active' },
    { loan_number: 'LOAN-2', borrower_name: 'Same bank', approved_amount: 100, currency: 'TJS', status: 'active' },
    { loan_number: 'LOAN-3', borrower_name: 'Same bank', approved_amount: 200, currency: 'USD', status: 'closed' },
  ]
  assert.equal(formatCellValue(0, 'currency', 'USD'), '0 USD')
  assert.equal(formatCellValue(null, 'currency', 'TJS'), '—')
  assert.equal(formatCellValue('bad', 'currency', 'TJS'), '—')
  assert.equal(formatCellValue(500, 'currency'), '500 (currency unspecified)')
  assert.equal(formatCellValue('bad', 'date'), '—')
  assert.equal(documentTotal(rows, amountColumn), '700 USD / 100 TJS')
  assert.equal(documentTotal([{ approved_amount: 100 }], amountColumn), 'Unavailable')
  assert.equal(documentTotal([{ approved_amount: null, currency: 'TJS' }], amountColumn), 'Unavailable (TJS)')
  assert.deepEqual(selectDocumentRows(rows, template, 'same').map(row => row.loan_number), ['LOAN-3', 'LOAN-2'])
  assert.deepEqual(selectDocumentRows(rows, template, '  same  ').map(row => row.loan_number), ['LOAN-3', 'LOAN-2'])
  const activeTemplate = { ...template, filters: [{ id: 'active', column: 'status', operator: 'eq' as const, value: 'active', enabled: true }] }
  assert.deepEqual(selectDocumentRows(rows, activeTemplate, 'same').map(row => row.loan_number), ['LOAN-2'])

  const malicious = '</title><img src=x onerror=alert(1)><script>alert(2)</script>&"\''
  const unsafe = structuredClone(template)
  unsafe.name = malicious
  unsafe.dataSource = malicious
  unsafe.columns[0].label = malicious
  unsafe.columns[0].align = malicious as 'left'
  unsafe.headerFooter = { ...unsafe.headerFooter, headerLeft: malicious, headerCenter: malicious,
    headerRight: malicious, footerLeft: malicious, footerCenter: malicious,
    footerRight: `${malicious} Page {page} of {total}` }
  for (const build of [buildDocumentPDFHTML, buildDocumentWordHTML]) {
    const html = build(unsafe, [{ loan_number: malicious, status: '__proto__', currency: 'USD' }])
    assert.ok(!html.includes(malicious), 'All user-controlled HTML must be escaped')
    assert.doesNotMatch(html, /<script>|<img src=x|\{page\}|\{total\}/)
    assert.match(html, /&lt;script&gt;/)
    assert.match(html, /text-align:left/)
  }
  assert.match(buildDocumentPDFHTML(template, rows), /counter\(page\).*counter\(pages\)/)
  assert.match(buildDocumentWordHTML(template, rows), /mso-field-code:PAGE/)
  assert.doesNotMatch(buildDocumentPDFHTML({ ...template, includeTitle: false }, []), /<h1>/)

  const textTemplate = { ...template, includeTotals: false, columns: [{ key: 'text', label: '=Header()', type: 'text' as const, visible: true }] }
  const dangerous = ['=1+1', '+SUM(A1)', '-CMD()', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1', 'First\rSecond', 'ООО "Хилол", line\nnext']
  const csv = buildDocumentCSV(textTemplate, dangerous.map(text => ({ text })))
  assert.ok(csv.startsWith('\ufeff"\'=Header()"\r\n'))
  for (const value of dangerous.slice(0, 7)) assert.ok(csv.includes(`"'${value}"`))
  assert.ok(csv.includes('"First\rSecond"'))
  assert.ok(csv.includes('"ООО ""Хилол"", line\nnext"'))
  const workbook = await buildExcelWorkbook(template, [...rows, { loan_number: '=DDE()', currency: 'USD', approved_amount: null }])
  assert.equal(workbook.Sheets.Data.A5.t, 's')
  assert.equal(workbook.Sheets.Data.A5.f, undefined)
  assert.ok(!workbook.Sheets.Data.E5 || workbook.Sheets.Data.E5.t !== 'n')
  assert.equal(workbook.Sheets.Data.E2.z, '#,##0.00 "USD"')
  assert.equal(workbook.Sheets.Data.E3.z, '#,##0.00 "TJS"')
  const mixed = await buildExcelWorkbook(template, rows)
  assert.equal(mixed.Sheets.Data.E5.t, 's')
  assert.equal(mixed.Sheets.Data.E5.v, '700 USD / 100 TJS')
  const reopened = XLSX.read(XLSX.write(mixed, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' })
  assert.equal(reopened.Sheets.Data.E2.v, 500)

  const all = Array.from({ length: 1205 }, (_, id) => ({ id }))
  let calls = 0
  const loaded = await collectDocumentPages(async from => {
    calls++
    // A server-side page cap smaller than our requested range must not truncate results.
    return { data: all.slice(from, from + 200), count: all.length, error: null }
  })
  assert.equal(loaded.length, 1205)
  assert.equal(calls, 7)
  assert.equal(new Set(loaded.map(row => row.id)).size, 1205)
  await assert.rejects(collectDocumentPages(async () => ({ data: [], count: 10, error: null })), /incomplete/)
  await assert.rejects(collectDocumentPages(async () => ({ data: [], error: null })), /complete.*count/)
  await assert.rejects(collectDocumentPages(async () => ({ data: null, error: { message: 'Access denied' } })), /Access denied/)
  await assert.rejects(collectDocumentPages(async from => ({ data: [{ id: from }], count: from ? 3 : 2, error: null })), /changed/)

  const snapshots = [
    { id: 'older', loan_application_id: 'loan', created_at: '2026-01-01', currency: 'USD', outstanding_principal: 100, days_overdue: 90, report: { report_month: '2026-01-01', status: 'approved' } },
    { id: 'newer', loan_application_id: 'loan', created_at: '2026-02-01', currency: 'USD', outstanding_principal: 0, days_overdue: 0, overdue_principal: 0, overdue_interest: 0, last_payment_date: '2026-02-01', report: { report_month: '2026-02-01', status: 'approved' } },
    { id: 'draft', loan_application_id: 'loan', created_at: '2026-03-01', currency: 'USD', outstanding_principal: 999, days_overdue: 99, report: { report_month: '2026-03-01', status: 'draft' } },
  ]
  const latest = latestApprovedSnapshots(snapshots).get('loan')!
  assert.equal(latest.id, 'newer')
  assert.equal(attachDocumentSnapshot({ disbursed_amount: 500, currency: 'USD' }, latest).outstanding_balance, 0)
  assert.equal(attachDocumentSnapshot({ disbursed_amount: 500, currency: 'USD' }).outstanding_balance, null)
  assert.equal(attachDocumentSnapshot({ currency: 'TJS' }, latest).outstanding_balance, null)
  const delinquency = { ...BUILT_IN_TEMPLATES[2], createdAt: '', updatedAt: '' }
  assert.deepEqual(selectDocumentRows([{ days_overdue: null }, { days_overdue: 0 }, { days_overdue: 10 }], delinquency), [{ days_overdue: 10 }])

  const fixtureClient = (tables: Record<string, Record<string, unknown>[]>) => ({ from(table: string) {
    assert.ok(Object.hasOwn(tables, table), `Unexpected table ${table}`)
    const query = { select() { return query }, order() { return query }, range() {
      return Promise.resolve({ data: tables[table], count: tables[table].length, error: null })
    } }
    return query
  } }) as unknown as SupabaseClient
  const claims = await loadDocumentRows(fixtureClient({ claims: [{ claim_date: '2026-01-02', loan: null, legacy_loan: [{ loan_number: 'L1', currency: 'USD' }], bank: [{ name_en: 'Bank' }] }] }), 'claims')
  assert.equal(claims[0].filing_date, '2026-01-02')
  assert.equal(claims[0].loan_number, 'L1')
  assert.equal(claims[0].currency, 'USD')
  const fees = await loadDocumentRows(fixtureClient({ fees: [{ period_start: '2026-01-01', period_end: '2026-01-31', base_amount: 123, fee_amount: 0, amount: 9, paid_date: '2026-01-30', payment_date: null, loan: { currency: 'TJS' }, bank: { name_en: 'Bank' } }] }), 'fees')
  assert.equal(fees[0].fee_amount, 0)
  assert.equal(fees[0].guarantee_amount, 123)
  assert.equal(fees[0].period, '2026-01-01 – 2026-01-31')
  assert.equal(fees[0].paid_date, '2026-01-30')
  await assert.rejects(loadDocumentRows(fixtureClient({}), 'unsupported'), /not supported/)

  const originalWindow = globalThis.window
  try {
    Object.assign(globalThis, { window: { open: () => null } })
    await assert.rejects(runExport(template, 'pdf', rows), /blocked.*popups/)
    let written = '', printed = 0, closed = 0
    const popup = { opener: {}, closed: false, document: { write: (html: string) => { written = html }, close() {}, fonts: { ready: Promise.resolve() }, images: [] }, focus() {}, print() { printed++ }, close() { closed++ } }
    Object.assign(globalThis, { window: { open: () => popup } })
    await runExport(template, 'pdf', rows, 'LOAN-2')
    assert.match(written, /LOAN-2/)
    assert.doesNotMatch(written, /LOAN-1|LOAN-3/)
    assert.equal(printed, 1)
    assert.equal(popup.opener, null)
    assert.equal(closed, 0)
    popup.print = () => { throw new Error('Print unavailable') }
    await assert.rejects(runExport(template, 'pdf', rows), /Print unavailable/)
    assert.equal(closed, 1)
    const noColumns = { ...template, columns: template.columns.map(col => ({ ...col, visible: false })) }
    for (const format of ['pdf', 'word', 'csv', 'excel'] as const) await assert.rejects(runExport(noColumns, format, rows), /at least one column/)
  } finally { Object.assign(globalThis, { window: originalWindow }) }
  console.log('Document Center regressions passed: HTML/CSV injection, typed Excel, currency-separated totals, nulls, shared search, full pagination, latest approved snapshots, claims/fees mapping, print errors and export guards.')

  if (process.argv.includes('--live')) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
    const email = process.env.MIS_ACCEPTANCE_SUPER_ADMIN_EMAIL
    const password = process.env.MIS_ACCEPTANCE_SUPER_ADMIN_PASSWORD
    assert.ok(url && key && email && password, 'Live verification requires the existing Supabase and acceptance environment variables')
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await client.auth.signInWithPassword({ email, password })
    assert.ok(!error, 'Acceptance authentication failed; credentials and tokens were not logged')
    try {
      for (const source of ['loan_applications', 'guarantee_reports', 'claims', 'fees']) {
        const results = await loadDocumentRows(client, source)
        const { count, error: countError } = await client.from(source).select('id', { count: 'exact', head: true })
        assert.ok(!countError, `Count verification failed for ${source}`)
        assert.equal(results.length, count, `${source} must load every authorized row`)
        const sourceTemplate = { ...BUILT_IN_TEMPLATES.find(item => item.dataSource === source)!, createdAt: '', updatedAt: '' }
        await buildExcelWorkbook(sourceTemplate, results)
        buildDocumentCSV(sourceTemplate, results)
        buildDocumentPDFHTML(sourceTemplate, results)
        buildDocumentWordHTML(sourceTemplate, results)
        console.log(`Authenticated read-only ${source}: ${results.length} rows; complete count and all export builders passed`)
      }
    } finally { await client.auth.signOut({ scope: 'local' }) }
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Document Center verification failed'); process.exitCode = 1 })
