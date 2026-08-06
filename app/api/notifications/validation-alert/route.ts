import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/service'
import { hasPermission, type PermissionOverrides } from '@/lib/utils/permissions'
import type { Role } from '@/lib/types/database'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Escape untrusted values before interpolating them into notification email
 * HTML. Without this, any caller could inject markup or links into a message
 * that arrives looking like an official PRSF notice.
 */
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Sending a validation alert is a loan review action. Previously ANY
    // authenticated user (including a bank_officer from an unrelated bank)
    // could trigger PRSF-branded emails and notifications for any loan.
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active, role:roles(*)')
      .eq('id', user.id)
      .single()

    if (profile?.is_active === false) {
      return NextResponse.json({ error: 'Account is disabled' }, { status: 403 })
    }

    const role = (profile?.role ?? null) as Role | null

    let overrides: PermissionOverrides | null = null
    if (role?.id) {
      const { data: permRows } = await supabase
        .from('role_permissions')
        .select('resource, can_view, can_create, can_update, can_delete, can_approve')
        .eq('role_id', role.id)

      if (permRows && permRows.length > 0) {
        overrides = {}
        for (const row of permRows) {
          overrides[row.resource] = {
            resource: row.resource,
            can_view: !!row.can_view,
            can_create: !!row.can_create,
            can_update: !!row.can_update,
            can_delete: !!row.can_delete,
            can_approve: !!row.can_approve,
          }
        }
      }
    }

    if (!hasPermission(role, 'loans', 'update', overrides)) {
      return NextResponse.json(
        { error: 'Forbidden: loans:update permission required' },
        { status: 403 },
      )
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

    if (!Array.isArray(validationErrors)) {
      return NextResponse.json(
        { error: 'validationErrors must be an array' },
        { status: 400 },
      )
    }

    // Confirm the caller can actually see this loan. This read goes through the
    // session client, so RLS restricts a bank user to their own bank's loans and
    // the route cannot be used to probe or alert on arbitrary loan IDs.
    const { data: loan } = await supabase
      .from('loan_applications')
      .select('id')
      .eq('id', loanApplicationId)
      .maybeSingle()

    if (!loan) {
      return NextResponse.json({ error: 'Loan application not found' }, { status: 404 })
    }

    // Get loan officer details
    let officerEmail: string | null = null
    let officerName = 'Loan Officer'

    if (assignedOfficerId) {
      // `profiles` has first_name/last_name — there is no `full_name` column,
      // so this select used to fail and the officer never got an email.
      const { data: officer, error: officerError } = await supabase
        .from('profiles')
        .select('email, first_name, last_name')
        .eq('id', assignedOfficerId)
        .maybeSingle()

      if (officerError) {
        console.error('[v0] Failed to load assigned officer:', officerError)
      }

      if (officer) {
        officerEmail = officer.email
        const composed = [officer.first_name, officer.last_name]
          .filter(Boolean)
          .join(' ')
          .trim()
        officerName = composed || 'Loan Officer'
      }
    }

    // Create in-app notification.
    // `notifications` has columns (user_id, title, message, type, is_read,
    // link) only — the previous `data` and `priority` keys do not exist, so
    // every insert was rejected and no notification was ever created. The
    // detailed payload is preserved in the audit_trail entry below.
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: assignedOfficerId || user.id,
        type: 'validation_error',
        title: `Validation Issues Found - ${loanNumber || 'Application'}`,
        message: `${validationErrors.length} validation error${validationErrors.length > 1 ? 's' : ''} found for ${borrowerName || 'application'}. Please review and correct.`,
        is_read: false,
        link: `/dashboard/loans/${loanApplicationId}`,
      })

    if (notifError) {
      console.error('[v0] Failed to create notification:', notifError)
    }

    // Send email notification if officer email is available
    if (officerEmail) {
      // Every interpolated value below is caller-supplied, so all of it is
      // escaped to prevent markup/link injection into an official-looking email.
      const errorList = validationErrors
        .map((e: { field?: string; label?: string; error?: string }) =>
          `<li><strong>${escapeHtml(e?.label)}:</strong> ${escapeHtml(e?.error)}</li>`
        )
        .join('')

      await sendEmail({
        to: officerEmail,
        subject: `[Action Required] Validation Errors - Loan Application ${String(loanNumber ?? '').replace(/[\r\n]/g, ' ')}`,
        html: `
          <h2>Validation Issues Require Attention</h2>
          <p>Dear ${escapeHtml(officerName)},</p>
          <p>The following validation errors were found during review of loan application <strong>${escapeHtml(loanNumber || loanApplicationId)}</strong> for <strong>${escapeHtml(borrowerName || 'borrower')}</strong>:</p>
          <ul style="color: #dc2626; margin: 16px 0;">
            ${errorList}
          </ul>
          ${reviewerNotes ? `<p><strong>Reviewer Notes:</strong> ${escapeHtml(reviewerNotes)}</p>` : ''}
          <p>Please log in to the system and correct these issues as soon as possible.</p>
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://prsf.tj'}/dashboard/loans/${encodeURIComponent(String(loanApplicationId))}" 
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
