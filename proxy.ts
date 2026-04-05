import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Route protection matrix
 * Maps dashboard routes to required permissions
 */
const ROUTE_PERMISSIONS: Record<string, { resource: string; permission: string }> = {
  '/dashboard/users': { resource: 'users', permission: 'view' },
  '/dashboard/users/.*': { resource: 'users', permission: 'view' },
  '/dashboard/loans': { resource: 'loans', permission: 'view' },
  '/dashboard/loans/.*': { resource: 'loans', permission: 'view' },
  '/dashboard/claims': { resource: 'claims', permission: 'view' },
  '/dashboard/claims/.*': { resource: 'claims', permission: 'view' },
  '/dashboard/fees': { resource: 'fees', permission: 'view' },
  '/dashboard/banks': { resource: 'banks', permission: 'view' },
  '/dashboard/audit': { resource: 'audit_logs', permission: 'view' },
  '/dashboard/access': { resource: 'access_logs', permission: 'view' },
}

export async function proxy(request: NextRequest) {
  // Dynamically import to avoid loading @supabase/ssr for excluded routes
  const { updateSession } = await import('@/lib/supabase/proxy')
  const response = await updateSession(request)
  
  // Route permission checking is handled by individual pages/components via usePermissions hook
  // This proxy just ensures session is up to date
  
  return response
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
