/**
 * Centralized loan status definitions
 * Use these constants across the application for consistency
 */

export const LOAN_STATUSES = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  GUARANTEE_ISSUED: 'guarantee_issued',
  EXTENSION_PENDING: 'extension_pending',
  CANCELLED: 'cancelled',
  DISBURSED: 'disbursed',
  ACTIVE: 'active',
  DEFAULTED: 'defaulted',
  SETTLED: 'settled',
  RESCHEDULED: 'rescheduled',
  CLAIM_PENDING: 'claim_pending',
  CLAIM_REJECTED: 'claim_rejected',
  CLAIM_PAID: 'claim_paid',
  CLOSED: 'closed',
} as const

export type LoanStatus = typeof LOAN_STATUSES[keyof typeof LOAN_STATUSES]

export const STATUS_STYLES: Record<string, string> = {
  [LOAN_STATUSES.DRAFT]: 'bg-gray-100 text-gray-800 border-gray-200',
  [LOAN_STATUSES.SUBMITTED]: 'bg-amber-100 text-amber-800 border-amber-200',
  [LOAN_STATUSES.UNDER_REVIEW]: 'bg-blue-100 text-blue-800 border-blue-200',
  [LOAN_STATUSES.APPROVED]: 'bg-sky-100 text-sky-800 border-sky-200',
  [LOAN_STATUSES.REJECTED]: 'bg-red-100 text-red-800 border-red-200',
  [LOAN_STATUSES.GUARANTEE_ISSUED]: 'bg-teal-100 text-teal-800 border-teal-200',
  [LOAN_STATUSES.EXTENSION_PENDING]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  [LOAN_STATUSES.CANCELLED]: 'bg-red-100 text-red-800 border-red-200',
  [LOAN_STATUSES.DISBURSED]: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  [LOAN_STATUSES.ACTIVE]: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  [LOAN_STATUSES.DEFAULTED]: 'bg-red-100 text-red-800 border-red-200',
  [LOAN_STATUSES.SETTLED]: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  [LOAN_STATUSES.RESCHEDULED]: 'bg-orange-100 text-orange-800 border-orange-200',
  [LOAN_STATUSES.CLAIM_PENDING]: 'bg-rose-100 text-rose-800 border-rose-200',
  [LOAN_STATUSES.CLAIM_REJECTED]: 'bg-red-100 text-red-800 border-red-200',
  [LOAN_STATUSES.CLAIM_PAID]: 'bg-purple-100 text-purple-800 border-purple-200',
  [LOAN_STATUSES.CLOSED]: 'bg-gray-100 text-gray-800 border-gray-200',
}

export const STATUS_LABELS: Record<string, string> = {
  [LOAN_STATUSES.DRAFT]: 'Draft',
  [LOAN_STATUSES.SUBMITTED]: 'Submitted',
  [LOAN_STATUSES.UNDER_REVIEW]: 'Under Review',
  [LOAN_STATUSES.APPROVED]: 'Approved',
  [LOAN_STATUSES.REJECTED]: 'Rejected',
  [LOAN_STATUSES.GUARANTEE_ISSUED]: 'Guarantee Issued',
  [LOAN_STATUSES.EXTENSION_PENDING]: 'Extension Pending',
  [LOAN_STATUSES.CANCELLED]: 'Cancelled',
  [LOAN_STATUSES.DISBURSED]: 'Disbursed',
  [LOAN_STATUSES.ACTIVE]: 'Active',
  [LOAN_STATUSES.DEFAULTED]: 'Defaulted',
  [LOAN_STATUSES.SETTLED]: 'Settled',
  [LOAN_STATUSES.RESCHEDULED]: 'Rescheduled',
  [LOAN_STATUSES.CLAIM_PENDING]: 'Claim Pending',
  [LOAN_STATUSES.CLAIM_REJECTED]: 'Claim Rejected',
  [LOAN_STATUSES.CLAIM_PAID]: 'Claim Paid',
  [LOAN_STATUSES.CLOSED]: 'Closed',
}

/**
 * Get the display label for a status
 */
export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

/**
 * Get the CSS classes for a status badge
 */
export function getStatusStyle(status: string): string {
  return STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-800 border-gray-200'
}

/**
 * Group statuses by workflow stage
 */
export const STATUS_GROUPS = {
  PENDING: [LOAN_STATUSES.DRAFT, LOAN_STATUSES.SUBMITTED, LOAN_STATUSES.UNDER_REVIEW],
  DECISION: [LOAN_STATUSES.APPROVED, LOAN_STATUSES.REJECTED],
  GUARANTEE: [LOAN_STATUSES.GUARANTEE_ISSUED, LOAN_STATUSES.EXTENSION_PENDING, LOAN_STATUSES.CANCELLED],
  ACTIVE: [LOAN_STATUSES.DISBURSED, LOAN_STATUSES.ACTIVE],
  OUTCOME: [LOAN_STATUSES.SETTLED, LOAN_STATUSES.RESCHEDULED, LOAN_STATUSES.DEFAULTED],
  CLAIM: [LOAN_STATUSES.CLAIM_PENDING, LOAN_STATUSES.CLAIM_REJECTED, LOAN_STATUSES.CLAIM_PAID],
  TERMINAL: [LOAN_STATUSES.SETTLED, LOAN_STATUSES.REJECTED, LOAN_STATUSES.CANCELLED, LOAN_STATUSES.CLAIM_PAID, LOAN_STATUSES.CLAIM_REJECTED, LOAN_STATUSES.CLOSED],
}

/**
 * Check if a status is terminal (end of workflow)
 */
export function isTerminalStatus(status: string): boolean {
  return STATUS_GROUPS.TERMINAL.includes(status as LoanStatus)
}
