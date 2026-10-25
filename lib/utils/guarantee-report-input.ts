type LoanField = 'loan_request_number' | 'customer_name' | 'customer_code' | 'tin_number' | 'sector' | 'currency' | 'approved_amount' | 'disbursed_amount' | 'outstanding_principal' | 'interest_rate' | 'loan_term_months' | 'disbursement_date' | 'maturity_date' | 'guarantee_coverage' | 'guarantee_amount' | 'loan_status' | 'days_overdue'
type PaymentField = 'loan_number' | 'installment_number' | 'payment_date' | 'principal_amount' | 'interest_amount' | 'total_amount' | 'remaining_balance'

function numberValue(value: string, fallback: number | null, integer = false): number | null {
  if (!value.trim()) return fallback
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error('Report amounts must be non-negative numbers')
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed))) throw new Error('Invalid report numeric value')
  return parsed
}

function dateValue(value: string): string | null {
  if (!value.trim()) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error('Report dates must use YYYY-MM-DD')
  }
  return value
}

export function buildGuaranteeReportRows(
  loans: readonly Record<LoanField, string>[], payments: readonly Record<PaymentField, string>[],
) {
  if (loans.length > 1000 || payments.length > 1000) throw new Error('A report supports at most 1000 rows per sheet')
  const meaningfulLoanFields: LoanField[] = ['loan_request_number', 'customer_name', 'customer_code', 'tin_number', 'sector', 'approved_amount', 'disbursed_amount', 'outstanding_principal', 'interest_rate', 'loan_term_months', 'disbursement_date', 'maturity_date', 'guarantee_amount']
  return {
    loans: loans.filter(row => meaningfulLoanFields.some(field => row[field].trim()) || row.currency !== 'TJS' || row.guarantee_coverage !== '50' || row.loan_status !== 'active' || row.days_overdue !== '0').map(row => {
      if (!row.loan_request_number.trim() || !row.customer_name.trim()) throw new Error('Every loan row requires a loan number and customer name')
      if (!/^[A-Z]{3}$/.test(row.currency)) throw new Error('Every loan row requires a three-letter currency')
      const coverage = numberValue(row.guarantee_coverage, 50)
      if (coverage !== null && coverage > 100) throw new Error('Guarantee coverage cannot exceed 100%')
      return {
        loan_request_number: row.loan_request_number.trim(), customer_name: row.customer_name.trim(),
        customer_code: row.customer_code.trim() || null, tin_number: row.tin_number.trim() || null,
        sector: row.sector.trim() || null, currency: row.currency,
        approved_amount: numberValue(row.approved_amount, 0), disbursed_amount: numberValue(row.disbursed_amount, null),
        outstanding_principal: numberValue(row.outstanding_principal, 0), interest_rate: numberValue(row.interest_rate, null),
        loan_term_months: numberValue(row.loan_term_months, null, true),
        disbursement_date: dateValue(row.disbursement_date), maturity_date: dateValue(row.maturity_date),
        guarantee_coverage: coverage, guarantee_amount: numberValue(row.guarantee_amount, 0),
        loan_status: row.loan_status || null, days_overdue: numberValue(row.days_overdue, 0, true),
      }
    }),
    payments: payments.filter(row => Object.entries(row).some(([key, value]) => key !== '_key' && value.trim())).map(row => {
      if (!row.loan_number.trim() || !row.payment_date) throw new Error('Every payment row requires a loan number and payment date')
      const installment = numberValue(row.installment_number, 1, true)
      if (installment === null || installment < 1) throw new Error('Installment number must be positive')
      return {
        loan_number: row.loan_number.trim(), installment_number: installment, payment_date: dateValue(row.payment_date),
        principal_amount: numberValue(row.principal_amount, 0), interest_amount: numberValue(row.interest_amount, 0),
        total_amount: numberValue(row.total_amount, 0), remaining_balance: numberValue(row.remaining_balance, 0),
      }
    }),
  }
}
