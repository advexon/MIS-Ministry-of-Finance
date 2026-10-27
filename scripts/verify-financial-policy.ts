import assert from 'node:assert/strict'
import { EMPTY_POLICY_DRAFT, financialPolicySchema, formatFinancialPolicyIssue, type FinancialPolicy } from '@/lib/admin/financial-policy'
import { interfaceCatalog, translateInterface } from '@/lib/i18n/interface-text'

const policy: FinancialPolicy = {
  ...structuredClone(EMPTY_POLICY_DRAFT),
  currencies: ['TJS', 'USD'],
  claims: { allow_partial_payments: true, separate_payment_actor: true, authorities: [{ role_code: 'accountant', currency: 'TJS', per_payment_limit: 100, per_claim_limit: 200 }] },
  recoveries: { allocation: 'fixed_percentage', fund_share_percent: 50, costs: 'no_deduction', cap_at_paid_amount: true },
}
let checks = 0
function accept(candidate: unknown) { assert.equal(financialPolicySchema.safeParse(candidate).success, true); checks++ }
function reject(candidate: unknown) { assert.equal(financialPolicySchema.safeParse(candidate).success, false); checks++ }
accept(policy)
reject(EMPTY_POLICY_DRAFT)
for (const role_code of ['super_admin', 'prsf_admin', 'auditor', 'bank_admin', 'bank_officer', 'legal_officer', 'prsf_analyst', 'unknown']) reject({ ...policy, claims: { ...policy.claims, authorities: [{ ...policy.claims.authorities[0], role_code }] } })
for (const role_code of ['accountant', 'deputy_director', 'fkg_management']) accept({ ...policy, claims: { ...policy.claims, authorities: [{ ...policy.claims.authorities[0], role_code }] } })
for (const value of [-1, 0, NaN, Infinity, 1_000_000_000_001, '100', null]) reject({ ...policy, claims: { ...policy.claims, authorities: [{ ...policy.claims.authorities[0], per_payment_limit: value }] } })
reject({ ...policy, claims: { ...policy.claims, authorities: [{ ...policy.claims.authorities[0], per_payment_limit: 201 }] } })
reject({ ...policy, claims: { ...policy.claims, authorities: [policy.claims.authorities[0], policy.claims.authorities[0]] } })
reject({ ...policy, currencies: ['USD'] })
for (const currencies of [[], ['TJS', 'TJS'], ['GBP'], [1], null]) reject({ ...policy, currencies })
accept({ ...policy, currencies: ['TJS', 'USD', 'EUR', 'RUB'] })
accept({ ...policy, claims: { ...policy.claims, authorities: [] } })
reject({ ...policy, currencies: ['USD'], claims: { ...policy.claims, authorities: [] }, settlement_currency: 'TJS' })
for (const value of [-1, 101, NaN, Infinity, '50', null]) reject({ ...policy, recoveries: { ...policy.recoveries, fund_share_percent: value } })
for (const value of [0, 50, 100]) accept({ ...policy, recoveries: { ...policy.recoveries, fund_share_percent: value } })
for (const allocation of ['fund_first', 'coverage_pro_rata']) {
  accept({ ...policy, recoveries: { ...policy.recoveries, allocation, fund_share_percent: null } })
  reject({ ...policy, recoveries: { ...policy.recoveries, allocation } })
}
reject({ ...policy, recoveries: { ...policy.recoveries, cap_at_paid_amount: false } })
for (const key of ['upfront_rate_percent', 'recurring_rate_percent']) for (const value of [-1, 101, NaN, Infinity, null, '1']) reject({ ...policy, fees: { ...policy.fees, [key]: value } })
for (const value of [-1, 5, 1.5, NaN]) reject({ ...policy, fees: { ...policy.fees, decimal_places: value } })
for (const value of [-1, 366, 1.5, NaN]) reject({ ...policy, fees: { ...policy.fees, due_days: value } })
reject({ ...policy, fees: { ...policy.fees, recurring_rate_basis: 'annual', proration: 'none' } })
for (const proration of ['actual_actual', 'actual_365']) accept({ ...policy, fees: { ...policy.fees, recurring_rate_basis: 'annual', proration } })
for (const base of ['guarantee_amount', 'approved_loan_amount', 'outstanding_guaranteed_principal']) accept({ ...policy, fees: { ...policy.fees, base } })
reject({ ...policy, fees: { ...policy.fees, rounding: 'bankers' } })
reject({ ...policy, schema_version: 2 })
reject({ ...policy, approved_by: 'caller-controlled' })
reject({ ...policy, claims: { ...policy.claims, bypass_committee: true } })
reject({ ...policy, fees: { ...policy.fees, arbitrary_field: true } })
reject(null)
reject([])
const invalidPolicies = [
  EMPTY_POLICY_DRAFT,
  { ...policy, currencies: [] },
  { ...policy, currencies: ['TJS', 'TJS'] },
  { ...policy, currencies: ['USD'] },
  { ...policy, currencies: ['USD'], settlement_currency: 'TJS', claims: { ...policy.claims, authorities: [] } },
  { ...policy, fees: { ...policy.fees, upfront_rate_percent: -1, recurring_rate_percent: 101, decimal_places: 1.5, due_days: NaN } },
  { ...policy, fees: { ...policy.fees, base: 'unsupported', recurring_rate_basis: 'annual', proration: 'none' } },
  { ...policy, claims: { ...policy.claims, authorities: [policy.claims.authorities[0], { ...policy.claims.authorities[0], per_payment_limit: 201 }] } },
  { ...policy, claims: { ...policy.claims, authorities: [{ ...policy.claims.authorities[0], per_payment_limit: 0 }] } },
  { ...policy, unexpected: true },
]
const translationKeys = new Set<string>()
for (const candidate of invalidPolicies) {
  const result = financialPolicySchema.safeParse(candidate)
  assert.equal(result.success, false)
  if (result.success) continue
  for (const issue of result.error.issues) {
    for (const locale of ['en', 'ru', 'tj'] as const) {
      const output = formatFinancialPolicyIssue(issue, (key, ...parameters) => {
        translationKeys.add(key)
        assert.ok(interfaceCatalog[key], `Missing policy validation translation: ${key}`)
        return translateInterface(locale, key, ...parameters)
      })
      assert.ok(output.length > 0)
      assert.doesNotMatch(output, /claims|authorities|fund_share_percent|upfront_rate_percent|Invalid input|Too small|Too big/)
      if (issue.path.includes(0)) assert.ok(output.includes(' → 1'), 'Authority rows use one-based numbering')
      if (locale !== 'en') assert.notEqual(output, formatFinancialPolicyIssue(issue, (key, ...parameters) => translateInterface('en', key, ...parameters)))
      checks++
    }
  }
}
for (const key of [
  'Policy revision {0} saved and audited. New claim payments, recoveries and fee assessments use this revision; historical records are unchanged.',
  'Policy revision {0} saved and audited; revision history could not refresh.',
]) {
  assert.ok(interfaceCatalog[key])
  for (const locale of ['en', 'ru', 'tj'] as const) {
    const output = translateInterface(locale, key, 42)
    assert.ok(output.includes('42'))
    assert.ok(!output.includes('{0}'))
    checks++
  }
}
console.log(`${checks} financial policy contract and multilingual validation checks passed (${translationKeys.size} validation labels/messages)`)
