import * as XLSX from 'xlsx'

export interface ParsedLoan {
  row_number?: number
  loan_request_number: string
  branch_name?: string
  branch_code?: string
  service_center_name?: string
  service_center_code?: string
  customer_code?: string
  customer_name: string
  customer_legal_type?: string
  tin_number?: string
  sector?: string
  product_code?: string
  loan_purpose?: string
  currency?: string
  approved_amount: number
  approved_currency?: string
  approval_date?: string
  disbursed_amount?: number
  disbursed_currency?: string
  outstanding_principal?: number
  outstanding_interest?: number
  outstanding_penalties?: number
  interest_rate?: number
  effective_interest_rate?: number
  loan_term_months?: number
  term_with_grace?: number
  grace_period_months?: number
  repayment_frequency?: string
  payment_frequency?: string
  frequency_months?: number
  disbursement_date?: string
  maturity_date?: string
  guarantee_coverage?: number
  guarantee_amount?: number
  guarantee_start_date?: string
  guarantee_end_date?: string
  loan_status?: string
  days_overdue?: number
  overdue_principal?: number
  overdue_interest?: number
  total_principal_paid_this_month?: number
  total_interest_paid_this_month?: number
  total_penalties_paid_this_month?: number
  last_payment_date?: string
  write_off_date?: string
  write_off_principal?: number
  write_off_interest?: number
  write_off_penalties?: number
  total_recovery_amount?: number
  last_recovery_date?: string
  last_recovery_amount?: number
  loan_officer_name?: string
}

export interface ParsedPayment {
  loan_number: string
  installment_number: number
  payment_date: string
  principal_amount: number
  interest_amount: number
  total_amount: number
  remaining_balance: number
}

