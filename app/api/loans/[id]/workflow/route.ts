/**
 * Server-side enforcement of the ФКГ guarantee-issuance scheme.
 *
 * The loan detail page previously wrote `status` straight from the browser, so
 * the process order existed only as UI convention: anyone able to call Supabase
 * with a valid session could jump an application from `submitted` to
 * `guarantee_issued`. Every scheme transition now goes through this route, which
 * re-checks the transition, the caller's role and the step's preconditions on
 * the server. The client is treated as untrusted.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  canTransition,
  canActOnStep,
  STEP_BY_STATUS,
  requiresAssessment,
  requiredQuorum,
  tallyVotes,
  evaluateCommitteeOutcome,
  toUsd,
  isWorkflowReadOnlyRole,
} from '@/lib/workflow/fkg-scheme'
import { workflowRequestSchema } from '@/lib/workflow/transition-input'
import { one } from '@/lib/utils/supabase-relation'
import type { LoanStatus } from '@/lib/types/database'

function supabaseFromCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
    process.env.NEXT_PUBLIC_MISSUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: loanId } = await ctx.params
  const cookieStore = await cookies()
  const supabase = supabaseFromCookies(cookieStore)

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await request.json().then(
    (value: unknown) => workflowRequestSchema.safeParse(value),
    () => null,
  )
  if (!parsed?.success) {
    return NextResponse.json({ error: 'Invalid workflow request', code: 'INVALID_REQUEST' }, { status: 400 })
  }
  const body = parsed.data
  const to = body.to as LoanStatus

  // Caller's role.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_active, role:roles(code, tier, is_active)')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active) {
    return NextResponse.json(
      { error: 'Account is inactive' },
      { status: 403 },
    )
  }
  const role = one<{ code?: string; is_active?: boolean }>(profile.role)
  const roleCode = role?.code ?? null
  if (role?.is_active !== true || isWorkflowReadOnlyRole(roleCode)) {
    return NextResponse.json({ error: 'This role cannot change application decisions', code: 'READ_ONLY_ROLE' }, { status: 403 })
  }

  // Current application state.
  const { data: loan, error: loanError } = await supabase
    .from('loan_applications')
    .select('id, status, current_step, approved_amount, guarantee_amount, usd_rate, amount_usd, requires_assessment')
    .eq('id', loanId)
    .single()

  if (loanError || !loan) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const from = loan.status as LoanStatus

  // 1. Is the transition part of the scheme at all?
  if (!canTransition(from, to)) {
    return NextResponse.json(
      {
        error: `Transition ${from} → ${to} is not permitted by the ФКГ scheme.`,
        code: 'ILLEGAL_TRANSITION',
      },
      { status: 422 },
    )
  }

  // Cancellation changes a decision too, so it requires the same lane authority.
  const currentStep = STEP_BY_STATUS[from]

  // `draft` and the legacy `under_review` have no scheme step, so the lane check
  // below would not fire for them. Restrict them explicitly instead of letting
  // an absent step definition become an open door.
  if (!currentStep) {
    const allowedLegacyRoles = from === 'draft'
      ? ['bank_officer', 'bank_admin']
      : from === 'approved'
        ? ['fkg_management']
        : ['prsf_analyst', 'uko_officer']
    if (!roleCode || !allowedLegacyRoles.includes(roleCode)) {
      return NextResponse.json(
        { error: `Role "${roleCode ?? 'unknown'}" may not move an application out of "${from}".`, code: 'WRONG_LANE' },
        { status: 403 },
      )
    }
  }

  if (currentStep && !canActOnStep(roleCode, currentStep)) {
    return NextResponse.json(
      {
        error:
          `Role "${roleCode ?? 'unknown'}" may not complete step ${currentStep.step} ` +
          `(${currentStep.titleEn}). Guideline ${currentStep.guidelineRef}.`,
        code: 'WRONG_LANE',
      },
      { status: 403 },
    )
  }

  // 3. Step-specific preconditions — the artefact each step must produce.
  const precondition = await checkPreconditions(supabase, loanId, from, to, loan)
  if (precondition) {
    return NextResponse.json({ error: precondition.message, code: precondition.code }, { status: 422 })
  }

  if (body.payload && (from !== 'uko_registration' || to !== 'eligibility_review')) {
    return NextResponse.json({ error: 'Registration fields are only accepted during registration', code: 'INVALID_PAYLOAD' }, { status: 400 })
  }
  if (from === 'uko_registration' && to === 'eligibility_review' && !body.payload) {
    return NextResponse.json({ error: 'A positive exchange rate is required', code: 'FX_MISSING' }, { status: 422 })
  }

  // Server-derived amounts and actor stamps cannot be supplied by the browser.
  const now = new Date().toISOString()
  const nextStep = STEP_BY_STATUS[to]?.step ?? loan.current_step ?? null
  const update: Record<string, unknown> = {
    status: to,
    current_step: nextStep,
    updated_at: now,
  }
  if (body.payload) {
    const amountUsd = toUsd(loan.guarantee_amount ?? loan.approved_amount, body.payload.usd_rate)
    update.uko_reference_no = body.payload.uko_reference_no ?? null
    update.usd_rate = body.payload.usd_rate
    update.amount_usd = amountUsd
    update.requires_assessment = requiresAssessment(amountUsd)
    update.uko_registered_at = now
    update.uko_registered_by = user.id
    update.fx_rate_date = now.slice(0, 10)
    update.fx_rate_source = 'Manual entry at УКО registration'
  }

  const { data: changed, error: updateError } = await supabase
    .from('loan_applications')
    .update(update)
    .eq('id', loanId)
    // Optimistic concurrency: if someone else moved the application while this
    // request was in flight, this matches zero rows rather than overwriting.
    .eq('status', from)
    .select('id')
    .maybeSingle()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }
  if (!changed) {
    return NextResponse.json({ error: 'The application changed or is no longer writable. Refresh before retrying.', code: 'TRANSITION_CONFLICT' }, { status: 409 })
  }

  // 5. Audit trail.
  const { error: historyError } = await supabase.from('loan_application_history').insert({
    loan_id: loanId,
    action: 'status_change',
    old_status: from,
    new_status: to,
    performed_by: user.id,
    notes: body.reason ?? null,
  })
  if (historyError) {
    return NextResponse.json({ error: 'The status changed, but its audit record could not be saved. Refresh and contact an administrator.', code: 'AUDIT_WRITE_FAILED', transitionApplied: true }, { status: 500 })
  }

  return NextResponse.json({ ok: true, from, to, step: nextStep })
}

/**
 * Preconditions that make each step meaningful. Without these the statuses would
 * be labels only — an application could reach the Management decision with no
 * assessment note, no risk opinion and no committee vote behind it.
 */
