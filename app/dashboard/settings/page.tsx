'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/context'
import { usePermissions } from '@/lib/contexts/permission-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CgfWorkflowControls } from '@/components/admin/cgf-workflow-controls'
import { FinancialPolicyControls } from '@/components/admin/financial-policy-controls'
import { OperationalSettingsControls } from '@/components/admin/operational-settings-controls'
import { ProductControls } from '@/components/admin/product-controls'
import { PRODUCT_COPY } from '@/lib/admin/product-administration'

const MODULES = [
  ['Users and employee flags', 'users'], ['Roles and permissions', 'roles'],
  ['Banks and branches', 'banks'], ['Borrowers', 'borrowers'],
  ['Loan applications', 'loans'], ['Claims', 'claims'], ['Committee sittings', 'committee'],
  ['Fees', 'fees'], ['Recoveries', 'recoveries'], ['Documents', 'documents'],
  ['Reports', 'reports'], ['Form requirements', 'form-requirements'],
  ['Table columns', 'column-config'], ['Audit history', 'audit'],
] as const

export default function SettingsPage() {
  const uiText = useUiTranslation()

  const { t, locale } = useI18n()
  const { role } = usePermissions()
  const admin = ['super_admin', 'prsf_admin'].includes(role?.code ?? '')

  return <main className="flex flex-col gap-6 p-6 lg:p-8">
    <header className="flex flex-col gap-2"><h1 className="text-balance text-2xl font-bold">{uiText(t.settings.title)}</h1><p className="text-pretty text-sm text-muted-foreground">{uiText("Administration, enforced operational rules and immutable financial policy revisions.")}</p></header>
    {role?.code === 'super_admin' && <Alert><AlertTitle>{uiText("Full audited authority")}</AlertTitle><AlertDescription>{uiText("You can perform supported business actions as yourself. Exceptional authority requires a reason. Valid workflow transitions, evidence, individual votes, signed records and financial limits remain protected.")}</AlertDescription></Alert>}
    <Tabs defaultValue="administration" className="flex flex-col gap-6">
      <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="administration">{uiText("Administration")}</TabsTrigger><TabsTrigger value="products">{PRODUCT_COPY[locale].title}</TabsTrigger><TabsTrigger value="operational">{uiText("Operational rules")}</TabsTrigger><TabsTrigger value="workflow">{uiText("Sectors and delegations")}</TabsTrigger><TabsTrigger value="financial">{uiText("Financial policy")}</TabsTrigger><TabsTrigger value="security">{uiText("Security and infrastructure")}</TabsTrigger></TabsList>
      <TabsContent value="administration"><Card><CardHeader><CardTitle>{uiText("Business administration")}</CardTitle><CardDescription>{uiText("Manage the existing MIS modules without changing code. Lifecycle restrictions still apply to finalized records.")}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3">{admin ? MODULES.map(([label, path]) => <Button key={path} variant="outline" asChild><Link href={`/dashboard/${path}`}>{uiText(label)}</Link></Button>) : <p className="text-sm text-muted-foreground">{uiText("Administrator access is required to manage these modules.")}</p>}</CardContent></Card></TabsContent>
      <TabsContent value="products"><ProductControls /></TabsContent>
      <TabsContent value="operational"><OperationalSettingsControls /></TabsContent>
      <TabsContent value="workflow"><CgfWorkflowControls /></TabsContent>
      <TabsContent value="financial"><FinancialPolicyControls /></TabsContent>
      <TabsContent value="security"><Card><CardHeader><CardTitle>{uiText("Security and infrastructure boundaries")}</CardTitle><CardDescription>{uiText("Controls are not presented as active merely because a preference can be saved.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><p className="text-sm leading-relaxed">{uiText("Account activation, role assignment and administrator-managed password resets are available in User Management. The final active Super Administrator cannot be disabled, demoted, bank-scoped or deleted.")}</p><Alert><AlertTitle>{uiText("Provider-managed or not implemented in the MIS")}</AlertTitle><AlertDescription>{uiText("MFA enrollment and enforcement, password expiry, session expiry, login lockout policy, scheduled reminder generation, backup schedules and restoration are not configurable from this business panel. No inactive toggles or simulated backup controls are offered.")}</AlertDescription></Alert><p className="text-sm leading-relaxed text-muted-foreground">{uiText("Infrastructure credentials, deployment settings, provider billing and database recovery remain outside the business panel. Historical signed documents, audit records and financial snapshots cannot be rewritten.")}</p></CardContent></Card></TabsContent>
    </Tabs>
  </main>
}
