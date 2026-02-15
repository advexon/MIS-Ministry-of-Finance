export interface ValidationError {
  field: string
  message: string
}

export function validateLoan(loan: any, reportType: 'blank_guarantee' | 'disbursements'): ValidationError[] {
  const errors: ValidationError[] = []

  // Required fields for all report types
  if (!loan.loan_request_number?.trim()) {
    errors.push({ field: 'loan_request_number', message: 'Loan number is required' })
  }

  if (!loan.customer_name?.trim()) {
    errors.push({ field: 'customer_name', message: 'Customer name is required' })
  }

  if (!loan.approved_amount || loan.approved_amount <= 0) {
    errors.push({ field: 'approved_amount', message: 'Approved amount must be greater than 0' })
  }

  // Additional required fields for disbursements report
  if (reportType === 'disbursements') {
    if (!loan.branch_name?.trim()) {
      errors.push({ field: 'branch_name', message: 'Branch name is required for disbursements report' })
    }

    if (!loan.disbursement_date) {
      errors.push({ field: 'disbursement_date', message: 'Disbursement date is required' })
    }

    if (!loan.outstanding_principal || loan.outstanding_principal < 0) {
      errors.push({ field: 'outstanding_principal', message: 'Outstanding principal must be >= 0' })
    }
  }

  // Validate dates
  if (loan.disbursement_date && loan.maturity_date) {
    if (new Date(loan.disbursement_date) >= new Date(loan.maturity_date)) {
      errors.push({ field: 'maturity_date', message: 'Maturity date must be after disbursement date' })
    }
  }

  if (loan.guarantee_start_date && loan.guarantee_end_date) {
    if (new Date(loan.guarantee_start_date) >= new Date(loan.guarantee_end_date)) {
      errors.push({ field: 'guarantee_end_date', message: 'Guarantee end date must be after start date' })
    }
  }

  // Validate numeric ranges
  if (loan.interest_rate && (loan.interest_rate < 0 || loan.interest_rate > 100)) {
    errors.push({ field: 'interest_rate', message: 'Interest rate must be between 0 and 100' })
  }

  if (loan.guarantee_coverage && (loan.guarantee_coverage < 0 || loan.guarantee_coverage > 100)) {
    errors.push({ field: 'guarantee_coverage', message: 'Guarantee coverage must be between 0 and 100' })
  }

  if (loan.loan_term_months && loan.loan_term_months <= 0) {
    errors.push({ field: 'loan_term_months', message: 'Loan term must be greater than 0' })
  }

  // Validate outstanding amounts don't exceed disbursed amount
  if (loan.disbursed_amount && loan.outstanding_principal && loan.outstanding_principal > loan.disbursed_amount) {
    errors.push({ field: 'outstanding_principal', message: 'Outstanding principal cannot exceed disbursed amount' })
  }

  return errors
}

export function validatePayment(payment: any): ValidationError[] {
  const errors: ValidationError[] = []

  if (!payment.loan_number?.trim()) {
    errors.push({ field: 'loan_number', message: 'Loan number is required' })
  }

  if (!payment.installment_number || payment.installment_number <= 0) {
    errors.push({ field: 'installment_number', message: 'Installment number must be greater than 0' })
  }

  if (!payment.payment_date) {
    errors.push({ field: 'payment_date', message: 'Payment date is required' })
  }

  if (!payment.principal_amount || payment.principal_amount < 0) {
    errors.push({ field: 'principal_amount', message: 'Principal amount must be >= 0' })
  }

  if (!payment.interest_amount || payment.interest_amount < 0) {
    errors.push({ field: 'interest_amount', message: 'Interest amount must be >= 0' })
  }

  // Validate total_amount equals principal + interest
  const calculatedTotal = (parseFloat(payment.principal_amount) || 0) + (parseFloat(payment.interest_amount) || 0)
  const providedTotal = parseFloat(payment.total_amount) || 0

  if (Math.abs(calculatedTotal - providedTotal) > 0.01) {
    errors.push({ field: 'total_amount', message: 'Total amount should equal principal + interest' })
  }

  return errors
}

export function validateReport(reportData: {
  bankId: string
  reportMonth: string
  loans: any[]
  payments: any[]
  reportType: 'blank_guarantee' | 'disbursements'
}): { isValid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = []

  // Validate report basic info
  if (!reportData.bankId?.trim()) {
    errors.push({ field: 'bankId', message: 'Bank selection is required' })
  }

  if (!reportData.reportMonth) {
    errors.push({ field: 'reportMonth', message: 'Report month is required' })
  }

  if (reportData.loans.length === 0) {
    errors.push({ field: 'loans', message: 'At least one loan is required' })
  }

  // Validate each loan
  reportData.loans.forEach((loan, index) => {
    const loanErrors = validateLoan(loan, reportData.reportType)
    loanErrors.forEach(error => {
      errors.push({
        field: `loan_${index}_${error.field}`,
        message: `Loan ${index + 1}: ${error.message}`
      })
    })
  })

  // Validate each payment
  reportData.payments.forEach((payment, index) => {
    const paymentErrors = validatePayment(payment)
    paymentErrors.forEach(error => {
      errors.push({
        field: `payment_${index}_${error.field}`,
        message: `Payment ${index + 1}: ${error.message}`
      })
    })
  })

  return {
    isValid: errors.length === 0,
    errors
  }
}

export function autoCalculatePaymentTotals(payment: {
  principal_amount: number | string
  interest_amount: number | string
}): number {
  const principal = parseFloat(String(payment.principal_amount || 0))
  const interest = parseFloat(String(payment.interest_amount || 0))
  return principal + interest
}

export function autoCalculateRemainingBalance(
  totalAmount: number,
  paymentsToDate: { principal_amount: number }[]
): number {
  const totalPaid = paymentsToDate.reduce((sum, p) => sum + (p.principal_amount || 0), 0)
  return Math.max(0, totalAmount - totalPaid)
}
