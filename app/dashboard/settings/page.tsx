"use client"

import { useI18n } from "@/lib/i18n/context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Save, Shield, Bell, Settings as SettingsIcon } from "lucide-react"

export default function SettingsPage() {
  const { t } = useI18n()

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
        <p className="mt-1 text-muted-foreground">Configure system settings and preferences</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-2"><SettingsIcon className="h-4 w-4" />{t.settings.general}</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />{t.settings.notifications}</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" />{t.settings.security}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Loan Processing Settings</CardTitle>
              <CardDescription>Configure default values for loan processing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t.settings.loanThreshold}</Label>
                  <Input type="number" defaultValue="1000000" />
                  <p className="text-xs text-muted-foreground">Loans above this amount require additional approval</p>
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.defaultCoverage}</Label>
                  <Input type="number" defaultValue="50" />
                  <p className="text-xs text-muted-foreground">Default guarantee coverage percentage</p>
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.reportDeadline}</Label>
                  <Select defaultValue="10">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5th of each month</SelectItem>
                      <SelectItem value="10">10th of each month</SelectItem>
                      <SelectItem value="15">15th of each month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t.settings.claimProcessingDays}</Label>
                  <Input type="number" defaultValue="30" />
                  <p className="text-xs text-muted-foreground">Maximum days to process a claim</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fee Configuration</CardTitle>
              <CardDescription>Set default fee rates for new loans</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default Upfront Fee Rate (%)</Label>
                  <Input type="number" step="0.1" defaultValue="0.5" />
                </div>
                <div className="space-y-2">
                  <Label>Default Quarterly Fee Rate (%)</Label>
                  <Input type="number" step="0.1" defaultValue="0.5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button className="gap-2"><Save className="h-4 w-4" />{t.common.save}</Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>Configure when the system sends email alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "New loan application submitted", desc: "Notify when banks submit new applications" },
                { label: "Loan approved/rejected", desc: "Notify bank when application status changes" },
                { label: "Payment overdue", desc: "Alert when a borrower misses a payment" },
                { label: "Claim submitted", desc: "Notify when a bank submits a guarantee claim" },
                { label: "Monthly report deadline", desc: "Remind banks about upcoming report deadlines" },
                { label: "Fee payment due", desc: "Alert about upcoming fee payments" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.passwordPolicy}</CardTitle>
              <CardDescription>Configure password requirements for user accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Minimum Password Length</Label>
                  <Input type="number" defaultValue="8" />
                </div>
                <div className="space-y-2">
                  <Label>Password Expiry (days)</Label>
                  <Input type="number" defaultValue="90" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Require uppercase letters</Label>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require numbers</Label>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Require special characters</Label>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Two-factor authentication</Label>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Session Timeout (minutes)</Label>
                  <Input type="number" defaultValue="30" />
                </div>
                <div className="space-y-2">
                  <Label>Max Failed Login Attempts</Label>
                  <Input type="number" defaultValue="5" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button className="gap-2"><Save className="h-4 w-4" />{t.common.save}</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
