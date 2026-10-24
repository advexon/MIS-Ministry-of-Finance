'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Settings as SettingsIcon, Bell, Shield, Database } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { CgfWorkflowControls } from '@/components/admin/cgf-workflow-controls'

interface SettingRow { key: string; value: Record<string, unknown>; description: string }

const NOTIFICATION_KEYS = [
  { key: 'notify_loan_submitted', label: 'New loan application submitted', desc: 'Notify when banks submit new applications' },
  { key: 'notify_loan_reviewed', label: 'Loan approved / rejected', desc: 'Notify bank when application status changes' },
  { key: 'notify_payment_overdue', label: 'Payment overdue', desc: 'Alert when a borrower misses a payment' },
  { key: 'notify_claim_submitted', label: 'Claim submitted', desc: 'Notify when a bank submits a guarantee claim' },
  { key: 'notify_report_deadline', label: 'Monthly report deadline reminder', desc: 'Remind banks 5 days before deadline' },
  { key: 'notify_fee_due', label: 'Fee payment due', desc: 'Alert about upcoming quarterly fees' },
]

export default function SettingsPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const { toast } = useToast()

  const [settings, setSettings] = useState<Record<string, SettingRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('system_settings').select('*').then(({ data }) => {
      if (data) {
        const map: Record<string, SettingRow> = {}
        for (const row of data) {
          let value: unknown = row.value
          try { value = JSON.parse(row.value) } catch { value = {} }
          map[row.key] = { ...row, value: value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
        }
        setSettings(map)
      }
      setLoading(false)
    })
  }, [])

  const getVal = (key: string, field: string, fallback: unknown) => {
    return (settings[key]?.value?.[field] ?? fallback) as string | number | boolean
  }

  const setVal = (key: string, field: string, value: unknown) => {
    setSettings(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || { key, description: '' }),
        value: { ...(prev[key]?.value || {}), [field]: value },
      },
    }))
  }

  const saveSection = async (keys: string[]) => {
    setSaving(true)
    try {
      const rows = keys.flatMap((key) => settings[key] ? [{ key, value: JSON.stringify(settings[key].value), description: settings[key].description }] : [])
      if (!rows.length) return
      const { error } = await supabase.from('system_settings').upsert(rows, { onConflict: 'key' })
      if (error) throw new Error(error.message)
      toast({ title: 'Settings saved' })
    } catch (error) {
      toast({ title: 'Settings not saved', description: error instanceof Error ? error.message : 'The update failed', variant: 'destructive' })
    } finally { setSaving(false) }
  }

  if (loading) return (
    <div className="p-6 lg:p-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
    </div>
  )

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t.settings.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure system settings, notifications, and security policies</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-2"><SettingsIcon className="h-4 w-4" />{t.settings.general}</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />{t.settings.notifications}</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" />{t.settings.security}</TabsTrigger>
          <TabsTrigger value="workflow">CGF workflow</TabsTrigger>
          <TabsTrigger value="backup" className="gap-2"><Database className="h-4 w-4" />Backup</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Loan Processing</CardTitle>
              <CardDescription>Default thresholds and processing rules</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t.settings.loanThreshold}</Label>
                <Input type="number" value={String(getVal('loan_threshold', 'amount', 1000000))}
                  onChange={e => setVal('loan_threshold', 'amount', Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Loans above this require additional approval</p>
              </div>
              <div className="space-y-2">
                <Label>{t.settings.defaultCoverage} (%)</Label>
                <Input type="number" value={String(getVal('default_coverage', 'percentage', 50))}
                  onChange={e => setVal('default_coverage', 'percentage', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>{t.settings.reportDeadline}</Label>
                <Select value={String(getVal('report_deadline_day', 'day', 10))}
                  onValueChange={v => setVal('report_deadline_day', 'day', Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 7, 10, 15].map(d => <SelectItem key={d} value={String(d)}>{d}th of each month</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.settings.claimProcessingDays} (days)</Label>
                <Input type="number" value={String(getVal('claim_processing_days', 'days', 30))}
                  onChange={e => setVal('claim_processing_days', 'days', Number(e.target.value))} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Fee Configuration</CardTitle>
              <CardDescription>Default fee rates applied to new guarantees</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Upfront Fee Rate (%)</Label>
                <Input type="number" step="0.01" value={String(Number(getVal('upfront_fee_rate', 'rate', 0.005)) * 100)}
                  onChange={e => setVal('upfront_fee_rate', 'rate', Number(e.target.value) / 100)} />
              </div>
              <div className="space-y-2">
                <Label>Quarterly Fee Rate (%)</Label>
                <Input type="number" step="0.01" value={String(Number(getVal('quarterly_fee_rate', 'rate', 0.005)) * 100)}
                  onChange={e => setVal('quarterly_fee_rate', 'rate', Number(e.target.value) / 100)} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => saveSection(['loan_threshold','default_coverage','report_deadline_day','claim_processing_days','upfront_fee_rate','quarterly_fee_rate'])} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />{saving ? 'Saving...' : t.common.save}
            </Button>
          </div>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Email Notifications</CardTitle>
              <CardDescription>Configure when the system sends automated alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {NOTIFICATION_KEYS.map(item => (
                <div key={item.key} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={Boolean(getVal(item.key, 'enabled', true))}
                    onCheckedChange={v => setVal(item.key, 'enabled', v)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={() => saveSection(NOTIFICATION_KEYS.map(k => k.key))} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />{saving ? 'Saving...' : t.common.save}
            </Button>
          </div>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">{t.settings.passwordPolicy}</CardTitle>
              <CardDescription>Password complexity and expiry rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Minimum Password Length</Label>
                  <Input type="number" value={String(getVal('password_min_length', 'length', 8))}
                    onChange={e => setVal('password_min_length', 'length', Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Password Expiry (days)</Label>
                  <Input type="number" value={String(getVal('password_expiry_days', 'days', 90))}
                    onChange={e => setVal('password_expiry_days', 'days', Number(e.target.value))} />
                </div>
              </div>
              {[
                { label: 'Require uppercase letters', key: 'require_uppercase', def: true },
                { label: 'Require numbers', key: 'require_numbers', def: true },
                { label: 'Require special characters', key: 'require_special', def: true },
                { label: 'Two-factor authentication', key: 'require_mfa', def: false },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="cursor-pointer text-sm font-normal">{item.label}</Label>
                  <Switch checked={Boolean(getVal('password_min_length', item.key, item.def))}
                    onCheckedChange={v => setVal('password_min_length', item.key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Session & Access</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Session Timeout (minutes)</Label>
                <Input type="number" value={String(getVal('session_timeout_minutes', 'minutes', 30))}
                  onChange={e => setVal('session_timeout_minutes', 'minutes', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Max Failed Login Attempts</Label>
                <Input type="number" value={String(getVal('max_failed_logins', 'attempts', 5))}
                  onChange={e => setVal('max_failed_logins', 'attempts', Number(e.target.value))} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => saveSection(['password_min_length','password_expiry_days','session_timeout_minutes','max_failed_logins'])} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />{saving ? 'Saving...' : t.common.save}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="workflow"><CgfWorkflowControls /></TabsContent>

        {/* Backup */}
        <TabsContent value="backup" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Backup & Data Retention</CardTitle>
              <CardDescription>Configure automated backup schedules and retention policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Backup Frequency</Label>
                  <Select defaultValue="daily">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Every hour</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Retention Period (days)</Label>
                  <Input type="number" defaultValue="90" />
                </div>
              </div>
              {[
                { label: 'Encrypt backups at rest', def: true },
                { label: 'Include audit logs in backup', def: true },
                { label: 'Send backup completion notification', def: false },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border p-3">
                  <Label className="text-sm font-normal">{item.label}</Label>
                  <Switch defaultChecked={item.def} />
                </div>
              ))}
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm text-muted-foreground">Backup management is handled via Supabase platform settings.</p>
                <Button variant="link" size="sm" className="mt-1 text-primary" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase Dashboard</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
