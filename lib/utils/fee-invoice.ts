export interface FeeInvoiceInput {
  invoiceNumber: string
  date: string
  loanReference: string
  bank: string
  borrower: string
  description: string
  baseAmount: string
  rate: string
  feeAmount: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

export function renderFeeInvoice(input: FeeInvoiceInput): string {
  const safe = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, escapeHtml(value)]),
  ) as unknown as FeeInvoiceInput

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Fee Invoice ${safe.invoiceNumber}</title>
<style>body{font-family:Arial,sans-serif;font-size:12pt;margin:40px;color:#222}.header{text-align:center;margin-bottom:30px}.table{width:100%;border-collapse:collapse;margin:20px 0}.table td,.table th{border:1px solid #ccc;padding:8px 12px}.table th{background:#f0f0f0;font-weight:bold}.total-row{font-weight:bold;background:#f8f8f8}</style>
</head><body>
<div class="header"><h1>CREDIT GUARANTEE FUND - GUARANTEE FEE INVOICE</h1><h2>Credit Guarantee Fund – Ministry of Finance</h2></div>
<p><strong>Invoice No.:</strong> ${safe.invoiceNumber}<br><strong>Date:</strong> ${safe.date}<br><strong>Loan Ref.:</strong> ${safe.loanReference}</p>
<p><strong>To:</strong> ${safe.bank}<br>Re: ${safe.borrower}</p>
<table class="table"><thead><tr><th>Description</th><th>Base Amount</th><th>Rate</th><th>Fee Amount</th></tr></thead><tbody>
<tr><td>${safe.description}</td><td>${safe.baseAmount}</td><td>${safe.rate}</td><td>${safe.feeAmount}</td></tr>
<tr class="total-row"><td colspan="3" style="text-align:right">Total Due:</td><td>${safe.feeAmount}</td></tr>
</tbody></table>
<p>Please remit payment to the PRSF Trust Fund Account within 30 days of this invoice date.</p>
<p style="margin-top:40px;font-size:10pt;color:#666">Generated: ${safe.date}</p>
</body></html>`
}
