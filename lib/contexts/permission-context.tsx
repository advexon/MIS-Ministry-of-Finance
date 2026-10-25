'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import useSWR from 'swr'
import { AuthorityReasonProvider } from '@/components/admin/authority-reason-provider'
import { isSuperAdmin } from '@/lib/utils/roles'
import { type Role, type Profile } from '@/lib/types/database'
import type { User } from '@supabase/supabase-js'
import {
  hasPermission,
  Permission,
  getResourcePermissions,
  ResourcePermission,
  fetchRolePermissions,
  PermissionOverrides,
} from '@/lib/utils/permissions'

interface PermissionContextType {
  profile: Profile | null
  user: User
  role: Role | null
  can: (resource: string, permission: Permission | Permission[]) => boolean
  getPermissions: (resource: string) => ResourcePermission | null
  /** True until the role's permissions have been loaded from the database. */
  permissionsLoading: boolean
  /** Re-read permissions from the database (after an admin edits a role). */
  refreshPermissions: () => Promise<void>
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined)

interface PermissionProviderProps {
  profile?: Profile | null
  children: ReactNode
  user: User
  role: Role | null
}

/**
 * Provider component that makes permissions available to all child components
 */
export function PermissionProvider({ children, user, role, profile = null }: PermissionProviderProps) {
  // Permissions live in the `role_permissions` table so the Role Management
  // page can actually change access. Until they load (or if they cannot be
  // read), `hasPermission` falls back to the static matrix, which the table
  // was seeded from — so access is never wrongly granted or blanket-denied.
  const { data: overrides = null, isLoading, isValidating, mutate } = useSWR<PermissionOverrides | null>(
    ['permissions', user.id, role?.id],
    () => fetchRolePermissions(role?.id),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const permissionsLoading = isLoading || isValidating
  const loadPermissions = React.useCallback(async () => { await mutate() }, [mutate])

  const can = (resource: string, permission: Permission | Permission[]): boolean => {
    if (profile?.is_active === false || (role?.code === 'super_admin' && profile?.bank_id)) return false
    if (Array.isArray(permission)) {
      return permission.some(p => hasPermission(role, resource, p, overrides))
    }
    return hasPermission(role, resource, permission, overrides)
  }

  const getPermissions = (resource: string) =>
    profile?.is_active === false || (role?.code === 'super_admin' && profile?.bank_id) ? null : getResourcePermissions(role, resource, overrides)

  const value: PermissionContextType = {
    profile,
    user,
    role,
    can,
    getPermissions,
    permissionsLoading,
    refreshPermissions: loadPermissions,
  }

  return (
    <PermissionContext.Provider value={value}>
      <AuthorityReasonProvider enabled={isSuperAdmin(role) && profile?.is_active !== false && !profile?.bank_id}>{children}</AuthorityReasonProvider>
    </PermissionContext.Provider>
  )
}

/**
 * Hook to access permission context
 */
export function usePermissions() {
  const context = useContext(PermissionContext)
  if (!context) {
    throw new Error('usePermissions must be used within PermissionProvider')
  }
  return context
}

/**
 * Hook to check a single permission
 */
export function useCan(resource: string, permission: Permission | Permission[] = 'view'): boolean {
  const { can } = usePermissions()
  return can(resource, permission)
}

/**
 * Hook to get full permission object for a resource
 */
export function useResourcePermissions(resource: string) {
  const { getPermissions } = usePermissions()
  return getPermissions(resource)
}

interface CanAccessProps {
  resource: string
  permission?: Permission | Permission[]
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Component that conditionally renders based on permissions
 * Usage: <CanAccess resource="loans" permission="create">Create Loan Button</CanAccess>
 */
export function CanAccess({
  resource,
  permission = 'view',
  fallback = null,
  children,
}: CanAccessProps) {
  const { can } = usePermissions()

  if (!can(resource, permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Component that shows content only if user is superadmin
 */
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { role } = usePermissions()
  
  if (!isSuperAdmin(role)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Component that shows content only if user is internal PRSF staff
 */
export function PRSFStaffOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { role } = usePermissions()
  
  if (!role || role.tier > 5 || role.code.startsWith('bank_')) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Component that shows content only if user is bank staff
 */
export function BankStaffOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { role } = usePermissions()
  
  if (!role || !role.code.startsWith('bank_')) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Enhanced CanAccess that can show disabled state instead of hiding
 * Useful for buttons/actions that should be visible but disabled
 */
interface CanAccessDisabledProps {
  resource: string
  permission?: Permission | Permission[]
  children: ReactNode
  disabledTooltip?: string
  mode?: 'hide' | 'disable'
}

export function CanAccessOrDisable({
  resource,
  permission = 'view',
  children,
  disabledTooltip = 'You do not have permission for this action',
  mode = 'disable',
}: CanAccessDisabledProps) {
  const { can } = usePermissions()
  const hasAccess = can(resource, permission)

  if (!hasAccess && mode === 'hide') {
    return null
  }

  if (!hasAccess && mode === 'disable') {
    // Clone children and add disabled prop + tooltip wrapper
    return (
      <span 
        title={disabledTooltip} 
        className="cursor-not-allowed opacity-50"
        aria-disabled="true"
      >
        {React.Children.map(children, child => {
          if (React.isValidElement<Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'aria-disabled' | 'onClick'>>(child)) {
            return React.cloneElement(child, {
              disabled: true,
              'aria-disabled': true,
              onClick: (e: React.MouseEvent) => e.preventDefault(),
            })
          }
          return child
        })}
      </span>
    )
  }

  return <>{children}</>
}

/**
 * Tier-based access component
 * Shows content only if user's tier is at or below the specified tier
 */
interface TierAccessProps {
  maxTier: number
  children: ReactNode
  fallback?: ReactNode
}

export function TierAccess({ maxTier, children, fallback = null }: TierAccessProps) {
  const { role } = usePermissions()
  
  if (!role || role.tier > maxTier) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Hook to check if user has a specific tier or better
 */
export function useHasTier(maxTier: number): boolean {
  const { role } = usePermissions()
  return role ? role.tier <= maxTier : false
}

/**
 * Hook to check if user is PRSF staff (non-bank)
 */
export function useIsPRSFStaff(): boolean {
  const { role } = usePermissions()
  return role ? !role.code.startsWith('bank_') : false
}

/**
 * Hook to check if user is bank staff
 */
export function useIsBankStaff(): boolean {
  const { role } = usePermissions()
  return role ? role.code.startsWith('bank_') : false
}

/**
 * Permission-gated button component
 * Shows disabled state with tooltip when user lacks permission
 */
interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  resource: string
  permission?: Permission | Permission[]
  tooltip?: string
  children: ReactNode
}

export function PermissionButton({
  resource,
  permission = 'view',
  tooltip = 'Insufficient permissions',
  children,
  ...props
}: PermissionButtonProps) {
  const { can } = usePermissions()
  const hasAccess = can(resource, permission)

  return (
    <button
      {...props}
      disabled={!hasAccess || props.disabled}
      title={!hasAccess ? tooltip : props.title}
      aria-disabled={!hasAccess || props.disabled}
      className={`${props.className || ''} ${!hasAccess ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {children}
    </button>
  )
}
