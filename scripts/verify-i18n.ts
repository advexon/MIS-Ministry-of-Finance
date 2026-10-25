import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { translations } from '@/lib/i18n/translations'

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

const layout = readFileSync(new URL('app/layout.tsx', root), 'utf8')
const subsets = [...layout.matchAll(/subsets:\s*\[([^\]]+)\]/g)]
assert.equal(subsets.length, 2, 'Check both UI and heading fonts')
for (const [, values] of subsets) {
  for (const subset of ['latin', 'cyrillic', 'cyrillic-ext']) {
    assert.ok(values.includes(`'${subset}'`), `Font must include ${subset}`)
  }
}
console.log(`Internationalization: ${checked} UTF-8 source files, three translation dictionaries, corruption fixtures, and Russian/Tajik font subsets passed.`)