export async function parseExcelFile(file: File): Promise<{
  loans: ParsedLoan[]
  payments: ParsedPayment[]
  errors: string[]
}> {
  const errors: string[] = []

  try {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    const loans: ParsedLoan[] = []
    const payments: ParsedPayment[] = []

    // Parse Loans Sheet (Sheet 1 or named "Loans"/"Guaranteed Loans")
    const loansSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase().includes('loan') || name.toLowerCase().includes('гарант')
    ) || workbook.SheetNames[0]

    if (loansSheetName) {
      const loansSheet = workbook.Sheets[loansSheetName]
      const loansData = XLSX.utils.sheet_to_json(loansSheet, { raw: false, defval: '' })

      loansData.forEach((row: any, index: number) => {
        try {
          const loan: ParsedLoan = {
            row_number: index + 1,
            loan_request_number: String(row['Loan Number'] || row['Loan Request Number'] || row['№ кредита'] || row['Рақами қарз'] || '').trim(),
            customer_name: String(row['Customer Name'] || row['Наименование клиента'] || row['Номи муштарӣ'] || '').trim(),
            approved_amount: parseFloat(String(row['Approved Amount'] || row['Утвержденная сумма'] || row['Маблағи тасдиқшуда'] || '0').replace(/[^\d.-]/g, '')),
            
            // Optional fields with fallbacks
            branch_name: String(row['Branch Name'] || row['Branch'] || row['Филиал'] || '').trim() || undefined,
            branch_code: String(row['Branch Code'] || row['Код филиала'] || '').trim() || undefined,
            service_center_name: String(row['Service Center'] || row['Центр обслуживания'] || '').trim() || undefined,
            service_center_code: String(row['Service Center Code'] || row['Код центра'] || '').trim() || undefined,
            customer_code: String(row['Customer Code'] || row['Код клиента'] || '').trim() || undefined,
            customer_legal_type: String(row['Legal Type'] || row['Организационная форма'] || '').trim() || undefined,
            tin_number: String(row['TIN'] || row['ИНН'] || row['РМА'] || '').trim() || undefined,
            sector: String(row['Sector'] || row['Сектор'] || row['Соҳа'] || '').trim() || undefined,
            product_code: String(row['Product Code'] || row['Код продукта'] || '').trim() || undefined,
            loan_purpose: String(row['Loan Purpose'] || row['Цель кредита'] || '').trim() || undefined,
            currency: String(row['Currency'] || row['Валюта'] || '').trim() || 'TJS',
            
            disbursed_amount: parseFloat(String(row['Disbursed Amount'] || row['Выданная сумма'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            outstanding_principal: parseFloat(String(row['Outstanding Principal'] || row['Остаток основного долга'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            outstanding_interest: parseFloat(String(row['Outstanding Interest'] || row['Задолженность по процентам'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            outstanding_penalties: parseFloat(String(row['Outstanding Penalties'] || row['Задолженность по штрафам'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            
            interest_rate: parseFloat(String(row['Interest Rate'] || row['Процентная ставка'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            effective_interest_rate: parseFloat(String(row['Effective Rate'] || row['Эффективная ставка'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            
            loan_term_months: parseInt(String(row['Loan Term'] || row['Срок кредита'] || '0').replace(/[^\d]/g, '')) || undefined,
            term_with_grace: parseInt(String(row['Term with Grace'] || row['Срок с льготным периодом'] || '0').replace(/[^\d]/g, '')) || undefined,
            grace_period_months: parseInt(String(row['Grace Period'] || row['Льготный период'] || '0').replace(/[^\d]/g, '')) || undefined,
            frequency_months: parseInt(String(row['Frequency (Months)'] || row['Периодичность (мес.)'] || '0').replace(/[^\d]/g, '')) || undefined,
            
            repayment_frequency: String(row['Repayment Frequency'] || row['Периодичность платежей'] || '').trim() || undefined,
            payment_frequency: String(row['Payment Frequency'] || row['Периодичность платежей'] || '').trim() || undefined,
            
            disbursement_date: String(row['Disbursement Date'] || row['Дата выдачи'] || '').trim() || undefined,
            maturity_date: String(row['Maturity Date'] || row['Дата погашения'] || '').trim() || undefined,
            approval_date: String(row['Approval Date'] || row['Дата утверждения'] || '').trim() || undefined,
            
            guarantee_coverage: parseFloat(String(row['Guarantee Coverage'] || row['Покрытие гарантии'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            guarantee_amount: parseFloat(String(row['Guarantee Amount'] || row['Сумма гарантии'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            guarantee_start_date: String(row['Guarantee Start'] || row['Начало гарантии'] || '').trim() || undefined,
            guarantee_end_date: String(row['Guarantee End'] || row['Окончание гарантии'] || '').trim() || undefined,
            
            loan_status: String(row['Loan Status'] || row['Статус кредита'] || '').trim() || undefined,
            days_overdue: parseInt(String(row['Days Overdue'] || row['Дней просрочки'] || '0').replace(/[^\d]/g, '')) || undefined,
            overdue_principal: parseFloat(String(row['Overdue Principal'] || row['Просроченный основной долг'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            overdue_interest: parseFloat(String(row['Overdue Interest'] || row['Просроченные проценты'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            
            total_principal_paid_this_month: parseFloat(String(row['Principal Paid This Month'] || row['Погашено основного долга за месяц'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            total_interest_paid_this_month: parseFloat(String(row['Interest Paid This Month'] || row['Погашено процентов за месяц'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            total_penalties_paid_this_month: parseFloat(String(row['Penalties Paid This Month'] || row['Погашено штрафов за месяц'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            
            last_payment_date: String(row['Last Payment Date'] || row['Дата последнего платежа'] || '').trim() || undefined,
            
            write_off_date: String(row['Write-off Date'] || row['Дата списания'] || '').trim() || undefined,
            write_off_principal: parseFloat(String(row['Write-off Principal'] || row['Списанный основной долг'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            write_off_interest: parseFloat(String(row['Write-off Interest'] || row['Списанные проценты'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            write_off_penalties: parseFloat(String(row['Write-off Penalties'] || row['Списанные штрафы'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            
            total_recovery_amount: parseFloat(String(row['Total Recovery'] || row['Всего возмещено'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            last_recovery_date: String(row['Last Recovery Date'] || row['Дата последнего возмещения'] || '').trim() || undefined,
            last_recovery_amount: parseFloat(String(row['Last Recovery Amount'] || row['Сумма последнего возмещения'] || '0').replace(/[^\d.-]/g, '')) || undefined,
            
            loan_officer_name: String(row['Loan Officer'] || row['Кредитный специалист'] || '').trim() || undefined,
          }

          // Validate required fields
          if (!loan.loan_request_number || !loan.customer_name || !loan.approved_amount) {
            errors.push(`Row ${index + 2}: Missing required fields (Loan Number, Customer Name, or Approved Amount)`)
          } else {
            loans.push(loan)
          }
        } catch (error) {
          errors.push(`Row ${index + 2}: Error parsing loan data - ${error}`)
        }
      })
    }

    // Parse Payments Sheet (Sheet 2 or named "Payments"/"Schedule")
    const paymentsSheetName = workbook.SheetNames.find(
      (name) => name.toLowerCase().includes('payment') || name.toLowerCase().includes('schedule') || name.toLowerCase().includes('график')
    ) || (workbook.SheetNames.length > 1 ? workbook.SheetNames[1] : null)

    if (paymentsSheetName) {
      const paymentsSheet = workbook.Sheets[paymentsSheetName]
      const paymentsData = XLSX.utils.sheet_to_json(paymentsSheet, { raw: false, defval: '' })

      paymentsData.forEach((row: any, index: number) => {
        try {
          const payment: ParsedPayment = {
            loan_number: String(row['Loan Number'] || row['№ кредита'] || row['Рақами қарз'] || '').trim(),
            installment_number: parseInt(String(row['Installment No'] || row['Installment'] || row['Платеж №'] || row['№'] || '0').replace(/[^\d]/g, '')),
            payment_date: String(row['Payment Date'] || row['Дата платежа'] || row['Санаи пардохт'] || '').trim(),
            principal_amount: parseFloat(String(row['Principal'] || row['Principal Amount'] || row['Основной долг'] || '0').replace(/[^\d.-]/g, '')),
            interest_amount: parseFloat(String(row['Interest'] || row['Interest Amount'] || row['Проценты'] || '0').replace(/[^\d.-]/g, '')),
            total_amount: parseFloat(String(row['Total'] || row['Total Amount'] || row['Итого'] || '0').replace(/[^\d.-]/g, '')),
            remaining_balance: parseFloat(String(row['Remaining Balance'] || row['Balance'] || row['Остаток задолженности'] || '0').replace(/[^\d.-]/g, '')),
          }

          // Validate required fields
          if (!payment.loan_number || !payment.installment_number || !payment.payment_date) {
            errors.push(`Payment Row ${index + 2}: Missing required fields`)
          } else {
            payments.push(payment)
          }
        } catch (error) {
          errors.push(`Payment Row ${index + 2}: Error parsing payment data - ${error}`)
        }
      })
    }

    return { loans, payments, errors }
  } catch (error) {
    console.error('[v0] Error parsing Excel file:', error)
    errors.push(`File parsing error: ${error}`)
    return { loans: [], payments: [], errors }
  }
}

export function generateExcelTemplate(reportType: 'blank_guarantee' | 'disbursements'): void {
  const wb = XLSX.utils.book_new()

  // Loans sheet columns based on report type
  const loansColumns = reportType === 'disbursements' 
    ? [
        'Row #', 'Loan Number', 'Branch Name', 'Branch Code', 'Service Center', 'Service Center Code',
        'Customer Code', 'Customer Name', 'Legal Type', 'TIN', 'Sector', 'Product Code',
        'Loan Purpose', 'Currency', 'Approved Amount', 'Approved Currency', 'Approval Date',
        'Disbursed Amount', 'Disbursed Currency', 'Outstanding Principal', 'Outstanding Interest',
        'Outstanding Penalties', 'Interest Rate', 'Effective Rate', 'Loan Term', 'Term with Grace',
        'Grace Period', 'Payment Frequency', 'Frequency (Months)', 'Disbursement Date', 'Maturity Date',
        'Guarantee Coverage', 'Guarantee Amount', 'Guarantee Start', 'Guarantee End', 'Loan Status',
        'Days Overdue', 'Overdue Principal', 'Overdue Interest'
      ]
    : [
        'Loan Number', 'Customer Name', 'Customer Code', 'TIN', 'Sector', 'Loan Purpose',
        'Approved Amount', 'Disbursed Amount', 'Outstanding Principal', 'Interest Rate',
        'Loan Term', 'Grace Period', 'Disbursement Date', 'Maturity Date',
        'Guarantee Coverage', 'Guarantee Amount', 'Guarantee Start', 'Guarantee End',
        'Loan Status', 'Days Overdue', 'Overdue Principal', 'Overdue Interest'
      ]

  const loansWs = XLSX.utils.aoa_to_sheet([loansColumns])
  XLSX.utils.book_append_sheet(wb, loansWs, 'Guaranteed Loans')

  // Payments sheet
  const paymentsColumns = [
    'Loan Number', 'Installment No', 'Payment Date', 'Principal', 'Interest', 'Total', 'Remaining Balance'
  ]
  const paymentsWs = XLSX.utils.aoa_to_sheet([paymentsColumns])
  XLSX.utils.book_append_sheet(wb, paymentsWs, 'Payment Schedule')

  // Download
  XLSX.writeFile(wb, `guarantee_report_template_${reportType}.xlsx`)
}
