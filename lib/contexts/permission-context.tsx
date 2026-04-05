'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { Role } from '@/lib/types/database'
import { hasPermission, Permission, getResourcePermissions, ResourcePermission } from '@/lib/utils/permissions'

interface PermissionContextType {
  user: any
  role: Role | null
  can: (resource: string, permission: Permission | Permission[]) => boolean
  getPermissions: (resource: string) => ResourcePermission | null
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined)

interface PermissionProviderProps {
  children: ReactNode
  user: any
  role: Role | null
}

/**
 * Provider component that makes permissions available to all child components
 */
export function PermissionProvider({ children, user, role }: PermissionProviderProps) {
  const can = (resource: string, permission: Permission | Permission[]): boolean => {
    if (Array.isArray(permission)) {
      return permission.some(p => hasPermission(role, resource, p))
    }
    return hasPermission(role, resource, permission)
  }

  const getPermissions = (resource: string) => getResourcePermissions(role, resource)

  const value: PermissionContextType = {
    user,
    role,
    can,
    getPermissions,
  }

  return (
    <PermissionContext.Provider value={value}>
      {children}
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
  
  if (!role || role.tier !== 1) {
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
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<any>, {
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
