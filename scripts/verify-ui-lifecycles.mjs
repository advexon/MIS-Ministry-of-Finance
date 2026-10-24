import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
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
    if (specifier.startsWith('@/')) {
      for (const extension of ['.ts', '.tsx']) {
        const path = specifier.slice(2) + extension
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
    localStorage: overrides.localStorage,
    Date: overrides.Date ?? Date,
    console,
  }, { filename })
  return loadedModule.exports
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
  for (const method of ['select', 'order', 'eq', 'in', 'limit']) {
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
  const form = 'app/dashboard/loans/new/page.tsx'
  const identity = { isIndividualEntrepreneur: true, legalRepSurname: '  Family ', legalRepName: ' Given ', legalRepPatronymic: ' ', companyName: 'Company', clientTin: '123456789', representativeTin: '987654321' }
  assert.equal(sourceExpression(form, 'clientName', identity), 'Family Given')
  assert.equal(sourceExpression(form, 'legalRepTin', identity), '123456789')
  assert.equal(sourceExpression(form, 'clientName', { ...identity, isIndividualEntrepreneur: false }), 'Company')
  assert.equal(sourceExpression(form, 'legalRepTin', { ...identity, isIndividualEntrepreneur: false }), '987654321')
  assert.equal(sourceExpression(form, 'clientName', { ...identity, legalRepSurname: '', legalRepName: '', legalRepPatronymic: '' }), '')
  for (const [coverageOverride, product, expected] of [[undefined, undefined, ''], [undefined, { guarantee_coverage: 50 }, '50'], ['', { guarantee_coverage: 50 }, ''], ['0', { guarantee_coverage: 50 }, '0']]) {
    assert.equal(sourceExpression(form, 'guaranteeCoverage', { coverageOverride, product }), expected)
  }
  const unavailable = queryFixture(null, new Error('Live data unavailable'))
  const fetcher = pageFetcher('app/dashboard/documents/page.tsx', 'document-preview', { supabase: unavailable.client, template: { dataSource: 'loan_applications' } })
  await assert.rejects(fetcher(), /Live data unavailable/)
  const unsupported = pageFetcher('app/dashboard/documents/page.tsx', 'document-preview', { template: { dataSource: 'unsupported' } })
  await assert.rejects(unsupported(), /not supported/)
  console.log('Form/report regressions passed: derived sole-proprietor identity, separate company identity, explicit coverage overrides and no synthetic rows on live-query failure')
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
  let effect
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
      useEffect(callback) { effect = callback },
    },
  })
  const provider = i18n.I18nProvider({ children: null })
  return { restore: () => effect(), setLocale: provider.props.value.setLocale, updates, writes, get state() { return state } }
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

const { ReportChartCard } = loadSource('components/dashboard/report-chart-card.tsx')
const card = props => renderToStaticMarkup(React.createElement(ReportChartCard, {
  title: 'Portfolio by Bank', ...props,
}, React.createElement('span', null, 'Chart content')))
assert.match(card({ onExport() {} }), /aria-label="Export Portfolio by Bank"/)
assert.match(card({}), /Chart content/)
assert.doesNotMatch(card({}), /<button/)
const { StepValidationPanel } = loadSource('components/forms/step-validation-panel.tsx')
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