async function checkPreconditions(
  supabase: ReturnType<typeof supabaseFromCookies>,
  loanId: string,
  from: LoanStatus,
  to: LoanStatus,
  loan: {
    approved_amount: number | null
    guarantee_amount: number | null
    usd_rate: number | null
    amount_usd: number | null
    requires_assessment: boolean | null
  },
): Promise<{ message: string; code: string } | null> {
  // Leaving the eligibility gate requires a completed screening record.
  if (from === 'eligibility_review' && (to === 'assessment' || to === 'risk_review')) {
    const { data } = await supabase
      .from('eligibility_checks')
      .select('decision, is_eligible, esms_passed, kyc_passed')
      .eq('loan_id', loanId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data || data.decision !== 'passed') {
      return {
        message: 'Eligibility, ESMS and KYC screening must be recorded and passed before the application proceeds.',
        code: 'ELIGIBILITY_MISSING',
      }
    }

    // Gate D: the 10,000 USD routing decision must be knowable. If the FX rate
    // was never captured we refuse rather than guess, because guessing here
    // could silently skip a mandatory assessment.
    const amountUsd =
      loan.amount_usd ?? toUsd(loan.guarantee_amount ?? loan.approved_amount, loan.usd_rate)
    const needsAssessment = requiresAssessment(amountUsd)

    if (needsAssessment === null) {
      return {
        message:
          'The USD equivalent is unknown, so the 10,000 USD routing gate cannot be evaluated. ' +
          'Record the TJS/USD rate at УКО registration first.',
        code: 'FX_MISSING',
      }
    }
    if (needsAssessment && to === 'risk_review') {
      return {
        message:
          `This guarantee is USD ${amountUsd!.toFixed(2)}, above the 10,000 USD threshold, ` +
          'so an assessment note (step 5) is mandatory and cannot be skipped.',
        code: 'ASSESSMENT_REQUIRED',
      }
    }
  }

  // Step 5 → 6 needs a submitted assessment note.
  if (from === 'assessment' && to === 'risk_review') {
    const { data } = await supabase
      .from('assessment_notes')
      .select('status')
      .eq('loan_id', loanId)
      .eq('status', 'submitted')
      .limit(1)
      .maybeSingle()
    if (!data) {
      return {
        message: 'A submitted assessment note is required before the Credit Risk Department review.',
        code: 'ASSESSMENT_NOT_SUBMITTED',
      }
    }
  }

  // Step 6 → 7 needs a submitted risk opinion.
  if (from === 'risk_review' && to === 'kkg_scheduled') {
    const { data } = await supabase
      .from('risk_reviews')
      .select('status')
      .eq('loan_id', loanId)
      .eq('status', 'submitted')
      .limit(1)
      .maybeSingle()
    if (!data) {
      return {
        message: 'A submitted Credit Risk Department opinion is required before the application is tabled at ККГ.',
        code: 'RISK_REVIEW_MISSING',
      }
    }
  }

  // A recommendation or rejection needs unanimous votes from the assigned seats.
  if (to === 'kkg_protocol' || (from === 'kkg_review' && to === 'rejected')) {
    const { data: item } = await supabase
      .from('committee_agenda_items')
      .select('id, meeting_id, outcome, meeting:committee_meetings(required_quorum)')
      .eq('loan_id', loanId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!item) {
      return {
        message: 'This application has not been tabled at a ККГ meeting.',
        code: 'NO_AGENDA_ITEM',
      }
    }

    const [{ data: votes, error: votesError }, { data: seats, error: seatsError }] = await Promise.all([
      supabase.from('committee_votes').select('member_id, vote').eq('agenda_item_id', item.id),
      supabase.from('committee_meeting_members').select('member_id, attended').eq('meeting_id', item.meeting_id),
    ])
    if (votesError || seatsError || !seats?.length) {
      return { message: 'Committee membership and votes could not be verified.', code: 'COMMITTEE_UNVERIFIED' }
    }
    const seatedIds = new Set(seats.map((seat) => seat.member_id))
    const voterIds = new Set((votes ?? []).map((vote) => vote.member_id))
    if (voterIds.size !== (votes ?? []).length || (votes ?? []).some((vote) => !seatedIds.has(vote.member_id))) {
      return { message: 'Every vote must come from a distinct assigned member.', code: 'INVALID_COMMITTEE_VOTES' }
    }

    const meeting = one<{ required_quorum?: number }>(item.meeting)
    const quorum = Math.max(
      meeting?.required_quorum ?? 0,
      requiredQuorum(loan.amount_usd ?? toUsd(loan.guarantee_amount ?? loan.approved_amount, loan.usd_rate)),
    )
    const tally = tallyVotes((votes ?? []) as { vote: 'for' | 'against' | 'abstain' }[])
    const outcome = evaluateCommitteeOutcome(tally, quorum, seats.length)
    if (!outcome.quorumMet) {
      return { message: outcome.reason, code: 'QUORUM_NOT_MET' }
    }
    const unanimous = to === 'rejected'
      ? tally.total === seats.length && tally.against === seats.length
      : outcome.carried
    if (!unanimous || seats.some((seat) => !seat.attended)) {
      return { message: 'Every assigned member must be present and vote unanimously for this decision.', code: 'UNANIMOUS_DECISION_REQUIRED' }
    }
  }

  // Step 9 → 10 needs a completed verification. Steps 5, 6, 13 and 15 were all
  // gated on their evidence but 9, 11 and 12 were not, so an application could
  // reach ПВГ issuance with no recorded site visit, no signed formal application
  // and no УКО/ККГ reconciliation — the three gates below close that hole.
  if (from === 'verification' && to === 'kkg_protocol') {
    const { data } = await supabase
      .from('verifications')
      .select('status, outcome')
      .eq('loan_id', loanId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) {
      return {
        message: 'A completed verification (step 9) is required before the ККГ protocol is issued.',
        code: 'VERIFICATION_MISSING',
      }
    }
    // A visit that did not confirm the application belongs back at ККГ, not on
    // the protocol. Mirrors how compliance 'not_cleared' is handled below.
    if (data.outcome === 'not_confirmed') {
      return {
        message:
          'The verification visit did not confirm this application, so it cannot proceed to the protocol. ' +
          'Return it to ККГ review.',
        code: 'VERIFICATION_NOT_CONFIRMED',
      }
    }
  }

  // Step 11 → 12 needs the signed formal application (Appendix 1.1).
  if (from === 'formal_application' && to === 'uko_reconciliation') {
    const { data } = await supabase
      .from('formal_applications')
      .select('id')
      .eq('loan_id', loanId)
      .limit(1)
      .maybeSingle()
    if (!data) {
      return {
        message: 'The signed formal application (Appendix 1.1, step 11) must be recorded before УКО reconciliation.',
        code: 'FORMAL_APPLICATION_MISSING',
      }
    }
  }

  // Step 12 → 13 needs the reconciliation, and any disagreement between the УКО
  // decision and the ККГ recommendation must carry a written resolution.
  if (from === 'uko_reconciliation' && to === 'compliance_check') {
    const { data } = await supabase
      .from('uko_reconciliations')
      .select('is_consistent, resolution')
      .eq('loan_id', loanId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) {
      return {
        message: 'The УКО reconciliation against the ККГ recommendation (step 12) must be recorded before compliance.',
        code: 'RECONCILIATION_MISSING',
      }
    }
    if (data.is_consistent === false && !data.resolution?.trim()) {
      return {
        message:
          'The УКО decision differs from the ККГ recommendation, so a written resolution is required before ' +
          'the application proceeds to compliance.',
        code: 'RECONCILIATION_UNRESOLVED',
      }
    }
  }

  // Step 13 → 15 needs a submitted compliance note.
  if (from === 'compliance_check' && to === 'management_review') {
    const { data } = await supabase
      .from('compliance_checks')
      .select('status, outcome')
      .eq('loan_id', loanId)
      .eq('status', 'submitted')
      .limit(1)
      .maybeSingle()
    if (!data) {
      return {
        message: 'A submitted compliance-check note is required before the Management decision.',
        code: 'COMPLIANCE_MISSING',
      }
    }
    if (data.outcome === 'not_cleared') {
      return {
        message: 'Compliance did not clear this application, so it cannot proceed to the Management decision.',
        code: 'COMPLIANCE_NOT_CLEARED',
      }
    }
  }

  // Step 15 → approved needs a recorded Management decision.
  if (from === 'management_review' && to === 'approved') {
    const { data } = await supabase
      .from('management_decisions')
      .select('decision')
      .eq('loan_id', loanId)
      .eq('decision', 'approved')
      .limit(1)
      .maybeSingle()
    if (!data) {
      return {
        message: 'Record the ФКГ Management decision before marking the application approved.',
        code: 'MGMT_DECISION_MISSING',
      }
    }
  }

  return null
}
