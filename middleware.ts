import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Dynamically import to avoid loading @supabase/ssr for excluded routes
  const { updateSession } = await import('@/lib/supabase/proxy')
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Only run middleware on /dashboard routes (protected) and /auth routes
     * (for redirect-if-logged-in logic). This excludes:
     * - / (landing page)
     * - /api routes
     * - _next/static, _next/image, favicon.ico, and static assets
     */
    '/dashboard/:path*',
    '/auth/:path*',
  ],
}
