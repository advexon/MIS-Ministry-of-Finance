import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.rpc('cgf_issue_guarantee', { p_loan: id })
  if (error) {
    const status = error.code === '42501' ? 403 : ['23514', '22023'].includes(error.code) ? 422 : 500
    return NextResponse.json({ error: status === 500 ? 'Could not sign the guarantee. No partial issuance was saved.' : error.message }, { status })
  }
  return NextResponse.json(data)
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid loan ID' }, { status: 400 })
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: guarantee, error } = await supabase.from('guarantee_letters').select('*').eq('loan_id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not retrieve the guarantee letter' }, { status: 500 })
  if (!guarantee) return NextResponse.json({ error: 'No guarantee letter found for this loan' }, { status: 404 })
  return NextResponse.json({ success: true, guarantee })
}
