import { type Role, ROLE_TIERS, ROLE_CODES } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'

export type Permission = 'view' | 'create' | 'update' | 'delete' | 'approve'

export interface ResourcePermission {
  resource: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_approve: boolean
}

/**
 * A role's effective permissions, keyed by resource. Loaded from the
 * `role_permissions` table, which is the source of truth for access control.
 */
export type PermissionOverrides = Record<string, ResourcePermission>

/**
 * Fallback permission matrix, used only when `role_permissions` cannot be
 * read (offline, RLS failure, or a role with no rows seeded yet). The table
 * was seeded from this matrix, so the two agree until an admin edits a role.
 */
const PERMISSION_MATRIX: Record<string, Record<string, Permission[]>> = {
  [ROLE_CODES.SUPER_ADMIN]: {
    // Superadmin has all permissions on all resources
    'users': ['view', 'create', 'update', 'delete', 'approve'],
    'roles': ['view', 'create', 'update', 'delete'],
    'loans': ['view', 'create', 'update', 'delete', 'approve'],
    'claims': ['view', 'create', 'update', 'delete', 'approve'],
    'fees': ['view', 'create', 'update', 'delete'],
    'banks': ['view', 'create', 'update', 'delete'],
    'reports': ['view', 'create'],
    'audit_logs': ['view'],
    'access_logs': ['view'],
  },
  [ROLE_CODES.PRSF_ADMIN]: {
    // PRSF Admin manages internal operations
    'users': ['view', 'create', 'update'],
    'loans': ['view', 'update', 'approve'],
    'claims': ['view', 'update', 'approve'],
    'fees': ['view', 'create', 'update'],
    'banks': ['view'],
    'reports': ['view', 'create'],
    'audit_logs': ['view'],
  },
  [ROLE_CODES.PRSF_ANALYST]: {
    // PRSF Analyst analyzes loans with limited approval authority
    'loans': ['view', 'update'],
    'claims': ['view'],
    'reports': ['view', 'create'],
  },
  [ROLE_CODES.AUDITOR]: {
    // Auditor has read-only access for compliance
    'loans': ['view'],
    'claims': ['view'],
    'banks': ['view'],
    'users': ['view'],
    'fees': ['view'],
    'audit_logs': ['view'],
    'access_logs': ['view'],
  },
  [ROLE_CODES.BANK_ADMIN]: {
    // Bank Admin manages bank operations.
    // Note: creating a New Loan Application is restricted to the Loan Officer
    // (bank_officer) and Super Administrator only.
    'users': ['view', 'create', 'update'],
    'loans': ['view', 'update'],
    'claims': ['view'],
    'reports': ['view'],
  },
  [ROLE_CODES.BANK_OFFICER]: {
    // Bank Loan Officer submits and tracks loans
    'loans': ['view', 'create'],
    'claims': ['view'],
    'reports': ['view'],
  },
}

/**
 * Check if a user with a given role has permission on a resource
 */
export function hasPermission(
  role: Role | null,
  resource: string,
  permission: Permission,
  overrides?: PermissionOverrides | null
): boolean {
  // No role = no access
  if (!role) return false

  // Regulatory prohibitions take precedence over editable grants and tier bypasses.
  if (role.code === ROLE_CODES.AUDITOR && permission !== 'view') return false
  if (
    (role.code === ROLE_CODES.SUPER_ADMIN || role.code === ROLE_CODES.PRSF_ADMIN) &&
    ['loans', 'claims'].includes(resource) && permission === 'approve'
  ) return false

  if (role.code === ROLE_CODES.SUPER_ADMIN && role.tier === ROLE_TIERS.SUPER_ADMIN) return true

  // Prefer the database-backed permissions when they have been loaded, so
  // edits made on the Role Management page take real effect.
  const fromDb = overrides?.[resource]
  if (fromDb) {
    switch (permission) {
      case 'view': return fromDb.can_view
      case 'create': return fromDb.can_create
      case 'update': return fromDb.can_update
      case 'delete': return fromDb.can_delete
      case 'approve': return fromDb.can_approve
    }
  }
  // A loaded override set that simply has no row for this resource means
  // "no access to this resource" — do not fall back to the static matrix,
  // or revoking a resource in the UI would silently have no effect.
  if (overrides) return false

  // Fallback: static matrix (overrides not loaded yet / unavailable)
  const rolePermissions = PERMISSION_MATRIX[role.code]
  if (!rolePermissions) return false

  const resourcePermissions = rolePermissions[resource]
  return resourcePermissions?.includes(permission) ?? false
}

/**
 * Load a role's permissions from the database.
 * Returns null when unavailable so callers fall back to PERMISSION_MATRIX.
 */
export async function fetchRolePermissions(
  roleId: string | null | undefined
): Promise<PermissionOverrides | null> {
  if (!roleId) return null
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('role_permissions')
      .select('resource, can_view, can_create, can_update, can_delete, can_approve')
      .eq('role_id', roleId)

    if (error || !data) return null

    const map: PermissionOverrides = {}
    for (const row of data) {
      map[row.resource] = {
        resource: row.resource,
        can_view: !!row.can_view,
        can_create: !!row.can_create,
        can_update: !!row.can_update,
        can_delete: !!row.can_delete,
        can_approve: !!row.can_approve,
      }
    }
    return map
  } catch {
    return null
  }
}

