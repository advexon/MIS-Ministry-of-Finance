import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { translations } from '@/lib/i18n/translations'
import { interfaceCatalog, translateInterface } from '@/lib/i18n/interface-text'
import { renderFeeInvoice } from '@/lib/utils/fee-invoice'
import { SCHEME_STEPS, getNextStatuses, statusLabel } from '@/lib/workflow/fkg-scheme'
import ts from 'typescript'
import { FINANCIAL_POLICY_FIELD_LABELS } from '@/lib/admin/financial-policy'
import { OPERATIONAL_SETTINGS } from '@/lib/admin/operational-settings'

const decoder = new TextDecoder('utf-8', { fatal: true })
const replacement = /\uFFFD/u
const mojibake = /(?:\u00D0[\u0080-\u00BF]|\u00D1[\u0080-\u00BF]){2,}/u

function validateText(bytes: Uint8Array, name: string) {
  const text = decoder.decode(bytes)
  assert.ok(!replacement.test(text), `${name}: Unicode replacement character found`)
  assert.ok(!mojibake.test(text), `${name}: possible double-encoded Cyrillic text`)
  return text
}

assert.throws(() => validateText(Uint8Array.of(0xd0, 0x20), 'invalid UTF-8 fixture'))
assert.throws(() => validateText(Buffer.from('\uFFFD'), 'replacement fixture'))
assert.throws(() => validateText(Buffer.from('\u00D0\u009D\u00D0\u00BE'), 'mojibake fixture'))
const alphabet = 'Ёё Ғғ Ӣӣ Ққ Ӯӯ Ҳҳ Ҷҷ'
assert.equal(validateText(Buffer.from(alphabet), 'Tajik alphabet'), alphabet)

const root = new URL('../', import.meta.url)
const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean)
const textExtension = /\.(?:[cm]?[jt]sx?|json|css|scss|html|sql|ya?ml|md|mdx|txt)$/i
const failures: string[] = []
let checked = 0
for (const path of new Set(paths)) {
  if (!textExtension.test(path) && !['.editorconfig', '.gitattributes'].includes(path)) continue
  try {
    validateText(readFileSync(new URL(path, root)), path)
    checked++
  } catch (error) {
    failures.push(error instanceof Error ? `${path}: ${error.message}` : String(error))
  }
}
assert.deepEqual(failures, [], 'Source text must remain valid UTF-8 without corrupted characters')

function validateTranslations(value: unknown, path: string) {
  if (typeof value === 'string') {
    assert.ok(value.trim(), `${path}: empty translation`)
    validateText(Buffer.from(value), path)
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) validateTranslations(nested, `${path}.${key}`)
  }
}
for (const locale of ['en', 'ru', 'tj'] as const) validateTranslations(translations[locale], locale)
assert.equal(translations.ru.loans.newApplication, 'Новая заявка на кредит')
assert.equal(translations.ru.users.role, 'Роль')
assert.equal(translations.ru.users.lastLogin, 'Последний вход')
assert.equal(translations.tj.claims.approvedAmount, 'Маблағи тасдиқшуда')

for (const [source, entries] of Object.entries(interfaceCatalog)) {
  assert.equal(entries.length, 2, `${source}: Russian and Tajik translations required`)
  const placeholders = (source.match(/\{\d+\}/g) ?? []).sort()
  for (const [index, text] of entries.entries()) {
    assert.ok(text.trim(), `${source}: empty locale ${index}`)
    validateText(Buffer.from(text), source)
    assert.deepEqual((text.match(/\{\d+\}/g) ?? []).sort(), placeholders, `${source}: interpolation mismatch`)
  }
}
for (const step of SCHEME_STEPS) {
  for (const key of [step.titleEn, ...step.actors, ...getNextStatuses(step.status).map(status => statusLabel(status))]) {
    assert.ok(interfaceCatalog[key], `Workflow step ${step.step}: missing dynamic translation for ${key}`)
  }
  assert.equal(translateInterface('ru', step.titleEn), step.titleRu, `Workflow step ${step.step}: preserve approved Russian title`)
}
for (const key of [...Object.values(FINANCIAL_POLICY_FIELD_LABELS), ...OPERATIONAL_SETTINGS.flatMap(setting => [setting.label, setting.unit, setting.description])]) {
  assert.ok(interfaceCatalog[key], `Administration configuration: missing translation for ${key}`)
}
for (const path of paths.filter(path => /^(app|components)\/.*\.tsx$/.test(path))) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, root), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node: ts.Node) {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && ['PolicySelect', 'PolicyNumber'].includes(node.tagName.getText(source))) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue
        if (attribute.name.getText(source) === 'label' && ts.isStringLiteral(attribute.initializer)) {
          assert.ok(interfaceCatalog[attribute.initializer.text], `${path}: missing financial field translation for ${attribute.initializer.text}`)
        }
        if (attribute.name.getText(source) === 'options' && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression && ts.isArrayLiteralExpression(attribute.initializer.expression)) {
          for (const option of attribute.initializer.expression.elements) {
            if (ts.isArrayLiteralExpression(option) && option.elements[1] && ts.isStringLiteral(option.elements[1])) {
              assert.ok(interfaceCatalog[option.elements[1].text], `${path}: missing financial option translation for ${option.elements[1].text}`)
            }
          }
        }
      }
    }
    if (ts.isJsxAttribute(node) && ['placeholder', 'aria-label', 'title'].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      assert.ok(!/[A-Za-z]{3}/.test(node.initializer.text), `${path}: translate ${node.name.getText(source)}=${node.initializer.text}`)
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'uiText' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const key = node.arguments[0].text.replace(/\s+/g, ' ').trim()
      assert.ok(interfaceCatalog[key], `${path}: missing translation for ${key}`)
    }
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'LocalizedText') {
      const key = node.children.filter(ts.isJsxText).map(child => child.text).join('').replace(/\s+/g, ' ').trim()
      if (key) assert.ok(interfaceCatalog[key], `${path}: missing LocalizedText translation for ${key}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
for (const locale of ['en', 'ru', 'tj'] as const) {
  assert.equal(translateInterface(locale, 'Borrower ACME-123'), 'Borrower ACME-123')
  assert.equal(translateInterface(locale, 123), 123)
  assert.ok(translateInterface(locale, ' Fees & Commissions ').startsWith(' '))
  const invoice = renderFeeInvoice({ invoiceNumber: '<script>', date: '2026-10-26', loanReference: 'LOAN-123', bank: 'Bank', borrower: 'Borrower', description: 'Fee', baseAmount: '100', rate: '1%', feeAmount: '1' }, locale)
  assert.ok(invoice.includes(`lang="${locale === 'tj' ? 'tg' : locale}"`))
  assert.ok(invoice.includes('&lt;script&gt;'))
  assert.ok(invoice.includes(translateInterface(locale, 'Total Due')))
}
assert.equal(translateInterface('ru', 'Page {0} of {1}', 2, 5).includes('2'), true)

const layout = readFileSync(new URL('app/layout.tsx', root), 'utf8')
const subsets = [...layout.matchAll(/subsets:\s*\[([^\]]+)\]/g)]
assert.equal(subsets.length, 2, 'Check both UI and heading fonts')
for (const [, values] of subsets) {
  for (const subset of ['latin', 'cyrillic', 'cyrillic-ext']) {
    assert.ok(values.includes(`'${subset}'`), `Font must include ${subset}`)
  }
}
console.log(`Internationalization: ${checked} UTF-8 source files, three translation dictionaries, corruption fixtures, and Russian/Tajik font subsets passed.`)
