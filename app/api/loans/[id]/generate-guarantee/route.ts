import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Generate a unique guarantee number
 * Format: GF-YYYY-[BANK_CODE]-[SEQUENTIAL_6_DIGIT]
 */
async function generateGuaranteeNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bankCode: string
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `GF-${year}-${bankCode.toUpperCase()}`
  
  // Get the latest guarantee number for this bank/year
  const { data: latestGuarantee } = await supabase
    .from('guarantee_letters')
    .select('guarantee_number')
    .like('guarantee_number', `${prefix}-%`)
    .order('guarantee_number', { ascending: false })
    .limit(1)
    .single()

  let sequence = 1
  if (latestGuarantee?.guarantee_number) {
    const parts = latestGuarantee.guarantee_number.split('-')
    const lastSeq = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastSeq)) {
      sequence = lastSeq + 1
    }
  }

  return `${prefix}-${sequence.toString().padStart(6, '0')}`
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
      .select('*, role:roles(*)')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Check permission: only PRSF staff (tier <= 4) can issue guarantees
    const roleTier = (profile.role as any)?.tier ?? 99
    if (roleTier > 4) {
      return NextResponse.json(
        { error: 'Insufficient permissions to issue guarantees' },
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

    // Check if loan is in valid status for guarantee issuance
    const validStatuses = ['approved', 'guarantee_issued', 'disbursed', 'active']
    if (!validStatuses.includes(loan.status)) {
      return NextResponse.json(
        { error: `Cannot issue guarantee for loan in '${loan.status}' status` },
        { status: 400 }
      )
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

    // Generate unique guarantee number
    const bankCode = (loan.bank as any)?.code || 'UNK'
    const guaranteeNumber = await generateGuaranteeNumber(supabase, bankCode)

    // Calculate validity date (loan maturity + 3 months for claim period)
    let validUntilDate = null
    if (loan.maturity_date) {
      const maturity = new Date(loan.maturity_date)
      maturity.setMonth(maturity.getMonth() + 3)
      validUntilDate = maturity.toISOString()
    }

    const now = new Date().toISOString()

    // Create guarantee letter record
    const { data: newGuarantee, error: insertError } = await supabase
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
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create guarantee letter:', insertError)
      return NextResponse.json(
        { error: 'Failed to create guarantee letter' },
        { status: 500 }
      )
    }

    // Update loan_applications with guarantee info
    const { error: updateError } = await supabase
      .from('loan_applications')
      .update({
        guarantee_number: guaranteeNumber,
        guarantee_issued_date: now,
        status: loan.status === 'approved' ? 'guarantee_issued' : loan.status,
      })
      .eq('id', loanId)

    if (updateError) {
      console.error('Failed to update loan with guarantee info:', updateError)
      // Don't fail the request - the guarantee letter was created
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
