import type { LoanApplication } from '@/lib/types/database'
import type { LoanDraftFormData } from '@/lib/hooks/use-loan-draft'

export function applicationToForm(loan: LoanApplication): LoanDraftFormData {
  const b = loan.borrower
  const text = (value: string | number | null | undefined) => value == null ? '' : String(value)
  return {
    legalEntityType: ['sole_proprietor', 'individual_entrepreneur'].includes(String(b?.legal_type ?? '')) ? 'individual_entrepreneur' : 'legal_entity',
    clientName: b?.name ?? '', clientTin: b?.tin_number ?? '', registrationNumber: b?.registration_number ?? '',
    sectorId: loan.sector_id ?? b?.sector_id ?? '', addressStreet: b?.address_street ?? '', city: b?.address_city ?? '', district: b?.address_district ?? '',
    phone: b?.phone ?? '', email: b?.email ?? '', workforce: text(b?.workforce_count), bankCustomerCode: b?.customer_code ?? '',
    legalRepSurname: b?.legal_rep_surname ?? '', legalRepName: b?.legal_rep_name ?? '', legalRepPatronymic: b?.legal_rep_patronymic ?? '',
    legalRepGender: b?.legal_rep_gender ?? '', legalRepBirthdate: b?.legal_rep_birthdate ?? '', legalRepCountry: b?.legal_rep_country_of_birth ?? 'Tajikistan', legalRepTin: b?.legal_rep_tin ?? '',
    bankId: loan.bank_id, branchId: loan.branch_id ?? '', productId: loan.product_id ?? '', requestedAmount: text(loan.approved_amount), currency: loan.currency,
    loanTerm: text(loan.duration_months), gracePeriod: text(loan.grace_period_months), frequency: loan.frequency ?? 'monthly', interestRate: text(loan.interest_rate),
    guaranteeCoverage: text(loan.guarantee_coverage), loanOfficer: loan.loan_officer ?? '', purpose: loan.purpose ?? '', bankApprovalDate: loan.loan_approval_date ?? '', notes: loan.notes ?? '',
    ...loan.intake_data,
  }
}

export function applicationActions(status: string, role: string): string[] {
  const bank = ['super_admin', 'bank_admin', 'bank_officer'].includes(role)
  if (status === 'guarantee_issued' && bank) return ['record_disbursement']
  if (['active', 'disbursed'].includes(status) && bank) return ['mark_settled', 'reschedule', 'mark_defaulted']
  if (status === 'rescheduled' && bank) return ['mark_settled', 'mark_defaulted']
  if (status === 'defaulted' && bank) return ['file_claim']
  if (status === 'claim_pending' && ['super_admin', 'prsf_analyst', 'credit_risk_officer', 'compliance_officer', 'fkg_management'].includes(role)) return ['claims_committee']
  return []
}
