import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission, Permission, PermissionOverrides } from '@/lib/utils/permissions'
import type { Profile, Role } from '@/lib/types/database'
import type { User } from '@supabase/supabase-js'

type RouteContext = { params?: Promise<Record<string, string | string[]>> }

export type ProtectedRouteContext = RouteContext & {
  user: User
  profile: Profile | null
  caller: {
    userId: string
    roleCode: string
    tier: number
    bankId: string | null
    isBankScoped: boolean
    overrides: PermissionOverrides | null
  }
}

export interface ProtectedRouteOptions {
  resource: string
  permission: Permission | Permission[]
  requireAuth?: boolean
}

/**
 * Server-side access logger.
 *
 * The shared `logAccessAttempt` in lib/utils/permissions.ts builds a *browser*
 * Supabase client and reads `navigator`, so calling it from a route handler
 * writes with no session (silently dropped by RLS) and never records an IP.
 * This variant uses the request's server client and the real request headers.
 */
async function logAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  req: NextRequest,
  userId: string | undefined,
  resource: string,
  success: boolean,
  failureReason?: string,
  metadata?: Record<string, unknown>,
) {
  if (!userId) return
  try {
    await supabase.from('access_logs').insert({
      user_id: userId,
      action: req.method,
      resource,
      resource_id: null,
      ip_address:
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        req.headers.get('x-real-ip') ??
        null,
      user_agent: req.headers.get('user-agent'),
      success,
      failure_reason: failureReason,
      metadata: { path: req.nextUrl.pathname, ...(metadata ?? {}) },
    })
  } catch (error) {
    console.error('[v0] Failed to write access log:', error)
  }
}

/**
 * Wraps an API route handler with permission checking and audit logging
 * Handles authentication, authorization, and access logging automatically
 */
export function withPermission(
  options: ProtectedRouteOptions,
  handler: (req: NextRequest, context: ProtectedRouteContext) => Promise<Response>
) {
  return async (req: NextRequest, context: RouteContext = {}) => {
    const supabase = await createClient()
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user && options.requireAuth !== false) {
        // No user id exists here, so there is nothing to attribute a log row to.
        return NextResponse.json(
          { error: 'Unauthorized: Not authenticated' },
          { status: 401 }
        )
      }

      // Get user profile with role
      const { data: profile } = await supabase
        .from('profiles')
        .select('*, role:roles(*)')
        .eq('id', user?.id)
        .single()

      if (!profile && options.requireAuth !== false) {
        await logAccess(
          supabase, req, user?.id, options.resource, false, 'Profile not found'
        )
        return NextResponse.json(
          { error: 'Unauthorized: Profile not found' },
          { status: 401 }
        )
      }

      // A disabled account retains a valid session cookie until it expires,
      // so it has to be rejected on every request.
      if (profile?.is_active === false) {
        await logAccess(
          supabase, req, user?.id, options.resource, false, 'Account disabled'
        )
        return NextResponse.json(
          { error: 'Forbidden: Account is disabled' },
          { status: 403 }
        )
      }

      // Check permissions
      const permissions = Array.isArray(options.permission)
        ? options.permission
        : [options.permission]

      // Load the role's permissions from the database so server-side checks
      // honour Role Management edits. Read with this request's server client
      // (not the browser client) and fall back to the static matrix on failure.
      let overrides: PermissionOverrides | null = null
      const roleId = (profile?.role as Role | null)?.id
      if (roleId) {
        const { data: permRows } = await supabase
          .from('role_permissions')
          .select('resource, can_view, can_create, can_update, can_delete, can_approve')
          .eq('role_id', roleId)

        if (permRows) {
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

      const hasAccess = permissions.some(perm =>
        hasPermission(profile?.role as Role, options.resource, perm, overrides)
      )

      if (!hasAccess) {
        await logAccess(
          supabase, req, user?.id, options.resource, false,
          `Permission denied for ${permissions.join(',')}`
        )
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        )
      }

      // Log successful access
      await logAccess(supabase, req, user?.id, options.resource, true)

      // Call the actual handler with the verified caller context, so handlers
      // never have to re-derive identity (and cannot forget to).
      const role = (profile?.role ?? null) as Role | null
      const isBankScoped =
        role?.code === 'bank_admin' || role?.code === 'bank_officer'

      return await handler(req, {
        ...context,
        user: user!,
        profile: profile as Profile | null,
        caller: {
          userId: user!.id,
          roleCode: role?.code ?? '',
          tier: role?.tier ?? 99,
          bankId: profile?.bank_id ?? null,
          isBankScoped,
          overrides,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Log the error
      const { data: { user } } = await supabase.auth.getUser()
      await logAccess(
        supabase, req, user?.id, options.resource, false, `Error: ${errorMessage}`
      )

      console.error('[v0] API error in protected route:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Shorter alias for withPermission
 */
export const protect = withPermission
