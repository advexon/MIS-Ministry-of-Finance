"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useI18n } from "@/lib/i18n/context"
import { usePermissions, AdminOnly } from "@/lib/contexts/permission-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"
import {
  Shield,
  Lock,
  Edit,
  Eye,
  Save,
  Loader2,
  AlertTriangle,
  Users,
  CheckCircle2,
} from "lucide-react"
import type { Role } from "@/lib/types/database"
import { getLocalizedName } from "@/lib/utils/localized-name"

// Resource definitions with labels
const RESOURCES = [
  { key: 'users', label: 'User Management', description: 'Manage system users and their accounts' },
  { key: 'roles', label: 'Role Management', description: 'Manage roles and permissions' },
  { key: 'loans', label: 'Loan Applications', description: 'View and manage loan applications' },
  { key: 'claims', label: 'Claims', description: 'View and manage guarantee claims' },
  { key: 'fees', label: 'Fees', description: 'View and manage fees and invoices' },
  { key: 'banks', label: 'Banks', description: 'View and manage partner banks' },
  { key: 'reports', label: 'Reports', description: 'Access and generate reports' },
  { key: 'audit_logs', label: 'Audit Logs', description: 'View system audit trail' },
  { key: 'access_logs', label: 'Access Logs', description: 'View access attempt logs' },
]

const PERMISSIONS = ['view', 'create', 'update', 'delete', 'approve'] as const
type Permission = typeof PERMISSIONS[number]

interface RolePermission {
  id?: string
  role_id: string
  resource: string
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_approve: boolean
}

// `Role.permissions` is a string[] of permission codes, but this page hydrates
// it into full RolePermission records, so the base field must be replaced.
interface RoleWithPermissions extends Omit<Role, "permissions"> {
  permissions?: RolePermission[]
  user_count?: number
}

const tierColors: Record<number, string> = {
  1: "bg-red-100 text-red-800 border-red-200",
  2: "bg-orange-100 text-orange-800 border-orange-200",
  3: "bg-amber-100 text-amber-800 border-amber-200",
  4: "bg-blue-100 text-blue-800 border-blue-200",
  5: "bg-purple-100 text-purple-800 border-purple-200",
  6: "bg-emerald-100 text-emerald-800 border-emerald-200",
  7: "bg-teal-100 text-teal-800 border-teal-200",
}

