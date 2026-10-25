import assert from 'node:assert/strict'
import config from '../next.config.mjs'
import { renderFeeInvoice } from '../lib/utils/fee-invoice.ts'

const input = {
  invoiceNumber: 'INV-2026-001',
  date: '24 October 2026',
  loanReference: 'CGF-001',
  bank: 'Partner Bank',
  borrower: 'Borrower & Partners',
  description: 'Upfront Guarantee Fee',
  baseAmount: 'TJS 100,000.00',
  rate: '0.50%',
  feeAmount: 'TJS 500.00',
}
const ordinary = renderFeeInvoice(input)
assert.ok(ordinary.includes('Borrower &amp; Partners'))
assert.ok(ordinary.includes('TJS 500.00'))
assert.ok(ordinary.includes('<title>Fee Invoice INV-2026-001</title>'))
for (const key of Object.keys(input)) {
  const html = renderFeeInvoice({ ...input, [key]: '</title><script>globalThis.compromised=true</script><img src=x onerror="alert(1)">\'&' })
  assert.ok(!html.includes('<script>'), `${key} allowed a script element`)
  assert.ok(!html.includes('<img'), `${key} allowed an image element`)
  assert.ok(html.includes('&lt;script&gt;'), `${key} lost the escaped user text`)
  assert.ok(html.includes('&quot;alert(1)&quot;'), `${key} did not escape quotes`)
  assert.ok(html.includes('&#39;&amp;'), `${key} did not escape apostrophes/ampersands`)
}
const rules = await config.headers()
for (const source of ['/dashboard/:path*', '/api/:path*', '/auth/:path*']) {
  const rule = rules.find((entry) => entry.source === source)
  assert.ok(rule, `${source} has no private cache rule`)
  assert.equal(rule.headers.find((header) => header.key === 'Cache-Control')?.value, 'private, no-store, max-age=0')
}
const globalHeaders = rules.find((entry) => entry.source === '/:path*')?.headers
assert.ok(globalHeaders)
assert.ok(!globalHeaders.some((header) => header.key === 'Cache-Control'), 'Blanket caching returned')
for (const name of ['X-Content-Type-Options', 'Referrer-Policy', 'Strict-Transport-Security', 'X-Frame-Options', 'Permissions-Policy']) {
  assert.ok(globalHeaders.some((header) => header.key === name), `Missing ${name}`)
}
assert.notEqual(config.typescript?.ignoreBuildErrors, true)
console.log('Response security and all 9 invoice interpolation fields passed')
