import type { Locale } from '@/lib/i18n/translations'
import { translateInterface } from '@/lib/i18n/interface-text'

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

export function renderFeeInvoice(input: FeeInvoiceInput, locale: Locale = 'en'): string {
  const label = (text: string) => escapeHtml(translateInterface(locale, text))
  const safe = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, escapeHtml(value)]),
  ) as unknown as FeeInvoiceInput

  return `<!DOCTYPE html><html lang="${locale === 'tj' ? 'tg' : locale}"><head><meta charset="utf-8"><title>${label('Fee Invoice')} ${safe.invoiceNumber}</title>
<style>body{font-family:Arial,sans-serif;font-size:12pt;margin:40px;color:#222}.header{text-align:center;margin-bottom:30px}.table{width:100%;border-collapse:collapse;margin:20px 0}.table td,.table th{border:1px solid #ccc;padding:8px 12px}.table th{background:#f0f0f0;font-weight:bold}.total-row{font-weight:bold;background:#f8f8f8}</style>
</head><body>
<div class="header"><h1>${label('CREDIT GUARANTEE FUND - GUARANTEE FEE INVOICE')}</h1><h2>${label('Credit Guarantee Fund – Ministry of Finance')}</h2></div>
<p><strong>${label('Invoice No.')}:</strong> ${safe.invoiceNumber}<br><strong>${label('Date')}:</strong> ${safe.date}<br><strong>${label('Loan Ref.')}:</strong> ${safe.loanReference}</p>
<p><strong>${label('To')}:</strong> ${safe.bank}<br>${label('Borrower')}: ${safe.borrower}</p>
<table class="table"><thead><tr><th>${label('Description')}</th><th>${label('Base Amount')}</th><th>${label('Rate')}</th><th>${label('Fee Amount')}</th></tr></thead><tbody>
<tr><td>${safe.description}</td><td>${safe.baseAmount}</td><td>${safe.rate}</td><td>${safe.feeAmount}</td></tr>
<tr class="total-row"><td colspan="3" style="text-align:right">${label('Total Due')}:</td><td>${safe.feeAmount}</td></tr>
</tbody></table>
<p>${label('Please remit payment to the PRSF Trust Fund Account within 30 days of this invoice date.')}</p>
<p style="margin-top:40px;font-size:10pt;color:#666">${label('Generated')}: ${safe.date}</p>
</body></html>`
}
