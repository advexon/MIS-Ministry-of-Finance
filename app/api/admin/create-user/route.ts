import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const cookieStore = await cookies()

  // Verify caller is authenticated
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    .select('role:roles(code)')
    .eq('id', user.id)
    .single()
  const roleCode = (profile?.role as { code?: string } | null)?.code ?? ''
  const isAdmin = roleCode === 'prsf_admin' || roleCode === 'super_admin'
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 })
  }

  // Parse request body
  const body = await request.json()
  const { email, password, firstName, lastName, roleId, bankId, branchId, phone, preferredLanguage } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Use service-role client to bypass RLS and create the auth user
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Pre-confirm so admin-created accounts work immediately
    user_metadata: {
      first_name: firstName || '',
      last_name: lastName || '',
      preferred_language: preferredLanguage || 'en',
    },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Update the profile row that was auto-created by the DB trigger
  if (newUser.user) {
    await adminClient
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
  }

  return NextResponse.json({ success: true, userId: newUser.user?.id }, { status: 201 })
}
