import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

/**
 * Sends an email using Resend
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!resend) {
    console.warn('Email service not configured: RESEND_API_KEY is missing')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'PRSF MIS <noreply@prsf.tj>',
      to: Array.isArray(options.to) ? options.to : [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    })

    if (error) {
      console.error('Email send error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Email exception:', errorMsg)
    return { success: false, error: errorMsg }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email Templates
// ─────────────────────────────────────────────────────────────────────────────

const baseStyles = `
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
  .header h1 { margin: 0; font-size: 24px; }
  .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
  .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: 0; }
  .button { display: inline-block; background: #0d9488; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
  .highlight { background: #f0fdfa; padding: 15px; border-radius: 6px; border-left: 4px solid #0d9488; margin: 20px 0; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; }
  td:first-child { font-weight: 600; color: #6b7280; width: 40%; }
`

function wrapTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PRSF Credit Guarantee Fund</h1>
      <p style="margin: 5px 0 0; opacity: 0.9;">Ministry of Finance — Republic of Tajikistan</p>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated message from the PRSF Management Information System.</p>
      <p>For support, contact <a href="mailto:prsf@minfin.tj">prsf@minfin.tj</a></p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Send loan status update notification
 */
export async function sendLoanStatusNotification(params: {
  to: string
  borrowerName: string
  loanNumber: string
  newStatus: string
  statusMessage: string
  actionUrl?: string
}): Promise<EmailResult> {
  const statusColors: Record<string, string> = {
    approved: '#10b981',
    rejected: '#ef4444',
    guarantee_issued: '#0d9488',
    disbursed: '#3b82f6',
    defaulted: '#dc2626',
  }

  const content = `
    <h2>Loan Status Update</h2>
    <p>Dear Partner,</p>
    <p>This is to inform you that the loan application has been updated:</p>
    
    <div class="highlight">
      <table>
        <tr><td>Borrower:</td><td>${params.borrowerName}</td></tr>
        <tr><td>Loan Number:</td><td>${params.loanNumber}</td></tr>
        <tr><td>New Status:</td><td><span style="color: ${statusColors[params.newStatus] || '#333'}; font-weight: bold;">${params.newStatus.replace(/_/g, ' ').toUpperCase()}</span></td></tr>
      </table>
    </div>
    
    <p>${params.statusMessage}</p>
    
    ${params.actionUrl ? `<p style="text-align: center; margin-top: 25px;"><a href="${params.actionUrl}" class="button">View Loan Details</a></p>` : ''}
  `

  return sendEmail({
    to: params.to,
    subject: `[PRSF] Loan ${params.loanNumber} - Status Update: ${params.newStatus.replace(/_/g, ' ')}`,
    html: wrapTemplate(content),
  })
}

/**
 * Send guarantee issuance notification
 */
export async function sendGuaranteeIssuedNotification(params: {
  to: string
  borrowerName: string
  loanNumber: string
  guaranteeNumber: string
  guaranteeAmount: string
  validUntil: string
  downloadUrl?: string
}): Promise<EmailResult> {
  const content = `
    <h2>Letter of Guarantee Issued</h2>
    <p>Dear Partner,</p>
    <p>We are pleased to inform you that a Letter of Guarantee has been issued for the following loan:</p>
    
    <div class="highlight">
      <table>
        <tr><td>Borrower:</td><td>${params.borrowerName}</td></tr>
        <tr><td>Loan Number:</td><td>${params.loanNumber}</td></tr>
        <tr><td>Guarantee Number:</td><td><strong>${params.guaranteeNumber}</strong></td></tr>
        <tr><td>Guaranteed Amount:</td><td><strong>${params.guaranteeAmount}</strong></td></tr>
        <tr><td>Valid Until:</td><td>${params.validUntil}</td></tr>
      </table>
    </div>
    
    <p>Please log in to the PRSF MIS to download the official Letter of Guarantee document.</p>
    
    ${params.downloadUrl ? `<p style="text-align: center; margin-top: 25px;"><a href="${params.downloadUrl}" class="button">Download Guarantee Letter</a></p>` : ''}
  `

  return sendEmail({
    to: params.to,
    subject: `[PRSF] Letter of Guarantee Issued - ${params.guaranteeNumber}`,
    html: wrapTemplate(content),
  })
}

