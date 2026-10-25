import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { resetPasswordSchema } from '@/lib/admin/accounts'
import { withPermission } from '@/lib/middleware/api-protection'
import { one } from '@/lib/utils/supabase-relation'

type Caller = { userId: string; roleCode: string; tier: number }

export const POST = withPermission(
  { resource: 'users', permission: 'update' },
  async (request: NextRequest, { caller }: { caller: Caller }) => {
    if (!['super_admin', 'prsf_admin'].includes(caller.roleCode)) {
      return NextResponse.json({ error: 'System administrator role required' }, { status: 403 })
    }

    const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Select a user and provide a password of 8–128 characters' }, { status: 400 })
    }
    const { userId, password } = parsed.data
    if (userId === caller.userId) {
      return NextResponse.json({ error: 'Change your own password from your profile' }, { status: 403 })
    }

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('id, role:roles(tier)')
      .eq('id', userId)
      .maybeSingle()

    if (targetError) {
      return NextResponse.json({ error: 'Could not verify the target account' }, { status: 500 })
    }
    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const targetTier = one<{ tier?: number }>(target.role)?.tier ?? 99
    if (caller.roleCode !== 'super_admin' && targetTier < caller.tier) {
      return NextResponse.json({ error: 'You cannot reset a more privileged account' }, { status: 403 })
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, { password })
    if (error) {
      console.error('Administrator password reset failed:', error.code)
      return NextResponse.json({ error: 'Could not reset password. Check the password requirements and try again.' }, { status: 400 })
    }

    const { error: auditError } = await supabase.from('audit_trail').insert({
      table_name: 'profiles',
      record_id: userId,
      action: 'PASSWORD_RESET',
      changed_by: caller.userId,
      new_data: { password_reset: true, channel: 'administrator' },
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null,
      user_agent: request.headers.get('user-agent'),
    })
    if (auditError) console.error('Could not audit administrator password reset:', auditError.code)

    return NextResponse.json({ success: true })
  },
)
