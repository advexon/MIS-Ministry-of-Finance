"use client"

import { forwardRef } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import type { LoanApplication } from '@/lib/types/database'

interface GuaranteeLetterProps {
  loan: LoanApplication & {
    borrower?: {
      name?: string
      company_name?: string
      legal_name?: string
      tin_number?: string
      tin?: string
      legal_address?: string
      address_street?: string
      address_city?: string
    }
    bank?: {
      name_en?: string
      code?: string
    }
    branch?: {
      name_en?: string
    }
  }
  guaranteeNumber?: string
  issueDate?: string
  validUntil?: string
  approvedBy?: string
  className?: string
  isDraft?: boolean
}

function formatCurrency(amount: number | null | undefined, currency: string = 'TJS'): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(new Date(dateStr), 'dd MMMM yyyy')
  } catch {
    return dateStr
  }
}

export const GuaranteeLetter = forwardRef<HTMLDivElement, GuaranteeLetterProps>(
  ({ loan, guaranteeNumber, issueDate, validUntil, approvedBy, className, isDraft = false }, ref) => {
    const borrowerName = loan.borrower?.name || loan.borrower?.company_name || loan.borrower?.legal_name || '—'
    const borrowerTIN = loan.borrower?.tin_number || loan.borrower?.tin || '—'
    const borrowerAddress = loan.borrower?.address_street 
      ? `${loan.borrower.address_street}${loan.borrower.address_city ? ', ' + loan.borrower.address_city : ''}`
      : loan.borrower?.legal_address || '—'
    const bankName = loan.bank?.name_en || '—'
    const branchName = loan.branch?.name_en || ''
    const guaranteeCoverage = loan.guarantee_coverage || 50
    const guaranteeAmount = loan.guarantee_amount || (loan.approved_amount ? loan.approved_amount * (guaranteeCoverage / 100) : null)
    
    // Calculate validity (loan maturity + 3 months grace period for claims)
    const validityDate = validUntil || loan.maturity_date

    return (
      <div
        ref={ref}
        className={`bg-white text-black print:text-black relative ${className || ''}`}
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '20mm 25mm',
          fontFamily: 'Times New Roman, serif',
          fontSize: '12pt',
          lineHeight: '1.6',
        }}
      >
        {/* Draft Watermark */}
        {isDraft && (
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none print:hidden"
            style={{ zIndex: 10 }}
          >
            <span 
              className="text-red-200 font-bold uppercase tracking-widest select-none"
              style={{ 
                fontSize: '120px', 
                transform: 'rotate(-30deg)',
                opacity: 0.3 
              }}
            >
              DRAFT
            </span>
          </div>
        )}

        {/* Header with Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image
              src="/logo.png"
              alt="PRSF Logo"
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
          <h1 className="text-xl font-bold uppercase tracking-wide mb-1">
            Credit Guarantee Fund
          </h1>
          <p className="text-sm text-gray-600">
            Ministry of Finance — Republic of Tajikistan
          </p>
          <div className="mt-4 pt-4 border-t-2 border-b-2 border-gray-800 py-2">
            <h2 className="text-lg font-bold uppercase tracking-widest">
              Letter of Guarantee
            </h2>
          </div>
        </div>

        {/* Reference Number and Date */}
        <div className="flex justify-between text-sm mb-6">
          <div>
            <span className="text-gray-600">Reference No.: </span>
            <strong>{guaranteeNumber || 'DRAFT'}</strong>
          </div>
          <div>
            <span className="text-gray-600">Date: </span>
            <strong>{formatDate(issueDate)}</strong>
          </div>
        </div>

        {/* Introduction */}
        <p className="mb-6 text-justify">
          This Letter of Guarantee is issued by the <strong>Credit Guarantee Fund (CGF)</strong>, 
          established under the Ministry of Finance of the Republic of Tajikistan, in favour of 
          the following Partner Financial Institution and Borrower:
        </p>

        {/* Beneficiary Details */}
        <div className="border rounded-lg p-4 mb-6 bg-gray-50">
          <h3 className="font-bold text-sm uppercase tracking-wide mb-3 border-b pb-2">
            Beneficiary Details
          </h3>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-gray-600 w-40">Partner Bank:</td>
                <td className="py-1 font-semibold">{bankName}{branchName && ` (${branchName})`}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Borrower:</td>
                <td className="py-1 font-semibold">{borrowerName}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">TIN:</td>
                <td className="py-1">{loan.borrower?.tin || '—'}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Address:</td>
                <td className="py-1">{loan.borrower?.legal_address || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Guarantee Terms */}
        <div className="border rounded-lg p-4 mb-6">
          <h3 className="font-bold text-sm uppercase tracking-wide mb-3 border-b pb-2">
            Guarantee Terms
          </h3>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-gray-600 w-48">Loan Reference:</td>
                <td className="py-1">{loan.loan_number || loan.id.slice(0, 8)}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Approved Loan Amount:</td>
                <td className="py-1 font-semibold">{formatCurrency(loan.approved_amount, loan.currency)}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Guarantee Coverage:</td>
                <td className="py-1">{guaranteeCoverage}%</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Guaranteed Amount:</td>
                <td className="py-1 font-bold text-teal-700">{formatCurrency(guaranteeAmount, loan.currency)}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Loan Term:</td>
                <td className="py-1">{loan.duration_months || '—'} months</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Interest Rate:</td>
                <td className="py-1">{loan.interest_rate || '—'}% per annum</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Loan Maturity Date:</td>
                <td className="py-1">{formatDate(loan.maturity_date)}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Guarantee Validity:</td>
                <td className="py-1 font-semibold">Until {formatDate(validityDate)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Terms and Conditions */}
        <div className="mb-6">
          <h3 className="font-bold text-sm uppercase tracking-wide mb-3">
            Terms and Conditions
          </h3>
          <ol className="list-decimal list-inside text-sm space-y-2 text-justify">
            <li>
              The CGF hereby guarantees <strong>{guaranteeCoverage}%</strong> of the outstanding 
              principal balance in the event of default by the Borrower, subject to the terms and 
              conditions of the Guarantee Agreement and the Operational Manual of the PRSF Programme.
            </li>
            <li>
              This guarantee is non-transferable and shall expire upon full repayment of the loan 
              or upon the validity date stated above, whichever occurs first.
            </li>
            <li>
              Claims under this guarantee must be submitted within 90 days of the default event, 
              accompanied by all required documentation as specified in the Operational Manual.
            </li>
            <li>
              The Partner Bank must comply with all reporting requirements and notify the CGF of 
              any material changes in the loan status within the prescribed timeframes.
            </li>
          </ol>
        </div>

        {/* Signatures */}
        <div className="mt-12 pt-8 border-t">
          <div className="grid grid-cols-2 gap-16">
            <div>
              <div className="border-t border-black pt-2 w-48">
                <p className="text-xs text-gray-600">Authorised Signatory — CGF</p>
              </div>
              <p className="text-sm mt-2">Name: ________________________</p>
              <p className="text-sm mt-1">Title: Director, PRSF</p>
              <p className="text-sm mt-1">Date: {formatDate(issueDate)}</p>
            </div>
            <div>
              <div className="border-t border-black pt-2 w-48">
                <p className="text-xs text-gray-600">Acknowledged — Partner Bank</p>
              </div>
              <p className="text-sm mt-2">Name: ________________________</p>
              <p className="text-sm mt-1">Title: ________________________</p>
              <p className="text-sm mt-1">Date: ________________________</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-xs text-gray-400">
            This document is generated by the PRSF Management Information System. 
            For verification, contact prsf@minfin.tj
          </p>
          {!isDraft && guaranteeNumber && (
            <p className="text-xs text-gray-500 mt-1">
              Guarantee Reference: {guaranteeNumber}
            </p>
          )}
        </div>
      </div>
    )
  }
)

GuaranteeLetter.displayName = 'GuaranteeLetter'
