import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getRouteRequirement } from '@/lib/utils/route-permissions'
import { hasPermission, type PermissionOverrides } from '@/lib/utils/permissions'
import type { Role } from '@/lib/types/database'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_MISSUPABASE_URL!,
      process.env.NEXT_PUBLIC_MISSUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value)
            }
            supabaseResponse = NextResponse.next({ request })
            for (const { name, value, options } of cookiesToSet) {
              supabaseResponse.cookies.set(name, value, options)
            }
          },
        },
      },
    )

    // IMPORTANT: use getUser() not getSession() – getUser() validates the JWT
    // server-side and is not susceptible to spoofed cookies.
    const { data: { user } } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    // --- Protected dashboard routes ---
    if (pathname.startsWith('/dashboard') && !user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }

    // --- Redirect already-logged-in users away from login ---
    if (pathname === '/auth/login' && user) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    // --- /api/admin routes require authentication ---
    if (pathname.startsWith('/api/admin') && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // --- Server-side dashboard route permissions ---
    // Until now the ROUTE_PERMISSIONS matrix was declared but never applied:
    // page access was gated only by client-side `usePermissions` checks, which
    // hide navigation but do not prevent a user from loading the URL directly.
    if (user && pathname.startsWith('/dashboard')) {
      const requirement = getRouteRequirement(pathname)

      if (requirement) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active, role:roles(*)')
          .eq('id', user.id)
          .single()

        const role = (profile?.role ?? null) as Role | null

        // A deactivated account keeps a valid session cookie until it expires,
        // so it must be rejected here rather than only at login.
        if (profile?.is_active === false) {
          const url = request.nextUrl.clone()
          url.pathname = '/auth/login'
          url.searchParams.set('error', 'account_disabled')
          return NextResponse.redirect(url)
        }

        // Honour Role Management edits by reading the role's stored
        // permissions; hasPermission falls back to the static matrix when the
        // role has no rows.
        let overrides: PermissionOverrides | null = null
        if (role?.id) {
          const { data: permRows } = await supabase
            .from('role_permissions')
            .select('resource, can_view, can_create, can_update, can_delete, can_approve')
            .eq('role_id', role.id)

          if (permRows && permRows.length > 0) {
            overrides = {}
            for (const row of permRows) {
              overrides[row.resource] = {
                resource: row.resource,
                can_view: !!row.can_view,
                can_create: !!row.can_create,
                can_update: !!row.can_update,
                can_delete: !!row.can_delete,
                can_approve: !!row.can_approve,
              }
            }
          }
        }

        if (!hasPermission(role, requirement.resource, requirement.permission, overrides)) {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          url.searchParams.set('error', 'insufficient_permissions')
          return NextResponse.redirect(url)
        }
      }
    }
  } catch (err) {
    // If middleware itself errors (e.g. missing env vars, network issue),
    // allow the request to continue rather than serving a blank page.
    // Dashboard auth is also enforced at the layout level.
    console.error('Middleware error:', err)
  }

  return supabaseResponse
}
