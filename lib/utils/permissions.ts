import { Role, ROLE_TIERS, ROLE_CODES } from '@/lib/types/database'
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
 * Permission matrix for each role and resource
 * This is the single source of truth for access control
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
    // Bank Admin manages bank operations
    'users': ['view', 'create', 'update'],
    'loans': ['view', 'create', 'update'],
    'claims': ['view'],
    'reports': ['view'],
  },
  [ROLE_CODES.BANK_OFFICER]: {
    // Bank Officer submits and tracks loans
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
  permission: Permission
): boolean {
  // No role = no access
  if (!role) return false

  // Superadmin bypasses all permission checks
  if (role.tier === ROLE_TIERS.SUPER_ADMIN) return true

  // Get role permissions from matrix
  const rolePermissions = PERMISSION_MATRIX[role.code]
  if (!rolePermissions) return false

  const resourcePermissions = rolePermissions[resource]
  return resourcePermissions?.includes(permission) ?? false
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
  resource: string
): ResourcePermission | null {
  if (!role) return null

  // Superadmin has full permissions on everything
  if (role.tier === ROLE_TIERS.SUPER_ADMIN) {
    return {
      resource,
      can_view: true,
      can_create: true,
      can_update: true,
      can_delete: true,
      can_approve: true,
    }
  }

  const rolePermissions = PERMISSION_MATRIX[role.code]
  if (!rolePermissions) return null

  const permissions = rolePermissions[resource]
  if (!permissions) return null

  return {
    resource,
    can_view: permissions.includes('view'),
    can_create: permissions.includes('create'),
    can_update: permissions.includes('update'),
    can_delete: permissions.includes('delete'),
    can_approve: permissions.includes('approve'),
  }
}
