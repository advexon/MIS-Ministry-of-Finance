import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exports = {}
runInNewContext(compile(readFileSync('lib/workflow/committee-actions.ts', 'utf8')), { exports, Set, Error })
const { confirmCommitteeReceipt, committeeReadiness } = exports
const id = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
assert.equal(confirmCommitteeReceipt(id), id)
assert.equal(confirmCommitteeReceipt(id, id), id)
for (const receipt of [null, undefined, {}, [], '', 'not-an-id', true, other]) {
  assert.throws(() => confirmCommitteeReceipt(receipt, id), /not confirmed/)
}
const meeting = {
  id, required_quorum: 2,
  seats: [{ member_id: 'a', attended: true, signed_at: null }, { member_id: 'b', attended: true, signed_at: null }],
  items: [{ loan: { status: 'kkg_review' }, votes: [{ member_id: 'a', vote: 'for' }, { member_id: 'b', vote: 'for' }] }],
}
assert.equal(committeeReadiness(meeting).canPrepare, true)
assert.equal(committeeReadiness(meeting).allSigned, false)
for (const vote of ['against', 'abstain', undefined]) {
  const changed = structuredClone(meeting)
  changed.items[0].votes[1].vote = vote
  assert.equal(committeeReadiness(changed).canPrepare, false)
}
for (const state of ['verification', 'cancelled', 'kkg_protocol', undefined]) {
  const changed = structuredClone(meeting)
  changed.items[0].loan.status = state
  assert.equal(committeeReadiness(changed).readyApplications, false)
  assert.equal(committeeReadiness(changed).canPrepare, false)
}
const absent = structuredClone(meeting)
absent.seats[1].attended = false
assert.equal(committeeReadiness(absent).canPrepare, false)
const hidden = structuredClone(meeting)
hidden.items[0].loan = null
assert.equal(committeeReadiness(hidden).canPrepare, false)
assert.equal(committeeReadiness(hidden, true).canPrepare, true)
const outsiders = structuredClone(meeting)
outsiders.items[0].votes = [{ member_id: 'a', vote: 'for' }, { member_id: 'outsider', vote: 'for' }]
assert.equal(committeeReadiness(outsiders).canPrepare, false)
const signed = structuredClone(meeting)
signed.seats.forEach((seat) => { seat.signed_at = '2026-10-25T00:00:00Z' })
assert.equal(committeeReadiness(signed).allSigned, true)
assert.equal(committeeReadiness({ ...meeting, seats: [], items: [] }).canPrepare, false)

function handler(filename, name) {
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(found, `Missing handler ${name}`)
  return compile(found.getText(source)) + `\n${name}`
}

for (const mode of ['success', 'empty', 'wrong-id', 'returned-error', 'network', 'refresh-error', 'authority-cancel', 'in-flight']) {
  const events = []
  const toasts = []
  const inFlight = { current: mode === 'in-flight' }
  const act = runInNewContext(handler('components/committee/meeting-card.tsx', 'act'), {
    inFlight, meeting, confirmCommitteeReceipt,
    requestAuthorityReason: async () => { if (mode === 'authority-cancel') throw new Error('Cancelled'); return 'Audited authority reason' },
    createClient: () => ({ rpc: async (name, args) => {
      events.push('rpc')
      assert.equal(name, 'cgf_committee_action')
      assert.equal(args.p_meeting, id)
      assert.equal(args.p_data.authority_reason, 'Audited authority reason')
      if (mode === 'network') throw new Error('Network unavailable')
      return { data: mode === 'empty' ? null : mode === 'wrong-id' ? other : id, error: mode === 'returned-error' ? { message: 'Denied' } : null }
    } }),
    setBusy: (value) => events.push(['busy', value]),
    setProtocolOpen: () => events.push('close-protocol'),
    setCancelOpen: () => events.push('close-cancel'),
    setAcknowledged: () => events.push('clear-signature-ack'),
    onAction: undefined,
    onChanged: async () => { events.push('refresh'); if (mode === 'refresh-error') throw new Error('Reload failed') },
    toast: (toast) => toasts.push(toast),
    Promise, Error,
  })
  await act('issue')
  assert.equal(inFlight.current, mode === 'in-flight')
  const success = toasts.some((toast) => toast.title === 'Signed protocol issued')
  assert.equal(success, ['success', 'refresh-error'].includes(mode), mode)
  assert.equal(events.includes('close-protocol'), ['success', 'refresh-error'].includes(mode), mode)
  if (mode === 'in-flight') assert.equal(events.length, 0)
}

for (const mode of ['success', 'empty', 'wrong-id', 'returned-error', 'in-flight']) {
  const events = []
  const fn = runInNewContext(handler('components/committee/claims-register.tsx', 'act'), {
    requestAuthorityReason: async () => { events.push('reason'); return 'Audited reason' },
    confirmCommitteeReceipt,
    createClient: () => ({ rpc: async (name) => {
      assert.equal(name, 'cgf_claim_committee_action')
      return { data: mode === 'empty' ? null : mode === 'wrong-id' ? other : id, error: mode === 'returned-error' ? new Error('Denied') : null }
    } }), Error,
  })
  if (['success', 'in-flight'].includes(mode)) await fn('sign', id, { authority_reason: 'Already confirmed' })
  else await assert.rejects(fn('sign', id, {}))
  if (mode === 'success') assert.equal(events.length, 0, 'Do not prompt twice for the same claims action')
}

for (const mode of ['success', 'malformed', 'server-error']) {
  const events = []
  const fn = runInNewContext(handler('components/committee/meeting-card.tsx', 'requestVerification'), {
    inFlight: { current: false }, setBusy: () => {},
    requestAuthorityReason: async () => null,
    fetch: async () => ({ ok: mode !== 'server-error', json: async () => mode === 'success' ? { ok: true, from: 'kkg_review', to: 'verification' } : {} }),
    onChanged: async () => events.push('refresh'),
    toast: (toast) => events.push(toast.title), Promise, Error,
  })
  await fn(id)
  assert.equal(events.includes('refresh'), mode === 'success')
}
console.log('Committee UI lifecycle checks passed: exact receipts, scoped unanimity, verification pause, attendance/signatures, action locking, authority cancellation, claims confirmation and saved-vs-refresh failures')
