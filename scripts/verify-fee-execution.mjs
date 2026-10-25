import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const filename = resolve(
  import.meta.dirname,
  '../components/admin/fee-forms.tsx',
)
const source = ts.createSourceFile(
  filename,
  readFileSync(filename, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
)
const handlers = {}
function visit(node, owner) {
  if (ts.isFunctionDeclaration(node) && node.name?.text.endsWith('Form'))
    owner = node.name.text
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'submit')
    handlers[owner] = ts.transpileModule(node.getText(source), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText
  ts.forEachChild(node, (child) => visit(child, owner))
}
visit(source)
function harness(kind = 'FeeCreateForm', overrides = {}) {
  const calls = [],
    errors = [],
    recorded = [],
    busy = []
  let ids = 0
  const context = {
    version: { revision: 7 },
    confirmed: true,
    busyRef: { current: false },
    attempt: { current: null },
    loan: { id: 'loan-1' },
    outstanding: false,
    form: {
      type: 'upfront',
      date: '2026-10-25',
      notes: ' Approved reason ',
      start: '2026-07-01',
      end: '2026-10-01',
      balanceId: '',
    },
    fee: { id: 'fee-1' },
    action: 'invoice',
    date: '2026-10-25',
    reason: ' Approved reason ',
    reference: ' RECEIPT-1 ',
    setBusy: (value) => busy.push(value),
    onBusyChange: () => {},
    setError: (value) => errors.push(value),
    crypto: { randomUUID: () => `request-${++ids}` },
    createClient: () => ({
      rpc: async (name, input) => {
        calls.push({ name, input })
        return {
          data: {
            id: input.p_fee_id,
            policy_revision: 7,
            status:
              name === 'cgf_create_fee'
                ? 'pending'
                : context.action === 'invoice'
                  ? 'invoiced'
                  : 'paid',
            invoice_date: input.p_date,
            payment_date: input.p_date,
            payment_reference: input.p_reference,
          },
          error: null,
        }
      },
    }),
    onRecorded: async (receipt) => recorded.push(receipt),
    ...overrides,
  }
  return {
    context,
    calls,
    errors,
    recorded,
    busy,
    submit: runInNewContext(`${handlers[kind]}\nsubmit`, context),
  }
}
for (const overrides of [
  { version: null },
  { confirmed: false },
  { busyRef: { current: true } },
  { loan: null },
  { outstanding: true },
]) {
  const test = harness('FeeCreateForm', overrides)
  await test.submit()
  assert.equal(test.calls.length, 0)
}
{
  const test = harness()
  await test.submit()
  const { name, input } = test.calls[0]
  assert.equal(name, 'cgf_create_fee')
  assert.equal(input.p_fee_id, 'request-1')
  assert.equal(input.p_notes, 'Approved reason')
  assert.equal(input.p_start, null)
  assert.equal(input.p_end, null)
  assert.equal(input.p_balance_row_id, null)
  assert.equal(input.p_expected_revision, 7)
  assert.equal(Object.hasOwn(input, 'p_amount'), false)
  assert.equal(Object.hasOwn(input, 'p_rate'), false)
  assert.equal(test.recorded.length, 1)
  assert.deepEqual(test.busy, [true, false])
}
{
  const test = harness('FeeCreateForm', { outstanding: true })
  test.context.form.type = 'quarterly'
  test.context.form.balanceId = 'approved-row-1'
  await test.submit()
  assert.equal(test.calls[0].input.p_balance_row_id, 'approved-row-1')
  assert.equal(test.calls[0].input.p_end, '2026-10-01')
}
for (const failure of ['network', 'rpc', 'empty', 'id', 'revision', 'status']) {
  const requests = []
  let count = 0
  const test = harness('FeeCreateForm', {
    createClient: () => ({
      rpc: async (_name, input) => {
        requests.push(input)
        const receipt = {
          id: input.p_fee_id,
          policy_revision: 7,
          status: 'pending',
        }
        if (++count === 1) {
          if (failure === 'network') throw new Error('Response lost')
          if (failure === 'rpc') return { error: { message: 'Policy changed' } }
          if (failure === 'empty') return { data: null }
          receipt[
            failure === 'id'
              ? 'id'
              : failure === 'revision'
                ? 'policy_revision'
                : 'status'
          ] = failure === 'revision' ? 8 : 'unexpected'
        }
        return { data: receipt }
      },
    }),
  })
  await test.submit()
  assert.equal(test.recorded.length, 0)
  assert.ok(test.errors.at(-1))
  assert.equal(test.context.busyRef.current, false)
  await test.submit()
  assert.equal(test.recorded.length, 1)
  assert.equal(requests[0].p_fee_id, requests[1].p_fee_id)
  test.context.form.notes = 'Changed reason'
  await test.submit()
  assert.notEqual(requests[1].p_fee_id, requests[2].p_fee_id)
}
{
  let release,
    calls = 0
  const test = harness('FeeCreateForm', {
    createClient: () => ({
      rpc: async (_name, input) => {
        calls++
        await new Promise((resolve) => {
          release = resolve
        })
        return {
          data: { id: input.p_fee_id, policy_revision: 7, status: 'pending' },
        }
      },
    }),
  })
  const pending = test.submit()
  await test.submit()
  assert.equal(calls, 1)
  release()
  await pending
  assert.equal(test.recorded.length, 1)
}
for (const action of ['invoice', 'pay']) {
  const test = harness('FeeActionForm', { action })
  await test.submit()
  assert.equal(test.calls[0].name, 'cgf_fee_action')
  assert.equal(test.recorded.length, 1)
  assert.equal(test.calls[0].input.p_reason, 'Approved reason')
  assert.equal(
    test.calls[0].input.p_reference,
    action === 'pay' ? 'RECEIPT-1' : null,
  )
  for (const overrides of [
    { confirmed: false },
    { busyRef: { current: true } },
    { reason: '' },
    { date: '' },
    ...(action === 'pay' ? [{ reference: '' }] : []),
  ]) {
    const denied = harness('FeeActionForm', { action, ...overrides })
    await denied.submit()
    assert.equal(denied.calls.length, 0)
  }
  for (const mismatch of [
    'id',
    'status',
    action === 'pay' ? 'payment_reference' : 'invoice_date',
  ]) {
    const bad = harness('FeeActionForm', {
      action,
      createClient: () => ({
        rpc: async (_name, input) => ({
          data: {
            id: 'fee-1',
            status: action === 'pay' ? 'paid' : 'invoiced',
            payment_date: input.p_date,
            invoice_date: input.p_date,
            payment_reference: input.p_reference,
            [mismatch]: 'wrong',
          },
        }),
      }),
    })
    await bad.submit()
    assert.equal(bad.recorded.length, 0)
    assert.ok(bad.errors.at(-1))
    assert.equal(bad.context.busyRef.current, false)
  }
}
console.log(
  'Fee handler checks passed: policy-only inputs, approved balance evidence, exact receipt/status/revision confirmation, retries, changed-request IDs, in-flight guard and invoice/payment validation. Live database acceptance is separate.',
)
