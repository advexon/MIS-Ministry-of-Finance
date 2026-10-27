"use client"

import { useUiTranslation } from '@/lib/i18n/ui-text'

import React, { useState } from "react"
import { usePageQuery } from "@/lib/hooks/use-page-query"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/lib/contexts/permission-context"
import { canManageRole, logPermissionChange } from "@/lib/utils/permissions"
import { Button } from "@/components/ui/button"
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
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Shield,
  AlertTriangle,
  Lock,
  Loader2,
  Save,
  CheckCircle2,
  Info,
} from "lucide-react"
import type { Role, Profile } from "@/lib/types/database"
import { useI18n } from "@/lib/i18n/context"
import { getLocalizedName } from "@/lib/utils/localized-name"

interface RoleAssignmentProps {
  user: Profile & { role?: Role }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const tierDescriptions: Record<number, string> = {
  1: "Full system access - can manage all users and settings",
  2: "Administrative access - can manage most operations",
  3: "Manager access - can approve and manage team",
  4: "Analyst access - can view and analyze data",
  5: "Auditor access - read-only compliance access",
  6: "Bank admin - can manage bank operations",
  7: "Bank officer - can submit and track loans",
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

export function RoleAssignmentDialog(props: RoleAssignmentProps) {
  return <RoleAssignmentForm key={`${props.user.id}:${props.user.role_id}:${props.open}`} {...props} />
}

function RoleAssignmentForm({
  user,
  open,
  onOpenChange,
  onSuccess,
}: RoleAssignmentProps) {
  const uiText = useUiTranslation()

  const { role: currentUserRole, user: currentUser } = usePermissions()
  const { locale } = useI18n()
  const [selectedRoleId, setSelectedRoleId] = useState<string>(user.role_id || "")
  const [saving, setSaving] = useState(false)
  const [actionError, setError] = useState<string | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const { data: roles = [], error: queryError, isLoading, isValidating } = usePageQuery<Role[]>(open ? ["assignable-roles"] : null, async () => {
    const supabase = createClient()
    const { data, error } = await supabase.from("roles").select("*").eq("is_active", true).order("tier", { ascending: true })
    if (error) throw error
    return data ?? []
  })
  const loading = isLoading || isValidating
  const error = actionError ?? (queryError ? "Failed to load roles" : null)

  // Get roles that can be assigned by current user
  const assignableRoles = roles.filter((role) =>
    canManageRole(currentUserRole, role.id, roles)
  )

  // Check if current selection is valid
  const selectedRole = roles.find((r) => r.id === selectedRoleId)
  const canAssignSelected = selectedRole
    ? canManageRole(currentUserRole, selectedRole.id, roles)
    : false

  // Check for privilege escalation attempt
  const isEscalationAttempt =
    selectedRole &&
    currentUserRole &&
    selectedRole.tier < currentUserRole.tier

  // Check if changing to a higher authority role than current user
  const previousRole = user.role
  const isUpgrade = selectedRole && previousRole && selectedRole.tier < previousRole.tier
  const isDowngrade = selectedRole && previousRole && selectedRole.tier > previousRole.tier

  const handleSave = async () => {
    if (!selectedRoleId || !canAssignSelected) {
      setError("You cannot assign this role")
      return
    }

    // Require confirmation for role changes
    if (!showConfirmation) {
      setShowConfirmation(true)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role_id: selectedRoleId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Failed to assign role")

      // Log the permission change
      await logPermissionChange(
        currentUser?.id || "",
        "ROLE_ASSIGNED",
        user.id,
        selectedRoleId,
        {
          roleName: getLocalizedName(selectedRole, locale),
          previousRole: getLocalizedName(previousRole, locale),
          newRole: getLocalizedName(selectedRole, locale),
          changedBy: currentUser?.email,
        }
      )

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign role")
    } finally {
      setSaving(false)
      setShowConfirmation(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />{uiText("Assign Role")}</DialogTitle>
          <DialogDescription>{uiText("Change the role for ")}{user.first_name} {user.last_name || user.email}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Current Role Display */}
            {previousRole && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <Label className="text-xs text-muted-foreground">{uiText("Current Role")}</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline" className={tierColors[previousRole.tier]}>{uiText("Tier ")}{previousRole.tier}
                  </Badge>
                  <span className="font-medium">{getLocalizedName(previousRole, locale)}</span>
                </div>
              </div>
            )}

            {/* Role Selection */}
            <div className="space-y-2">
              <Label htmlFor="role-select">{uiText("New Role")}</Label>
              <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                <SelectTrigger id="role-select">
                  <SelectValue placeholder={uiText("Select a role")} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => {
                    const canAssign = canManageRole(currentUserRole, role.id, roles)
                    return (
                      <SelectItem
                        key={role.id}
                        value={role.id}
                        disabled={!canAssign}
                        className={!canAssign ? "opacity-50" : ""}
                      >
                        <div className="flex items-center gap-2">
                          {!canAssign && <Lock className="h-3 w-3 text-muted-foreground" />}
                          <Badge
                            variant="outline"
                            className={`${tierColors[role.tier]} mr-2 text-xs`}
                          >
                            T{role.tier}
                          </Badge>
                          {getLocalizedName(role, locale)}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              {/* Role description */}
              {selectedRole && (
                <p className="text-xs text-muted-foreground">
                  {tierDescriptions[selectedRole.tier] || selectedRole.description}
                </p>
              )}
            </div>

            {/* Warning for privilege escalation attempt */}
            {isEscalationAttempt && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{uiText("Privilege Escalation Blocked")}</AlertTitle>
                <AlertDescription>{uiText("You cannot assign a role with higher authority than your own. Your tier is ")}{currentUserRole?.tier}{uiText(", but the selected role is tier")}{" "}
                  {selectedRole?.tier}.
                </AlertDescription>
              </Alert>
            )}

            {/* Info for role upgrade */}
            {isUpgrade && canAssignSelected && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>{uiText("Role Upgrade")}</AlertTitle>
                <AlertDescription>{uiText("This will grant the user additional permissions. The change will be logged in the audit trail.")}</AlertDescription>
              </Alert>
            )}

            {/* Info for role downgrade */}
            {isDowngrade && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{uiText("Role Downgrade")}</AlertTitle>
                <AlertDescription>{uiText("This will remove some permissions from the user. The change will be logged in the audit trail.")}</AlertDescription>
              </Alert>
            )}

            {/* Confirmation step */}
            {showConfirmation && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{uiText("Confirm Role Change")}</AlertTitle>
                <AlertDescription>{uiText("Are you sure you want to change the role from")}{" "}
                  <strong>{getLocalizedName(previousRole, locale) || uiText("None")}</strong> {uiText("to")}{" "}
                  <strong>{getLocalizedName(selectedRole, locale)}</strong>{uiText("? This action will be logged.")}</AlertDescription>
              </Alert>
            )}

            {/* Error display */}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{uiText(error)}</AlertDescription>
              </Alert>
            )}

            {/* Assignable roles info */}
            {assignableRoles.length === 0 && (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertTitle>{uiText("No Assignable Roles")}</AlertTitle>
                <AlertDescription>{uiText("You do not have permission to assign any roles. Contact a superadmin to change user roles.")}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              setShowConfirmation(false)
              onOpenChange(false)
            }}
          >{uiText("Cancel")}</Button>
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !selectedRoleId ||
              !canAssignSelected ||
              selectedRoleId === user.role_id
            }
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : showConfirmation ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {showConfirmation ? uiText("Confirm Change") : uiText("Assign Role")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Inline role badge with edit capability
 */
interface RoleBadgeWithEditProps {
  user: Profile & { role?: Role }
  onRoleChange?: () => void
}

export function RoleBadgeWithEdit({ user, onRoleChange }: RoleBadgeWithEditProps) {
  const uiText = useUiTranslation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const { can } = usePermissions()
  const { locale } = useI18n()

  const canEditRoles = can("users", "update")

  return (
    <>
      <button
        onClick={() => canEditRoles && setDialogOpen(true)}
        disabled={!canEditRoles}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          user.role ? tierColors[user.role.tier] : "bg-gray-100 text-gray-600"
        } ${canEditRoles ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        title={canEditRoles ? "Click to change role" : "You cannot edit roles"}
      >
        {getLocalizedName(user.role, locale) || uiText("No Role")}
        {canEditRoles && <Shield className="h-3 w-3" />}
      </button>

      <RoleAssignmentDialog
        user={user}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={onRoleChange}
      />
    </>
  )
}
