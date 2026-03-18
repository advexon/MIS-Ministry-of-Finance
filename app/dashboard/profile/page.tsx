"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { useI18n } from "@/lib/i18n/context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  User,
  Shield,
  Key,
  Globe,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Mail,
  Phone,
  Clock,
} from "lucide-react"
import type { Profile, Role, Bank, BankBranch } from "@/lib/types/database"

interface ProfileWithRelations extends Profile {
  role?: Role
  bank?: Bank
  branch?: BankBranch
}

export default function ProfilePage() {
  const { t, locale, setLocale } = useI18n()
  const supabase = createClient()

  const [profile, setProfile] = useState<ProfileWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Form state for profile
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [preferredLanguage, setPreferredLanguage] = useState("en")

  // Form state for password change
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmNewPassword, setConfirmNewPassword] = useState("")

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from("profiles")
        .select(`
          *,
          role:roles(*),
          bank:banks(*),
          branch:bank_branches(*)
        `)
        .eq("id", user.id)
        .single()

      if (error) throw error

      setProfile(data)
      setFirstName(data.first_name || "")
      setLastName(data.last_name || "")
      setPhone(data.phone || "")
      setPreferredLanguage(data.preferred_language || "en")
    } catch (err) {
      console.error("Error fetching profile:", err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

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

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone,
          preferred_language: preferredLanguage,
        })
        .eq("id", user.id)

      if (error) throw error

      // Update locale in the app
      setLocale(preferredLanguage as "en" | "ru" | "tj")

      showMessage("success", "Profile updated successfully")
      fetchProfile()
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      showMessage("error", "New passwords do not match")
      return
    }
    if (newPassword.length < 8) {
      showMessage("error", "Password must be at least 8 characters long")
      return
    }

    setChangingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      showMessage("success", "Password changed successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmNewPassword("")
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Failed to change password")
    } finally {
      setChangingPassword(false)
    }
  }

  const getInitials = () => {
    const first = firstName?.charAt(0) || ""
    const last = lastName?.charAt(0) || ""
    return (first + last).toUpperCase() || "U"
  }

  const getRoleName = () => {
    if (!profile?.role) return "No role assigned"
    if (locale === "ru" && profile.role.name_ru) return profile.role.name_ru
    if (locale === "tj" && profile.role.name_tj) return profile.role.name_tj
    return profile.role.name_en
  }

  const getBankName = () => {
    if (!profile?.bank) return null
    if (locale === "ru" && profile.bank.name_ru) return profile.bank.name_ru
    if (locale === "tj" && profile.bank.name_tj) return profile.bank.name_tj
    return profile.bank.name_en
  }

  const getBranchName = () => {
    if (!profile?.branch) return null
    if (locale === "ru" && profile.branch.name_ru) return profile.branch.name_ru
    if (locale === "tj" && profile.branch.name_tj) return profile.branch.name_tj
    return profile.branch.name_en
  }

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t.nav.profile}</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your account settings and preferences
        </p>
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Summary Card */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">
                {firstName} {lastName}
              </h2>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>

            <Separator />

            <div className="w-full space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Role:</span>
                <Badge variant="secondary" className="ml-auto">
                  {getRoleName()}
                </Badge>
              </div>

              {getBankName() && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Bank:</span>
                  <span className="ml-auto font-medium text-foreground">
                    {getBankName()}
                  </span>
                </div>
              )}

              {getBranchName() && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Branch:</span>
                  <span className="ml-auto font-medium text-foreground">
                    {getBranchName()}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Email:</span>
                <span className="ml-auto truncate font-medium text-foreground">
                  {profile?.email}
                </span>
              </div>

              {profile?.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="ml-auto font-medium text-foreground">
                    {profile.phone}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Language:</span>
                <span className="ml-auto font-medium text-foreground">
                  {preferredLanguage === "en" ? "English" : preferredLanguage === "ru" ? "Русский" : "Тоҷикӣ"}
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Last login:</span>
                <span className="ml-auto font-medium text-foreground">
                  {profile?.last_login_at
                    ? new Date(profile.last_login_at).toLocaleDateString()
                    : "Never"}
                </span>
              </div>

              <Separator />

              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <Badge
                  variant={profile?.is_active ? "default" : "destructive"}
                  className="ml-auto"
                >
                  {profile?.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Member since:</span>
                <span className="ml-auto font-medium text-foreground">
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString()
                    : "Unknown"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Edit Profile and Security */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList>
              <TabsTrigger value="profile" className="gap-2">
                <User className="h-4 w-4" />
                Personal Information
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <Key className="h-4 w-4" />
                Security
              </TabsTrigger>
              <TabsTrigger value="preferences" className="gap-2">
                <Globe className="h-4 w-4" />
                Preferences
              </TabsTrigger>
            </TabsList>

            {/* Personal Information Tab */}
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Update your name and contact details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">{t.auth.firstName}</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Enter your first name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">{t.auth.lastName}</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Enter your last name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t.auth.email}</Label>
                    <Input
                      id="email"
                      value={profile?.email || ""}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email address cannot be changed. Contact an administrator for assistance.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+992 XX XXX XXXX"
                    />
                  </div>

                  {/* Read-only assignment info */}
                  {(profile?.role || profile?.bank) && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                          Organizational Assignment
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          These fields are managed by system administrators and cannot be changed here.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t.users.role}</Label>
                            <Input
                              value={getRoleName()}
                              disabled
                              className="bg-muted"
                            />
                          </div>
                          {getBankName() && (
                            <div className="space-y-2">
                              <Label>{t.loans.bank}</Label>
                              <Input
                                value={getBankName() || ""}
                                disabled
                                className="bg-muted"
                              />
                            </div>
                          )}
                          {getBranchName() && (
                            <div className="space-y-2">
                              <Label>{t.loans.branch}</Label>
                              <Input
                                value={getBranchName() || ""}
                                disabled
                                className="bg-muted"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {t.common.save}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>
                    Update your password to keep your account secure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmNewPassword">{t.auth.confirmPassword}</Label>
                      <Input
                        id="confirmNewPassword"
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="mb-2 text-sm font-medium">Password Requirements</h4>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li className={newPassword.length >= 8 ? "text-green-600 dark:text-green-400" : ""}>
                        {newPassword.length >= 8 ? "+" : "-"} At least 8 characters
                      </li>
                      <li className={/[A-Z]/.test(newPassword) ? "text-green-600 dark:text-green-400" : ""}>
                        {/[A-Z]/.test(newPassword) ? "+" : "-"} At least one uppercase letter
                      </li>
                      <li className={/[0-9]/.test(newPassword) ? "text-green-600 dark:text-green-400" : ""}>
                        {/[0-9]/.test(newPassword) ? "+" : "-"} At least one number
                      </li>
                      <li className={/[^A-Za-z0-9]/.test(newPassword) ? "text-green-600 dark:text-green-400" : ""}>
                        {/[^A-Za-z0-9]/.test(newPassword) ? "+" : "-"} At least one special character
                      </li>
                      <li className={newPassword === confirmNewPassword && newPassword.length > 0 ? "text-green-600 dark:text-green-400" : ""}>
                        {newPassword === confirmNewPassword && newPassword.length > 0 ? "+" : "-"} Passwords match
                      </li>
                    </ul>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleChangePassword}
                      disabled={changingPassword || !newPassword || !confirmNewPassword}
                      className="gap-2"
                    >
                      {changingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Key className="h-4 w-4" />
                      )}
                      Change Password
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Session Information</CardTitle>
                  <CardDescription>
                    Details about your current session
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">Current Session</p>
                        <p className="text-xs text-muted-foreground">Active now</p>
                      </div>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                    {profile?.last_login_at && (
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">Last Login</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(profile.last_login_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Preferences Tab */}
            <TabsContent value="preferences" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Language Preference</CardTitle>
                  <CardDescription>
                    Choose your preferred language for the system interface
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t.auth.selectLanguage}</Label>
                    <Select
                      value={preferredLanguage}
                      onValueChange={setPreferredLanguage}
                    >
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ru">Русский (Russian)</SelectItem>
                        <SelectItem value="tj">Тоҷикӣ (Tajik)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      This setting will change the language of all labels, menus, and system messages.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {t.common.save}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account Details</CardTitle>
                  <CardDescription>
                    Information about your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Account ID</span>
                      <code className="rounded bg-muted px-2 py-1 text-xs font-mono">
                        {profile?.id?.slice(0, 8)}...
                      </code>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Account Status</span>
                      <Badge variant={profile?.is_active ? "default" : "destructive"}>
                        {profile?.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Created</span>
                      <span className="text-sm text-foreground">
                        {profile?.created_at
                          ? new Date(profile.created_at).toLocaleDateString()
                          : "Unknown"}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Last Updated</span>
                      <span className="text-sm text-foreground">
                        {profile?.updated_at
                          ? new Date(profile.updated_at).toLocaleDateString()
                          : "Unknown"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
