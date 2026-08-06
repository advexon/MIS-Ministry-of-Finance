import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission, logAccessAttempt, Permission } from '@/lib/utils/permissions'
import { Role } from '@/lib/types/database'

export interface ProtectedRouteOptions {
  resource: string
  permission: Permission | Permission[]
  requireAuth?: boolean
}

/**
 * Wraps an API route handler with permission checking and audit logging
 * Handles authentication, authorization, and access logging automatically
 */
export function withPermission(
  options: ProtectedRouteOptions,
  handler: (req: NextRequest, context: any) => Promise<Response>
) {
  return async (req: NextRequest, context: any) => {
    const supabase = await createClient()
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user && options.requireAuth !== false) {
        // `user` is narrowed to null here, so there is no id to log.
        await logAccessAttempt(
          undefined,
          req.method,
          options.resource,
          undefined,
          false,
          'Not authenticated'
        )
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
        await logAccessAttempt(
          user?.id,
          req.method,
          options.resource,
          undefined,
          false,
          'Profile not found'
        )
        return NextResponse.json(
          { error: 'Unauthorized: Profile not found' },
          { status: 401 }
        )
      }

      // Check permissions
      const permissions = Array.isArray(options.permission)
        ? options.permission
        : [options.permission]

      const hasAccess = permissions.some(perm =>
        hasPermission(profile?.role as Role, options.resource, perm)
      )

      if (!hasAccess) {
        await logAccessAttempt(
          user?.id,
          req.method,
          options.resource,
          undefined,
          false,
          `Permission denied for ${permissions.join(',')}`
        )
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        )
      }

      // Log successful access
      await logAccessAttempt(
        user?.id,
        req.method,
        options.resource,
        undefined,
        true,
        undefined,
        { path: req.nextUrl.pathname }
      )

      // Call the actual handler with user context
      const response = await handler(req, { ...context, user, profile })

      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Log the error
      const { data: { user } } = await supabase.auth.getUser()
      await logAccessAttempt(
        user?.id,
        req.method,
        options.resource,
        undefined,
        false,
        `Error: ${errorMessage}`
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
