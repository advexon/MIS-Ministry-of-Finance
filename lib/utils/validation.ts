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

  // Support both column names: duration_months (loan_applications) and loan_term_months (guarantee_reports)
  const termMonths = loan.duration_months || loan.loan_term_months
  if (termMonths && termMonths <= 0) {
    errors.push({ field: 'duration_months', message: 'Loan term must be greater than 0' })
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

// ─────────────────────────────────────────────────────────────────────────────
// General-purpose validation utilities
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean
  error?: string
}

export interface NumericValidationOptions {
  min?: number
  max?: number
  required?: boolean
  allowDecimal?: boolean
  decimalPlaces?: number
  fieldName?: string
}

/**
 * Validates a numeric input value
 */
export function validateNumeric(
  value: string | number | undefined,
  options: NumericValidationOptions = {}
): ValidationResult {
  const {
    min,
    max,
    required = false,
    allowDecimal = true,
    decimalPlaces,
    fieldName = 'Value'
  } = options

  if (value === undefined || value === null || value === '') {
    if (required) {
      return { isValid: false, error: `${fieldName} is required` }
    }
    return { isValid: true }
  }

  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(numValue)) {
    return { isValid: false, error: `${fieldName} must be a valid number` }
  }

  if (!allowDecimal && !Number.isInteger(numValue)) {
    return { isValid: false, error: `${fieldName} must be a whole number` }
  }

  if (decimalPlaces !== undefined) {
    const parts = String(value).split('.')
    if (parts[1] && parts[1].length > decimalPlaces) {
      return { isValid: false, error: `${fieldName} can have at most ${decimalPlaces} decimal places` }
    }
  }

  if (min !== undefined && numValue < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}` }
  }

  if (max !== undefined && numValue > max) {
    return { isValid: false, error: `${fieldName} cannot exceed ${max}` }
  }

  return { isValid: true }
}

/**
 * Validates a percentage value (0-100)
 */
export function validatePercentage(
  value: string | number | undefined,
  options: Omit<NumericValidationOptions, 'min' | 'max'> = {}
): ValidationResult {
  return validateNumeric(value, {
    ...options,
    min: 0,
    max: 100,
    fieldName: options.fieldName || 'Percentage'
  })
}

/**
 * Validates a currency amount (positive, 2 decimal places)
 */
export function validateCurrency(
  value: string | number | undefined,
  options: Omit<NumericValidationOptions, 'min' | 'decimalPlaces'> & { maxAmount?: number } = {}
): ValidationResult {
  return validateNumeric(value, {
    ...options,
    min: 0,
    max: options.maxAmount,
    decimalPlaces: 2,
    fieldName: options.fieldName || 'Amount'
  })
}

/**
 * Validates months/duration (positive integer)
 */
export function validateMonths(
  value: string | number | undefined,
  options: Omit<NumericValidationOptions, 'allowDecimal'> = {}
): ValidationResult {
  return validateNumeric(value, {
    ...options,
    allowDecimal: false,
    min: options.min ?? 1,
    max: options.max ?? 360,
    fieldName: options.fieldName || 'Duration'
  })
}

/**
 * Validates interest rate (0-100%, up to 2 decimal places)
 */
export function validateInterestRate(
  value: string | number | undefined,
  options: Omit<NumericValidationOptions, 'min' | 'max' | 'decimalPlaces'> = {}
): ValidationResult {
  return validateNumeric(value, {
    ...options,
    min: 0,
    max: 100,
    decimalPlaces: 2,
    fieldName: options.fieldName || 'Interest rate'
  })
}

/**
 * Validates TIN (9 digits for Tajikistan)
 */
export function validateTIN(value: string | undefined, required = true): ValidationResult {
  if (!value || value.trim() === '') {
    if (required) {
      return { isValid: false, error: 'TIN is required' }
    }
    return { isValid: true }
  }

  const cleaned = value.replace(/\D/g, '')
  if (cleaned.length !== 9) {
    return { isValid: false, error: 'TIN must be exactly 9 digits' }
  }

  return { isValid: true }
}

/**
 * Validates email format
 */
export function validateEmail(value: string | undefined, required = false): ValidationResult {
  if (!value || value.trim() === '') {
    if (required) {
      return { isValid: false, error: 'Email is required' }
    }
    return { isValid: true }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(value)) {
    return { isValid: false, error: 'Please enter a valid email address' }
  }

  return { isValid: true }
}

/**
 * Validates phone number
 */
export function validatePhone(value: string | undefined, required = false): ValidationResult {
  if (!value || value.trim() === '') {
    if (required) {
      return { isValid: false, error: 'Phone number is required' }
    }
    return { isValid: true }
  }

  const cleaned = value.replace(/[\s\-\(\)]/g, '')
  const phoneRegex = /^\+?\d{7,15}$/
  
  if (!phoneRegex.test(cleaned)) {
    return { isValid: false, error: 'Please enter a valid phone number' }
  }

  return { isValid: true }
}
