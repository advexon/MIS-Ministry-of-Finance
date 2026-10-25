import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const filename = resolve(import.meta.dirname, '../components/admin/recovery-form.tsx')
const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'submit') handler = node
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(handler, 'Recovery submit handler must exist')
const compiled = ts.transpileModule(handler.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function harness(overrides = {}) {
  const calls = [], errors = [], busy = [], recorded = []
  let count = 0
  const context = {
    version: { revision: 7 }, currency: 'TJS', confirmed: true, costsAllowed: true,
    busyRef: { current: false }, attempt: { current: null }, claim: { id: 'claim-1' },
    form: { gross: '100', costs: '10', date: '2026-10-25', reference: '  RECEIPT-1  ', costEvidence: ' document-1 ', notes: ' Recovery authority reason ', method: 'cash' },
    setBusy: (value) => busy.push(value), setError: (value) => errors.push(value),
    crypto: { randomUUID: () => `request-${++count}` },
    createClient: () => ({ rpc: async (name, input) => { calls.push({ name, input }); return { data: { id: input.p_recovery_id, policy_revision: 7 }, error: null } } }),
    onRecorded: async (receipt) => recorded.push(receipt),
    ...overrides,
  }
  const submit = runInNewContext(`${compiled}\nsubmit`, context)
  return { context, submit, calls, errors, busy, recorded }
}

for (const overrides of [{ version: null }, { currency: null }, { confirmed: false }, { busyRef: { current: true } }]) {
  const test = harness(overrides)
  await test.submit()
  assert.equal(test.calls.length, 0)
  assert.equal(test.busy.length, 0)
}
for (const value of ['NaN', 'Infinity', '-1', '0', '1000000000001']) {
  const test = harness()
  test.context.form.gross = value
  await test.submit()
  assert.equal(test.calls.length, 0)
  assert.ok(test.errors.at(-1))
}
for (const value of ['NaN', '-1', '101']) {
  const test = harness()
  test.context.form.costs = value
  await test.submit()
  assert.equal(test.calls.length, 0)
}
{
  const test = harness()
  test.context.form.costEvidence = ''
  await test.submit()
  assert.equal(test.calls.length, 0)
  assert.match(test.errors.at(-1), /document reference/)
}
{
  const test = harness()
  await test.submit()
  assert.equal(test.calls.length, 1)
  assert.equal(test.calls[0].name, 'cgf_record_recovery')
  assert.equal(JSON.stringify(test.calls[0].input), JSON.stringify({ p_recovery_id: 'request-1', p_method: 'cash', p_claim_id: 'claim-1', p_gross: 100, p_costs: 10, p_currency: 'TJS', p_date: '2026-10-25', p_reference: 'RECEIPT-1', p_cost_evidence: 'document-1', p_notes: 'Recovery authority reason', p_expected_revision: 7 }))
  assert.equal(test.recorded.length, 1)
  assert.deepEqual(test.busy, [true, false])
  assert.equal(test.context.busyRef.current, false)
}
{
  const test = harness({ costsAllowed: false })
  await test.submit()
  assert.equal(test.calls[0].input.p_costs, 0)
  assert.equal(test.calls[0].input.p_cost_evidence, null)
}
for (const failure of ['network', 'rpc', 'empty', 'mismatch']) {
  let attempts = 0
  const requests = []
  const test = harness({ createClient: () => ({ rpc: async (_name, input) => {
    requests.push(input)
    if (++attempts === 1) {
      if (failure === 'network') throw new Error('Response interrupted')
      if (failure === 'rpc') return { data: null, error: { message: 'Policy changed' } }
      return { data: failure === 'empty' ? null : { id: 'another-receipt' }, error: null }
    }
    return { data: { id: input.p_recovery_id }, error: null }
  } }) })
  await test.submit()
  assert.equal(test.recorded.length, 0)
  assert.ok(test.errors.at(-1))
  assert.equal(test.context.busyRef.current, false)
  await test.submit()
  assert.equal(test.recorded.length, 1)
  assert.equal(requests[0].p_recovery_id, requests[1].p_recovery_id, `${failure}: exact retry must keep the same id`)
  test.context.form.reference = 'DIFFERENT-RECEIPT'
  await test.submit()
  assert.notEqual(requests[1].p_recovery_id, requests[2].p_recovery_id)
}
{
  let release
  let calls = 0
  const test = harness({ createClient: () => ({ rpc: async (_name, input) => {
    calls++
    await new Promise((resolve) => { release = resolve })
    return { data: { id: input.p_recovery_id }, error: null }
  } }) })
  const first = test.submit()
  await test.submit()
  assert.equal(calls, 1, 'Double-click while in flight must not send two RPCs')
  release()
  await first
  assert.equal(test.recorded.length, 1)
  assert.equal(test.context.busyRef.current, false)
}
console.log('Recovery submission checks passed: validation, costs, exact receipts, same-ID retries, changed-request IDs and in-flight double-click protection. Database successful-receipt and concurrency acceptance are separate checks.')
