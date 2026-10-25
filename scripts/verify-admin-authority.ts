import assert from 'node:assert/strict'
import { createServerClient } from '@supabase/ssr'
import { OPERATIONAL_SETTINGS, validateOperationalValue } from '@/lib/admin/operational-settings'

async function main() {
for (const definition of OPERATIONAL_SETTINGS) {
  assert.ok(validateOperationalValue(definition.key, definition.fallback), `${definition.key} default must validate`)
  assert.equal(validateOperationalValue(definition.key, 'NaN'), false)
  assert.equal(validateOperationalValue(definition.key, '-1'), false)
}
assert.equal(validateOperationalValue('not_registered', '1'), false)
assert.equal(validateOperationalValue('committee_operations_members', '2.5'), false)
assert.equal(validateOperationalValue('committee_voting_days', '1.5'), false)
assert.equal(validateOperationalValue('assessment_sla_days', '31'), false)
assert.equal(validateOperationalValue('risk_review_threshold_usd', '0'), true)
console.log('Operational configuration registry checks passed')

if (process.argv.includes('--live')) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  const email = process.env.MIS_ACCEPTANCE_SUPER_ADMIN_EMAIL
  const password = process.env.MIS_ACCEPTANCE_SUPER_ADMIN_PASSWORD
  assert.ok(url && key && email && password, 'Acceptance environment must be available; secrets are never logged')
  const sessionCookies = new Map<string, string>()
  const client = createServerClient(url, key, { cookies: { getAll: () => [...sessionCookies].map(([name, value]) => ({ name, value })), setAll: (cookies) => { for (const cookie of cookies) sessionCookies.set(cookie.name, cookie.value) } } })
  const { error: authError } = await client.auth.signInWithPassword({ email, password })
  assert.ok(!authError, 'Acceptance login failed; credentials were not logged')
  const missing = '00000000-0000-4000-8000-000000000000'
  try {
    const authority = await client.rpc('cgf_is_super_admin')
    assert.equal(authority.error, null)
    assert.equal(authority.data, true)
    const noReason = await client.rpc('cgf_transition_loan', { p_loan: missing, p_from: 'draft', p_to: 'submitted' })
    assert.equal(noReason.error?.code, '23514', 'Direct RPC must require an explicit administrator reason')
    const committee = await client.rpc('cgf_committee_action', { p_action: 'vote', p_meeting: missing, p_data: { authority_reason: 'Read-only acceptance boundary probe' } })
    assert.equal(committee.error?.code, '22023', 'Administrator must reach meeting validation, not a role prohibition')
    const deputy = await client.rpc('cgf_confirm_deputy', { p_loan: missing, p_notes: 'Read-only acceptance boundary probe' })
    assert.equal(deputy.error?.code, '23514', 'Administrator must reach deputy evidence validation')
    const signature = await client.rpc('cgf_sign_guarantee', { p_loan: missing, p_reason: 'Read-only acceptance boundary probe' })
    assert.equal(signature.error?.code, '22023', 'Administrator must reach signing evidence validation')
    const seat = await client.rpc('cgf_assume_committee_seat', { p_claim: false, p_sitting: missing, p_member: missing, p_reason: 'Read-only acceptance boundary probe' })
    assert.equal(seat.error?.code, '23514', 'Administrator cannot substitute into an unavailable sitting')
    const invalidSettings = await client.rpc('cgf_save_settings', { p_reason: 'Read-only acceptance invalid-input probe', p_changes: [{ key: 'not_a_registered_setting', value: '1', expected_value: null }] })
    assert.equal(invalidSettings.error?.code, '23514', 'Unsupported settings cannot be saved')
    const invalidPayment = await client.rpc('cgf_record_claim_payment', { p_payment_id: missing, p_claim_id: missing, p_amount: -1, p_currency: 'TJS', p_payment_date: new Date().toISOString().slice(0, 10), p_reference: 'READ-ONLY-ACCEPTANCE', p_notes: 'Invalid-input boundary probe', p_expected_revision: 1 })
    assert.equal(invalidPayment.error?.code, '23514', 'Administrator must reach amount validation, never bypass it')
    if (process.argv.includes('--http')) {
      const headers = { Cookie: [...sessionCookies].map(([name, value]) => `${name}=${value}`).join('; ') }
      for (const route of ['/dashboard/settings', '/dashboard/committee', '/dashboard/claims', '/dashboard/loans/new']) {
        const response = await fetch(`http://localhost:3000${route}`, { headers })
        assert.equal(new URL(response.url).pathname, route, `${route} must not redirect the verified administrator`)
        assert.equal(response.status, 200)
        const html = await response.text()
        if (route === '/dashboard/settings') assert.ok(html.includes('Full audited authority') && html.includes('Operational rules'), 'Administrator settings must serve the new authority surface')
      }
      console.log('Authenticated HTTP checks passed for settings, committee, claims and application creation; browser interaction is a separate check')
    }
    console.log('Authenticated live administrator RPC boundary checks passed; no business records were changed')
  } finally { await client.auth.signOut({ scope: 'local' }) }
}
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Administrator verification failed'); process.exitCode = 1 })
