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
    console,
  }, { filename })
  return loadedModule.exports
}

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
console.log('UI lifecycle checks passed: mobile SSR/breakpoints/unsubscribe, shared hook identity, carousel initial/select/reInit/keyboard/cleanup, deterministic skeleton SSR and report export accessibility')
