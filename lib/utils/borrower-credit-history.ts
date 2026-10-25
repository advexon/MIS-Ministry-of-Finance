import type { Profile, Role } from '@/lib/types/database'

const FUND_HISTORY_ROLES = new Set([
  'super_admin', 'prsf_admin', 'prsf_analyst', 'auditor', 'credit_risk_officer',
  'compliance_officer', 'fkg_management', 'deputy_director', 'accountant',
  'reporting_officer', 'business_development',
])

export function canViewBorrowerCreditHistory(
  profile: Pick<Profile, 'is_active'> | null,
  role: Pick<Role, 'code' | 'is_active'> | null,
): boolean {
  return profile?.is_active === true && role?.is_active === true && FUND_HISTORY_ROLES.has(role.code)
}

export interface BorrowerCreditHistory {
  total: number
  items: {
    id: string
    loan_request_id: string
    loan_number: string | null
    bank_id: string
    bank_name: string | null
    status: string | null
    currency: string | null
    approved_amount: number | null
    created_at: string | null
    guarantee_issued_date: string | null
    settlement_date: string | null
    defaulted_date: string | null
  }[]
}