/**
 * Send claim status notification
 */
export async function sendClaimNotification(params: {
  to: string
  loanNumber: string
  claimAmount: string
  status: 'submitted' | 'approved' | 'rejected' | 'paid'
  message?: string
}): Promise<EmailResult> {
  const statusMessages: Record<string, string> = {
    submitted: 'A new claim has been submitted and is awaiting review.',
    approved: 'Your claim has been approved and will be processed for payment.',
    rejected: 'Your claim has been reviewed and unfortunately could not be approved.',
    paid: 'Your claim payment has been processed successfully.',
  }

  const content = `
    <h2>Claim ${params.status === 'submitted' ? 'Submitted' : 'Status Update'}</h2>
    <p>Dear Partner,</p>
    
    <div class="highlight">
      <table>
        <tr><td>Loan Number:</td><td>${params.loanNumber}</td></tr>
        <tr><td>Claim Amount:</td><td><strong>${params.claimAmount}</strong></td></tr>
        <tr><td>Status:</td><td><strong>${params.status.toUpperCase()}</strong></td></tr>
      </table>
    </div>
    
    <p>${params.message || statusMessages[params.status]}</p>
  `

  return sendEmail({
    to: params.to,
    subject: `[PRSF] Claim ${params.status === 'submitted' ? 'Submitted' : 'Update'} - Loan ${params.loanNumber}`,
    html: wrapTemplate(content),
  })
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(params: {
  to: string
  resetUrl: string
  expiresIn?: string
}): Promise<EmailResult> {
  const content = `
    <h2>Password Reset Request</h2>
    <p>Hello,</p>
    <p>We received a request to reset your password for your PRSF MIS account.</p>
    
    <p style="text-align: center; margin: 30px 0;">
      <a href="${params.resetUrl}" class="button">Reset Password</a>
    </p>
    
    <p style="font-size: 14px; color: #6b7280;">
      This link will expire in ${params.expiresIn || '1 hour'}. If you did not request a password reset, please ignore this email or contact support if you have concerns.
    </p>
    
    <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
      If the button doesn't work, copy and paste this URL into your browser:<br>
      <a href="${params.resetUrl}" style="color: #0d9488; word-break: break-all;">${params.resetUrl}</a>
    </p>
  `

  return sendEmail({
    to: params.to,
    subject: '[PRSF] Password Reset Request',
    html: wrapTemplate(content),
  })
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail(params: {
  to: string
  fullName: string
  role: string
  loginUrl: string
  tempPassword?: string
}): Promise<EmailResult> {
  const content = `
    <h2>Welcome to PRSF MIS</h2>
    <p>Dear ${params.fullName},</p>
    <p>Your account has been created on the PRSF Management Information System.</p>
    
    <div class="highlight">
      <table>
        <tr><td>Email:</td><td>${params.to}</td></tr>
        <tr><td>Role:</td><td>${params.role}</td></tr>
        ${params.tempPassword ? `<tr><td>Temporary Password:</td><td><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${params.tempPassword}</code></td></tr>` : ''}
      </table>
    </div>
    
    ${params.tempPassword ? '<p><strong>Please change your password immediately after your first login.</strong></p>' : ''}
    
    <p style="text-align: center; margin-top: 25px;">
      <a href="${params.loginUrl}" class="button">Login to PRSF MIS</a>
    </p>
  `

  return sendEmail({
    to: params.to,
    subject: '[PRSF] Welcome to PRSF Management Information System',
    html: wrapTemplate(content),
  })
}
