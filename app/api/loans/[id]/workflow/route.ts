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
} from '@/lib/workflow/fkg-scheme'
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

  let body: { to?: string; reason?: string; payload?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const to = body.to as LoanStatus | undefined
  if (!to) {
    return NextResponse.json({ error: 'Target status ("to") is required' }, { status: 400 })
  }

  // Caller's role.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_active, role:roles(code, tier)')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active) {
    return NextResponse.json(
      { error: 'Account is inactive' },
      { status: 403 },
    )
  }
  const roleCode = (profile.role as { code?: string } | null)?.code ?? null

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

  // 2. Is the caller in the right swimlane for the step being left?
  //    Cancellation is exempt: it is an administrative action, not a scheme step.
  const currentStep = STEP_BY_STATUS[from]

  // `draft` and the legacy `under_review` have no scheme step, so the lane check
  // below would not fire for them. Restrict them explicitly instead of letting
  // an absent step definition become an open door.
  if (!currentStep && to !== 'cancelled') {
    const allowedLegacyRoles = ['super_admin', 'prsf_admin', 'prsf_analyst', 'uko_officer', 'bank_officer', 'bank_admin']
    if (!roleCode || !allowedLegacyRoles.includes(roleCode)) {
      return NextResponse.json(
        { error: `Role "${roleCode ?? 'unknown'}" may not move an application out of "${from}".`, code: 'WRONG_LANE' },
        { status: 403 },
      )
    }
  }

  if (to !== 'cancelled' && currentStep && !canActOnStep(roleCode, currentStep)) {
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

  // 4. Apply the transition.
  const nextStep = STEP_BY_STATUS[to]?.step ?? loan.current_step ?? null
  const update: Record<string, unknown> = {
    status: to,
    current_step: nextStep,
    updated_at: new Date().toISOString(),
    ...(body.payload ?? {}),
  }

  const { error: updateError } = await supabase
    .from('loan_applications')
    .update(update)
    .eq('id', loanId)
    // Optimistic concurrency: if someone else moved the application while this
    // request was in flight, this matches zero rows rather than overwriting.
    .eq('status', from)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 5. Audit trail.
  await supabase.from('loan_application_history').insert({
    loan_application_id: loanId,
    previous_status: from,
    new_status: to,
    changed_by: user.id,
    notes: body.reason ?? null,
  })

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

  // Step 8/10: the protocol may only be issued once quorum and a majority exist.
  if (to === 'kkg_protocol') {
    const { data: item } = await supabase
      .from('committee_agenda_items')
      .select('id, outcome, meeting:committee_meetings(required_quorum)')
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

    const { data: votes } = await supabase
      .from('committee_votes')
      .select('vote')
      .eq('agenda_item_id', item.id)

    const meeting = item.meeting as { required_quorum?: number } | null
    const quorum =
      meeting?.required_quorum ??
      requiredQuorum(loan.amount_usd ?? toUsd(loan.approved_amount, loan.usd_rate))

    const outcome = evaluateCommitteeOutcome(
      tallyVotes((votes ?? []) as { vote: 'for' | 'against' | 'abstain' }[]),
      quorum,
    )
    if (!outcome.quorumMet) {
      return { message: outcome.reason, code: 'QUORUM_NOT_MET' }
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
