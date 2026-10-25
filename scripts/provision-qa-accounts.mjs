/**
 * Provision QA accounts for the ФКГ scheme lanes that currently have no holder.
 *
 * Why new accounts rather than reassigning existing ones: `profiles.role_id` is
 * single-valued, so one user holds exactly one role. Staffing the six unstaffed
 * lanes plus a three-person ККГ quorum needs eight distinct accounts, and the
 * six existing role-holders (super_admin, prsf_admin, prsf_analyst, auditor,
 * bank_admin, bank_officer) would each have to give up their current role to
 * supply one. Creating dedicated accounts leaves existing coverage intact.
 *
 * The script is idempotent: an account that already exists is left in place and
 * only its role is reconciled, so it is safe to re-run.
 *
 * These are TEST credentials for a non-production database. Do not run this
 * against production, and do not commit real passwords.
 *
 *   node scripts/provision-qa-accounts.mjs --confirm-test-project
 *
 * Requires QA_PASSWORD in the environment; passwords are never printed.
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

if (!process.argv.includes('--confirm-test-project')) {
  console.error('Provisioning refused. Verify the target is a test project and pass --confirm-test-project.')
  process.exit(1)
}

const PASSWORD = process.env.QA_PASSWORD
if (!PASSWORD || PASSWORD.length < 12) {
  console.error('Provisioning requires QA_PASSWORD with at least 12 characters. Passwords are never logged.')
  process.exit(1)
}

/** One account per unstaffed lane, plus three seats so quorum is reachable. */
const ACCOUNTS = [
  { email: 'qa.uko@prsf.tj',        role: 'uko_officer',         first: 'QA УКО',        last: 'Officer',    note: 'step 2' },
  { email: 'qa.risk@prsf.tj',       role: 'credit_risk_officer', first: 'QA Credit Risk', last: 'Officer',   note: 'step 6' },
  { email: 'qa.compliance@prsf.tj', role: 'compliance_officer',  first: 'QA Compliance',  last: 'Officer',   note: 'step 13' },
  { email: 'qa.secretary@prsf.tj',  role: 'kkg_secretary',       first: 'QA ККГ',         last: 'Secretary', note: 'steps 7, 10' },
  { email: 'qa.kkg1@prsf.tj',       role: 'kkg_member',          first: 'QA ККГ',         last: 'Member One',   note: 'step 8' },
  { email: 'qa.kkg2@prsf.tj',       role: 'kkg_member',          first: 'QA ККГ',         last: 'Member Two',   note: 'step 8' },
  { email: 'qa.kkg3@prsf.tj',       role: 'kkg_member',          first: 'QA ККГ',         last: 'Member Three', note: 'step 8' },
  { email: 'qa.management@prsf.tj', role: 'fkg_management',      first: 'QA ФКГ',         last: 'Management', note: 'steps 15, 16' },
]

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: roles, error: rolesErr } = await admin.from('roles').select('id, code')
if (rolesErr) {
  console.error('Could not read roles:', rolesErr.message)
  process.exit(1)
}
const roleId = new Map(roles.map((r) => [r.code, r.id]))

// Existing users, so a re-run reconciles instead of erroring on duplicates.
const existing = new Map()
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
  if (error) {
    console.error('Could not list users:', error.message)
    process.exit(1)
  }
  for (const u of data.users) existing.set(u.email?.toLowerCase(), u.id)
  if (data.users.length < 200) break
}

let created = 0
let reconciled = 0
let failed = 0

for (const acct of ACCOUNTS) {
  const targetRole = roleId.get(acct.role)
  if (!targetRole) {
    console.error(`  FAIL ${acct.email}: role "${acct.role}" does not exist`)
    failed++
    continue
  }

  let id = existing.get(acct.email.toLowerCase())

  if (!id) {
    const { data, error } = await admin.auth.admin.createUser({
      email: acct.email,
      password: PASSWORD,
      email_confirm: true, // no inbox for these addresses
      user_metadata: { first_name: acct.first, last_name: acct.last },
    })
    if (error) {
      console.error(`  FAIL ${acct.email}: ${error.message}`)
      failed++
      continue
    }
    id = data.user.id
    created++
  } else {
    reconciled++
  }

  // The on_auth_user_created trigger inserts the profile without a role, so the
  // role must be set here regardless of whether the account is new.
  const { error: roleErr } = await admin
    .from('profiles')
    .update({ role_id: targetRole, is_active: true, position: `QA — ${acct.note}` })
    .eq('id', id)

  if (roleErr) {
    console.error(`  FAIL ${acct.email}: could not set role — ${roleErr.message}`)
    failed++
    continue
  }

  console.log(`  ok   ${acct.email.padEnd(24)} ${acct.role.padEnd(20)} ${acct.note}`)
}

console.log(`\ncreated ${created}, reconciled ${reconciled}, failed ${failed}`)
console.log('QA credentials were supplied through the environment and were not logged.')
process.exit(failed > 0 ? 1 : 0)