/**
 * Check if user has ALL of multiple permissions
 */
export function hasAllPermissions(
  role: Role | null,
  resource: string,
  permissions: Permission[]
): boolean {
  return permissions.every(perm => hasPermission(role, resource, perm))
}

/**
 * Check if user has ANY of multiple permissions
 */
export function hasAnyPermission(
  role: Role | null,
  resource: string,
  permissions: Permission[]
): boolean {
  return permissions.some(perm => hasPermission(role, resource, perm))
}

/**
 * Log access attempt to audit trail
 */
export async function logAccessAttempt(
  userId: string | undefined,
  action: string,
  resource: string,
  resourceId: string | undefined,
  success: boolean,
  failureReason?: string,
  metadata?: Record<string, any>
) {
  if (!userId) return

  try {
    const supabase = createClient()
    await supabase.from('access_logs').insert({
      user_id: userId,
      action,
      resource,
      resource_id: resourceId,
      ip_address: undefined, // IP will be set by server
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      success,
      failure_reason: failureReason,
      metadata: metadata || {},
    })
  } catch (error) {
    console.error('Failed to log access attempt:', error)
  }
}

/**
 * Log permission/role changes to audit trail
 */
export async function logPermissionChange(
  userId: string,
  changeType: 'ROLE_ASSIGNED' | 'ROLE_REMOVED' | 'PERMISSIONS_UPDATED' | 'ROLE_CREATED' | 'ROLE_DELETED',
  targetUserId: string | null,
  targetRoleId: string,
  details: {
    roleName?: string
    previousRole?: string
    newRole?: string
    permissionsChanged?: string[]
    changedBy?: string
  }
) {
  try {
    const supabase = createClient()
    await supabase.from('audit_trail').insert({
      table_name: changeType.includes('ROLE') && !changeType.includes('PERMISSIONS') ? 'profiles' : 'roles',
      record_id: targetUserId || targetRoleId,
      action: changeType,
      changed_by: userId,
      new_data: {
        change_type: changeType,
        target_user_id: targetUserId,
        target_role_id: targetRoleId,
        ...details,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to log permission change:', error)
  }
}

/**
 * Log security-sensitive actions
 */
export async function logSecurityEvent(
  userId: string,
  eventType: 'LOGIN' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'FAILED_LOGIN' | 'PRIVILEGE_ESCALATION_ATTEMPT' | 'UNAUTHORIZED_ACCESS',
  metadata: Record<string, any>
) {
  try {
    const supabase = createClient()
    await supabase.from('access_logs').insert({
      user_id: userId,
      action: eventType,
      resource: 'security',
      resource_id: null,
      success: !['FAILED_LOGIN', 'PRIVILEGE_ESCALATION_ATTEMPT', 'UNAUTHORIZED_ACCESS'].includes(eventType),
      failure_reason: metadata.reason,
      metadata: {
        ...metadata,
        event_type: eventType,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to log security event:', error)
  }
}

/**
 * Check if user can manage/assign a role (privilege escalation prevention)
 * Users can only assign roles with lower authority (higher tier number) than their own
 */
export function canManageRole(userRole: Role | null, targetRoleId: string, allRoles: Role[]): boolean {
  if (!userRole) return false

  // Superadmin can manage all roles
  if (userRole.tier === ROLE_TIERS.SUPER_ADMIN) return true

  // Find target role
  const targetRole = allRoles.find(r => r.id === targetRoleId)
  if (!targetRole) return false

  // User can only assign roles with HIGHER tier number (lower authority)
  return targetRole.tier > userRole.tier
}

/**
 * Get all resources a role has access to
 */
export function getAccessibleResources(role: Role | null): string[] {
  if (!role) return []

  // Superadmin has access to all
  if (role.tier === ROLE_TIERS.SUPER_ADMIN) {
    return Object.keys(PERMISSION_MATRIX[ROLE_CODES.SUPER_ADMIN] || {})
  }

  const rolePermissions = PERMISSION_MATRIX[role.code]
  return rolePermissions ? Object.keys(rolePermissions) : []
}

/**
 * Get permission details for a resource by role
 */
export function getResourcePermissions(
  role: Role | null,
  resource: string,
  overrides?: PermissionOverrides | null
): ResourcePermission | null {
  if (!role) return null

  const isSuperAdmin = role.code === ROLE_CODES.SUPER_ADMIN && role.tier === ROLE_TIERS.SUPER_ADMIN
  if (!isSuperAdmin && !(overrides ? overrides[resource] : PERMISSION_MATRIX[role.code]?.[resource])) return null

  return {
    resource,
    can_view: hasPermission(role, resource, 'view', overrides),
    can_create: hasPermission(role, resource, 'create', overrides),
    can_update: hasPermission(role, resource, 'update', overrides),
    can_delete: hasPermission(role, resource, 'delete', overrides),
    can_approve: hasPermission(role, resource, 'approve', overrides),
  }
}