export default function RolesPage() {
  const { t, locale } = useI18n()
  const { role: userRole, user, refreshPermissions } = usePermissions()

  const [roles, setRoles] = useState<RoleWithPermissions[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null)
  const [editDialog, setEditDialog] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Permission edit state
  const [editedPermissions, setEditedPermissions] = useState<Record<string, RolePermission>>({})

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    // Fetch roles with user counts
    const { data: rolesData, error } = await supabase
      .from('roles')
      .select('*')
      .order('tier', { ascending: true })

    if (error) {
      showToast('Failed to load roles', 'error')
      setLoading(false)
      return
    }

    // Fetch user counts per role
    const { data: userCounts } = await supabase
      .from('profiles')
      .select('role_id')

    // Count users per role
    const countMap: Record<string, number> = {}
    userCounts?.forEach((u) => {
      if (u.role_id) {
        countMap[u.role_id] = (countMap[u.role_id] || 0) + 1
      }
    })

    // Fetch role_permissions
    const { data: permsData, error: permsError } = await supabase
      .from('role_permissions')
      .select('*')

    if (permsError) {
      // Previously silent, so a failed load looked identical to "no permissions
      // granted" — every checkbox rendered unchecked with no explanation.
      console.error('[v0] Failed to load role permissions:', permsError)
      showToast('Could not load permissions. Showing roles only.', 'error')
    }

    // Merge permissions into roles
    const rolesWithPerms = rolesData.map((role) => ({
      ...role,
      user_count: countMap[role.id] || 0,
      permissions: permsData?.filter((p) => p.role_id === role.id) || [],
    }))

    setRoles(rolesWithPerms)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  // Access check runs after all hooks so the hook order stays stable while
  // `userRole` resolves from null to a loaded role (Rules of Hooks).
  if (!userRole || userRole.tier > 2) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Lock className="h-12 w-12 text-destructive" />
              <h3 className="font-semibold text-destructive">Access Denied</h3>
              <p className="text-sm text-muted-foreground">
                Only administrators can access role management.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleEditRole = (role: RoleWithPermissions) => {
    setSelectedRole(role)
    
    // Initialize edited permissions from role's current permissions
    const permMap: Record<string, RolePermission> = {}
    RESOURCES.forEach((res) => {
      const existing = role.permissions?.find((p) => p.resource === res.key)
      permMap[res.key] = existing || {
        role_id: role.id,
        resource: res.key,
        can_view: false,
        can_create: false,
        can_update: false,
        can_delete: false,
        can_approve: false,
      }
    })
    setEditedPermissions(permMap)
    setEditDialog(true)
  }

  const handlePermissionChange = (resource: string, permission: Permission, checked: boolean) => {
    setEditedPermissions((prev) => ({
      ...prev,
      [resource]: {
        ...prev[resource],
        [`can_${permission}`]: checked,
      },
    }))
  }

  const handleSavePermissions = async () => {
    if (!selectedRole) return
    setSaving(true)

    try {
      const supabase = createClient()

      // Upsert each permission
      for (const resource of RESOURCES) {
        const perm = editedPermissions[resource.key]
        if (!perm) continue

        const { error } = await supabase
          .from('role_permissions')
          .upsert(
            {
              role_id: selectedRole.id,
              resource: resource.key,
              can_view: perm.can_view,
              can_create: perm.can_create,
              can_update: perm.can_update,
              can_delete: perm.can_delete,
              can_approve: perm.can_approve,
            },
            { onConflict: 'role_id,resource' }
          )

        if (error) throw error
      }

      // Log the permission change to audit trail.
      // `changed_by` is the acting USER, not their role — passing userRole.id
      // here recorded a role id and broke attribution.
      await supabase.from('audit_trail').insert({
        table_name: 'roles',
        record_id: selectedRole.id,
        action: 'UPDATE_PERMISSIONS',
        changed_by: user?.id ?? null,
        new_data: {
          role_name: getLocalizedName(selectedRole, locale),
          permissions_updated: Object.keys(editedPermissions),
        },
      })

      showToast('Permissions updated successfully')
      setEditDialog(false)
      fetchRoles()
      // Access is now DB-backed, so re-read the current user's own permissions
      // in case they just changed their own role's access.
      await refreshPermissions()
    } catch (error) {
      console.error('[v0] Failed to save role permissions:', error)
      showToast(
        error instanceof Error ? error.message : 'Failed to save permissions',
        'error',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-destructive text-destructive-foreground'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Role Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage system roles and their permissions
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <Shield className="h-3.5 w-3.5" />
          {roles.length} Roles
        </Badge>
      </div>

      {/* Roles Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Roles</CardTitle>
          <CardDescription>
            Each role has a tier level that determines its authority. Lower tier = higher authority.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-center">Tier</TableHead>
                  <TableHead className="text-center">Users</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{getLocalizedName(role, locale)}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {role.code}
                      </code>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={tierColors[role.tier] || 'bg-gray-100'}
                      >
                        Tier {role.tier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{role.user_count || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {role.description || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditRole(role)}
                        disabled={role.tier < (userRole?.tier || 99)}
                        title={
                          role.tier < (userRole?.tier || 99)
                            ? "Cannot edit roles with higher authority"
                            : "Edit permissions"
                        }
                      >
                        {role.tier < (userRole?.tier || 99) ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <Edit className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Permission Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission Types</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { key: 'view', label: 'View', desc: 'Read and list records', icon: Eye },
              { key: 'create', label: 'Create', desc: 'Add new records', icon: Shield },
              { key: 'update', label: 'Update', desc: 'Modify existing records', icon: Edit },
              { key: 'delete', label: 'Delete', desc: 'Remove records', icon: AlertTriangle },
              { key: 'approve', label: 'Approve', desc: 'Approve actions/requests', icon: CheckCircle2 },
            ].map((perm) => (
              <div key={perm.key} className="flex items-start gap-3 rounded-lg border p-3">
                <perm.icon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{perm.label}</p>
                  <p className="text-xs text-muted-foreground">{perm.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Permissions Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Edit Permissions: {getLocalizedName(selectedRole, locale)}
            </DialogTitle>
            <DialogDescription>
              Configure which resources this role can access and what actions they can perform.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-4">
            <Accordion type="multiple" defaultValue={RESOURCES.map((r) => r.key)} className="space-y-2">
              {RESOURCES.map((resource) => {
                const perm = editedPermissions[resource.key]
                const activeCount = perm
                  ? [perm.can_view, perm.can_create, perm.can_update, perm.can_delete, perm.can_approve].filter(Boolean).length
                  : 0

                return (
                  <AccordionItem key={resource.key} value={resource.key} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{resource.label}</span>
                        <Badge variant="secondary" className="text-xs">
                          {activeCount}/5
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <p className="text-sm text-muted-foreground mb-4">{resource.description}</p>
                      <div className="grid grid-cols-5 gap-4">
                        {PERMISSIONS.map((permission) => (
                          <label
                            key={permission}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Checkbox
                              checked={perm?.[`can_${permission}` as keyof RolePermission] as boolean}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(resource.key, permission, checked as boolean)
                              }
                            />
                            <span className="text-sm capitalize">{permission}</span>
                          </label>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePermissions} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Permissions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
