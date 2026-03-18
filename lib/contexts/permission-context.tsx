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
