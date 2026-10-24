import { createClient } from '@/lib/supabase/server'
import { withPermission } from '@/lib/middleware/api-protection'
import { NextRequest, NextResponse } from 'next/server'
import { validationAlertSchema } from '@/lib/notifications'

export const POST = withPermission(
  { resource: 'loans', permission: 'update' },
  async (request: NextRequest, { user }: { user: { id: string } }) => {
    const parsed = validationAlertSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid validation alert' }, { status: 400 })
    }

    const supabase = await createClient()
    const { loanApplicationId, validationErrors, reviewerNotes, assignedOfficerId } = parsed.data
    const { data: loan, error: loanError } = await supabase
      .from('loan_applications')
      .select('id, loan_number, created_by')
      .eq('id', loanApplicationId)
      .maybeSingle()

    if (loanError) {
      return NextResponse.json({ error: 'Could not load loan application' }, { status: 500 })
    }
    if (!loan) {
      return NextResponse.json({ error: 'Loan application not found' }, { status: 404 })
    }

    const recipientId = loan.created_by || user.id
    if (assignedOfficerId && assignedOfficerId !== recipientId) {
      return NextResponse.json({ error: 'The recipient must be the application owner' }, { status: 400 })
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: recipientId,
      type: 'validation_error',
      title: `Validation Issues Found - ${loan.loan_number || 'Application'}`,
      message: `${validationErrors.length} validation issue${validationErrors.length > 1 ? 's' : ''} require correction.${reviewerNotes ? ` Reviewer notes: ${reviewerNotes}` : ''}`,
      is_read: false,
      link: `/dashboard/loans/${loan.id}`,
    })

    if (notificationError) {
      console.error('Failed to persist validation notification:', notificationError)
      return NextResponse.json({ error: 'Could not save the notification. Please try again.' }, { status: 500 })
    }

    const { error: auditError } = await supabase.from('audit_trail').insert({
      table_name: 'loan_applications',
      record_id: loan.id,
      action: 'VALIDATION_ALERT_SENT',
      new_data: {
        errors: validationErrors,
        notified_user_id: recipientId,
        reviewer_notes: reviewerNotes,
        channel: 'in_app',
      },
      changed_by: user.id,
    })
    if (auditError) console.error('Could not audit validation notification:', auditError)

    return NextResponse.json({
      success: true,
      message: 'In-app notification saved successfully',
      notificationSent: true,
    })
  },
)
