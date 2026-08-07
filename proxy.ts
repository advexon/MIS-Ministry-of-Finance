import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Dynamically import to avoid loading @supabase/ssr for excluded routes
  const { updateSession } = await import('@/lib/supabase/proxy')

  // updateSession refreshes the auth cookies AND enforces access control:
  // authentication for /dashboard, admin-only /auth/sign-up, and the
  // per-route permission matrix in `lib/utils/route-permissions.ts`.
  // Client-side `usePermissions` checks remain, but only to hide UI.
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
