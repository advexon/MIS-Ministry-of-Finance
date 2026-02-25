import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

    // --- /auth/sign-up is admin-only ---
    if (pathname === '/auth/sign-up') {
      if (!user) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/login'
        return NextResponse.redirect(url)
      }
      // Verify admin role before allowing access
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

    // --- /api/admin routes require authentication ---
    if (pathname.startsWith('/api/admin') && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } catch (err) {
    // If middleware itself errors (e.g. missing env vars, network issue),
    // allow the request to continue rather than serving a blank page.
    // Dashboard auth is also enforced at the layout level.
    console.error('Middleware error:', err)
  }

  return supabaseResponse
}
