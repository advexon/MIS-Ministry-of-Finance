import type { Role, RoleTier } from '@/lib/types/database'
import { ROLE_TIERS } from '@/lib/types/database'

/**
 * Role Tier System
 * 
 * Tier levels (lower number = higher authority):
 * - Tier 1: Superadmin - Full system control, can manage everything
 * - Tier 2: PRSF Director - Executive oversight, unlimited loan approval
 * - Tier 3: PRSF Manager/Accountant - Operational management, high-value approvals
 * - Tier 4: PRSF Analyst/Reporter - Operational staff, limited approvals
 * - Tier 5: Auditor - External oversight, read-only
 * - Tier 6: Bank Manager - Bank-level management
 * - Tier 7: Bank Employee - Bank-level operations
 * - Tier 8: Viewer - Read-only access
 */

/**
 * Check if a user with a given role tier can perform actions on another tier
 * Users can only manage users of lower authority (higher tier number)
 */
export function canManageRole(actorTier: number, targetTier: number): boolean {
  return actorTier < targetTier
}

/**
 * Check if a user can approve a loan of a given amount based on their role
 */
export function canApproveLoanAmount(role: Role, amount: number): boolean {
  if (role.can_approve_any_amount) return true
  if (!role.max_loan_approval_amount) return false
  return amount <= role.max_loan_approval_amount
}

/**
 * Get the minimum tier required to approve a loan of a given amount
 */
export function getRequiredTierForAmount(amount: number): RoleTier {
  // Thresholds in TJS (Tajikistani Somoni)
  if (amount > 1000000) return ROLE_TIERS.DIRECTOR  // >1M requires Director
  if (amount > 500000) return ROLE_TIERS.MANAGER    // >500K requires Manager
  if (amount > 100000) return ROLE_TIERS.ANALYST    // >100K requires Analyst
  return ROLE_TIERS.BANK_MANAGER                     // ≤100K can be handled by Bank Manager
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: string): boolean {
  if (role.permissions.includes('all')) return true
  return role.permissions.includes(permission)
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: Role, permissions: string[]): boolean {
  if (role.permissions.includes('all')) return true
  return permissions.some(p => role.permissions.includes(p))
}

/**
 * Check if a role has all of the specified permissions
 */
export function hasAllPermissions(role: Role, permissions: string[]): boolean {
  if (role.permissions.includes('all')) return true
  return permissions.every(p => role.permissions.includes(p))
}

/**
 * Check if a user is a PRSF staff member (internal)
 */
export function isPRSFStaff(role: Role): boolean {
  return role.tier <= ROLE_TIERS.AUDITOR && !role.code.startsWith('bank_')
}

/**
 * Check if a user is a bank staff member (external)
 */
export function isBankStaff(role: Role): boolean {
  return role.code.startsWith('bank_') || role.tier >= ROLE_TIERS.BANK_MANAGER
}

/**
 * Check if a user is an admin (tier 1-2)
 */
export function isAdmin(role: Role): boolean {
  return role.tier <= ROLE_TIERS.DIRECTOR
}

/**
 * Check if a user is a superadmin (tier 1)
 */
export function isSuperAdmin(role: Role): boolean {
  return role.tier === ROLE_TIERS.SUPERADMIN
}

/**
 * Get display color class for a role tier
 */
export function getRoleTierColor(tier: number): string {
  switch (tier) {
    case 1: return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    case 2: return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 3: return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
    case 4: return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 5: return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
    case 6: return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
    case 7: return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200'
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
}

/**
 * Get tier label for display
 */
export function getTierLabel(tier: number): string {
  switch (tier) {
    case 1: return 'Tier 1 - Superadmin'
    case 2: return 'Tier 2 - Executive'
    case 3: return 'Tier 3 - Management'
    case 4: return 'Tier 4 - Operations'
    case 5: return 'Tier 5 - Oversight'
    case 6: return 'Tier 6 - Bank Management'
    case 7: return 'Tier 7 - Bank Staff'
    case 8: return 'Tier 8 - Viewer'
    default: return `Tier ${tier}`
  }
}

/**
 * Filter roles that a user can assign to others
 * Users can only assign roles with higher tier numbers (lower authority)
 */
export function getAssignableRoles(roles: Role[], actorTier: number): Role[] {
  return roles.filter(role => role.tier > actorTier && role.is_active)
}

/**
 * Determine the workflow stage based on loan amount
 */
export function getLoanWorkflowStage(amount: number): 'standard' | 'committee' | 'director' {
  if (amount > 1000000) return 'director'    // Requires PRSF Director
  if (amount > 500000) return 'committee'    // Requires Credit Committee
  return 'standard'                           // Standard processing
}

/**
 * Role code to tier mapping
 */
export const ROLE_CODE_TIERS: Record<string, number> = {
  superadmin: 1,
  admin: 1,
  prsf_director: 2,
  prsf_accountant: 3,
  prsf_analyst: 4,
  prsf_reporter: 4,
  auditor: 5,
  bank_manager: 6,
  bank_employee: 7,
  viewer: 8,
}

/**
 * Get tier for a role code (fallback for when full role object isn't available)
 */
export function getTierForRoleCode(code: string): number {
  return ROLE_CODE_TIERS[code] ?? 99
}
