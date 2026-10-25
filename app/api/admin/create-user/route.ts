import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { one } from '@/lib/utils/supabase-relation'
import { createUserSchema } from '@/lib/admin/accounts'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  // Verify caller is authenticated
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
    process.env.NEXT_PUBLIC_MISSUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify caller has admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, bank_id, role:roles(code, tier, is_active)')
    .eq('id', user.id)
    .single()
  const callerRole = one<{ code?: string; tier?: number; is_active?: boolean }>(profile?.role)
  const roleCode = callerRole?.code ?? ''
  const callerTier = callerRole?.tier ?? 99

  // A deactivated account keeps a valid session cookie until it expires, so it
  // has to be rejected here and not only at login.
  if (profile?.is_active !== true || callerRole?.is_active !== true) {
    return NextResponse.json({ error: 'Forbidden: Account is disabled' }, { status: 403 })
  }

  const isAdmin = roleCode === 'prsf_admin' || (roleCode === 'super_admin' && callerTier === 1 && !profile?.bank_id)
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 })
  }

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Provide a valid email, a password of 8–128 characters, and an active role.' },
      { status: 400 },
    )
  }
  const { email, password, firstName, lastName, roleId, bankId, branchId, phone, preferredLanguage } = parsed.data

  // Privilege ceiling. Without this, a prsf_admin (tier 2) could pass the
  // super_admin role id and mint a tier-1 account, then log into it — a
  // straightforward privilege escalation. The equivalent check already guards
  // role changes in PATCH /api/users; creation must enforce the same rule.
  if (roleId) {
    const { data: targetRole } = await supabase
      .from('roles')
      .select('code, tier')
      .eq('is_active', true)
      .eq('id', roleId)
      .single()

    if (!targetRole) {
      return NextResponse.json({ error: 'Unknown roleId' }, { status: 400 })
    }
    if (roleCode !== 'super_admin' && (targetRole.tier ?? 99) < callerTier) {
      return NextResponse.json(
        { error: 'You cannot create a user more privileged than your own role.' },
        { status: 403 },
      )
    }
  }

  // Use service-role client to bypass RLS and create the auth user
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Pre-confirm so admin-created accounts work immediately
    app_metadata: {
      account_provisioning: 'administrator',
      created_by: user.id,
    },
    user_metadata: {
      first_name: firstName || '',
      last_name: lastName || '',
      preferred_language: preferredLanguage || 'en',
    },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Update the profile row that was auto-created by the DB trigger.
  // The result MUST be checked: this update was previously fire-and-forget, so
  // when it failed the API still returned 201 and the new user silently ended
  // up with no role, name, or bank assigned.
  if (newUser.user) {
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
        role_id: roleId || null,
        bank_id: bankId || null,
        branch_id: branchId || null,
        preferred_language: preferredLanguage || 'en',
        is_active: true,
      })
      .eq('id', newUser.user.id)

    if (profileError) {
      // The auth user exists but is unusable without a profile. Remove it so
      // the admin can retry cleanly instead of leaving an orphaned account.
      console.error('[v0] Profile update failed for new user:', profileError)
      await adminClient.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json(
        { error: `Could not save the user profile: ${profileError.message}` },
        { status: 400 }
      )
    }
  }

  // Record who created whom. Account creation is the most privileged action in
  // the system and was previously the only user-administration operation that
  // left no audit record at all (PATCH /api/users already writes one).
  if (newUser.user) {
    const { error: auditError } = await adminClient.from('audit_trail').insert({
      table_name: 'profiles',
      record_id: newUser.user.id,
      action: 'INSERT',
      changed_by: user.id,
      old_data: null,
      new_data: {
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        role_id: roleId || null,
        bank_id: bankId || null,
        branch_id: branchId || null,
      },
      ip_address:
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        request.headers.get('x-real-ip') ??
        null,
      user_agent: request.headers.get('user-agent'),
    })

    // A failed audit write must not hide a successful creation, but it should
    // be visible rather than silently swallowed.
    if (auditError) {
      console.error('[v0] Audit write failed for created user:', auditError.message)
    }
  }

  return NextResponse.json({ success: true, userId: newUser.user?.id }, { status: 201 })
}
