"use client"

import { useState } from "react"
import { usePageQuery } from "@/lib/hooks/use-page-query"
import { useI18n } from "@/lib/i18n/context"
import { usePermissions } from "@/lib/contexts/permission-context"
import { Card, CardContent } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  Plus,
  MoreHorizontal,
  Eye,
  Edit,
  Shield,
  Users,
  UserCheck,
  Search,
  Loader2,
  Save,
  UserX,
  CheckCircle2,
  AlertCircle,
  Lock,
} from "lucide-react"
import type { Profile, Role, Bank, BankBranch } from "@/lib/types/database"
import { useFieldRequirements } from "@/lib/hooks/use-field-requirements"
import { RequiredMark, missingFieldsMessage } from "@/components/forms/required-mark"

import { EmployeeFlagsEditor, employeeFlagsFromProfile, type EmployeeFlags } from "@/components/admin/employee-flags-editor"
import { employeeFlagsSchema } from "@/lib/employee-flags"
import { AdminPasswordReset } from "@/components/admin/password-reset"

interface UserWithRelations extends Profile, Partial<EmployeeFlags> {
  role?: Role
  bank?: Bank
}

const roleColors: Record<string, string> = {
  prsf_admin: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  prsf_manager: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  prsf_analyst: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bank_admin: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  bank_officer: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  viewer: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
}

export default function UsersPage() {
  const permissions = usePermissions()

  // Permission check: only admin can access users page
  if (!permissions.can('users', 'view')) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Lock className="h-12 w-12 text-destructive" />
              <h3 className="font-semibold text-destructive">Access Denied</h3>
              <p className="text-sm text-muted-foreground">
                You don&apos;t have permission to access the users management page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <UserManagement />
}

