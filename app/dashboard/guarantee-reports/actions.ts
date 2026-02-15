'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getGuaranteeReports(filters?: {
  status?: string
  bankId?: string
}) {
  const supabase = await createClient()
  
  let query = supabase
    .from('guarantee_reports')
    .select(`
      *,
      bank:banks(id, name, code),
      submitted_by:profiles!guarantee_reports_submitted_by_fkey(id, name, email)
    `)
    .order('report_month', { ascending: false })

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }

  if (filters?.bankId && filters.bankId !== 'all') {
    query = query.eq('bank_id', filters.bankId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[v0] Error fetching guarantee reports:', error)
    throw new Error('Failed to fetch guarantee reports')
  }

  return data
}

export async function getGuaranteeReport(id: string) {
  const supabase = await createClient()
  
  const { data: report, error: reportError } = await supabase
    .from('guarantee_reports')
    .select(`
      *,
      bank:banks(id, name, code),
      submitted_by:profiles!guarantee_reports_submitted_by_fkey(id, name, email),
      reviewed_by:profiles!guarantee_reports_reviewed_by_fkey(id, name, email)
    `)
    .eq('id', id)
    .single()

  if (reportError) {
    console.error('[v0] Error fetching guarantee report:', reportError)
    throw new Error('Failed to fetch guarantee report')
  }

  // Fetch associated loans
  const { data: loans, error: loansError } = await supabase
    .from('guarantee_report_loans')
    .select('*')
    .eq('report_id', id)
    .order('row_number', { ascending: true })

  if (loansError) {
    console.error('[v0] Error fetching report loans:', loansError)
  }

  // Fetch associated payments
  const { data: payments, error: paymentsError } = await supabase
    .from('guarantee_report_payments')
    .select('*')
    .eq('report_id', id)
    .order('loan_number', { ascending: true })
    .order('installment_number', { ascending: true })

  if (paymentsError) {
    console.error('[v0] Error fetching report payments:', paymentsError)
  }

  return {
    report,
    loans: loans || [],
    payments: payments || [],
  }
}

export async function createGuaranteeReport(data: {
  bankId: string
  reportMonth: string
  reportType: string
}) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: report, error } = await supabase
    .from('guarantee_reports')
    .insert({
      bank_id: data.bankId,
      report_month: data.reportMonth,
      report_type: data.reportType,
      status: 'draft',
      submitted_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[v0] Error creating guarantee report:', error)
    throw new Error('Failed to create guarantee report')
  }

  revalidatePath('/dashboard/guarantee-reports')
  return report
}

export async function updateGuaranteeReport(
  id: string,
  data: Partial<{
    status: string
    totalLoans: number
    totalOutstandingPrincipal: number
    totalGuaranteeAmount: number
  }>
) {
  const supabase = await createClient()
  
  const { data: report, error } = await supabase
    .from('guarantee_reports')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error updating guarantee report:', error)
    throw new Error('Failed to update guarantee report')
  }

  revalidatePath('/dashboard/guarantee-reports')
  revalidatePath(`/dashboard/guarantee-reports/${id}`)
  return report
}

export async function submitGuaranteeReport(id: string) {
  const supabase = await createClient()
  
  const { data: report, error } = await supabase
    .from('guarantee_reports')
    .update({
      status: 'submitted',
      submission_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error submitting guarantee report:', error)
    throw new Error('Failed to submit guarantee report')
  }

  revalidatePath('/dashboard/guarantee-reports')
  revalidatePath(`/dashboard/guarantee-reports/${id}`)
  return report
}

export async function approveGuaranteeReport(id: string, reviewNotes?: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: report, error } = await supabase
    .from('guarantee_reports')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      review_date: new Date().toISOString(),
      review_notes: reviewNotes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error approving guarantee report:', error)
    throw new Error('Failed to approve guarantee report')
  }

  revalidatePath('/dashboard/guarantee-reports')
  revalidatePath(`/dashboard/guarantee-reports/${id}`)
  return report
}

export async function rejectGuaranteeReport(id: string, reviewNotes: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('Not authenticated')
  }

  if (!reviewNotes.trim()) {
    throw new Error('Review notes are required when rejecting a report')
  }

  const { data: report, error } = await supabase
    .from('guarantee_reports')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      review_date: new Date().toISOString(),
      review_notes: reviewNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error rejecting guarantee report:', error)
    throw new Error('Failed to reject guarantee report')
  }

  revalidatePath('/dashboard/guarantee-reports')
  revalidatePath(`/dashboard/guarantee-reports/${id}`)
  return report
}

export async function requestRevisionGuaranteeReport(id: string, reviewNotes: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('Not authenticated')
  }

  if (!reviewNotes.trim()) {
    throw new Error('Review notes are required when requesting revision')
  }

  const { data: report, error } = await supabase
    .from('guarantee_reports')
    .update({
      status: 'revision_requested',
      reviewed_by: user.id,
      review_date: new Date().toISOString(),
      review_notes: reviewNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[v0] Error requesting revision for guarantee report:', error)
    throw new Error('Failed to request revision for guarantee report')
  }

  revalidatePath('/dashboard/guarantee-reports')
  revalidatePath(`/dashboard/guarantee-reports/${id}`)
  return report
}

export async function deleteGuaranteeReport(id: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('guarantee_reports')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[v0] Error deleting guarantee report:', error)
    throw new Error('Failed to delete guarantee report')
  }

  revalidatePath('/dashboard/guarantee-reports')
  return { success: true }
}

export async function addLoanToReport(reportId: string, loanData: any) {
  const supabase = await createClient()
  
  const { data: loan, error } = await supabase
    .from('guarantee_report_loans')
    .insert({
      report_id: reportId,
      ...loanData,
    })
    .select()
    .single()

  if (error) {
    console.error('[v0] Error adding loan to report:', error)
    throw new Error('Failed to add loan to report')
  }

  // Update report totals
  await recalculateReportTotals(reportId)

  revalidatePath(`/dashboard/guarantee-reports/${reportId}`)
  return loan
}

export async function addPaymentToReport(reportId: string, paymentData: any) {
  const supabase = await createClient()
  
  const { data: payment, error } = await supabase
    .from('guarantee_report_payments')
    .insert({
      report_id: reportId,
      ...paymentData,
    })
    .select()
    .single()

  if (error) {
    console.error('[v0] Error adding payment to report:', error)
    throw new Error('Failed to add payment to report')
  }

  revalidatePath(`/dashboard/guarantee-reports/${reportId}`)
  return payment
}

async function recalculateReportTotals(reportId: string) {
  const supabase = await createClient()
  
  const { data: loans } = await supabase
    .from('guarantee_report_loans')
    .select('outstanding_principal, guarantee_amount')
    .eq('report_id', reportId)

  if (!loans) return

  const totalLoans = loans.length
  const totalOutstanding = loans.reduce((sum, loan) => sum + (loan.outstanding_principal || 0), 0)
  const totalGuarantee = loans.reduce((sum, loan) => sum + (loan.guarantee_amount || 0), 0)

  await supabase
    .from('guarantee_reports')
    .update({
      total_loans: totalLoans,
      total_outstanding_principal: totalOutstanding,
      total_guarantee_amount: totalGuarantee,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
}
