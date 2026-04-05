export type LoanStatus = 
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'guarantee_issued'
  | 'extension_pending'   // bank has requested an extension of the guarantee/approval validity
  | 'cancelled'
  | 'disbursed'
  | 'active'
  | 'defaulted'           // borrower has defaulted; triggers claim filing
  | 'settled'
  | 'rescheduled'
  | 'claim_pending'
  | 'claim_rejected'      // PRSF rejected the claim; end of process
  | 'claim_paid'
  | 'closed'

export type LegalType = 'individual' | 'legal_entity' | 'individual_entrepreneur'

export type LoanPurpose = 'working_capital' | 'investment' | 'operational'

export type RepaymentFrequency = 'monthly' | 'quarterly'

export type RepaymentMethod = 'annuity' | 'declining_balance'

export type ClaimStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'paid'

export type FeeType = 'upfront' | 'quarterly'

export type FeeStatus = 'pending' | 'invoiced' | 'paid'

export type NotificationType = 'info' | 'warning' | 'success' | 'error'

export interface Bank {
  id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BankBranch {
  id: string
  bank_id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  city: string | null
  district: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Sector {
  id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  is_active: boolean
  created_at: string
}

export interface LoanProduct {
  id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  guarantee_coverage: number
  upfront_fee_rate: number
  quarterly_fee_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Role {
  id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  permissions: string[]
  tier: number  // 1=Superadmin (highest), incrementing for lower authority
  description: string | null
  is_active: boolean
  max_loan_approval_amount: number | null
  can_approve_any_amount: boolean
  created_at: string
}

export interface RolePermission {
  id: string
  code: string
  name_en: string
  name_ru: string | null
  name_tj: string | null
  description: string | null
  category: 'system' | 'users' | 'loans' | 'claims' | 'fees' | 'reports'
  created_at: string
}

// Role tier constants for easy reference (lower tier = higher authority)
export const ROLE_TIERS = {
  SUPER_ADMIN: 1,    // Full system access
  PRSF_ADMIN: 2,     // PRSF management
  PRSF_ANALYST: 4,   // Loan analysis
  AUDITOR: 5,        // Read-only compliance
  BANK_ADMIN: 6,     // Bank management
  BANK_OFFICER: 7,   // Loan submissions
} as const

export const ROLE_CODES = {
  SUPER_ADMIN: 'super_admin',
  PRSF_ADMIN: 'prsf_admin',
  PRSF_ANALYST: 'prsf_analyst',
  AUDITOR: 'auditor',
  BANK_ADMIN: 'bank_admin',
  BANK_OFFICER: 'bank_officer',
} as const

export type RoleTier = typeof ROLE_TIERS[keyof typeof ROLE_TIERS]
export type RoleCode = typeof ROLE_CODES[keyof typeof ROLE_CODES]

export interface Profile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  role_id: string | null
  bank_id: string | null
  branch_id: string | null
  is_active: boolean
  preferred_language: string
  last_login_at: string | null
  created_at: string
  updated_at: string
  role?: Role
  bank?: Bank
  branch?: BankBranch
}

export interface Borrower {
  id: string
  customer_code: string | null
  tin_number: string
  registration_number: string | null
  legal_type: LegalType
  /** Primary display name for the borrower (company name or full name) */
  name: string
  sector_id: string | null
  address_street: string | null
  address_city: string | null
  address_district: string | null
  address_zip: string | null
  phone: string | null
  email: string | null
  legal_rep_surname: string | null
  legal_rep_name: string | null
  legal_rep_patronymic: string | null
  legal_rep_gender: string | null
  legal_rep_birthdate: string | null
  legal_rep_country_of_birth: string | null
  legal_rep_tin: string | null
  workforce_count: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  sector?: Sector
}

export interface LoanApplication {
  id: string
  /** Internal tracking reference (loan_request_id in DB) */
  loan_request_id: string | null
  /** The canonical loan number displayed throughout the UI */
  loan_number: string | null
  bank_id: string
  branch_id: string | null
  borrower_id: string
  product_id: string | null
  status: LoanStatus
  currency: string
  approved_amount: number | null
  disbursed_amount: number | null
  interest_rate: number | null
  duration_months: number | null
  grace_period_months: number | null
  maturity_date: string | null
  disbursement_date: string | null
  frequency: string | null
  guarantee_coverage: number | null
  guarantee_amount: number | null
  loan_officer: string | null
  loan_approval_date: string | null
  sector_id: string | null
  purpose: string | null
  notes: string | null
  created_by: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
  reschedule_reason: string | null
  reschedule_date: string | null
  new_maturity_date: string | null
  reschedule_approved_by: string | null
  guarantee_issued_date: string | null
  guarantee_number: string | null
  cancellation_reason: string | null
  settlement_date: string | null
  settlement_amount: number | null
  // Extension (approval validity extension before disbursement)
  extension_requested_date: string | null
  extension_granted_date: string | null
  extension_reason: string | null
  extension_new_maturity: string | null
  // Defaulted
  defaulted_date: string | null
  bank?: Bank
  branch?: BankBranch
  borrower?: Borrower
  product?: LoanProduct
}

export interface PersonalGuarantor {
  name: string
  id_number: string
  relationship: string
}

export interface LoanDocument {
  id: string
  loan_application_id: string
  document_type: string
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
}

export interface LoanApplicationHistory {
  id: string
  loan_application_id: string
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  notes: string | null
  performed_by: string | null
  created_at: string
  performer?: Profile
}

export interface PaymentSchedule {
  id: string
  loan_application_id: string
  installment_number: number
  due_date: string
  principal_amount: number
  interest_amount: number
  total_amount: number
  outstanding_principal: number
  is_paid: boolean
  actual_payment_date: string | null
  actual_payment_amount: number | null
  created_at: string
  updated_at: string
}

// Column Configuration Types
export type ColumnValidationType = 'text' | 'number' | 'date' | 'email' | 'phone' | 'tin' | 'currency' | 'percentage'
export type ColumnInputType = 'text' | 'number' | 'select' | 'date' | 'textarea' | 'checkbox' | 'currency'
export type ColumnFieldGroup = 'borrower' | 'legal_rep' | 'loan' | 'guarantee' | 'collateral' | 'additional' | 'system'

export interface ColumnConfiguration {
  id: string
  entity_type: string
  column_key: string
  display_name_en: string
  display_name_ru: string | null
  display_name_tj: string | null
  description_en: string | null
  description_ru: string | null
  description_tj: string | null
  field_group: ColumnFieldGroup
  is_visible_in_table: boolean
  is_visible_in_form: boolean
  is_visible_in_detail: boolean
  is_required: boolean
  is_system_required: boolean
  validation_type: ColumnValidationType | null
  min_value: number | null
  max_value: number | null
  min_length: number | null
  max_length: number | null
  regex_pattern: string | null
  input_type: ColumnInputType
  placeholder_en: string | null
  placeholder_ru: string | null
  placeholder_tj: string | null
  help_text_en: string | null
  help_text_ru: string | null
  help_text_tj: string | null
  display_order: number
  table_column_order: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface ColumnConfigAudit {
  id: string
  config_id: string | null
  action: 'create' | 'update' | 'delete'
  previous_values: Record<string, any> | null
  new_values: Record<string, any> | null
  changed_by: string | null
  changed_at: string
}

export interface MonthlyReport {
  id: string
  loan_application_id: string
  report_month: string
  outstanding_principal: number | null
  outstanding_interest: number | null
  outstanding_penalties: number | null
  principal_paid: number
  interest_paid: number
  penalties_paid: number
  days_past_due: number
  write_off_date: string | null
  write_off_principal: number | null
  write_off_interest: number | null
  write_off_penalties: number | null
  total_recovered: number
  last_recovery_date: string | null
  last_recovery_amount: number | null
  last_payment_date: string | null
  submitted_by: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface Claim {
  id: string
  claim_number: string
  loan_application_id: string
  claim_date: string
  claim_amount: number
  principal_claimed: number | null
  interest_claimed: number | null
  status: ClaimStatus
  reviewed_by: string | null
  review_date: string | null
  review_notes: string | null
  approved_amount: number | null
  payment_date: string | null
  payment_reference: string | null
  created_at: string
  updated_at: string
  loan_application?: LoanApplication
  reviewer?: Profile
}

export interface Recovery {
  id: string
  claim_id: string
  loan_application_id: string
  recovery_date: string
  total_recovered: number
  prsf_share: number
  bank_share: number
  notes: string | null
  reported_by: string | null
  created_at: string
}

export interface Fee {
  id: string
  loan_application_id: string
  fee_type: FeeType
  period_start: string | null
  period_end: string | null
  base_amount: number
  fee_rate: number
  fee_amount: number
  status: FeeStatus
  invoice_date: string | null
  invoice_number: string | null
  payment_date: string | null
  payment_reference: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  related_entity: string | null
  related_id: string | null
  is_read: boolean
  is_email_sent: boolean
  created_at: string
}

export interface SystemSetting {
  id: string
  key: string
  value: Record<string, unknown>
  description: string | null
  updated_by: string | null
  updated_at: string
}

// Dashboard Statistics
export interface DashboardStats {
  totalLoans: number
  activeLoans: number
  totalDisbursed: number
  totalGuaranteed: number
  pendingApplications: number
  pendingClaims: number
  delinquencyRate: number
  portfolioByStatus: { status: string; count: number; amount: number }[]
  portfolioBySector: { sector: string; count: number; amount: number }[]
  portfolioByBank: { bank: string; count: number; amount: number }[]
  monthlyDisbursements: { month: string; amount: number }[]
}
