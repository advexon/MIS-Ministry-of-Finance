import { z } from 'zod'

export const POLICY_CURRENCIES = ['TJS', 'USD', 'EUR', 'RUB'] as const
export const PAYMENT_ROLES = [
  { code: 'accountant', label: 'Accountant' },
  { code: 'deputy_director', label: 'Deputy Director' },
  { code: 'fkg_management', label: 'Director' },
] as const

const currency = z.enum(POLICY_CURRENCIES)
const percentage = z.number().finite().min(0).max(100)
const money = z.number().finite().positive().max(1_000_000_000_000)

export const financialPolicySchema = z.strictObject({
  schema_version: z.literal(1),
  currencies: z.array(currency).min(1).max(4),
  settlement_currency: z.enum(['loan_currency', 'TJS']),
  fx_date: z.enum(['transaction_date', 'period_end']),
  claims: z.strictObject({
    allow_partial_payments: z.boolean(),
    separate_payment_actor: z.boolean(),
    authorities: z.array(z.strictObject({
      role_code: z.enum(['accountant', 'deputy_director', 'fkg_management']),
      currency,
      per_payment_limit: money,
      per_claim_limit: money,
    })).max(12),
  }),
  recoveries: z.strictObject({
    allocation: z.enum(['fixed_percentage', 'coverage_pro_rata', 'fund_first']),
    fund_share_percent: percentage.nullable(),
    costs: z.enum(['no_deduction', 'deduct_documented_costs']),
    cap_at_paid_amount: z.literal(true),
  }),
  fees: z.strictObject({
    base: z.enum(['guarantee_amount', 'approved_loan_amount', 'outstanding_guaranteed_principal']),
    upfront_rate_percent: percentage,
    recurring_rate_percent: percentage,
    recurring_rate_basis: z.enum(['annual', 'quarterly']),
    proration: z.enum(['none', 'actual_365', 'actual_actual']),
    rounding: z.literal('half_up'),
    decimal_places: z.number().int().min(0).max(4),
    due_days: z.number().int().min(0).max(365),
  }),
}).superRefine((policy, context) => {
  if (new Set(policy.currencies).size !== policy.currencies.length) context.addIssue({ code: 'custom', path: ['currencies'], message: 'Currencies must be unique.' })
  const authorities = new Set<string>()
  policy.claims.authorities.forEach((authority, index) => {
    const key = `${authority.role_code}:${authority.currency}`
    if (authorities.has(key)) context.addIssue({ code: 'custom', path: ['claims', 'authorities', index], message: 'Use only one authority per role and currency.' })
    authorities.add(key)
    if (!policy.currencies.includes(authority.currency)) context.addIssue({ code: 'custom', path: ['claims', 'authorities', index, 'currency'], message: 'Authority currency must be enabled.' })
    if (authority.per_payment_limit > authority.per_claim_limit) context.addIssue({ code: 'custom', path: ['claims', 'authorities', index], message: 'Per-payment limit cannot exceed the cumulative per-claim limit.' })
  })
  if (policy.settlement_currency === 'TJS' && !policy.currencies.includes('TJS')) context.addIssue({ code: 'custom', path: ['currencies'], message: 'Enable TJS for TJS settlement.' })
  if ((policy.recoveries.allocation === 'fixed_percentage') !== (policy.recoveries.fund_share_percent !== null)) context.addIssue({ code: 'custom', path: ['recoveries', 'fund_share_percent'], message: 'Enter a fund percentage only for fixed-percentage allocation.' })
  if (policy.fees.recurring_rate_basis === 'annual' && policy.fees.proration === 'none') context.addIssue({ code: 'custom', path: ['fees', 'proration'], message: 'Annual recurring rates require a day-count proration method.' })
})

export type FinancialPolicy = z.infer<typeof financialPolicySchema>
export interface FinancialPolicyVersion {
  id: string
  revision: number
  policy: FinancialPolicy
  reason: string
  created_at: string
}

// These values populate an unsaved draft, never an approved or active fallback.
export const EMPTY_POLICY_DRAFT: FinancialPolicy = {
  schema_version: 1,
  currencies: ['TJS'],
  settlement_currency: 'loan_currency',
  fx_date: 'transaction_date',
  claims: { allow_partial_payments: false, separate_payment_actor: true, authorities: [] },
  recoveries: { allocation: 'fixed_percentage', fund_share_percent: null, costs: 'no_deduction', cap_at_paid_amount: true },
  fees: { base: 'guarantee_amount', upfront_rate_percent: 0, recurring_rate_percent: 0, recurring_rate_basis: 'quarterly', proration: 'none', rounding: 'half_up', decimal_places: 2, due_days: 30 },
}
