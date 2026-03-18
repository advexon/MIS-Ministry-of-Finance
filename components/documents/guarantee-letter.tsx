'use client'

import { forwardRef } from 'react'
import Image from 'next/image'
import type { LoanApplication } from '@/lib/types/database'

interface GuaranteeLetterProps {
  loan: LoanApplication & {
    borrower?: {
      company_name?: string
      legal_name?: string
      tin?: string
      legal_address?: string
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

const formatCurrency = (amount: number | null | undefined, currency = 'TJS') => {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const formatDate = (date: string | null | undefined) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const numberToWords = (num: number): string => {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

  if (num === 0) return 'zero'
  if (num < 20) return ones[num]
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '')
  if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' and ' + numberToWords(num % 100) : '')
  if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '')
  return numberToWords(Math.floor(num / 1000000)) + ' million' + (num % 1000000 ? ' ' + numberToWords(num % 1000000) : '')
}

export const GuaranteeLetter = forwardRef<HTMLDivElement, GuaranteeLetterProps>(
  ({ loan, guaranteeNumber, issueDate, validUntil, approvedBy, className, isDraft = false }, ref) => {
    const today = new Date()
    const effectiveIssueDate = issueDate || loan.guarantee_issued_date || today.toISOString()
    const effectiveGuaranteeNumber = guaranteeNumber || loan.guarantee_number || `GF-${today.getFullYear()}-${String(loan.id).slice(-6).toUpperCase()}`
    
    // Calculate validity (default: loan term + 3 months grace)
    const maturityDate = loan.maturity_date ? new Date(loan.maturity_date) : new Date(today.getFullYear() + 3, today.getMonth(), today.getDate())
    const effectiveValidUntil = validUntil || maturityDate.toISOString()

    const guaranteeAmount = loan.guarantee_amount || (loan.approved_amount || 0) * ((loan.guarantee_coverage || 50) / 100)
    const amountInWords = numberToWords(Math.round(guaranteeAmount))

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
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 relative">
              <Image
                src="/logo.png"
                alt="Republic of Tajikistan Emblem"
                width={64}
                height={64}
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 uppercase tracking-wide">
                Credit Guarantee Fund
              </h1>
              <p className="text-sm text-gray-600">
                Private Sector Resilience Fund · Republic of Tajikistan
              </p>
            </div>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>Ref: <span className="font-semibold text-gray-900">{effectiveGuaranteeNumber}</span></p>
            <p>Date: {formatDate(effectiveIssueDate)}</p>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold uppercase tracking-widest text-gray-900 border-b border-gray-400 inline-block pb-1">
            Letter of Guarantee
          </h2>
        </div>

        {/* Addressee */}
        <div className="mb-6">
          <p className="font-semibold">To:</p>
          <p className="font-bold text-gray-900">{loan.bank?.name_en || 'Partner Financial Institution'}</p>
          {loan.branch?.name_en && <p>{loan.branch.name_en}</p>}
          <p>Republic of Tajikistan</p>
        </div>

        {/* Subject Line */}
        <div className="mb-6">
          <p>
            <span className="font-semibold">Subject:</span>{' '}
            <span className="underline">
              Guarantee for Loan to {loan.borrower?.company_name || loan.borrower?.legal_name || 'Borrower'}
            </span>
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 text-justify">
          <p>Dear Sir/Madam,</p>

          <p>
            We, the <strong>Credit Guarantee Fund of the Republic of Tajikistan</strong>, hereby 
            irrevocably and unconditionally guarantee the repayment of the credit facility 
            extended by your institution to the borrower specified below, subject to the 
            terms and conditions set forth herein.
          </p>

          {/* Guarantee Details Table */}
          <div className="my-6 border border-gray-300">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 bg-gray-50 font-semibold w-2/5">Borrower Name:</td>
                  <td className="px-4 py-2">{loan.borrower?.company_name || loan.borrower?.legal_name || '—'}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 bg-gray-50 font-semibold">Taxpayer ID (TIN):</td>
                  <td className="px-4 py-2">{loan.borrower?.tin || '—'}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 bg-gray-50 font-semibold">Loan Amount:</td>
                  <td className="px-4 py-2">{formatCurrency(loan.approved_amount, loan.currency)}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 bg-gray-50 font-semibold">Guarantee Coverage:</td>
                  <td className="px-4 py-2">{loan.guarantee_coverage || 50}%</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 bg-gray-50 font-semibold">Guarantee Amount:</td>
                  <td className="px-4 py-2 font-bold">
                    {formatCurrency(guaranteeAmount, loan.currency)}
                    <br />
                    <span className="font-normal text-gray-600 italic">
                      ({amountInWords} {loan.currency || 'TJS'})
                    </span>
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 bg-gray-50 font-semibold">Loan Term:</td>
                  <td className="px-4 py-2">{loan.duration_months || '—'} months</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-4 py-2 bg-gray-50 font-semibold">Loan Purpose:</td>
                  <td className="px-4 py-2 capitalize">{loan.purpose?.replace(/_/g, ' ') || '—'}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 bg-gray-50 font-semibold">Guarantee Valid Until:</td>
                  <td className="px-4 py-2">{formatDate(effectiveValidUntil)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Terms and Conditions */}
          <p className="font-semibold mt-6">Terms and Conditions:</p>
          <ol className="list-decimal list-inside space-y-2 ml-4">
            <li>
              This guarantee covers <strong>{loan.guarantee_coverage || 50}%</strong> of the 
              outstanding principal amount in case of default by the borrower.
            </li>
            <li>
              The guarantee becomes effective upon disbursement of the loan and remains 
              valid until <strong>{formatDate(effectiveValidUntil)}</strong> or full repayment 
              of the loan, whichever occurs first.
            </li>
            <li>
              In the event of default, the lending institution must submit a formal claim 
              within 90 days of the default date, accompanied by all required documentation 
              as per the Guarantee Agreement.
            </li>
            <li>
              The Fund reserves the right to subrogate to the rights of the lending 
              institution upon payment of any claim under this guarantee.
            </li>
            <li>
              This guarantee is subject to the terms of the Master Guarantee Agreement 
              between the Fund and the Partner Financial Institution.
            </li>
          </ol>

          <p className="mt-6">
            This Letter of Guarantee is issued under the authority of the Credit Guarantee 
            Fund and is governed by the laws of the Republic of Tajikistan.
          </p>
        </div>

        {/* Signature Block */}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div>
            <p className="font-semibold mb-12">Authorized Signatory:</p>
            <div className="border-t border-gray-400 pt-2">
              <p className="font-bold">{approvedBy || 'Director'}</p>
              <p className="text-sm text-gray-600">Credit Guarantee Fund</p>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-12">Official Seal:</p>
            <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center text-xs text-gray-400">
              [SEAL]
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
          <p>Credit Guarantee Fund · Rudaki Avenue 42, Dushanbe, Republic of Tajikistan</p>
          <p>Tel: +992 37 XXX XXXX · Email: info@cgf.tj · www.cgf.tj</p>
        </div>
      </div>
    )
  }
)

GuaranteeLetter.displayName = 'GuaranteeLetter'

export default GuaranteeLetter
