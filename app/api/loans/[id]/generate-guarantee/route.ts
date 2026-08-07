import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  STEP_BY_STATUS, canActOnStep, canTransition, getStepByNumber,
} from '@/lib/workflow/fkg-scheme'
import type { LoanStatus } from '@/lib/types/database'

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

/**
 * Generate a guarantee number of the form GF-YYYY-[BANK_CODE]-[SEQUENTIAL_6].
 *
 * The sequence is derived by reading the current maximum, which is inherently
 * racy: two officers issuing at the same moment compute the same number. Both
 * `guarantee_letters.guarantee_number` and `loan_applications.guarantee_number`
 * carry unique indexes, so a collision cannot corrupt the register — it surfaces
 * as a unique violation, and the caller retries with a recomputed sequence.
 *
 * The maximum is taken across BOTH tables. Legacy loans carry a number on
 * `loan_applications` with no matching letter row, so reading only the letters
 * table would re-issue a number that is already in use.
 */
async function nextGuaranteeNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankCode: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `GF-${year}-${bankCode.toUpperCase()}`

  const [letters, loans] = await Promise.all([
    supabase
      .from('guarantee_letters')
      .select('guarantee_number')
      .like('guarantee_number', `${prefix}-%`)
      .order('guarantee_number', { ascending: false })
      .limit(1),
    supabase
      .from('loan_applications')
      .select('guarantee_number')
      .like('guarantee_number', `${prefix}-%`)
      .order('guarantee_number', { ascending: false })
      .limit(1),
  ])

  const seqOf = (n: string | null | undefined): number => {
    if (!n) return 0
    const parsed = Number.parseInt(n.slice(prefix.length + 1), 10)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const highest = Math.max(
    seqOf(letters.data?.[0]?.guarantee_number),
    seqOf(loans.data?.[0]?.guarantee_number),
  )

  return `${prefix}-${(highest + 1).toString().padStart(6, '0')}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile with role to check permissions
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active, role:roles(code, tier)')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    if (!profile.is_active) {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    }

    // Issuance is step 16 of the ФКГ scheme, reserved to ФКГ Management (and
    // admins as the break-glass path). The previous `tier <= 4` test let any
    // mid-tier staff member issue a ПВГ, which is a wider grant than the
    // Guideline allows.
    const roleCode = (profile.role as { code?: string } | null)?.code ?? null
    const step16 = getStepByNumber(16)!
    if (!canActOnStep(roleCode, step16)) {
      return NextResponse.json(
        {
          error: `Role "${roleCode ?? 'unknown'}" may not issue a ПВГ. Step 16 is reserved to ФКГ Management.`,
          code: 'WRONG_LANE',
        },
        { status: 403 }
      )
    }

    // Fetch the loan with bank info
    const { data: loan, error: loanError } = await supabase
      .from('loan_applications')
      .select('*, bank:banks(id, code, name_en), borrower:borrowers(name)')
      .eq('id', loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    // Two legitimate cases, kept distinct rather than merged into one loose list:
    //
    //  (a) a real step 15 -> 16 issuance, which the engine must sanction; and
    //  (b) a backfill, where the loan is already at or past issuance but has no
    //      letter row — true of the loans that predate this table.
    //
    // Case (b) must not move the status; case (a) must.
    const status = loan.status as LoanStatus
    const isBackfill = ['guarantee_issued', 'disbursed', 'active'].includes(status)
    const isIssuance = canTransition(status, 'guarantee_issued')

    if (!isBackfill && !isIssuance) {
      const step = STEP_BY_STATUS[status]
      return NextResponse.json(
        {
          error:
            `Cannot issue a ПВГ from "${status}"` +
            (step ? ` (step ${step.step}: ${step.titleEn})` : '') +
            '. The application must clear the ФКГ Management decision first.',
          code: 'ILLEGAL_TRANSITION',
        },
        { status: 400 }
      )
    }

    // A ПВГ is the execution of the Management decision, so that decision must
    // exist and must be an approval. Without this check the letter could be
    // issued off the back of a rejected or absent decision.
    if (isIssuance) {
      const { data: decision } = await supabase
        .from('management_decisions')
        .select('decision, approved_amount, approved_coverage')
        .eq('loan_id', loanId)
        .order('decided_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!decision) {
        return NextResponse.json(
          {
            error: 'No ФКГ Management decision is recorded for this application (step 15).',
            code: 'MISSING_DECISION',
          },
          { status: 409 }
        )
      }
      // 'approved' — not 'approve'. This is the value the
      // management_decisions_decision_check constraint permits and the value the
      // step 15 form writes. Comparing against the wrong spelling would refuse
      // every legitimate issuance while looking like a working control.
      if (decision.decision !== 'approved') {
        return NextResponse.json(
          {
            error: `The Management decision is "${decision.decision}", so no ПВГ may be issued.`,
            code: 'DECISION_NOT_APPROVAL',
          },
          { status: 409 }
        )
      }
    }

    // Check if guarantee already exists (idempotency)
    const { data: existingGuarantee } = await supabase
      .from('guarantee_letters')
      .select('*')
      .eq('loan_id', loanId)
      .single()

    if (existingGuarantee) {
      return NextResponse.json({
        success: true,
        already_exists: true,
        guarantee_number: existingGuarantee.guarantee_number,
        issued_date: existingGuarantee.issued_date,
        message: 'Guarantee letter already exists for this loan'
      })
    }

    const bankCode = (loan.bank as any)?.code || 'UNK'

    // Calculate validity date (loan maturity + 3 months for claim period)
    let validUntilDate = null
    if (loan.maturity_date) {
      const maturity = new Date(loan.maturity_date)
      maturity.setMonth(maturity.getMonth() + 3)
      validUntilDate = maturity.toISOString()
    }

    const now = new Date().toISOString()

    // Insert with a bounded retry: the sequence is computed from a read, so a
    // concurrent issuance can claim the same number. The unique index rejects
    // the loser, which then recomputes rather than failing the officer's action.
    let newGuarantee: { id: string } | null = null
    let guaranteeNumber = ''
    let lastError: { code?: string; message: string } | null = null

    for (let attempt = 0; attempt < 5; attempt++) {
      guaranteeNumber = await nextGuaranteeNumber(supabase, bankCode)

      const { data, error } = await supabase
        .from('guarantee_letters')
        .insert({
          loan_id: loanId,
          guarantee_number: guaranteeNumber,
          issued_date: now,
          valid_until_date: validUntilDate,
          issued_by_user_id: user.id,
          metadata: {
            borrower_name: (loan.borrower as any)?.name,
            bank_name: (loan.bank as any)?.name_en,
            approved_amount: loan.approved_amount,
            guarantee_amount: loan.guarantee_amount,
            guarantee_coverage: loan.guarantee_coverage,
          }
        })
        .select('id')
        .single()

      if (!error) {
        newGuarantee = data
        break
      }

      lastError = error
      // Only a number collision is worth retrying. A duplicate loan_id means
      // another request issued the letter first, which is not an error.
      if (error.code !== UNIQUE_VIOLATION) break
      if (error.message.includes('loan_id')) {
        const { data: raced } = await supabase
          .from('guarantee_letters')
          .select('guarantee_number, issued_date')
          .eq('loan_id', loanId)
          .maybeSingle()
        return NextResponse.json({
          success: true,
          already_exists: true,
          guarantee_number: raced?.guarantee_number,
          issued_date: raced?.issued_date,
          message: 'Guarantee letter already exists for this loan'
        })
      }
    }

    if (!newGuarantee) {
      console.error('[v0] Failed to create guarantee letter:', lastError)
      return NextResponse.json(
        { error: 'Failed to create guarantee letter. Please retry.' },
        { status: 500 }
      )
    }

    // Update loan_applications with guarantee info. A backfill records the
    // number without touching the status, since the loan is already past
    // issuance and rewriting its status would corrupt the lifecycle.
    const { error: updateError } = await supabase
      .from('loan_applications')
      .update({
        guarantee_number: guaranteeNumber,
        guarantee_issued_date: now,
        ...(isIssuance
          ? { status: 'guarantee_issued' as LoanStatus, current_step: 16 }
          : {}),
      })
      .eq('id', loanId)

    if (updateError) {
      // The letter row exists but the application still reads as un-issued.
      // Reporting success here would leave the two permanently inconsistent
      // with nobody aware, so surface it and let the caller retry: the insert
      // is idempotent on loan_id, so a retry resumes at the update.
      console.error('[v0] Guarantee letter created but loan update failed:', updateError)
      return NextResponse.json(
        {
          error:
            'The guarantee letter was recorded but the application could not be updated. ' +
            'Please retry to complete issuance.',
          code: 'PARTIAL_ISSUANCE',
          guarantee_number: guaranteeNumber,
        },
        { status: 500 }
      )
    }

    // Log access for audit trail
    await supabase.from('access_logs').insert({
      user_id: user.id,
      action: 'create',
      resource: 'guarantee_letters',
      resource_id: newGuarantee.id,
      success: true,
      metadata: {
        loan_id: loanId,
        guarantee_number: guaranteeNumber,
      }
    })

    return NextResponse.json({
      success: true,
      guarantee_number: guaranteeNumber,
      issued_date: now,
      valid_until_date: validUntilDate,
      message: 'Letter of Guarantee issued successfully'
    })

  } catch (error) {
    console.error('Error generating guarantee:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch guarantee letter for this loan
    const { data: guarantee, error } = await supabase
      .from('guarantee_letters')
      .select('*')
      .eq('loan_id', loanId)
      .single()

    if (error || !guarantee) {
      return NextResponse.json(
        { error: 'No guarantee letter found for this loan' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      guarantee
    })

  } catch (error) {
    console.error('Error fetching guarantee:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
