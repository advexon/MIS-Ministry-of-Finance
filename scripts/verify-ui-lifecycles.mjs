import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')

function loadSource(relativePath, overrides = {}, cache = new Map()) {
  const filename = resolve(root, relativePath)
  if (cache.has(filename)) return cache.get(filename).exports
  const loadedModule = { exports: {} }
  cache.set(filename, loadedModule)
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const localRequire = specifier => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier]
    if (specifier.startsWith('.') && specifier.endsWith('.json')) {
      return JSON.parse(readFileSync(resolve(dirname(filename), specifier), 'utf8'))
    }
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      for (const extension of ['.ts', '.tsx']) {
        const path = specifier.startsWith('@/') ? specifier.slice(2) + extension : resolve(dirname(filename), specifier + extension)
        try {
          readFileSync(resolve(root, path))
        } catch (error) {
          if (error.code === 'ENOENT') continue
          throw error
        }
        return loadSource(path, overrides, cache)
      }
      throw new Error(`Cannot resolve ${specifier}`)
    }
    return require(specifier)
  }
  runInNewContext(compiled, {
    exports: loadedModule.exports,
    module: loadedModule,
    require: localRequire,
    window: overrides.window,
    document: overrides.document ?? { documentElement: { lang: 'en' } },
    localStorage: overrides.localStorage,
    Date: overrides.Date ?? Date,
    console,
  }, { filename })
  return loadedModule.exports
}

