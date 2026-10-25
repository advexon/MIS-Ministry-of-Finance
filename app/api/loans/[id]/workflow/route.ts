import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canTransition } from '@/lib/workflow/fkg-scheme'
import { workflowRequestSchema } from '@/lib/workflow/transition-input'
import type { LoanStatus } from '@/lib/types/database'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid application ID' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = await request.json().then((body: unknown) => workflowRequestSchema.safeParse(body), () => null)
  if (!parsed?.success) return NextResponse.json({ error: 'Invalid workflow request', code: 'INVALID_REQUEST' }, { status: 400 })
  const { from, to, payload, screening, reason } = parsed.data
  const { data: loan, error: loadError } = await supabase.from('loan_applications').select('status').eq('id', id).maybeSingle()
  if (loadError) return NextResponse.json({ error: 'Application could not be loaded. Retry before taking action.' }, { status: 500 })
  if (!loan) return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  if (from && from !== loan.status) return NextResponse.json({ error: 'The application changed. Refresh before continuing.', code: 'TRANSITION_CONFLICT' }, { status: 409 })
  if (!canTransition(loan.status as LoanStatus, to as LoanStatus)) return NextResponse.json({ error: 'This transition is not permitted.', code: 'ILLEGAL_TRANSITION' }, { status: 422 })

  // The RPC locks the application and commits screening, transition, audit and
  // notifications together. Database triggers enforce the same rules on direct writes.
  const { data, error } = await supabase.rpc('cgf_transition_loan', {
    p_loan: id, p_from: loan.status, p_to: to,
    p_reason: reason ?? null, p_registration: payload ?? null, p_screening: screening ?? null,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '40001' ? 409 : ['23514', '22023', '22P02'].includes(error.code) ? 422 : 500
    return NextResponse.json({ error: status === 500 ? 'Could not complete the workflow action. No partial transition was saved.' : error.message, code: error.code === '40001' ? 'TRANSITION_CONFLICT' : 'WORKFLOW_REFUSED' }, { status })
  }
  return NextResponse.json(data)
}
