import type { Permission } from '@/lib/utils/permissions'

export interface RouteRequirement {
  resource: string
  permission: Permission
}

/**
 * Route protection matrix: maps dashboard paths to the permission required to
 * open them. This is enforced server-side in middleware (see
 * `lib/supabase/proxy.ts`) so that a user cannot reach a page simply by
 * navigating directly to its URL — client-side `usePermissions` checks only
 * hide UI, they do not stop the request.
 *
 * Ordering matters: the FIRST matching entry wins, so more specific paths must
 * come before their broader prefixes.
 */
const ROUTE_PERMISSIONS: Array<{ pattern: RegExp } & RouteRequirement> = [
  { pattern: /^\/dashboard\/users(\/.*)?$/, resource: 'users', permission: 'view' },
  { pattern: /^\/dashboard\/roles(\/.*)?$/, resource: 'roles', permission: 'view' },
  { pattern: /^\/dashboard\/loans(\/.*)?$/, resource: 'loans', permission: 'view' },
  { pattern: /^\/dashboard\/claims(\/.*)?$/, resource: 'claims', permission: 'view' },
  { pattern: /^\/dashboard\/fees(\/.*)?$/, resource: 'fees', permission: 'view' },
  { pattern: /^\/dashboard\/banks(\/.*)?$/, resource: 'banks', permission: 'view' },
  { pattern: /^\/dashboard\/reports(\/.*)?$/, resource: 'reports', permission: 'view' },
  { pattern: /^\/dashboard\/audit(\/.*)?$/, resource: 'audit_logs', permission: 'view' },
  { pattern: /^\/dashboard\/access(\/.*)?$/, resource: 'access_logs', permission: 'view' },

  // These pages had no permission check of any kind. PERMISSION_MATRIX has no
  // dedicated resource for them, so each maps to the resource whose data it
  // actually shows — the same mapping the sidebar already uses (e.g. the
  // Borrowers nav item is declared with resource: 'loans').
  //
  // 'guarantee-reports' must precede the broader 'guarantees' style prefixes
  // and is treated as reporting, since it aggregates issued letters.
  { pattern: /^\/dashboard\/guarantee-reports(\/.*)?$/, resource: 'reports', permission: 'view' },
  { pattern: /^\/dashboard\/reconciliation(\/.*)?$/, resource: 'reports', permission: 'view' },
  { pattern: /^\/dashboard\/borrowers(\/.*)?$/, resource: 'loans', permission: 'view' },
  { pattern: /^\/dashboard\/documents(\/.*)?$/, resource: 'loans', permission: 'view' },
  { pattern: /^\/dashboard\/recoveries(\/.*)?$/, resource: 'claims', permission: 'view' },
]

/**
 * Returns the permission required for a pathname, or null when the route is
 * not permission-gated (e.g. /dashboard itself, or /dashboard/settings).
 */
export function getRouteRequirement(pathname: string): RouteRequirement | null {
  // Normalise a trailing slash so "/dashboard/users/" matches "/dashboard/users".
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  for (const entry of ROUTE_PERMISSIONS) {
    if (entry.pattern.test(path)) {
      return { resource: entry.resource, permission: entry.permission }
    }
  }
  return null
}
