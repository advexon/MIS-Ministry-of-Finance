// Do NOT import xlsx at the top level — it is ~1 MB and would be bundled into
// every page that imports this module. Instead we dynamically import it only
// when exportToExcel is actually called by the user.

export interface ReportData {
  report: any
  loans: any[]
  payments: any[]
}

export async function exportToExcel(data: ReportData, reportMonth: string): Promise<void> {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  // Format report info
  const reportInfo = [
    ['Guarantee Report'],
    ['Report Month:', reportMonth],
    ['Bank:', data.report.bank?.name || ''],
    ['Status:', data.report.status],
    ['Total Loans:', data.report.total_loans],
    ['Total Outstanding Principal:', data.report.total_outstanding_principal],
    ['Total Guarantee Amount:', data.report.total_guarantee_amount],
    [''],
  ]

  const infoWs = XLSX.utils.aoa_to_sheet(reportInfo)
  XLSX.utils.book_append_sheet(wb, infoWs, 'Report Info')

  if (data.loans && data.loans.length > 0) {
    const loansData = data.loans.map((loan, index) => ({
      'Row #': loan.row_number || index + 1,
      'Loan Number': loan.loan_request_number,
      'Branch Name': loan.branch_name,
      'Branch Code': loan.branch_code,
      'Service Center': loan.service_center_name,
      'Service Center Code': loan.service_center_code,
      'Customer Code': loan.customer_code,
      'Customer Name': loan.customer_name,
      'Legal Type': loan.customer_legal_type,
      'TIN': loan.tin_number,
      'Sector': loan.sector,
      'Product Code': loan.product_code,
      'Loan Purpose': loan.loan_purpose,
      'Currency': loan.currency,
      'Approved Amount': loan.approved_amount,
      'Approved Currency': loan.approved_currency,
      'Approval Date': loan.approval_date,
      'Disbursed Amount': loan.disbursed_amount,
      'Disbursed Currency': loan.disbursed_currency,
      'Outstanding Principal': loan.outstanding_principal,
      'Outstanding Interest': loan.outstanding_interest,
      'Outstanding Penalties': loan.outstanding_penalties,
      'Interest Rate': loan.interest_rate,
      'Effective Interest Rate': loan.effective_interest_rate,
      'Loan Term': loan.loan_term_months,
      'Term with Grace': loan.term_with_grace,
      'Grace Period': loan.grace_period_months,
      'Payment Frequency': loan.payment_frequency,
      'Frequency (Months)': loan.frequency_months,
      'Disbursement Date': loan.disbursement_date,
      'Maturity Date': loan.maturity_date,
      'Guarantee Coverage': loan.guarantee_coverage,
      'Guarantee Amount': loan.guarantee_amount,
      'Guarantee Start': loan.guarantee_start_date,
      'Guarantee End': loan.guarantee_end_date,
      'Loan Status': loan.loan_status,
      'Days Overdue': loan.days_overdue,
      'Overdue Principal': loan.overdue_principal,
      'Overdue Interest': loan.overdue_interest,
      'Principal Paid This Month': loan.total_principal_paid_this_month,
      'Interest Paid This Month': loan.total_interest_paid_this_month,
      'Penalties Paid This Month': loan.total_penalties_paid_this_month,
      'Last Payment Date': loan.last_payment_date,
      'Write-off Date': loan.write_off_date,
      'Write-off Principal': loan.write_off_principal,
      'Write-off Interest': loan.write_off_interest,
      'Write-off Penalties': loan.write_off_penalties,
      'Total Recovery': loan.total_recovery_amount,
      'Last Recovery Date': loan.last_recovery_date,
      'Last Recovery Amount': loan.last_recovery_amount,
      'Loan Officer': loan.loan_officer_name,
    }))

    const loansWs = XLSX.utils.json_to_sheet(loansData)
    XLSX.utils.book_append_sheet(wb, loansWs, 'Guaranteed Loans')
  }

  if (data.payments && data.payments.length > 0) {
    const paymentsData = data.payments.map(payment => ({
      'Loan Number': payment.loan_number,
      'Installment No': payment.installment_number,
      'Payment Date': payment.payment_date,
      'Principal': payment.principal_amount,
      'Interest': payment.interest_amount,
      'Total': payment.total_amount,
      'Remaining Balance': payment.remaining_balance,
      'Is Paid': payment.is_paid ? 'Yes' : 'No',
      'Actual Payment Date': payment.actual_payment_date,
      'Actual Amount Paid': payment.actual_amount_paid,
    }))

    const paymentsWs = XLSX.utils.json_to_sheet(paymentsData)
    XLSX.utils.book_append_sheet(wb, paymentsWs, 'Payment Schedule')
  }

  const filename = `guarantee_report_${reportMonth}_${Date.now()}.xlsx`
  XLSX.writeFile(wb, filename)
}