function UserManagement() {
  const { t, locale } = useI18n()
  const permissions = usePermissions()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterRole, setFilterRole] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserWithRelations | null>(null)
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Create user form state
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newFirstName, setNewFirstName] = useState("")
  const [newLastName, setNewLastName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newRoleId, setNewRoleId] = useState("")
  const [newBankId, setNewBankId] = useState("")
  const [, setNewBranchId] = useState("")
  const [creating, setCreating] = useState(false)

  // Edit form state
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editRoleId, setEditRoleId] = useState("")
  const [editBankId, setEditBankId] = useState("")
  const [editIsActive, setEditIsActive] = useState(true)
  const [editFlags, setEditFlags] = useState<EmployeeFlags>(() => employeeFlagsFromProfile({}))
  const [editProductTags, setEditProductTags] = useState("")
  const canEditFlags = permissions.can("users", "update") &&
    ["super_admin", "prsf_admin"].includes(permissions.role?.code ?? "") &&
    !!permissions.user?.id && permissions.user.id !== selectedUser?.id
  const flagsInput = { ...editFlags, product_tags: editProductTags.split(",").map((tag) => tag.trim()).filter(Boolean) }
  const flagsChanged = selectedUser && JSON.stringify(flagsInput) !== JSON.stringify(employeeFlagsFromProfile(selectedUser))

  const { data: directory, isLoading, isValidating, mutate } = usePageQuery<{
    users: UserWithRelations[]
    roles: Role[]
    banks: Bank[]
    branches: BankBranch[]
  }>(["user-directory"], async () => {
    const response = await fetch("/api/users", { credentials: "include" })
    if (!response.ok) throw new Error("Failed to load users")
    return response.json()
  })
  const users = directory?.users ?? []
  const roles = directory?.roles ?? []
  const banks = directory?.banks ?? []
  const loading = isLoading || isValidating
  const fetchData = () => mutate()

  const showMessage = (type: "success" | "error", message: string) => {
    if (type === "success") {
      setSuccessMessage(message)
      setErrorMessage(null)
    } else {
      setErrorMessage(message)
      setSuccessMessage(null)
    }
    setTimeout(() => {
      setSuccessMessage(null)
      setErrorMessage(null)
    }, 5000)
  }

  const getName = (item: { name_en: string; name_ru?: string | null; name_tj?: string | null }) => {
    if (locale === "ru" && item.name_ru) return item.name_ru
    if (locale === "tj" && item.name_tj) return item.name_tj
    return item.name_en
  }

  const getUserName = (user: UserWithRelations) => {
    const parts = [user.first_name, user.last_name].filter(Boolean)
    return parts.length > 0 ? parts.join(" ") : user.email
  }

  const getInitials = (user: UserWithRelations) => {
    const first = user.first_name?.charAt(0) || ""
    const last = user.last_name?.charAt(0) || ""
    return (first + last).toUpperCase() || user.email.charAt(0).toUpperCase()
  }

  const openEditDialog = (user: UserWithRelations) => {
    setSelectedUser(user)
    setEditFirstName(user.first_name || "")
    setEditLastName(user.last_name || "")
    setEditPhone(user.phone || "")
    setEditRoleId(user.role_id || "")
    setEditBankId(user.bank_id || "")
    setEditIsActive(user.is_active)
    setEditFlags(employeeFlagsFromProfile(user))
    setEditProductTags((user.product_tags ?? []).join(", "))
    setEditDialogOpen(true)
  }

  const openViewDialog = (user: UserWithRelations) => {
    setSelectedUser(user)
    setViewDialogOpen(true)
  }

  const handleSaveUser = async () => {
    if (!selectedUser) return
    const parsedFlags = employeeFlagsSchema.safeParse(flagsInput)
    if (canEditFlags && flagsChanged && !parsedFlags.success) {
      showMessage("error", parsedFlags.error.issues[0]?.message ?? "Check employee responsibilities")
      return
    }
    setSaving(true)
    try {
      // Use the admin API endpoint to bypass RLS
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          first_name: editFirstName,
          last_name: editLastName,
          phone: editPhone,
          ...(editRoleId && editRoleId !== selectedUser.role_id ? { role_id: editRoleId } : {}),
          bank_id: editBankId && editBankId !== "none" ? editBankId : null,
          is_active: editIsActive,
          ...(canEditFlags && flagsChanged && parsedFlags.success ? parsedFlags.data : {}),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update user")

      showMessage("success", `User ${getUserName(selectedUser)} updated successfully`)
      setEditDialogOpen(false)
      await fetchData()
    } catch (err) {
      console.error("[v0] Error saving user:", err)
      showMessage("error", err instanceof Error ? err.message : "Failed to update user")
    } finally {
      setSaving(false)
    }
  }

  const userReq = useFieldRequirements("user_create")
  const newUserMissing = userReq.missingFields({
    first_name: newFirstName,
    last_name: newLastName,
    email: newEmail,
    password: newPassword,
    phone: newPhone,
    role: newRoleId,
    bank: newBankId === "none" ? "" : newBankId,
  })

  const handleCreateUser = async () => {
    if (!newRoleId) {
      showMessage('error', 'Select a role for the new account')
      return
    }
    if (newUserMissing.length) {
      showMessage("error", missingFieldsMessage(newUserMissing))
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          firstName: newFirstName,
          lastName: newLastName,
          phone: newPhone || undefined,
          roleId: newRoleId || undefined,
          bankId: newBankId && newBankId !== 'none' ? newBankId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create user')
      showMessage('success', `User ${newEmail} created successfully`)
      setCreateDialogOpen(false)
      // Reset form
      setNewEmail(""); setNewPassword(""); setNewFirstName(""); setNewLastName("")
      setNewPhone(""); setNewRoleId(""); setNewBankId(""); setNewBranchId("")
      fetchData()
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (user: UserWithRelations) => {
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, is_active: !user.is_active }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed to update user status")

      showMessage("success", `User ${getUserName(user)} ${!user.is_active ? "activated" : "deactivated"}`)
      fetchData()
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Failed to update user status")
    }
  }

  // Filtering
  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      searchQuery === "" ||
      getUserName(user).toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesRole =
      filterRole === "all" || user.role?.code === filterRole

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && user.is_active) ||
      (filterStatus === "inactive" && !user.is_active)

    return matchesSearch && matchesRole && matchesStatus
  })

  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.is_active).length
  const adminUsers = users.filter((u) => u.role?.code === "prsf_admin").length

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.users.title}</h1>
          <p className="mt-1 text-muted-foreground">
            Manage system users, assign roles and bank affiliations
          </p>
        </div>
        {['super_admin', 'prsf_admin'].includes(permissions.role?.code ?? '') && (
          <Button onClick={() => setCreateDialogOpen(true)} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Create User
          </Button>
        )}
      </div>

      {/* Status Messages */}
      {successMessage && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4" />
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Users</p>
              <p className="text-2xl font-bold">{totalUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3">
              <UserCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{activeUsers}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-red-500/10 p-3">
              <Shield className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admins</p>
              <p className="text-2xl font-bold">{adminUsers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.code}>
                {getName(role)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">User</TableHead>
                  <TableHead className="font-semibold">{t.users.role}</TableHead>
                  <TableHead className="font-semibold">Organization</TableHead>
                  <TableHead className="font-semibold">{t.users.lastLogin}</TableHead>
                  <TableHead className="font-semibold">{t.common.status}</TableHead>
                  <TableHead className="text-right font-semibold">
                    {t.common.actions}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      {searchQuery || filterRole !== "all" || filterStatus !== "all"
                        ? "No users match your filters"
                        : t.common.noData}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-xs text-primary">
                              {getInitials(user)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{getUserName(user)}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.role ? (
                          <Badge
                            className={roleColors[user.role.code] || ""}
                            variant="secondary"
                          >
                            {getName(user.role)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No role</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.bank ? getName(user.bank) : "PRSF"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            user.is_active
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                          }
                        >
                          {user.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openViewDialog(user)}>
                              <Eye className="mr-2 h-4 w-4" />
                              {t.common.view}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(user)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {t.common.edit}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleToggleActive(user)}>
                              {user.is_active ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Showing {filteredUsers.length} of {totalUsers} users
      </p>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create an account and assign its role. Share credentials through an approved secure channel. The user can sign in immediately; no email or verification link is sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t.auth.firstName}<RequiredMark show={userReq.isRequired("first_name")} /></Label>
                <Input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} placeholder="First name" />
              </div>
              <div className="space-y-2">
                <Label>{t.auth.lastName}<RequiredMark show={userReq.isRequired("last_name")} /></Label>
                <Input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} placeholder="Last name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.auth.email}<RequiredMark show={userReq.isRequired("email")} /></Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@bank.tj" required />
            </div>
            <div className="space-y-2">
              <Label>{t.auth.password}<RequiredMark show={userReq.isRequired("password")} /></Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" required />
            </div>
            <div className="space-y-2">
              <Label>Phone<RequiredMark show={userReq.isRequired("phone")} /></Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+992 XX XXX XXXX" />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>{t.users.role}<RequiredMark show={userReq.isRequired("role")} /></Label>
              <Select value={newRoleId} onValueChange={setNewRoleId}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>{getName(role)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t.loans.bank}<RequiredMark show={userReq.isRequired("bank")} /></Label>
                <Select value={newBankId} onValueChange={(v) => { setNewBankId(v); setNewBranchId("") }}>
                  <SelectTrigger><SelectValue placeholder="Select bank (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (PRSF Staff)</SelectItem>
                    {banks.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>{getName(bank)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setCreateDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleCreateUser} disabled={creating || newUserMissing.length > 0} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Detailed information about this user account
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-lg text-primary-foreground">
                    {getInitials(selectedUser)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold">{getUserName(selectedUser)}</h3>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium">
                    {selectedUser.role ? getName(selectedUser.role) : "Not assigned"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Organization</span>
                  <span className="font-medium">
                    {selectedUser.bank ? getName(selectedUser.bank) : "PRSF"}
                  </span>
                </div>
                {selectedUser.branch && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Branch</span>
                    <span className="font-medium">{getName(selectedUser.branch)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-medium">{selectedUser.phone || "Not set"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={selectedUser.is_active ? "default" : "destructive"}
                  >
                    {selectedUser.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span className="font-medium">
                    {new Date(selectedUser.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setViewDialogOpen(false)}>
              {t.common.close}
            </Button>
            <Button
              onClick={() => {
                setViewDialogOpen(false)
                if (selectedUser) openEditDialog(selectedUser)
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              {t.common.edit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user profile, role assignment, and bank affiliation
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(selectedUser)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedUser.email}</p>
                  <p className="text-xs text-muted-foreground">
                    ID: {selectedUser.id.slice(0, 8)}...
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t.auth.firstName}</Label>
                  <Input
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.auth.lastName}</Label>
                  <Input
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+992 XX XXX XXXX"
                />
              </div>

              <Separator />

              {selectedUser.id !== permissions.user?.id &&
                ['super_admin', 'prsf_admin'].includes(permissions.role?.code ?? '') && (
                  <AdminPasswordReset key={selectedUser.id} userId={selectedUser.id} name={getUserName(selectedUser)} />
                )}

              <div className="space-y-2">
                <Label>{t.users.role}</Label>
                <Select value={editRoleId} onValueChange={setEditRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {getName(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t.loans.bank}</Label>
                <Select
                  value={editBankId}
                  onValueChange={setEditBankId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bank (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (PRSF Staff)</SelectItem>
                    {banks.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id}>
                        {getName(bank)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <EmployeeFlagsEditor
                value={editFlags}
                onChange={setEditFlags}
                tagsText={editProductTags}
                onTagsChange={setEditProductTags}
                disabled={!canEditFlags || saving}
              />
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Account Active</p>
                  <p className="text-xs text-muted-foreground">
                    Inactive users cannot log in to the system
                  </p>
                </div>
                <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setEditDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSaveUser} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
