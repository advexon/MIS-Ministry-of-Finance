'use client'

import React from "react"

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import Image from 'next/image'
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  BarChart3,
  AlertTriangle,
  DollarSign,
  Settings,
  Bell,
  LogOut,
  Menu,
  ChevronDown,
  Globe,
  PlusCircle,
  HelpCircle,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n/translations'

interface DashboardShellProps {
  children: React.ReactNode
  user: User
}

const navItems = [
  {
    titleKey: 'dashboard' as const,
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    titleKey: 'loans' as const,
    href: '/dashboard/loans',
    icon: FileText,
    subItems: [
      { titleKey: 'loans' as const, href: '/dashboard/loans' },
      { titleKey: 'newLoan' as const, href: '/dashboard/loans/new' },
    ],
  },
  {
    titleKey: 'borrowers' as const,
    href: '/dashboard/borrowers',
    icon: Users,
  },
  {
    titleKey: 'claims' as const,
    href: '/dashboard/claims',
    icon: AlertTriangle,
  },
  {
    titleKey: 'fees' as const,
    href: '/dashboard/fees',
    icon: DollarSign,
  },
  {
    titleKey: 'reports' as const,
    href: '/dashboard/reports',
    icon: BarChart3,
  },
  {
    titleKey: 'banks' as const,
    href: '/dashboard/banks',
    icon: Building2,
  },
  {
    titleKey: 'users' as const,
    href: '/dashboard/users',
    icon: HelpCircle,
  },
  {
    titleKey: 'settings' as const,
    href: '/dashboard/settings',
    icon: Settings,
  },
]

const languages: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
  { code: 'tj', label: 'Тоҷикӣ', flag: 'TJ' },
]

export function DashboardShell({ children, user }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { t, locale, setLocale } = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const NavContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <Image src="/logo.png" alt="PRSF Emblem" width={36} height={36} className="h-9 w-9 object-contain" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground">PRSF MIS</span>
          <span className="text-[10px] text-sidebar-foreground/70">Loan Tracking System</span>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {t.nav[item.titleKey]}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Quick Action */}
      <div className="border-t border-sidebar-border p-3">
        <Button 
          asChild 
          className="w-full justify-start gap-2 bg-sidebar-primary hover:bg-sidebar-primary/90"
        >
          <Link href="/dashboard/loans/new">
            <PlusCircle className="h-4 w-4" />
            {t.loans.newApplication}
          </Link>
        </Button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r bg-sidebar-background lg:block">
        <NavContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar-background p-0">
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
            </Sheet>
            <div className="hidden text-sm text-muted-foreground md:block">
              {t.common.appDescription}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">{languages.find(l => l.code === locale)?.flag}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {languages.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => setLocale(lang.code)}
                    className={cn(locale === lang.code && 'bg-accent')}
                  >
                    <span className="mr-2 font-medium">{lang.flag}</span>
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
              <span className="sr-only">{t.nav.notifications}</span>
            </Button>

            {/* Help */}
            <Button variant="ghost" size="icon" className="hidden sm:flex">
              <HelpCircle className="h-5 w-5" />
              <span className="sr-only">{t.nav.help}</span>
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 pl-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden flex-col items-start md:flex">
                    <span className="text-sm font-medium">
                      {user.user_metadata?.first_name || user.email?.split('@')[0]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{t.nav.profile}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    {t.nav.profile}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    {t.nav.settings}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t.auth.logout}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
