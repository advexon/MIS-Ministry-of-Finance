/**
 * Single source of truth for which form fields are mandatory.
 *
 * Every form that shows an asterisk reads `isRequired()` from here for BOTH the
 * asterisk and the submit check, so the two can no longer disagree. Defaults
 * live in code; admins override them per field in
 * /dashboard/form-requirements, stored in `column_configurations` under
 * `entity_type = 'form:<formId>'` (unique on entity_type + column_key, and
 * writable only by tier ≤ 2 admins via existing RLS).
 */

export interface FormFieldDef {
  key: string
  label: string
  defaultRequired: boolean
  /** Locked fields cannot be made optional — the record cannot be saved without them. */
  locked?: boolean
}

export interface FormDef {
  id: string
  name: string
  group: string
  fields: FormFieldDef[]
}

const f = (key: string, label: string, defaultRequired = false, locked = false): FormFieldDef => ({
  key,
  label,
  defaultRequired,
  locked,
})

export const FORM_DEFS: FormDef[] = [
  {
    id: 'loan_application',
    name: 'New loan application',
    group: 'Loan applications',
    fields: [
      f('legalEntityType', 'Legal entity type', true, true),
      f('clientName', 'Borrower name', true, true),
      f('clientTin', 'Borrower TIN', true),
      f('sectorId', 'Business sector', true),
      f('addressStreet', 'Street address'),
      f('city', 'City'),
      f('phone', 'Phone', true),
      f('email', 'Email'),
      f('workforce', 'Number of employees', true),
      f('legalRepSurname', 'Legal rep surname', true),
      f('legalRepName', 'Legal rep first name', true),
      f('legalRepGender', 'Legal rep gender', true),
      f('legalRepBirthdate', 'Legal rep date of birth'),
      f('legalRepTin', 'Legal rep TIN', true),
      f('passportNumber', 'Passport number'),
      f('bankId', 'Partner bank', true, true),
      f('branchId', 'Branch', true),
      f('requestedAmount', 'Loan amount', true, true),
      f('currency', 'Loan currency', true),
      f('loanTerm', 'Loan term (months)', true),
      f('interestRate', 'Interest rate'),
      f('guaranteeCoverage', 'Guarantee coverage (%)', true),
      f('guaranteeType', 'Guarantee product', true),
      f('applicationDate', 'Application date', true),
      f('purpose', 'Purpose', true),
      f('collateralDescription', 'Collateral description'),
      f('notes', 'Internal notes'),
    ],
  },
  {
    id: 'loan_reject',
    name: 'Reject application',
    group: 'Loan actions',
    fields: [f('reason', 'Rejection reason', true)],
  },
  {
    id: 'loan_cancel',
    name: 'Cancel guarantee',
    group: 'Loan actions',
    fields: [f('reason', 'Cancellation reason', true)],
  },
  {
    id: 'loan_reschedule',
    name: 'Reschedule loan',
    group: 'Loan actions',
    fields: [
      f('reschedule_date', 'Reschedule date'),
      f('new_maturity_date', 'New maturity date'),
      f('reason', 'Reason for rescheduling', true),
    ],
  },
  {
    id: 'loan_claim_reject',
    name: 'Reject claim',
    group: 'Loan actions',
    fields: [f('reason', 'Rejection reason', true)],
  },
  {
    id: 'loan_extend_request',
    name: 'Request extension',
    group: 'Loan actions',
    fields: [f('reason', 'Reason for extension', true)],
  },
  {
    id: 'loan_extend_grant',
    name: 'Grant extension',
    group: 'Loan actions',
    fields: [
      f('grant_date', 'Grant date'),
      f('new_date', 'New validity / maturity date', true, true),
      f('notes', 'Notes'),
    ],
  },
  {
    id: 'loan_decline',
    name: 'Decline request',
    group: 'Loan actions',
    fields: [f('reason', 'Reason for declining', true)],
  },
  {
    id: 'bank',
    name: 'Partner bank',
    group: 'Reference data',
    fields: [
      f('code', 'Bank code', true, true),
      f('name_en', 'Bank name (English)', true, true),
      f('name_ru', 'Bank name (Russian)'),
      f('name_tj', 'Bank name (Tajik)'),
    ],
  },
  {
    id: 'claim_create',
    name: 'File claim',
    group: 'Claims & recoveries',
    fields: [
      f('loan_id', 'Loan application', true, true),
      f('claim_date', 'Claim date', true),
      f('principal_claimed', 'Principal claimed', true, true),
      f('interest_claimed', 'Interest claimed'),
      f('penalties_claimed', 'Penalties'),
    ],
  },
  {
    id: 'claim_review',
    name: 'Review claim',
    group: 'Claims & recoveries',
    fields: [
      f('approved_amount', 'Approved amount (approval only)', true),
      f('payment_date', 'Payment date (approval only)'),
      f('payment_reference', 'Payment reference (when paid)'),
      f('review_notes', 'Review notes', true),
    ],
  },
  {
    id: 'claim_recovery',
    name: 'Record claim recovery',
    group: 'Claims & recoveries',
    fields: [
      f('recovery_date', 'Recovery date', true, true),
      f('total_recovered', 'Total recovered', true, true),
      f('prsf_share', 'PRSF share'),
      f('notes', 'Notes'),
    ],
  },
  {
    id: 'recovery',
    name: 'Recovery',
    group: 'Claims & recoveries',
    fields: [
      f('claim_id', 'Related claim', true, true),
      f('recovery_amount', 'Recovery amount (TJS)', true, true),
      f('prsf_share', 'PRSF share (TJS)'),
      f('recovery_date', 'Recovery date', true, true),
      f('recovery_method', 'Recovery method'),
      f('notes', 'Notes'),
    ],
  },
  {
    id: 'fee_create',
    name: 'Create fee record',
    group: 'Fees',
    fields: [
      f('loan_id', 'Loan application', true, true),
      f('fee_type', 'Fee type', true, true),
      f('period_start', 'Period start (quarterly only)'),
      f('period_end', 'Period end (quarterly only)'),
      f('base_amount', 'Base amount (guarantee amount)', true, true),
      f('fee_rate', 'Fee rate (%)', false),
    ],
  },
  {
    id: 'fee_invoice',
    name: 'Generate fee invoice',
    group: 'Fees',
    fields: [f('invoice_date', 'Invoice date', true, true)],
  },
  {
    id: 'fee_payment',
    name: 'Record fee payment',
    group: 'Fees',
    fields: [f('payment_date', 'Payment date', true, true), f('payment_reference', 'Payment reference')],
  },
  {
    id: 'guarantee_report',
    name: 'Guarantee report',
    group: 'Reports',
    fields: [f('bank_id', 'Bank', true, true), f('report_month', 'Report month', true, true), f('report_type', 'Report type')],
  },
  {
    id: 'user_create',
    name: 'Create user',
    group: 'Administration',
    fields: [
      f('first_name', 'First name'),
      f('last_name', 'Last name'),
      f('email', 'Email', true, true),
      f('password', 'Password', true, true),
      f('phone', 'Phone'),
      f('role', 'Role'),
      f('bank', 'Bank'),
    ],
  },
]

export const FORM_ENTITY_PREFIX = 'form:'

export type RequirementOverrides = Record<string, boolean>

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'number') return Number.isNaN(value)
  return false
}

export function resolveRequired(field: FormFieldDef, overrides: RequirementOverrides): boolean {
  if (field.locked) return true
  return overrides[field.key] ?? field.defaultRequired
}