export function exportToPDF(data: ReportData, reportMonth: string): void {
  // Generate HTML content
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Guarantee Report - ${reportMonth}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #1e3a8a; }
          h2 { color: #475569; margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f1f5f9; font-weight: 600; }
          .summary { background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .summary-item { display: inline-block; margin-right: 30px; }
          .summary-label { font-weight: 600; color: #64748b; }
          .summary-value { font-size: 18px; color: #1e293b; }
        </style>
      </head>
      <body>
        <h1>Guarantee Report</h1>
        <div class="summary">
          <div class="summary-item">
            <span class="summary-label">Report Month:</span>
            <span class="summary-value">${reportMonth}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Bank:</span>
            <span class="summary-value">${data.report.bank?.name || 'N/A'}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Status:</span>
            <span class="summary-value">${data.report.status}</span>
          </div>
        </div>
        <div class="summary">
          <div class="summary-item">
            <span class="summary-label">Total Loans:</span>
            <span class="summary-value">${data.report.total_loans || 0}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Outstanding Principal:</span>
            <span class="summary-value">TJS ${(data.report.total_outstanding_principal || 0).toLocaleString()}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Guarantee Amount:</span>
            <span class="summary-value">TJS ${(data.report.total_guarantee_amount || 0).toLocaleString()}</span>
          </div>
        </div>

        <h2>Guaranteed Loans</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Loan Number</th>
              <th>Customer Name</th>
              <th>Approved Amount</th>
              <th>Outstanding</th>
              <th>Guarantee Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.loans.map((loan, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${loan.loan_request_number}</td>
                <td>${loan.customer_name}</td>
                <td>TJS ${(loan.approved_amount || 0).toLocaleString()}</td>
                <td>TJS ${(loan.outstanding_principal || 0).toLocaleString()}</td>
                <td>TJS ${(loan.guarantee_amount || 0).toLocaleString()}</td>
                <td>${loan.loan_status || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${data.payments.length > 0 ? `
          <h2>Payment Schedule</h2>
          <table>
            <thead>
              <tr>
                <th>Loan Number</th>
                <th>Installment</th>
                <th>Payment Date</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Total</th>
                <th>Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              ${data.payments.map(payment => `
                <tr>
                  <td>${payment.loan_number}</td>
                  <td>${payment.installment_number}</td>
                  <td>${payment.payment_date}</td>
                  <td>TJS ${(payment.principal_amount || 0).toLocaleString()}</td>
                  <td>TJS ${(payment.interest_amount || 0).toLocaleString()}</td>
                  <td>TJS ${(payment.total_amount || 0).toLocaleString()}</td>
                  <td>TJS ${(payment.remaining_balance || 0).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}
      </body>
    </html>
  `

  // Create a blob and download
  const blob = new Blob([htmlContent], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `guarantee_report_${reportMonth}_${Date.now()}.html`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Quote a single CSV cell per RFC 4180.
 *
 * Always quoting (rather than only when a comma is present) plus doubling any
 * embedded `"` is what keeps values intact. Legal entity names in this
 * programme routinely carry quotes — ООО "Хилол" — and the previous
 * conditional-quoting approach silently dropped them from the export, so the
 * downloaded file disagreed with the register it was reconciled against.
 * Newlines inside free-text fields (notes, addresses) also need the quoting.
 */
export function escapeCSVCell(value: unknown): string {
  if (value === null || value === undefined) return '""'
  return `"${String(value).replace(/"/g, '""')}"`
}

/** Build an RFC 4180 CSV body from a header row plus data rows. */
export function toCSV(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map(row => row.map(escapeCSVCell).join(',')).join('\r\n')
}

/**
 * Trigger a browser download for CSV text.
 *
 * The BOM makes Excel read the file as UTF-8; without it Cyrillic borrower
 * names render as mojibake, which is the common case for this data.
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportToCSV(data: any[], filename: string): void {
  if (data.length === 0) return

  const headers = Object.keys(data[0])
  const csv = toCSV(headers, data.map(row => headers.map(header => row[header])))
  downloadCSV(csv, `${filename}_${Date.now()}.csv`)
}
