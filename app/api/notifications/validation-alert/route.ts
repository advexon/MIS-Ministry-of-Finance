import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/service'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      loanApplicationId,
      loanNumber,
      borrowerName,
      validationErrors,
      reviewerNotes,
      assignedOfficerId,
    } = body

    if (!loanApplicationId || !validationErrors || validationErrors.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get loan officer details
    let officerEmail: string | null = null
    let officerName = 'Loan Officer'

    if (assignedOfficerId) {
      const { data: officer } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', assignedOfficerId)
        .single()

      if (officer) {
        officerEmail = officer.email
        officerName = officer.full_name || 'Loan Officer'
      }
    }

    // Create in-app notification
    const notificationData = {
      user_id: assignedOfficerId || user.id,
      type: 'validation_error',
      title: `Validation Issues Found - ${loanNumber || 'Application'}`,
      message: `${validationErrors.length} validation error${validationErrors.length > 1 ? 's' : ''} found for ${borrowerName || 'application'}. Please review and correct.`,
      data: {
        loan_application_id: loanApplicationId,
        loan_number: loanNumber,
        borrower_name: borrowerName,
        errors: validationErrors,
        reviewer_notes: reviewerNotes,
        created_by: user.id,
      },
      is_read: false,
      priority: validationErrors.length > 3 ? 'high' : 'medium',
    }

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notificationData)

    if (notifError) {
      console.error('Failed to create notification:', notifError)
    }

    // Send email notification if officer email is available
    if (officerEmail) {
      const errorList = validationErrors
        .map((e: { field: string; label: string; error: string }) => 
          `<li><strong>${e.label}:</strong> ${e.error}</li>`
        )
        .join('')

      await sendEmail({
        to: officerEmail,
        subject: `[Action Required] Validation Errors - Loan Application ${loanNumber || ''}`,
        html: `
          <h2>Validation Issues Require Attention</h2>
          <p>Dear ${officerName},</p>
          <p>The following validation errors were found during review of loan application <strong>${loanNumber || loanApplicationId}</strong> for <strong>${borrowerName || 'borrower'}</strong>:</p>
          <ul style="color: #dc2626; margin: 16px 0;">
            ${errorList}
          </ul>
          ${reviewerNotes ? `<p><strong>Reviewer Notes:</strong> ${reviewerNotes}</p>` : ''}
          <p>Please log in to the system and correct these issues as soon as possible.</p>
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://prsf.tj'}/dashboard/loans/${loanApplicationId}" 
               style="display: inline-block; padding: 12px 24px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px;">
              View Application
            </a>
          </p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            This is an automated notification from the PRSF Management Information System.
          </p>
        `,
      })
    }

    // Log audit trail
    await supabase.from('audit_trail').insert({
      table_name: 'loan_applications',
      record_id: loanApplicationId,
      action: 'VALIDATION_ALERT_SENT',
      new_data: {
        errors: validationErrors,
        notified_user_id: assignedOfficerId,
        reviewer_notes: reviewerNotes,
      },
      changed_by: user.id,
    })

    return NextResponse.json({
      success: true,
      message: 'Validation alert sent successfully',
      notificationSent: true,
      emailSent: !!officerEmail,
    })
  } catch (error) {
    console.error('Validation alert error:', error)
    return NextResponse.json(
      { error: 'Failed to send validation alert' },
      { status: 500 }
    )
  }
}