{
  const filename = 'components/admin/operational-settings-controls.tsx'
  const source = ts.createSourceFile(filename, readFileSync(resolve(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const handlers = {}
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && ['save', 'refreshLatest'].includes(node.name?.text)) handlers[node.name.text] = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(handlers.save && handlers.refreshLatest)
  const { validateOperationalValue } = loadSource('lib/admin/operational-settings.ts')
  const { translateInterface, interfaceCatalog } = loadSource('lib/i18n/interface-text.ts')
  const messages = new Set()
  for (const scenario of ['success', 'refresh-failure', 'conflict', 'returned-error', 'network', 'invalid', 'stale', 'refresh-required', 'busy', 'no-changes', 'short-reason', 'long-reason']) {
    const events = []
    const state = { baseline: { assessment_sla_days: '1' }, reason: 'Approved rule change', refreshRequired: scenario === 'refresh-required' }
    const pending = { current: scenario === 'busy' }
    let release
    const response = new Promise(resolve => { release = resolve })
    const context = {
      pending, stale: scenario === 'stale', refreshRequired: state.refreshRequired,
      changed: scenario === 'no-changes' ? [] : [{ key: 'assessment_sla_days' }],
      reason: scenario === 'short-reason' ? ' x ' : scenario === 'long-reason' ? 'x'.repeat(2001) : state.reason,
      draft: { assessment_sla_days: scenario === 'invalid' ? '1.5' : '2' }, baseline: state.baseline,
      validateOperationalValue,
      createClient: () => ({ rpc: async (name, args) => {
        events.push('rpc')
        assert.equal(name, 'cgf_save_settings')
        assert.equal(args.p_reason, 'Approved rule change')
        assert.equal(JSON.stringify(args.p_changes), JSON.stringify([{ key: 'assessment_sla_days', value: '2', expected_value: '1' }]))
        await response
        if (scenario === 'network') throw new Error('Private network detail')
        return { error: scenario === 'conflict' ? { code: '40001' } : scenario === 'returned-error' ? { message: 'Private database detail' } : null }
      } }),
      refresh: async () => { events.push('refresh'); if (scenario === 'refresh-failure') throw new Error('Private refresh detail') },
      setBusy: value => { state.busy = value },
      setBaseline: value => { state.baseline = value },
      setReason: value => { state.reason = value },
      setRefreshRequired: value => { state.refreshRequired = value },
      setError: value => { state.error = value; if (value) messages.add(value) },
      setMessage: value => { state.message = value; if (value) messages.add(value) },
    }
    const save = runInNewContext(ts.transpileModule(`${handlers.save}\nsave`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
    const first = save()
    await save()
    release()
    await first
    if (['stale', 'refresh-required', 'busy', 'no-changes', 'short-reason', 'long-reason'].includes(scenario)) {
      assert.deepEqual(events, [], scenario)
      continue
    }
    assert.equal(events.filter(event => event === 'rpc').length, scenario === 'invalid' ? 0 : 1, `${scenario}: prevent concurrent duplicate saves`)
    assert.equal(pending.current, false)
    if (scenario === 'invalid') { assert.match(state.error, /numeric ranges/); continue }
    assert.equal(state.busy, false)
    const confirmed = ['success', 'refresh-failure'].includes(scenario)
    assert.equal(state.baseline.assessment_sla_days, confirmed ? '2' : '1')
    assert.equal(state.reason, confirmed ? '' : 'Approved rule change')
    assert.equal(Boolean(state.message), confirmed)
    assert.equal(events.includes('refresh'), confirmed)
    assert.equal(Boolean(state.refreshRequired), scenario !== 'success')
    if (scenario === 'refresh-failure') assert.match(state.error, /were saved and audited/)
    if (scenario === 'conflict') assert.match(state.error, /Another administrator/)
    assert.doesNotMatch(JSON.stringify(state), /Private/)
  }
  for (const fails of [false, true]) {
    const pending = { current: false }
    const state = { refreshRequired: true, error: 'Previous error' }
    let calls = 0
    const refreshLatest = runInNewContext(ts.transpileModule(`${handlers.refreshLatest}\nrefreshLatest`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
      pending,
      refresh: async () => { calls++; if (fails) throw new Error('Private detail') },
      setBusy: value => { state.busy = value },
      setRefreshRequired: value => { state.refreshRequired = value },
      setError: value => { state.error = value; if (value) messages.add(value) },
    })
    await Promise.all([refreshLatest(), refreshLatest()])
    assert.equal(calls, 1)
    assert.equal(pending.current, false)
    assert.equal(state.busy, false)
    assert.equal(state.refreshRequired, fails)
    assert.equal(state.error === null, !fails)
  }
  let swrState = { data: { assessment_sla_days: '1' }, error: new Error('Read failed') }
  const { OperationalSettingsControls } = loadSource(filename, {
    swr: { __esModule: true, default: () => swrState },
    '@/lib/contexts/permission-context': { usePermissions: () => ({ role: { code: 'super_admin' }, user: { id: 'fixture' } }) },
    '@/lib/i18n/ui-text': { useUiTranslation: () => value => value },
  })
  assert.equal(OperationalSettingsControls().type, 'div', 'A failed revalidation must keep the cached editor mounted')
  assert.equal(OperationalSettingsControls().props.children[1].type.name, 'Editor')
  swrState = { ...swrState, data: undefined }
  assert.notEqual(OperationalSettingsControls().type, 'div', 'Initial failure must not provide editable defaults')
  for (const text of messages) {
    assert.ok(interfaceCatalog[text], `Settings feedback must be catalogued: ${text}`)
    for (const locale of ['ru', 'tj']) assert.notEqual(translateInterface(locale, text), text)
  }
  console.log('Operational settings checks passed: exact RPC payload, synchronous duplicate guard, validation, stale/uncertain guards, confirmed-save refresh failure, draft retention, refresh recovery and multilingual feedback')
}

{
  const { canViewBorrowerCreditHistory: allowed } = loadSource('lib/utils/borrower-credit-history.ts')
  const fundRoles = ['super_admin', 'prsf_admin', 'prsf_analyst', 'auditor', 'credit_risk_officer', 'compliance_officer', 'fkg_management', 'deputy_director', 'accountant', 'reporting_officer', 'business_development']
  for (const code of fundRoles) {
    assert.equal(allowed({ is_active: true }, { code, is_active: true }), true)
    assert.equal(allowed({ is_active: false }, { code, is_active: true }), false)
    assert.equal(allowed({ is_active: true }, { code, is_active: false }), false)
  }
  for (const code of ['bank_admin', 'bank_officer', 'legal_officer', 'credit_committee', 'unknown']) {
    assert.equal(allowed({ is_active: true }, { code, is_active: true }), false)
  }
  assert.equal(allowed(null, null), false)

  const { translations } = loadSource('lib/i18n/translations.ts')
  let identity = { profile: { is_active: true }, role: { code: 'prsf_analyst', is_active: true }, can: () => true }
  let queryKey, fetchHistory, page = 0, nextPage
  let rpcError = null
  let calls = 0
  let queryState = { isLoading: false, isValidating: false, data: { total: 21, items: [{ id: 'loan-1', loan_request_id: 'HISTORY-ONLY', approved_amount: 0, currency: 'TJS', created_at: null }] } }
  const wrapper = ({ children }) => React.createElement('div', null, children)
  const { CreditHistoryDialog } = loadSource('components/borrowers/credit-history-dialog.tsx', {
    react: { ...React, useCallback: callback => callback, useState: () => [page, value => { nextPage = value }] },
    'next/link': { default: ({ children, href }) => React.createElement('a', { href }, children), __esModule: true },
    '@/lib/contexts/permission-context': { usePermissions: () => identity },
    '@/lib/i18n/context': { useI18n: () => ({ t: translations.en, locale: 'en' }) },
    '@/lib/hooks/use-page-query': { usePageQuery: (key, fetcher) => { queryKey = key; fetchHistory = fetcher; return queryState } },
    '@/lib/supabase/client': { createClient: () => ({ rpc: async (name, args) => {
      calls++
      assert.equal(name, 'cgf_borrower_credit_history')
      assert.equal(args.p_borrower_id, 'borrower-1')
      assert.equal(args.p_limit, 20)
      assert.equal(args.p_offset, page * 20)
      return { data: queryState.data, error: rpcError }
    } }) },
    '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription'].map(name => [name, wrapper])),
  })
  const props = { borrower: { id: 'borrower-1', name: 'History borrower' }, onClose: () => {} }
  const tree = CreditHistoryDialog(props)
  assert.equal(JSON.stringify(queryKey), JSON.stringify(['borrower-credit-history', 'borrower-1', 0]))
  assert.equal(await fetchHistory(), queryState.data)
  assert.match(renderToStaticMarkup(tree), /HISTORY-ONLY/)
  assert.match(renderToStaticMarkup(tree), /0 TJS/)
  function findNext(node) {
    if (!React.isValidElement(node)) return
    if (node.props.children === 'Next') return node
    for (const child of React.Children.toArray(node.props.children)) {
      const found = findNext(child)
      if (found) return found
    }
  }
  findNext(tree).props.onClick()
  assert.equal(nextPage, 1)
  page = 1
  CreditHistoryDialog(props)
  assert.equal(queryKey[2], 1)
  await fetchHistory()
  rpcError = new Error('Access revoked')
  await assert.rejects(fetchHistory, /Access revoked/)
  queryState = { ...queryState, error: rpcError }
  assert.doesNotMatch(renderToStaticMarkup(CreditHistoryDialog(props)), /HISTORY-ONLY/)
  queryState = { ...queryState, error: null, isLoading: true }
  assert.doesNotMatch(renderToStaticMarkup(CreditHistoryDialog(props)), /HISTORY-ONLY/)
  queryState = { ...queryState, isLoading: false }
  identity = { ...identity, can: () => false }
  const readOnlyHistory = renderToStaticMarkup(CreditHistoryDialog(props))
  assert.match(readOnlyHistory, /HISTORY-ONLY/)
  assert.doesNotMatch(readOnlyHistory, /href=/)
  const previousCalls = calls
  identity = { ...identity, role: { code: 'bank_officer', is_active: true } }
  assert.equal(CreditHistoryDialog(props), null)
  assert.equal(queryKey, null)
  assert.equal(calls, previousCalls)
  console.log('Borrower history checks passed: fund roles, disabled actors, scoped pagination, zero amount, loading/error hiding, direct RPC failure and bank denial')
}

{
  const filename = 'app/dashboard/page.tsx'
  const source = ts.createSourceFile(filename, readFileSync(resolve(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const formatter = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'formatTimeSince')
  assert.ok(formatter, 'Activity formatter must be module-scoped, not captured from a later render declaration')
  const now = Date.parse('2026-10-25T12:00:00Z')
  class FixedDate extends Date {
    static now() { return now }
  }
  const compiled = ts.transpileModule(formatter.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const format = runInNewContext(`${compiled}\nformatTimeSince`, { Date: FixedDate })
  for (const [elapsed, label] of [
    [0, '0m ago'], [59999, '0m ago'], [60000, '1m ago'],
    [3599999, '59m ago'], [3600000, '1h ago'],
    [86399999, '23h ago'], [86400000, '1d ago'], [172800000, '2d ago'],
    [-60000, '-1m ago'],
  ]) assert.equal(format(new Date(now - elapsed).toISOString()), label)
  assert.equal(format('invalid-date'), 'NaNd ago')
  console.log('Dashboard activity formatter checks passed: minute/hour/day boundaries and existing future/invalid-date behavior')
}

{
  const filename = 'app/auth/login/page.tsx'
  const source = ts.createSourceFile(filename, readFileSync(resolve(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let loginHandler
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleLogin') loginHandler = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(loginHandler, 'Login submission handler must exist')
  const compiled = ts.transpileModule(`const ${loginHandler.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const email = 'login-regression@example.invalid'
  const password = 'test-only-not-a-real-password'
  for (const scenario of ['success', 'credentials', 'unexpected']) {
    const events = []
    const submit = runInNewContext(`${compiled}\nhandleLogin`, {
      email,
      password,
      Error,
      createClient: () => ({
        auth: {
          signInWithPassword: async input => {
            assert.equal(input.email, email)
            assert.equal(input.password, password)
            events.push('authenticate')
            if (scenario === 'unexpected') throw new Error('Service unavailable')
            return { error: scenario === 'credentials' ? new Error('Invalid login credentials') : null }
          },
        },
      }),
      setIsLoading: value => events.push(['loading', value]),
      setError: value => events.push(['error', value]),
      router: {
        push: path => events.push(['navigate', path]),
        refresh: () => events.push('refresh'),
      },
    })
    await submit({ preventDefault: () => events.push('preventDefault') })
    assert.deepEqual(events, [
      'preventDefault', ['loading', true], ['error', null], 'authenticate',
      ...(scenario === 'success'
        ? [['navigate', '/dashboard'], 'refresh']
        : [['error', scenario === 'credentials' ? 'Incorrect email or password. Please try again.' : 'Service unavailable']]),
      ['loading', false],
    ], `Login ${scenario}: authenticate before navigation, refresh only on success, and clear loading`)
  }
  console.log('Login handler checks passed: successful navigation/refresh, credential errors and rejected auth requests')
}

{
  const filename = 'app/dashboard/guarantee-reports/[id]/page.tsx'
  const source = ts.createSourceFile(filename, readFileSync(resolve(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let actionHandler
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'takeAction') actionHandler = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(actionHandler, 'Report action handler must exist')
  const compiled = ts.transpileModule(`const ${actionHandler.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText
  const now = '2026-10-25T12:00:00.000Z'
  class FixedDate extends Date {
    constructor() { super(now) }
  }
  const outcomes = { approve: 'approved', reject: 'rejected', revision_requested: 'revision_requested', submitted: 'submitted' }
  const titles = { approve: 'Report approved', reject: 'Report rejected', revision_requested: 'Revision requested', submitted: 'Report submitted' }
  for (const action of Object.keys(outcomes)) {
    for (const scenario of ['success', 'returned-error', 'zero-rows', 'wrong-id', 'wrong-status', 'network', 'refresh', 'busy', 'missing-report']) {
      const events = []
      const notifications = []
      const report = { id: 'report-1', status: action === 'submitted' ? 'draft' : 'submitted', submission_date: '2026-10-01T00:00:00.000Z' }
      const query = {
        update: payload => {
          events.push('update')
          assert.equal(payload.status, outcomes[action])
          assert.equal(payload.review_notes, 'Keep these notes')
          assert.equal(payload.review_date, action === 'submitted' ? null : now)
          assert.equal(payload.submission_date, action === 'submitted' ? now : report.submission_date)
          return query
        },
        eq: (column, value) => { events.push([column, value]); return query },
        select: columns => { assert.equal(columns, 'id, status'); return query },
        single: async () => {
          events.push('confirm')
          if (scenario === 'network') throw new Error('Network unavailable')
          return {
            data: scenario === 'zero-rows' ? null : { id: scenario === 'wrong-id' ? 'other-report' : report.id, status: scenario === 'wrong-status' ? 'draft' : outcomes[action] },
            error: scenario === 'returned-error' ? { message: 'Database details must not be exposed' } : null,
          }
        },
      }
      const submit = runInNewContext(`${compiled}\ntakeAction`, {
        id: report.id,
        report: scenario === 'missing-report' ? null : report,
        actionLoading: scenario === 'busy',
        reviewNotes: 'Keep these notes',
        Date: FixedDate,
        Error,
        supabase: { from: table => { assert.equal(table, 'guarantee_reports'); return query } },
        setActionLoading: value => events.push(['loading', value]),
        toast: notification => { notifications.push(notification); events.push(notification.title) },
        fetchReport: async () => {
          events.push('refresh')
          if (scenario === 'refresh') throw new Error('Refresh unavailable')
        },
      })
      await submit(action)
      if (scenario === 'busy' || scenario === 'missing-report') {
        assert.deepEqual(events, [])
        continue
      }
      const confirmed = scenario === 'success' || scenario === 'refresh'
      assert.deepEqual(events, [
        ['loading', true], 'update', ['id', report.id], ['status', report.status], 'confirm',
        ...(confirmed ? [titles[action], 'refresh', ...(scenario === 'refresh' ? ['Report saved, but refresh failed'] : [])] : ['Action failed']),
        ['loading', false],
      ], `${action}/${scenario}: confirm the exact row and status before success or refresh`)
      assert.equal(notifications[0].variant, confirmed ? undefined : 'destructive')
      if (scenario === 'refresh') assert.equal(notifications[1].variant, 'destructive')
      assert.doesNotMatch(JSON.stringify(notifications), /Database details/)
    }
  }
  console.log('Report action checks passed: four actions, returned errors, zero rows, mismatched confirmations, rejected requests, refresh failures and pending/missing-report guards')
}

{
  const filename = 'app/dashboard/claims/page.tsx'
  const source = ts.createSourceFile(filename, readFileSync(resolve(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleSubmitNewClaim') handler = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(handler)
  const compiled = ts.transpileModule(`const ${handler.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const scenario of ['success', 'authority', 'cancelled', 'missing', 'negative', 'nan', 'zero', 'no-bank', 'returned-error', 'network', 'no-confirmation', 'refresh']) {
    const events = []
    const messages = []
    const query = {
      insert: payload => {
        events.push('insert')
        assert.equal(payload.loan_id, 'loan-1')
        assert.equal(payload.loan_application_id, 'loan-1')
        assert.equal(payload.bank_id, 'bank-1')
        assert.equal(payload.claim_amount, 125)
        assert.equal(payload.principal_claimed, 100)
        assert.equal(payload.interest_claimed, 25)
        assert.equal(payload.penalties_claimed, 0)
        assert.equal(payload.submitted_by, undefined)
        assert.equal(payload.reason, scenario === 'authority' ? 'Approved administrator authority' : undefined)
        return query
      },
      select: columns => { assert.equal(columns, 'id'); return query },
      single: async () => {
        if (scenario === 'network') throw new Error('Network unavailable')
        return { data: scenario === 'no-confirmation' ? null : { id: 'claim-1' }, error: scenario === 'returned-error' ? { code: '42501' } : null }
      },
    }
    const submit = runInNewContext(`${compiled}\nhandleSubmitNewClaim`, {
      Number, Math, Date, Error,
      createReq: { missingFields: () => scenario === 'missing' ? ['Loan'] : [] },
      requestAuthorityReason: async () => { if (scenario === 'cancelled') throw new Error('Action cancelled'); return scenario === 'authority' ? 'Approved administrator authority' : null },
      newClaimValues: {}, newLoanId: 'loan-1', newClaimDate: '2026-10-25',
      newPrincipal: scenario === 'negative' ? '-100' : scenario === 'nan' ? '100suffix' : scenario === 'zero' ? '0' : '100',
      newInterest: scenario === 'zero' ? '0' : '25', newPenalties: '0',
      loans: scenario === 'no-bank' ? [] : [{ id: 'loan-1', bank_id: 'bank-1' }],
      missingFieldsMessage: () => 'Missing fields',
      getDatabaseErrorMessage: () => 'Submission failed',
      showMessage: (type, message) => messages.push([type, message]),
      supabase: { from: table => { assert.equal(table, 'claims', 'No split loan or audit writes'); return query } },
      setSaving: value => events.push(['saving', value]),
      setNewOpen: value => events.push(['dialog', value]),
      setNewLoanId: () => {}, setNewClaimDate: () => {}, setNewPrincipal: () => {}, setNewInterest: () => {}, setNewPenalties: () => {},
      fetchClaims: async () => { events.push('refresh'); if (scenario === 'refresh') throw new Error('Refresh unavailable') },
    })
    await submit()
    const validationFailed = ['missing', 'negative', 'nan', 'zero', 'no-bank'].includes(scenario)
    const confirmed = ['success', 'authority', 'refresh'].includes(scenario)
    assert.deepEqual(events, validationFailed ? [] : [
      ['saving', true], ...(scenario === 'cancelled' ? [] : ['insert']), ...(confirmed ? [['dialog', false], 'refresh'] : []), ['saving', false],
    ], scenario)
    assert.equal(messages[0][0], confirmed ? 'success' : 'error', scenario)
    if (scenario === 'refresh') assert.match(messages[1][1], /do not resubmit/)
  }
  console.log('Claim submission handler checks passed: single confirmed write, numeric validation, failures, refresh warning and loading cleanup')
}

{
  const { buildGuaranteeReportRows: build } = loadSource('lib/utils/guarantee-report-input.ts')
  const emptyLoan = { _key: 'row-1', loan_request_number: '', customer_name: '', customer_code: '', tin_number: '', sector: '', currency: 'TJS', approved_amount: '', disbursed_amount: '', outstanding_principal: '', interest_rate: '', loan_term_months: '', disbursement_date: '', maturity_date: '', guarantee_coverage: '50', guarantee_amount: '', loan_status: 'active', days_overdue: '0' }
  const loan = { ...emptyLoan, loan_request_number: 'R-1', customer_name: 'Test', approved_amount: '0', disbursed_amount: '0', guarantee_coverage: '0' }
  assert.equal(build([emptyLoan], []).loans.length, 0)
  const normalized = build([loan], []).loans[0]
  assert.equal(normalized.disbursed_amount, 0)
  assert.equal(normalized.guarantee_coverage, 0)
  assert.equal(normalized.interest_rate, null)
  assert.equal(normalized._key, undefined)
  for (const patch of [{ approved_amount: '-1' }, { approved_amount: '10suffix' }, { approved_amount: 'Infinity' }, { guarantee_coverage: '101' }, { loan_term_months: '1.5' }, { disbursement_date: '2026-02-30' }, { currency: '' }, { customer_name: '' }]) assert.throws(() => build([{ ...loan, ...patch }], []))
  assert.throws(() => build([{ ...emptyLoan, guarantee_coverage: '0' }], []), 'A partial row must not be silently dropped')
  assert.throws(() => build([], [{ loan_number: 'R-1', payment_date: '', installment_number: '', principal_amount: '', interest_amount: '', total_amount: '', remaining_balance: '' }]))
  assert.throws(() => build(Array(1001).fill(loan), []))

  const filename = 'app/dashboard/guarantee-reports/new/page.tsx'
  const source = ts.createSourceFile(filename, readFileSync(resolve(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let handler
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleSave') handler = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(handler)
  const compiled = ts.transpileModule(`const ${handler.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const submitNow of [false, true]) for (const scenario of ['success', 'missing', 'invalid', 'returned-error', 'network', 'wrong-id', 'pending']) {
    const events = [], notices = []
    const lock = { current: scenario === 'pending' }
    const identity = { current: null }
    const save = runInNewContext(`${compiled}\nhandleSave`, {
      reportReq: { missingFields: () => scenario === 'missing' ? ['Bank'] : [] }, missingFieldsMessage: () => 'Missing fields',
      bankId: 'bank-1', reportMonth: '2026-10', reportType: 'monthly', loans: [loan], payments: [],
      buildGuaranteeReportRows: (...args) => { if (scenario === 'invalid') throw new Error('Invalid'); return build(...args) },
      saveInFlight: lock, reportId: identity, crypto: { randomUUID: () => 'report-1' },
      setSaving: value => events.push(['saving', value]), toast: value => notices.push(value),
      router: { push: value => events.push(['navigate', value]) },
      supabase: { rpc: async (name, args) => {
        events.push('rpc'); assert.equal(name, 'cgf_create_guarantee_report'); assert.equal(args.p_id, 'report-1'); assert.equal(args.p_submit, submitNow); assert.equal(args.p_month, '2026-10-01'); assert.equal(args.p_loans[0].guarantee_coverage, 0)
        if (scenario === 'network') throw new Error('Network')
        return { data: scenario === 'wrong-id' ? 'other' : 'report-1', error: scenario === 'returned-error' ? { code: '42501' } : null }
      } },
    })
    await save(submitNow)
    if (scenario === 'missing' || scenario === 'pending') { assert.equal(events.length, 0); continue }
    assert.equal(lock.current, false)
    assert.deepEqual(events, [['saving', true], ...(scenario === 'invalid' ? [] : ['rpc']), ...(scenario === 'success' ? [['navigate', '/dashboard/guarantee-reports/report-1']] : []), ['saving', false]])
    assert.equal(notices[0].variant, scenario === 'success' ? undefined : 'destructive')
  }
  console.log('Atomic report client checks passed: one RPC, exact confirmation, draft/submit, zero/null values, partial/invalid row rejection, request failure and in-flight guard')
}

{
  const filename = 'app/dashboard/guarantee-reports/actions.ts'
  const source = ts.createSourceFile(filename, readFileSync(resolve(root, filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const handler = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'deleteGuaranteeReport')
  assert.ok(handler)
  const compiled = ts.transpileModule(handler.getText(source).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const scenario of ['success', 'zero-rows', 'wrong-id', 'returned-error', 'network']) {
    const events = []
    const query = {
      delete: () => query,
      eq: (column, value) => { assert.equal(column, 'id'); assert.equal(value, 'report-1'); return query },
      select: columns => { assert.equal(columns, 'id'); return query },
      single: async () => {
        if (scenario === 'network') throw new Error('Network unavailable')
        return { data: scenario === 'zero-rows' ? null : { id: scenario === 'wrong-id' ? 'other-report' : 'report-1' }, error: scenario === 'returned-error' ? { message: 'Denied' } : null }
      },
    }
    const remove = runInNewContext(`${compiled}\ndeleteGuaranteeReport`, {
      Error, console: { error: () => {} },
      createClient: async () => ({ from: table => { assert.equal(table, 'guarantee_reports'); return query } }),
      revalidatePath: path => events.push(path),
    })
    if (scenario === 'success') {
      assert.equal((await remove('report-1')).success, true)
      assert.deepEqual(events, ['/dashboard/guarantee-reports'])
    } else {
      await assert.rejects(() => remove('report-1'))
      assert.deepEqual(events, [])
    }
  }
  console.log('Report delete checks passed: exact returned ID required; denied, zero-row and network failures never report success')
}

const navigationSource = ts.createSourceFile(
  'dashboard-shell.tsx',
  readFileSync(resolve(root, 'components/dashboard/dashboard-shell.tsx'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
let navigationItems
for (const statement of navigationSource.statements) {
  if (!ts.isVariableStatement(statement)) continue
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.name.getText(navigationSource) === 'navItems') navigationItems = declaration.initializer
  }
}
assert.ok(navigationItems && ts.isArrayLiteralExpression(navigationItems))
const navigation = navigationItems.elements.map(item => {
  assert.ok(ts.isObjectLiteralExpression(item))
  return Object.fromEntries(item.properties.map(property => {
    assert.ok(ts.isPropertyAssignment(property))
    const value = property.initializer
    return [property.name.getText(navigationSource), ts.isStringLiteral(value) ? value.text : value.getText(navigationSource)]
  }))
})
const { translations: navigationTranslations } = loadSource('lib/i18n/translations.ts')
assert.equal(navigation.length, 19)
assert.equal(new Set(navigation.map(item => item.href)).size, navigation.length)
for (const locale of ['en', 'ru', 'tj']) {
  for (const item of navigation) {
    const label = navigationTranslations[locale].nav[item.titleKey]
    assert.equal(typeof label, 'string', `${locale}: missing navigation label ${item.titleKey}`)
    assert.ok(label.trim(), `${locale}: empty navigation label ${item.titleKey}`)
  }
}
assert.deepEqual(navigation.filter(item => item.adminOnly === 'true').map(item => item.titleKey), ['roles', 'columnConfig', 'formRequirements', 'settings'])
assert.deepEqual(navigation.filter(item => item.prsfOnly === 'true').map(item => item.titleKey), ['committee', 'reconciliation', 'recoveries'])
assert.equal(navigation.find(item => item.titleKey === 'roles').resource, 'roles')
console.log('Navigation contract checks passed: 19 unique routes, all three locales, admin-only and PRSF-only flags')

{
let permissionGranted = false
const permissionWrappers = loadSource('lib/contexts/permission-context.tsx', {
  react: { ...React, useContext: () => ({ can: () => permissionGranted }) },
  '@/lib/utils/permissions': {},
})
let clickCount = 0
const permittedControl = React.createElement('button', { onClick: () => { clickCount++ } }, 'Protected action')
const protectedProps = { resource: 'loans', permission: 'update', children: permittedControl }
assert.equal(permissionWrappers.CanAccessOrDisable({ ...protectedProps, mode: 'hide' }), null)
const denied = permissionWrappers.CanAccessOrDisable(protectedProps)
assert.equal(denied.type, 'span')
assert.equal(denied.props['aria-disabled'], 'true')
assert.equal(denied.props.title, 'You do not have permission for this action')
const disabledControl = React.Children.toArray(denied.props.children)[0]
assert.equal(disabledControl.props.disabled, true)
assert.equal(disabledControl.props['aria-disabled'], true)
let prevented = false
disabledControl.props.onClick({ preventDefault: () => { prevented = true } })
assert.equal(prevented, true)
assert.equal(clickCount, 0)
assert.equal(permissionWrappers.CanAccessOrDisable({ ...protectedProps, disabledTooltip: 'Read only' }).props.title, 'Read only')
const mixedChildren = permissionWrappers.CanAccessOrDisable({ ...protectedProps, children: ['Text', null, permittedControl] })
assert.equal(React.Children.toArray(mixedChildren.props.children)[0], 'Text')
assert.match(renderToStaticMarkup(denied), /disabled=""/)
assert.equal(renderToStaticMarkup(permissionWrappers.CanAccess({ ...protectedProps, fallback: 'Unavailable' })), 'Unavailable')
permissionGranted = true
for (const mode of ['hide', 'disable']) {
  const allowed = permissionWrappers.CanAccessOrDisable({ ...protectedProps, mode })
  assert.equal(allowed.props.children, permittedControl)
}
assert.equal(permissionWrappers.CanAccess(protectedProps).props.children, permittedControl)
permittedControl.props.onClick()
assert.equal(clickCount, 1)
console.log('Permission wrapper checks passed: denial, hiding, disabled props, click prevention, fallback, mixed children and allowed identity')
}

{
  const columns = [
    { column_key: 'amount', display_name_en: 'Amount', input_type: 'currency', min_value: 0, max_value: 100, is_required: true },
    { column_key: 'email', validation_type: 'email' },
    { column_key: 'phone', validation_type: 'phone' },
    { column_key: 'tin', validation_type: 'tin' },
    { column_key: 'percent', display_name_en: 'Coverage', validation_type: 'percentage' },
    { column_key: 'code', display_name_en: 'Code', min_length: 2, max_length: 4, regex_pattern: '^[A-Z]+$' },
    { column_key: 'invalidRegex', regex_pattern: '[' },
    { column_key: 'system', display_name_en: 'System', is_system_required: true },
    { column_key: 'hidden', is_required: true, is_visible_in_form: false },
  ].map(column => ({ field_group: 'loan', is_visible_in_form: true, ...column }))
  let context
  const columnModule = loadSource('lib/contexts/column-config-context.tsx', {
    '@/lib/supabase/client': { createClient() { throw new Error('Validation checks must not query the database') } },
    '@/lib/hooks/use-page-query': { usePageQuery: () => ({ data: columns, isLoading: false, isValidating: false, mutate: async () => columns }) },
    react: {
      ...React,
      useEffect: () => {},
      useCallback: callback => callback,
      useMemo: factory => factory(),
      useContext: () => context,
    },
  })
  context = columnModule.ColumnConfigProvider({ children: null }).props.value
  const { validateField, validateForm } = columnModule.useColumnValidation()
  const valid = (key, value) => assert.equal(validateField(key, value).valid, true, `${key}: ${String(value)}`)
  const invalid = (key, value, error) => {
    const result = validateField(key, value)
    assert.equal(result.valid, false, `${key}: ${String(value)}`)
    if (error) assert.equal(result.error, error)
  }
  valid('missing', undefined)
  for (const empty of [null, undefined, '']) {
    invalid('amount', empty, 'Amount is required')
    invalid('system', empty, 'System is required')
    valid('email', empty)
  }
  for (const value of [0, '0', 100, '100', '12.5', '12.5suffix', [12]]) valid('amount', value)
  invalid('amount', -1, 'Amount must be at least 0')
  invalid('amount', 101, 'Amount cannot exceed 100')
  for (const value of ['bad', false, {}, []]) invalid('amount', value, 'Amount must be a valid number')
  valid('email', 'person@domain.test')
  invalid('email', 'person@domain', 'Please enter a valid email address')
  valid('phone', '+123456789')
  invalid('phone', 'abc', 'Please enter a valid phone number')
  valid('tin', '123-456-789')
  valid('tin', 123456789)
  invalid('tin', '123', 'TIN must be exactly 9 digits')
  for (const value of [0, '100', 50.5]) valid('percent', value)
  for (const value of [-1, 101, 'bad']) invalid('percent', value, 'Coverage must be between 0 and 100')
  valid('code', 'AB')
  invalid('code', 'A', 'Code must be at least 2 characters')
  invalid('code', 'ABCDE', 'Code cannot exceed 4 characters')
  invalid('code', 'ab', 'Code format is invalid')
  valid('invalidRegex', 'anything')
  const invalidForm = validateForm({ amount: '', system: null, email: 'invalid' })
  assert.equal(invalidForm.isValid, false)
  assert.deepEqual(Object.keys(invalidForm.errors).sort(), ['amount', 'email', 'system'])
  assert.equal(validateForm({ amount: 0, system: false }).isValid, true)
  const grouped = columnModule.useGroupedValidation()
  const missing = grouped.getMissingFieldsByGroup({ amount: '', system: undefined, email: 'invalid' })
  assert.deepEqual(Array.from(missing.loan, field => field.field), ['amount', 'system'])
  assert.deepEqual(Array.from(grouped.getRequiredFieldsForGroup('loan'), column => column.column_key), ['amount', 'system'])
  assert.equal(Object.values(missing).flat().length, 2)
  console.log('Column validation checks passed: required/optional values, numeric bounds/coercion, formats, lengths, regex and grouped errors')
}

{
  let identity = { user: { id: 'user-a' }, role: { id: 'role-a' } }
  const requests = []
  const response = { data: 'cached', mutate: async () => 'refreshed' }
  const { usePageQuery: queryHarness } = loadSource('lib/hooks/use-page-query.ts', {
    '@/lib/contexts/permission-context': { usePermissions: () => identity },
    swr: (key, fetcher, options) => { requests.push({ key, fetcher, options }); return response },
  })
  const fetcher = async () => ['record']
  assert.equal(queryHarness(['loans', 0, 'active'], fetcher), response)
  assert.deepEqual(Array.from(requests[0].key), ['dashboard', 'user-a', 'role-a', 'loans', 0, 'active'])
  assert.equal(requests[0].fetcher, fetcher)
  assert.equal(requests[0].options.revalidateOnFocus, false)
  assert.equal(requests[0].options.shouldRetryOnError, false)
  queryHarness(['loans', 1, 'active'], fetcher)
  identity = { ...identity, user: { id: 'user-b' } }
  queryHarness(['loans', 0, 'active'], fetcher)
  identity = { ...identity, role: { id: 'role-b' } }
  queryHarness(['loans', 0, 'active'], fetcher)
  assert.equal(new Set(requests.map(request => JSON.stringify(request.key))).size, 4)
  queryHarness(null, fetcher)
  assert.equal(requests.at(-1).key, null)
  assert.equal(await response.mutate(), 'refreshed')
  console.log('Dashboard query contract checks passed: user/role isolation, filter/page keys, disabled queries and refresh forwarding')
}

{
  let loadedRole = 'role-a'
  let observedOverrides
  let refreshes = 0
  const storedOverrides = { loans: { can_view: true } }
  const provider = loadSource('lib/contexts/permission-context.tsx', {
    react: { ...React, useCallback: callback => callback },
    swr: key => ({
      data: key[2] === loadedRole ? storedOverrides : undefined,
      isLoading: key[2] !== loadedRole,
      isValidating: false,
      mutate: async () => { refreshes++ },
    }),
    '@/lib/utils/permissions': {
      hasPermission: (_role, _resource, _permission, overrides) => { observedOverrides = overrides; return true },
      getResourcePermissions: () => null,
    },
  })
  const valueFor = roleId => provider.PermissionProvider({ user: { id: 'user-a' }, role: { id: roleId }, children: null }).props.value
  const loaded = valueFor('role-a')
  loaded.can('loans', 'view')
  assert.equal(observedOverrides, storedOverrides)
  assert.equal(loaded.permissionsLoading, false)
  const changed = valueFor('role-b')
  changed.can('loans', 'view')
  assert.equal(observedOverrides, null, 'A different role must never inherit the previous role overrides')
  assert.equal(changed.permissionsLoading, true)
  loadedRole = 'role-b'
  assert.equal(valueFor('role-b').permissionsLoading, false)
  await changed.refreshPermissions()
  assert.equal(refreshes, 1)
  console.log('Permission loader contract checks passed: loaded overrides, role-change isolation, loading fallback and awaited refresh')
}

function sourceTree(relativePath) {
  return ts.createSourceFile(relativePath, readFileSync(resolve(root, relativePath), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function findNode(source, predicate) {
  let result
  function visit(node) {
    if (result) return
    if (predicate(node)) result = node
    else ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(result, `Expected source node in ${source.fileName}`)
  return result
}

function sourceExpression(relativePath, name, bindings) {
  const source = sourceTree(relativePath)
  const declaration = findNode(source, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
  const compiled = ts.transpileModule(`const result = ${declaration.initializer.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return runInNewContext(`${compiled}\nresult`, { ...bindings })
}

function pageFetcher(relativePath, keyName, bindings) {
  const source = sourceTree(relativePath)
  const call = findNode(source, node => {
    if (!ts.isCallExpression(node) || node.expression.getText(source) !== 'usePageQuery') return false
    let matches = false
    function visitKey(child) {
      if (ts.isStringLiteral(child) && child.text === keyName) matches = true
      ts.forEachChild(child, visitKey)
    }
    visitKey(node.arguments[0])
    return matches
  })
  const compiled = ts.transpileModule(`const fetcher = ${call.arguments[1].getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return runInNewContext(`${compiled}\nfetcher`, bindings)
}

function queryFixture(data, error = null) {
  const operations = []
  const query = { then: (fulfilled, rejected) => Promise.resolve({ data, error }).then(fulfilled, rejected) }
  for (const method of ['select', 'order', 'eq', 'in', 'limit', 'range']) {
    query[method] = (...args) => { operations.push([method, ...args]); return query }
  }
  return { client: { from: table => { operations.push(['from', table]); return query } }, operations }
}

{
  const { one } = loadSource('lib/utils/supabase-relation.ts')
  for (const relation of [
    { loan_number: 'L-1', bank: { name_en: 'Bank' }, borrower: { name: 'Borrower' } },
    [{ loan_number: 'L-1', bank: [{ name_en: 'Bank' }], borrower: [{ name: 'Borrower' }] }],
    null,
    [],
  ]) {
    const fixture = queryFixture([{ id: 'fee-1', loan_application: relation }])
    const fetcher = pageFetcher('app/dashboard/fees/page.tsx', 'fees', { supabase: fixture.client, one })
    const rows = await fetcher()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 'fee-1')
    if (relation && !Array.isArray(relation) || Array.isArray(relation) && relation.length) {
      assert.equal(rows[0].loan_application.borrower.name, 'Borrower')
      assert.equal(rows[0].loan_application.bank.name_en, 'Bank')
    } else assert.equal(rows[0].loan_application, null)
    assert.equal(fixture.operations[0][1], 'fees')
  }
  const failure = queryFixture(null, new Error('Unavailable'))
  await assert.rejects(pageFetcher('app/dashboard/fees/page.tsx', 'fees', { supabase: failure.client, one })(), /Unavailable/)

  const fixture = queryFixture([{ id: 'recovery-1', claims: [{ claim_number: 'C-1', bank_id: 'bank-a', banks: [{ name_en: 'Bank', code: 'A' }], loan_applications: [{ loan_number: 'L-1' }] }] }])
  const recoveries = await pageFetcher('app/dashboard/recoveries/page.tsx', 'recoveries', { supabase: fixture.client, one })()
  assert.equal(recoveries[0].claims.bank_id, 'bank-a')
  assert.equal(recoveries[0].claims.banks.name_en, 'Bank')
  assert.equal(recoveries[0].claims.loan_applications.loan_number, 'L-1')
  assert.match(fixture.operations.find(operation => operation[0] === 'select')[1], /claim_amount, bank_id/)
  const filter = (bankFilter, search = '', methodFilter = 'all') => sourceExpression('app/dashboard/recoveries/page.tsx', 'filtered', { recoveries, bankFilter, search, methodFilter })
  assert.equal(filter('all').length, 1)
  assert.equal(filter('bank-a').length, 1)
  assert.equal(filter('bank-b').length, 0)
  assert.equal(filter('all', 'c-1').length, 1)
  assert.equal(filter('all', 'missing').length, 0)
  assert.equal(filter('all', '', 'cash').length, 0)
  const empty = queryFixture([{ id: 'recovery-2', claims: [] }])
  const emptyRows = await pageFetcher('app/dashboard/recoveries/page.tsx', 'recoveries', { supabase: empty.client, one })()
  assert.equal(emptyRows[0].claims, undefined)
  console.log('Financial query regressions passed: object/array/null joins, nested normalization, query errors and recovery bank/search/method filtering')
}

{
  const form = 'components/workflow/application-form.tsx'
  const identity = { isIndividualEntrepreneur: true, legalRepSurname: '  Family ', legalRepName: ' Given ', legalRepPatronymic: ' ', companyName: 'Company', clientTin: '123456789', representativeTin: '987654321' }
  assert.equal(sourceExpression(form, 'clientName', identity), 'Family Given')
  assert.equal(sourceExpression(form, 'legalRepTin', identity), '123456789')
  assert.equal(sourceExpression(form, 'clientName', { ...identity, isIndividualEntrepreneur: false }), 'Company')
  assert.equal(sourceExpression(form, 'legalRepTin', { ...identity, isIndividualEntrepreneur: false }), '987654321')
  assert.equal(sourceExpression(form, 'clientName', { ...identity, legalRepSurname: '', legalRepName: '', legalRepPatronymic: '' }), '')
  for (const [coverageOverride, product, expected] of [[undefined, undefined, ''], [undefined, { guarantee_coverage: 50 }, '50'], ['', { guarantee_coverage: 50 }, ''], ['0', { guarantee_coverage: 50 }, '0']]) {
    assert.equal(sourceExpression(form, 'guaranteeCoverage', { coverageOverride, product }), expected)
  }
  const source = sourceTree(form)
  const restoreCall = findNode(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'restoreDraft').initializer
  const compiledRestore = ts.transpileModule(`const restore = ${restoreCall.arguments[0].getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const formDeclaration = findNode(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'formData')
  const fields = formDeclaration.initializer.arguments[0].body.expression.properties.map(property => property.name.text)
  const restored = {}
  const bindings = { setActiveTab: value => { restored.step = value }, setDraftMessage: () => {} }
  function bindState(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(source) === 'useState') {
      const [state, setter] = node.name.elements
      if (state?.name && setter?.name) bindings[setter.name.text] = value => { restored[state.name.text] = value }
    }
    ts.forEachChild(node, bindState)
  }
  bindState(source)
  const restore = runInNewContext(`${compiledRestore}\nrestore`, bindings)
  const aliases = { clientName: 'companyName', legalRepTin: 'representativeTin', guaranteeCoverage: 'coverageOverride' }
  const saved = Object.fromEntries(fields.map(field => [field, field === 'isBlacklisted' ? true : field === 'guarantors' ? [{ name: 'Guarantor', id_number: 'QA', relationship: 'Owner' }] : `saved-${field}`]))
  restore({ form_data: saved, current_step: 'collateral', draft_name: 'Regression' })
  for (const field of fields) assert.deepEqual(restored[aliases[field] ?? field], saved[field], `Draft must restore ${field}`)
  assert.equal(restored.activeTab, 'collateral')
  const cleared = { ...saved, isBlacklisted: false, gracePeriod: '0', guaranteeCoverage: '', bankCustomerCode: '', establishmentYear: '', guarantors: [] }
  restore({ form_data: cleared, current_step: 'borrower', draft_name: 'Regression' })
  for (const field of fields) assert.deepEqual(restored[aliases[field] ?? field], cleared[field], `Draft must preserve cleared/zero ${field}`)
  restore({ form_data: {}, current_step: 'borrower', draft_name: 'Legacy' })
  assert.equal(restored.currency, 'TJS')
  assert.equal(restored.isBlacklisted, false)
  assert.equal(restored.legalRepCountry, 'Tajikistan')
  assert.equal(restored.frequency, 'monthly')
  assert.equal(restored.coverageOverride, undefined)
  console.log(`Draft restoration checks passed: all ${fields.length} saved fields, cleared values, false, zero, step and legacy defaults`)
  const { loadDocumentRows } = loadSource('lib/utils/document-data.ts')
  const unavailable = queryFixture(null, new Error('Live data unavailable'))
  const fetcher = pageFetcher('app/dashboard/documents/page.tsx', 'document-preview', { supabase: unavailable.client, template: { dataSource: 'loan_applications' }, loadDocumentRows })
  await assert.rejects(fetcher(), /Live data unavailable/)
  const unsupported = pageFetcher('app/dashboard/documents/page.tsx', 'document-preview', { supabase: unavailable.client, template: { dataSource: 'unsupported' }, loadDocumentRows })
  await assert.rejects(unsupported(), /not supported/)
  console.log('Form/report regressions passed: derived sole-proprietor identity, separate company identity, explicit coverage overrides and no synthetic rows on live-query failure')
}

{
  let queryState = { data: [{ loan_number: 'VISIBLE-ROW', approved_amount: 10, currency: 'USD' }], isLoading: false, isValidating: false }
  let hideColumns = false, search = '', exports = 0
  let interfaceLocale = 'en', downloadLocale = null, exportedLocale, exportedTemplate
  const DocumentsPage = loadSource('app/dashboard/documents/page.tsx', {
    react: { ...React, useCallback: callback => callback, useMemo: factory => factory(), useState: initial => [
      typeof initial === 'object' && initial?.columns && hideColumns ? { ...initial, columns: initial.columns.map(column => ({ ...column, visible: false })) }
        : initial === '' ? search : initial === null ? downloadLocale : initial,
      value => { if (initial === null) downloadLocale = value },
    ] },
    '@/lib/i18n/context': { useI18n: () => ({ locale: interfaceLocale }) },
    '@/lib/hooks/use-page-query': { usePageQuery: () => ({ ...queryState, mutate: async () => {} }) },
    '@/lib/supabase/client': { createClient: () => ({}) },
    '@/hooks/use-toast': { useToast: () => ({ toast: () => {} }) },
    '@/lib/utils/document-engine': { ...loadSource('lib/utils/document-engine.ts'), runExport: async (template, _format, _rows, _search, locale) => { exports++; exportedLocale = locale; exportedTemplate = template } },
  }).default
  function exportButtons(node, result = []) {
    if (!React.isValidElement(node)) return result
    if (node.props.onClick?.name === 'handleExport') result.push(node)
    for (const child of React.Children.toArray(node.props.children)) exportButtons(child, result)
    return result
  }
  for (const state of [
    { isLoading: true }, { isValidating: true }, { error: new Error('Unavailable') },
  ]) {
    queryState = { data: [{ loan_number: 'VISIBLE-ROW' }], isLoading: false, isValidating: false, ...state }
    const buttons = exportButtons(DocumentsPage())
    assert.equal(buttons.length, 2)
    for (const button of buttons) {
      assert.equal(button.props.disabled, true)
      await button.props.onClick()
    }
  }
  queryState = { data: [{ loan_number: 'VISIBLE-ROW' }], isLoading: false, isValidating: false }
  hideColumns = true
  assert.ok(exportButtons(DocumentsPage()).every(button => button.props.disabled))
  hideColumns = false
  search = 'no-match'
  assert.ok(exportButtons(DocumentsPage()).every(button => button.props.disabled))
  search = ''
  const readyButtons = exportButtons(DocumentsPage())
  assert.ok(readyButtons.every(button => !button.props.disabled))
  assert.equal(exports, 0)
  await readyButtons[0].props.onClick()
  assert.equal(exports, 1)
  function languageControl(node) {
    if (!React.isValidElement(node)) return
    if (node.props.id === 'document-language') return node
    for (const child of React.Children.toArray(node.props.children)) {
      const found = languageControl(child)
      if (found) return found
    }
  }
  const { documentText } = loadSource('lib/i18n/document-translations.ts')
  for (const language of ['en', 'ru', 'tj']) {
    interfaceLocale = language
    const page = DocumentsPage()
    assert.equal(languageControl(page).props.value, language, 'Download defaults to the interface language')
    await exportButtons(page)[0].props.onClick()
    assert.equal(exportedLocale, language)
    assert.equal(exportedTemplate.name, documentText('Loan Portfolio Report', language))
  }
  languageControl(DocumentsPage()).props.onChange({ target: { value: 'ru' } })
  interfaceLocale = 'en'
  assert.equal(languageControl(DocumentsPage()).props.value, 'ru', 'Explicit download selection is independent of interface language')
  await exportButtons(DocumentsPage())[0].props.onClick()
  assert.equal(exportedLocale, 'ru')
  console.log('Document Center controls passed: loading/error/export guards, three interface-language defaults, explicit download-language selection and localized export dispatch')
}

const testTranslations = {
  en: { common: { appName: 'English' } },
  ru: { common: { appName: 'Russian' } },
  tj: { common: { appName: 'Tajik' } },
}
const serverI18n = loadSource('lib/i18n/context.tsx', { './translations': { translations: testTranslations } })
function LanguageProbe() {
  const { locale, t } = serverI18n.useI18n()
  return React.createElement('span', null, `${locale}:${t.common.appName}`)
}
assert.equal(renderToStaticMarkup(React.createElement(serverI18n.I18nProvider, null, React.createElement(LanguageProbe))), '<span>en:English</span>')

function localeHarness(saved, { storageFails = false, loadFails = false } = {}) {
  const effects = []
  let state
  const updates = []
  const writes = []
  const translations = { ...testTranslations }
  if (loadFails) Object.defineProperty(translations, 'ru', { get() { throw new Error('Chunk unavailable') } })
  const i18n = loadSource('lib/i18n/context.tsx', {
    './translations': { translations },
    localStorage: {
      getItem(key) {
        assert.equal(key, 'cgf-locale')
        if (storageFails) throw new Error('Storage denied')
        return saved
      },
      setItem(key, value) {
        assert.equal(key, 'cgf-locale')
        if (storageFails) throw new Error('Storage denied')
        writes.push(value)
      },
    },
    react: {
      ...React,
      useState(initial) {
        state = initial
        return [initial, value => { state = value; updates.push(value) }]
      },
      useRef: current => ({ current }),
      useCallback: callback => callback,
      useEffect(callback) { effects.push(callback) },
    },
  })
  const provider = i18n.I18nProvider({ children: null })
  return { restore: () => { const cleanups = effects.map(effect => effect()); return () => { for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup() } }, setLocale: provider.props.value.setLocale, updates, writes, get state() { return state } }
}
async function settleLocales() {
  for (let turn = 0; turn < 12; turn++) await Promise.resolve()
}
for (const locale of ['en', 'ru', 'tj']) {
  const language = localeHarness(locale)
  language.restore()
  assert.equal(language.updates.length, 0)
  await settleLocales()
  assert.equal(language.state.locale, locale)
  assert.equal(language.state.t, testTranslations[locale])
  assert.deepEqual(language.writes, [])
}
for (const saved of [null, '', 'invalid', '__proto__']) {
  const language = localeHarness(saved)
  language.restore()
  await settleLocales()
  assert.equal(language.updates.length, 0)
  assert.equal(language.state.locale, 'en')
}
const restoredRace = localeHarness('ru')
restoredRace.restore()
restoredRace.setLocale('en')
await settleLocales()
assert.equal(restoredRace.updates.length, 1)
assert.equal(restoredRace.state.locale, 'en')
assert.equal(restoredRace.state.t, testTranslations.en)
assert.deepEqual(restoredRace.writes, ['en'])
const rapidSwitch = localeHarness(null)
rapidSwitch.restore()
rapidSwitch.setLocale('ru')
rapidSwitch.setLocale('tj')
await settleLocales()
assert.equal(rapidSwitch.updates.length, 1)
assert.equal(rapidSwitch.state.locale, 'tj')
assert.equal(rapidSwitch.state.t, testTranslations.tj)
assert.deepEqual(rapidSwitch.writes, ['ru', 'tj'])
const unmountedLanguage = localeHarness('ru')
const cleanupLanguage = unmountedLanguage.restore()
cleanupLanguage()
await settleLocales()
assert.equal(unmountedLanguage.updates.length, 0)
const replayedLanguage = localeHarness('ru')
replayedLanguage.restore()()
replayedLanguage.restore()
await settleLocales()
assert.equal(replayedLanguage.updates.length, 1)
assert.equal(replayedLanguage.state.locale, 'ru')
const deniedStorage = localeHarness('ru', { storageFails: true })
deniedStorage.restore()
deniedStorage.setLocale('tj')
await settleLocales()
assert.equal(deniedStorage.state.locale, 'tj')
assert.equal(deniedStorage.state.t, testTranslations.tj)
const failedLoad = localeHarness('ru', { loadFails: true })
failedLoad.restore()
await settleLocales()
assert.equal(failedLoad.updates.length, 0)
assert.equal(failedLoad.state.locale, 'en')
failedLoad.setLocale('tj')
await settleLocales()
assert.equal(failedLoad.state.locale, 'tj')
assert.equal(failedLoad.state.t, testTranslations.tj)
console.log('Locale lifecycle checks passed: SSR, restoration, invalid preferences, latest-request races, atomic translations, cleanup/replay, denied storage and chunk failure recovery')

const serverClock = loadSource('hooks/use-current-time.ts')
function ClockProbe() {
  return React.createElement('span', null, serverClock.useCurrentTime() ?? 'pending')
}
assert.equal(renderToStaticMarkup(React.createElement(ClockProbe)), '<span>pending</span>')

let clockNow = Date.UTC(2026, 9, 25, 12)
let clockStore
let timerCallback
let timersStarted = 0
let timersCleared = 0
const clock = loadSource('hooks/use-current-time.ts', {
  Date: { now: () => clockNow },
  window: {
    setInterval(callback, interval) {
      assert.equal(interval, 30_000)
      timerCallback = callback
      timersStarted++
      return 1
    },
    clearInterval(timer) { assert.equal(timer, 1); timersCleared++ },
  },
  react: {
    ...React,
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      clockStore = { subscribe, getSnapshot, getServerSnapshot }
      return getSnapshot()
    },
  },
})
assert.equal(clock.useCurrentTime(), null)
assert.equal(clockStore.getServerSnapshot(), null)
let firstTicks = 0
let secondTicks = 0
const unsubscribeFirst = clockStore.subscribe(() => { firstTicks++ })
assert.equal(clockStore.getSnapshot(), clockNow)
const unsubscribeSecond = clockStore.subscribe(() => { secondTicks++ })
assert.equal(timersStarted, 1)
clockNow += 30_000
assert.notEqual(clockStore.getSnapshot(), clockNow)
timerCallback()
assert.equal(clockStore.getSnapshot(), clockNow)
assert.equal(firstTicks, 1)
assert.equal(secondTicks, 1)
unsubscribeFirst()
assert.equal(timersCleared, 0)
clockNow += 30_000
timerCallback()
assert.equal(firstTicks, 1)
assert.equal(secondTicks, 2)
unsubscribeSecond()
assert.equal(timersCleared, 1)
assert.equal(clockStore.getSnapshot(), null)
clockNow += 60_000
const unsubscribeRemount = clockStore.subscribe(() => {})
assert.equal(timersStarted, 2)
assert.equal(clockStore.getSnapshot(), clockNow)
unsubscribeRemount()
assert.equal(timersCleared, 2)

const { notificationAge, isExpiringSoon, delegationStatus } = loadSource('lib/utils/display-time.ts')
const isoAt = offset => new Date(clockNow + offset).toISOString()
assert.equal(notificationAge(isoAt(0), null), '…')
for (const [age, expected] of [[0, '0m ago'], [59_999, '0m ago'], [60_000, '1m ago'], [3_599_999, '59m ago'], [3_600_000, '1h ago'], [86_399_999, '23h ago'], [86_400_000, '1d ago']]) {
  assert.equal(notificationAge(isoAt(-age), clockNow), expected)
}
assert.equal(notificationAge(isoAt(60_000), clockNow), '0m ago')
assert.equal(notificationAge('invalid', clockNow), 'Unknown time')
const week = 7 * 86_400_000
assert.equal(isExpiringSoon(isoAt(week), clockNow), true)
assert.equal(isExpiringSoon(isoAt(week + 1), clockNow), false)
assert.equal(isExpiringSoon(isoAt(0), clockNow), true)
assert.equal(isExpiringSoon('invalid', clockNow), false)
assert.equal(delegationStatus(isoAt(-1), null, null), 'checking status')
assert.equal(delegationStatus(isoAt(1), null, clockNow), 'scheduled / active')
assert.equal(delegationStatus(isoAt(0), null, clockNow), 'expired')
assert.equal(delegationStatus(isoAt(-1), null, clockNow), 'expired')
assert.equal(delegationStatus(isoAt(1), isoAt(-1), clockNow), 'revoked')
assert.equal(delegationStatus(isoAt(1), isoAt(-1), null), 'revoked')
console.log('Display time checks passed: SSR defaults, shared timer, stable snapshots, ticks, cleanup/remount, age and expiry boundaries')

const serverMobile = loadSource('hooks/use-mobile.tsx')
function MobileProbe() {
  return React.createElement('span', null, String(serverMobile.useIsMobile()))
}
assert.equal(renderToStaticMarkup(React.createElement(MobileProbe)), '<span>false</span>')

let width = 1478
const mediaListeners = new Set()
const mediaQuery = {
  get matches() { return width <= 767 },
  addEventListener(event, callback) {
    assert.equal(event, 'change')
    mediaListeners.add(callback)
  },
  removeEventListener(event, callback) {
    assert.equal(event, 'change')
    mediaListeners.delete(callback)
  },
}
let mobileStore
const mobile = loadSource('hooks/use-mobile.tsx', {
  window: { matchMedia(query) { assert.equal(query, '(max-width: 767px)'); return mediaQuery } },
  react: {
    ...React,
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      mobileStore = { subscribe, getSnapshot, getServerSnapshot }
      return getSnapshot()
    },
  },
})
assert.equal(mobile.useIsMobile(), false)
assert.equal(mobileStore.getServerSnapshot(), false)
let mobileChanges = 0
const unsubscribeMobile = mobileStore.subscribe(() => { mobileChanges++ })
for (const [nextWidth, expected] of [[767, true], [768, false], [375, true], [1478, false]]) {
  width = nextWidth
  for (const callback of mediaListeners) callback()
  assert.equal(mobileStore.getSnapshot(), expected)
}
assert.equal(mobileChanges, 4)
assert.equal(mediaListeners.size, 1)
unsubscribeMobile()
assert.equal(mediaListeners.size, 0)
const duplicate = loadSource('components/ui/use-mobile.tsx', { '@/hooks/use-mobile': mobile })
assert.equal(duplicate.useIsMobile, mobile.useIsMobile)

const listeners = new Map([['select', new Set()], ['reInit', new Set()]])
let previous = false
let next = true
let previousCalls = 0
let nextCalls = 0
const api = {
  canScrollPrev: () => previous,
  canScrollNext: () => next,
  on(event, callback) { listeners.get(event).add(callback) },
  off(event, callback) { listeners.get(event).delete(callback) },
  scrollPrev() { previousCalls++ },
  scrollNext() { nextCalls++ },
}
let activeApi = api
let carouselStore
const { Carousel } = loadSource('components/ui/carousel.tsx', {
  react: {
    ...React,
    useCallback: callback => callback,
    useEffect: () => {},
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      carouselStore = { subscribe, getSnapshot, getServerSnapshot }
      return getSnapshot()
    },
  },
  'embla-carousel-react': () => [() => {}, activeApi],
  '@/components/ui/button': { Button: 'button' },
  '@/lib/utils': { cn: (...classes) => classes.filter(Boolean).join(' ') },
})
const carousel = Carousel.render({}, null)
assert.equal(carousel.props.value.canScrollPrev, false)
assert.equal(carousel.props.value.canScrollNext, true)
assert.equal(carouselStore.getServerSnapshot(), 0)
assert.equal(carouselStore.getSnapshot(), carouselStore.getSnapshot())
let carouselChanges = 0
const unsubscribeCarousel = carouselStore.subscribe(() => { carouselChanges++ })
for (const [canPrevious, canNext, expected, event] of [
  [true, true, 3, 'select'], [true, false, 1, 'select'], [false, false, 0, 'reInit'],
]) {
  previous = canPrevious
  next = canNext
  for (const callback of listeners.get(event)) callback()
  assert.equal(carouselStore.getSnapshot(), expected)
}
assert.equal(carouselChanges, 3)
const keydown = carousel.props.children.props.onKeyDownCapture
let prevented = 0
keydown({ key: 'ArrowLeft', preventDefault() { prevented++ } })
keydown({ key: 'ArrowRight', preventDefault() { prevented++ } })
keydown({ key: 'Tab', preventDefault() { throw new Error('Tab must not be intercepted') } })
assert.equal(previousCalls, 1)
assert.equal(nextCalls, 1)
assert.equal(prevented, 2)
unsubscribeCarousel()
assert.equal(listeners.get('select').size, 0)
assert.equal(listeners.get('reInit').size, 0)
activeApi = undefined
const uninitialized = Carousel.render({}, null)
assert.equal(uninitialized.props.value.canScrollPrev, false)
assert.equal(uninitialized.props.value.canScrollNext, false)
carouselStore.subscribe(() => {})()

const { SidebarMenuSkeleton } = loadSource('components/ui/sidebar.tsx')
const skeleton = () => renderToStaticMarkup(React.createElement(SidebarMenuSkeleton, { showIcon: true }))
assert.equal(skeleton(), skeleton())
assert.match(skeleton(), /--skeleton-width:70%/)
assert.match(skeleton(), /data-sidebar="menu-skeleton-icon"/)

for (const locale of ['en', 'ru', 'tj']) {
  const overrides = { '@/lib/i18n/context': { useI18n: () => ({ locale }) } }
  const { translateInterface } = loadSource('lib/i18n/interface-text.ts')
  const { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious, PaginationEllipsis } = loadSource('components/ui/pagination.tsx', overrides)
  const html = renderToStaticMarkup(React.createElement(Pagination, null,
    React.createElement(PaginationContent, null,
      ...[PaginationPrevious, PaginationEllipsis, PaginationNext].map((Control, index) =>
        React.createElement(PaginationItem, { key: index }, React.createElement(Control, { href: '#' }))))))
  for (const label of ['Pagination', 'Go to previous page', 'Go to next page', 'Previous', 'Next', 'More pages']) {
    assert.ok(html.includes(translateInterface(locale, label)), `${locale}: missing navigation label ${label}`)
  }
  const { SchemeStepper } = loadSource('components/workflow/scheme-stepper.tsx', overrides)
  const { SCHEME_STEPS } = loadSource('lib/workflow/fkg-scheme.ts')
  const stepper = renderToStaticMarkup(React.createElement(SchemeStepper, { status: 'assessment' }))
  for (const step of SCHEME_STEPS) {
    const title = translateInterface(locale, 'Step {0} · {1} (Guideline {2})', step.step, translateInterface(locale, step.titleEn), step.guidelineRef)
    assert.ok(stepper.includes(`title="${title}"`), `${locale}: missing localized step ${step.step}`)
  }
  for (const lane of ['Bank', 'Operations', 'Credit Risk', 'Management']) assert.ok(stepper.includes(translateInterface(locale, lane)))
  for (const step of SCHEME_STEPS.filter(step => step.slaDays != null)) {
    assert.ok(stepper.includes(translateInterface(locale, '{0}d', step.slaDays)))
  }
  const { STEP_FORMS } = loadSource('components/workflow/step-forms.tsx', overrides)
  const { interfaceCatalog } = loadSource('lib/i18n/interface-text.ts')
  const missingArtifactTranslations = Object.values(STEP_FORMS).flatMap(config => {
    const keys = [config.title, config.description, ...config.transitions.map(item => item.label),
      ...config.fields.flatMap(field => [field.label, field.placeholder, ...(field.options ?? []).map(option => option.label)]), config.sodAgainstStep?.describe]
    return keys.filter(key => key && !interfaceCatalog[key]).map(key => `Step ${config.step}: ${key}`)
  })
  assert.deepEqual(missingArtifactTranslations, [], 'All workflow artifact text needs Russian and Tajik translations')
  const { WorkflowPanel } = loadSource('components/workflow/workflow-panel.tsx', {
    ...overrides,
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/lib/contexts/permission-context': { usePermissions: () => ({ profile: { id: 'reader', is_active: true } }) },
    '@/components/admin/authority-reason-provider': { useAuthorityReason: () => async () => null },
    '@/components/workflow/step-forms': { STEP_FORMS, StepArtifactForm: () => null },
  })
  for (const step of SCHEME_STEPS) {
    const panel = renderToStaticMarkup(React.createElement(WorkflowPanel, {
      loan: { id: 'locale-fixture', status: step.status, guarantee_amount: 1000, usd_rate: 10 }, roleCode: 'auditor',
    }))
    assert.ok(panel.includes(translateInterface(locale, step.titleEn)), `${locale}: missing workflow heading ${step.step}`)
    assert.ok(panel.includes(translateInterface(locale, 'Guideline')), `${locale}: missing guideline label`)
  }
  for (const [status, config] of Object.entries(STEP_FORMS)) {
    const panel = renderToStaticMarkup(React.createElement(WorkflowPanel, {
      loan: { id: 'locale-fixture', status, guarantee_amount: 1000, usd_rate: 10 }, roleCode: 'super_admin',
    }))
    assert.ok(panel.includes(translateInterface(locale, config.title)), `${locale}: untranslated artifact action at ${status}`)
    let stateIndex = 0
    let validationError
    const { StepArtifactForm } = loadSource('components/workflow/step-forms.tsx', {
      ...overrides,
      react: { ...React, useMemo: fn => fn(), useState: initial => {
        const index = stateIndex++
        return [initial, value => { if (index === 2) validationError = value }]
      } },
      swr: { __esModule: true, default: () => ({ data: {} }) },
      'next/navigation': { useRouter: () => ({ refresh() { throw new Error('Validation cannot navigate') } }) },
      '@/lib/contexts/permission-context': { usePermissions: () => ({ role: { code: 'super_admin' } }) },
      '@/components/admin/authority-reason-provider': { useAuthorityReason: () => async () => { throw new Error('Validation cannot request authority') } },
      '@/lib/supabase/client': { createClient: () => ({}) },
      '@/lib/hooks/use-field-requirements': { useFieldRequirements: () => ({ isRequired: () => true }) },
      '@/lib/i18n/ui-text': { useUiTranslation: () => (key, ...params) => translateInterface(locale, key, ...params) },
    })
    const form = StepArtifactForm({ loan: { id: 'locale-fixture' }, config, open: true, onOpenChange() {} })
    const findSubmit = element => {
      if (!React.isValidElement(element)) return null
      if (element.props.onClick && element.props.variant !== 'outline') return element
      return React.Children.toArray(element.props.children).map(findSubmit).find(Boolean)
    }
    const submit = findSubmit(form)
    assert.ok(submit, `${status}: missing artifact submit button`)
    await submit.props.onClick()
    const field = config.fields.find(item => item.type !== 'checkbox' || item.required)
    assert.equal(validationError, translateInterface(locale, '"{0}" is required.', translateInterface(locale, field.label)))
  }
  const { Breadcrumb, BreadcrumbEllipsis } = loadSource('components/ui/breadcrumb.tsx', overrides)
  const breadcrumb = renderToStaticMarkup(React.createElement(Breadcrumb, null, React.createElement(BreadcrumbEllipsis)))
  for (const label of ['Breadcrumb', 'More']) assert.ok(breadcrumb.includes(translateInterface(locale, label)))
  const { SidebarProvider, SidebarTrigger, SidebarRail } = loadSource('components/ui/sidebar.tsx', overrides)
  const sidebar = renderToStaticMarkup(React.createElement(SidebarProvider, null,
    React.createElement(SidebarTrigger), React.createElement(SidebarRail)))
  assert.ok(sidebar.includes(`aria-label="${translateInterface(locale, 'Toggle Sidebar')}"`))
  assert.ok(sidebar.includes(`title="${translateInterface(locale, 'Toggle Sidebar')}"`))
  const { Carousel, CarouselPrevious, CarouselNext } = loadSource('components/ui/carousel.tsx', overrides)
  const carousel = renderToStaticMarkup(React.createElement(Carousel, null,
    React.createElement(CarouselPrevious), React.createElement(CarouselNext)))
  for (const label of ['Previous slide', 'Next slide']) assert.ok(carousel.includes(translateInterface(locale, label)))
  const { CommandDialog } = loadSource('components/ui/command.tsx', {
    ...overrides,
    '@/components/ui/dialog': { Dialog: 'div', DialogContent: 'div', DialogTitle: 'h2', DialogDescription: 'p' },
    cmdk: { Command: Object.assign(({ children, ...props }) => React.createElement('div', props, children), require('cmdk').Command) },
  })
  const command = renderToStaticMarkup(React.createElement(CommandDialog))
  for (const label of ['Command Palette', 'Search for commands and actions']) assert.ok(command.includes(translateInterface(locale, label)))
  const custom = renderToStaticMarkup(React.createElement(PaginationNext, { 'aria-label': 'Custom label' }))
  assert.match(custom, /aria-label="Custom label"/)
  const primitives = require('@radix-ui/react-dialog')
  const { SheetContent } = loadSource('components/ui/sheet.tsx', {
    ...overrides,
    '@radix-ui/react-dialog': {
      ...primitives,
      Portal: ({ children }) => children,
      Overlay: 'div', Content: 'div', Close: 'button',
    },
  })
  const sheet = renderToStaticMarkup(React.createElement(SheetContent, null, 'Drawer content'))
  assert.ok(sheet.includes(translateInterface(locale, 'Close')), `${locale}: missing translated drawer close label`)
}

const { ReportChartCard } = loadSource('components/dashboard/report-chart-card.tsx', {
    '@/lib/i18n/context': { useI18n: () => ({ locale: 'en' }) },
  })
const card = props => renderToStaticMarkup(React.createElement(ReportChartCard, {
  title: 'Portfolio by Bank', ...props,
}, React.createElement('span', null, 'Chart content')))
assert.match(card({ onExport() {} }), /aria-label="Export Portfolio by Bank"/)
assert.match(card({}), /Chart content/)
assert.doesNotMatch(card({}), /<button/)
const { StepValidationPanel } = loadSource('components/forms/step-validation-panel.tsx', {
  '@/lib/i18n/context': { useI18n: () => ({ locale: 'en' }) },
})
const validationError = { field: 'clientName', label: 'Borrower Name', error: 'Borrower name is required' }
const borrowerStatus = {
  step: 'borrower', label: 'Borrower', isComplete: false, isValid: false,
  errorCount: 1, errors: [validationError],
}
const panel = props => renderToStaticMarkup(React.createElement(StepValidationPanel, {
  step: 'borrower', stepsStatus: [borrowerStatus], hasTouchedFields: true, ...props,
}))
assert.equal(panel({ hasTouchedFields: false }), '')
assert.equal(panel({ stepsStatus: [] }), '')
assert.equal(panel({ step: 'loan' }), '')
assert.equal(panel({ stepsStatus: [{ ...borrowerStatus, errors: [], errorCount: 0 }] }), '')
const singleError = panel({})
assert.match(singleError, /Please complete this required field/)
assert.match(singleError, /Borrower Name:/)
assert.match(singleError, /Borrower name is required/)
assert.equal((singleError.match(/<li /g) ?? []).length, 1)
const multipleErrors = panel({ stepsStatus: [{
  ...borrowerStatus, errorCount: 2, errors: [validationError, {
    field: 'clientTin', label: 'TIN <number>', error: 'Invalid <script>alert(1)<\/script>',
  }],
}] })
assert.match(multipleErrors, /Please complete these 2 required fields/)
assert.equal((multipleErrors.match(/<li /g) ?? []).length, 2)
assert.match(multipleErrors, /TIN &lt;number&gt;/)
assert.doesNotMatch(multipleErrors, /<script>/)
assert.equal(panel({}), singleError)
for (const step of ['borrower', 'legal_rep', 'loan', 'collateral', 'additional']) {
  const error = { field: `${step}Field`, label: `${step} label`, error: `${step} message` }
  const stepsStatus = [{ ...borrowerStatus, step, errors: [error] }]
  assert.match(panel({ step, stepsStatus }), new RegExp(`${step} message`))
  assert.equal(panel({ step, stepsStatus, hasTouchedFields: false }), '')
}
console.log('UI lifecycle checks passed: mobile SSR/breakpoints/unsubscribe, shared hook identity, carousel initial/select/reInit/keyboard/cleanup, deterministic skeleton SSR, report export accessibility and loan validation visibility/messages/escaping')
