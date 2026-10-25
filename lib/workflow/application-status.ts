import { SCHEME_STEPS } from '@/lib/workflow/fkg-scheme'

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  ...Object.fromEntries(SCHEME_STEPS.map(step => [step.status, step.titleEn])),
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under review (legacy)', uko_registration: 'UKO registration', docs_incomplete: 'Returned to bank', eligibility_review: 'Eligibility / ESMS / KYC',
  ineligible: 'Ineligible', assessment: 'Assessment', risk_review: 'Credit risk review', kkg_scheduled: 'Committee scheduled', kkg_review: 'Committee review', verification: 'Verification', kkg_protocol: 'Committee protocol', formal_application: 'Formal application', uko_reconciliation: 'UKO reconciliation', compliance_check: 'Compliance check', deputy_review: 'Deputy review', management_review: 'Management decision',
  approved: 'Approved', rejected: 'Rejected', guarantee_issued: 'Guarantee issued', extension_pending: 'Extension pending (legacy)', cancelled: 'Cancelled', disbursed: 'Disbursed', active: 'Active', defaulted: 'Defaulted', settled: 'Settled', rescheduled: 'Rescheduled', claim_pending: 'Claim pending', claim_rejected: 'Claim rejected', claim_paid: 'Claim paid', closed: 'Closed',
}
export const PENDING_APPLICATION_STATUSES = ['submitted','under_review','uko_registration','docs_incomplete','eligibility_review','assessment','risk_review','kkg_scheduled','kkg_review','verification','kkg_protocol','formal_application','uko_reconciliation','compliance_check','deputy_review','management_review','extension_pending']
export const ACTIVE_APPLICATION_STATUSES = ['active', 'disbursed', 'rescheduled', 'defaulted']
