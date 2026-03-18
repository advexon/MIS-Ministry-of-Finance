import { NextResponse } from 'next/server'

export async function middleware(request: any) {
  // Dynamically import to avoid loading @supabase/ssr for excluded routes
  const { updateSession } = await import('@/lib/supabase/middleware')
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run middleware on /dashboard routes (protected), /auth routes
     * (redirect-if-logged-in logic), and /api/admin routes (admin-only).
     * Excludes: / (landing page), _next/static, _next/image, favicon.ico.
     */
    '/dashboard/:path*',
    '/auth/:path*',
    '/api/:path*',
  ],
}
