import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = NextResponse.next({
            request,
          })
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // IMPORTANT: Do NOT use supabase.auth.getSession() - it reads from storage
  // and is not guaranteed to have the latest session. Use getUser() instead.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - redirect to login if not authenticated
  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from the login page
  if (request.nextUrl.pathname === '/auth/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // /auth/sign-up is admin-only. Block unauthenticated visitors entirely.
  if (request.nextUrl.pathname === '/auth/sign-up') {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      return NextResponse.redirect(url)
    }
    // Check that the authenticated user has an admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role:roles(code)')
      .eq('id', user.id)
      .single()
    const roleCode = (profile?.role as { code?: string } | null)?.code ?? ''
    const isAdmin = roleCode === 'prsf_admin' || roleCode === 'super_admin'
    if (!isAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // /api/admin routes: must be authenticated admin
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return supabaseResponse
}
