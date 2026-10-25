export const ROLE_PERMISSION_RESOURCES = [
  { key: 'users', label: 'User Management', description: 'Manage system users and their accounts' },
  { key: 'roles', label: 'Role Management', description: 'Manage roles and permissions' },
  { key: 'loans', label: 'Loan Applications', description: 'View and manage loan applications' },
  { key: 'claims', label: 'Claims', description: 'View and manage guarantee claims' },
  { key: 'fees', label: 'Fees', description: 'View and manage fees and invoices' },
  { key: 'banks', label: 'Banks', description: 'View and manage partner banks' },
  { key: 'reports', label: 'Reports', description: 'Access and generate reports' },
  { key: 'audit_logs', label: 'Audit Logs', description: 'View system audit trail' },
  { key: 'access_logs', label: 'Access Logs', description: 'View access attempt logs' },
] as const

export const ROLE_PERMISSION_ACTIONS = ['view', 'create', 'update', 'delete', 'approve'] as const
export type RolePermissionAction = typeof ROLE_PERMISSION_ACTIONS[number]

export function isEditableRoleGrant(code: string, resource: string, action: RolePermissionAction): boolean {
  if (code === 'super_admin') return false
  if (code === 'auditor') return action === 'view'
  if (code === 'legal_officer') return action === 'view' && ['loans', 'claims'].includes(resource)
  if (code === 'prsf_admin' && ['loans', 'claims'].includes(resource)) return action === 'view' || action === 'update'
  return true
}
