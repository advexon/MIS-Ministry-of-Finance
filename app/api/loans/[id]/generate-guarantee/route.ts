import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/loans/[id]/generate-guarantee
 * Generates a Letter of Guarantee for an approved loan
 * 
 * Security: Only PRSF staff (tier <= 4) can issue guarantees
 * Idempotent: Returns existing guarantee if already issued
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()

    // 1. Verify user authentication and permissions
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*, role:roles(*)')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.role) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Check if user has permission (PRSF staff with tier <= 4)
    const userTier = (profile.role as any).tier
    if (userTier > 4) {
      return NextResponse.json({ 
        error: 'Permission denied. Only PRSF staff can issue guarantee letters.' 
      }, { status: 403 })
    }

    // 2. Fetch the loan application
    const { data: loan, error: loanError } = await supabase
      .from('loan_applications')
      .select(`
        *,
        bank:banks(id, code, name_en),
        borrower:borrowers(*)
      `)
      .eq('id', loanId)
      .single()

    if (loanError || !loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 })
    }

    // 3. Check if guarantee already exists (idempotent)
    if (loan.guarantee_number) {
      const { data: existingGuarantee } = await supabase
        .from('guarantee_letters')
        .select('*')
        .eq('loan_id', loanId)
        .single()

      return NextResponse.json({
        success: true,
        message: 'Guarantee letter already issued',
        guarantee: existingGuarantee,
        guarantee_number: loan.guarantee_number,
        already_exists: true
      })
    }

    // 4. Validate loan status (must be approved or guarantee_issued pending)
    const validStatuses = ['approved', 'committee_approved']
    if (!validStatuses.includes(loan.status)) {
      return NextResponse.json({ 
        error: `Cannot issue guarantee for loan with status: ${loan.status}. Loan must be approved first.` 
      }, { status: 400 })
    }

    // 5. Generate unique guarantee number
    const year = new Date().getFullYear()
    const bankCode = (loan.bank as any)?.code?.toUpperCase() || 'BANK'
    
    // Get the next sequence number for this year and bank
    const { count } = await supabase
      .from('guarantee_letters')
      .select('*', { count: 'exact', head: true })
      .ilike('guarantee_number', `GF-${year}-${bankCode}-%`)

    const sequence = String((count || 0) + 1).padStart(6, '0')
    const guaranteeNumber = `GF-${year}-${bankCode}-${sequence}`

    // 6. Calculate validity date (loan maturity + 3 months grace period)
    const maturityDate = loan.maturity_date ? new Date(loan.maturity_date) : new Date()
    maturityDate.setMonth(maturityDate.getMonth() + 3)
    const validUntilDate = maturityDate.toISOString()

    // 7. Create guarantee letter record
    const { data: guarantee, error: insertError } = await supabase
      .from('guarantee_letters')
      .insert({
        loan_id: loanId,
        guarantee_number: guaranteeNumber,
        issued_date: new Date().toISOString(),
        valid_until_date: validUntilDate,
        issued_by_user_id: user.id,
        metadata: {
          loan_number: loan.loan_number,
          borrower_name: (loan.borrower as any)?.name,
          bank_name: (loan.bank as any)?.name_en,
          guarantee_amount: loan.guarantee_amount,
          guarantee_coverage: loan.guarantee_coverage,
          issued_by_name: `${profile.first_name} ${profile.last_name}`,
          issued_by_role: (profile.role as any).name_en
        }
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating guarantee letter:', insertError)
      return NextResponse.json({ 
        error: 'Failed to create guarantee letter record' 
      }, { status: 500 })
    }

    // 8. Update loan application with guarantee number and status
    const { error: updateError } = await supabase
      .from('loan_applications')
      .update({
        guarantee_number: guaranteeNumber,
        guarantee_issued_date: new Date().toISOString(),
        status: 'guarantee_issued'
      })
      .eq('id', loanId)

    if (updateError) {
      console.error('Error updating loan status:', updateError)
      // Rollback guarantee letter creation
      await supabase.from('guarantee_letters').delete().eq('id', guarantee.id)
      return NextResponse.json({ 
        error: 'Failed to update loan status' 
      }, { status: 500 })
    }

    // 9. Log the action to audit trail
    await supabase.from('access_logs').insert({
      user_id: user.id,
      action: 'guarantee_letter_generated',
      resource: 'loan_applications',
      resource_id: loanId,
      success: true,
      metadata: {
        guarantee_number: guaranteeNumber,
        guarantee_id: guarantee.id,
        loan_number: loan.loan_number,
        borrower_name: (loan.borrower as any)?.name
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Guarantee letter issued successfully',
      guarantee: guarantee,
      guarantee_number: guaranteeNumber,
      valid_until: validUntilDate,
      already_exists: false
    })

  } catch (error) {
    console.error('Guarantee generation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

/**
 * GET /api/loans/[id]/generate-guarantee
 * Retrieves existing guarantee letter for a loan
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: loanId } = await params
    const supabase = await createClient()

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch guarantee letter
    const { data: guarantee, error } = await supabase
      .from('guarantee_letters')
      .select(`
        *,
        issued_by:profiles(first_name, last_name)
      `)
      .eq('loan_id', loanId)
      .single()

    if (error || !guarantee) {
      return NextResponse.json({ 
        error: 'No guarantee letter found for this loan' 
      }, { status: 404 })
    }

    // Log access
    await supabase.from('access_logs').insert({
      user_id: user.id,
      action: 'guarantee_letter_viewed',
      resource: 'guarantee_letters',
      resource_id: guarantee.id,
      success: true
    })

    return NextResponse.json({
      success: true,
      guarantee
    })

  } catch (error) {
    console.error('Guarantee fetch error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
