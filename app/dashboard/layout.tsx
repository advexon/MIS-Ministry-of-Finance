import React from "react"
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import { I18nProvider } from '@/lib/i18n/context'
import { PermissionProvider } from '@/lib/contexts/permission-context'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    redirect('/auth/login')
  }

  // Fetch user profile with role
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, role:roles(*)')
    .eq('id', user.id)
    .single()

  return (
    <I18nProvider>
      <PermissionProvider user={user} role={profile?.role || null}>
        <DashboardShell user={user}>
          {children}
        </DashboardShell>
      </PermissionProvider>
    </I18nProvider>
  )
}
