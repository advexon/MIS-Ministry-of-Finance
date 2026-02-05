export type LoanStatus = 
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'active'
  | 'closed'
  | 'defaulted'
  | 'claim_pending'
  | 'claim_paid'

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
  created_at: string
}

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
  tin_number: string
  registration_number: string | null
  legal_type: LegalType
  company_name: string | null
  company_name_ru: string | null
  first_name: string | null
  last_name: string | null
  patronymic: string | null
  gender: 'male' | 'female' | null
  date_of_birth: string | null
  country_of_birth: string | null
  passport_number: string | null
  legal_address: string | null
  actual_address: string | null
  city: string | null
  district: string | null
  zip_code: string | null
  phone: string | null
  email: string | null
  sector_id: string | null
  business_description: string | null
  establishment_year: number | null
  employee_count: number | null
  bank_customer_code: string | null
  is_blacklisted: boolean
  blacklist_reason: string | null
  created_at: string
  updated_at: string
  sector?: Sector
}

export interface LoanApplication {
  id: string
  application_number: string
  bank_id: string
  branch_id: string | null
  bank_loan_officer: string | null
  borrower_id: string
  product_id: string | null
  loan_purpose: LoanPurpose | null
  loan_purpose_details: string | null
  requested_amount: number
  approved_amount: number | null
  disbursed_amount: number | null
  currency: string
  exchange_rate: number | null
  loan_term_months: number
  grace_period_months: number
  interest_rate: number | null
  repayment_frequency: RepaymentFrequency
  repayment_method: RepaymentMethod | null
  guarantee_coverage: number | null
  guarantee_amount: number | null
  application_date: string
  bank_approval_date: string | null
  prsf_submission_date: string | null
  prsf_approval_date: string | null
  disbursement_date: string | null
  maturity_date: string | null
  status: LoanStatus
  rejection_reason: string | null
  assigned_analyst_id: string | null
  total_exposure: number | null
  annual_turnover: number | null
  net_income: number | null
  risk_rating: string | null
  collateral_description: string | null
  personal_guarantors: PersonalGuarantor[]
  covenants_bank: string | null
  covenants_prsf: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  bank?: Bank
  branch?: BankBranch
  borrower?: Borrower
  product?: LoanProduct
  assigned_analyst?: Profile
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
