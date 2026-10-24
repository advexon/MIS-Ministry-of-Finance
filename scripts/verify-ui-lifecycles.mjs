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
