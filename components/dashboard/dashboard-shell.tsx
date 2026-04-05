'use client'

import React, { useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/error-boundary'
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
  LogOut,
  Menu,
  ChevronDown,
  Globe,
  PlusCircle,
  User as UserIcon,
  Search,
  ShieldCheck,
  FolderDown,
  GitCompare,
  TrendingUp,
  Shield,
  BookOpen,
} from 'lucide-react'
import type { Locale } from '@/lib/i18n/translations'
import { NotificationsBell } from '@/components/dashboard/notifications-bell'

interface DashboardShellProps {
  children: React.ReactNode
  user: User
}

const navItems = [
  { titleKey: 'dashboard' as const, href: '/dashboard', icon: LayoutDashboard },
  {
    titleKey: 'loans' as const,
    href: '/dashboard/loans',
    icon: FileText,
  },
  { titleKey: 'borrowers' as const, href: '/dashboard/borrowers', icon: Users },
  { titleKey: 'claims' as const, href: '/dashboard/claims', icon: AlertTriangle },
  { titleKey: 'fees' as const, href: '/dashboard/fees', icon: DollarSign },
  {
    titleKey: 'guaranteeReports' as const,
    href: '/dashboard/guarantee-reports',
    icon: ShieldCheck,
  },
  { titleKey: 'reports' as const, href: '/dashboard/reports', icon: BarChart3 },
  { titleKey: 'documents' as const, href: '/dashboard/documents', icon: FolderDown },
  { titleKey: 'banks' as const, href: '/dashboard/banks', icon: Building2 },
  { titleKey: 'users' as const, href: '/dashboard/users', icon: Users },
  { titleKey: 'reconciliation' as const, href: '/dashboard/reconciliation', icon: GitCompare },
  { titleKey: 'recoveries' as const, href: '/dashboard/recoveries', icon: TrendingUp },
  { titleKey: 'auditTrail' as const, href: '/dashboard/audit', icon: Shield },
  { titleKey: 'settings' as const, href: '/dashboard/settings', icon: Settings },
  { titleKey: 'manual' as const, href: '/dashboard/manual', icon: BookOpen },
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

  const handleLogout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }, [router])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  const navContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <Image
          src="/logo.png"
          alt="PRSF Emblem"
          width={36}
          height={36}
          className="flex-shrink-0"
          style={{ width: '36px', height: '36px' }}
        />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold text-white truncate">Credit Guarantee Fund</span>
          <span className="text-[9px] leading-tight text-white/50 truncate">
            Management Information System
          </span>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">
          Navigation
        </p>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSidebar}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {t.nav[item.titleKey]}
              </Link>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Quick Action */}
      <div className="border-t border-white/10 p-3">
        <Button
          asChild
          size="sm"
          className="w-full justify-start gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Link href="/dashboard/loans/new" onClick={closeSidebar}>
            <PlusCircle className="h-4 w-4" />
            <span className="text-[13px]">{t.loans.newApplication}</span>
          </Link>
        </Button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-60 flex-shrink-0 bg-sidebar lg:block" aria-label="Main navigation">
        {navContent}
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-60 bg-sidebar p-0">
          {navContent}
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger — standalone, not nested in another Sheet */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Search */}
            <div
              className="hidden items-center gap-2 rounded-lg border bg-background px-3 py-1.5 md:flex"
              role="search"
              aria-label="Search"
            >
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Search...</span>
              <kbd className="ml-8 rounded border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {'/'}
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Language Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="hidden font-medium sm:inline">
                    {languages.find((l) => l.code === locale)?.flag}
                  </span>
                  <span className="sr-only">Select language</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {languages.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => setLocale(lang.code)}
                    className={cn('text-xs', locale === lang.code && 'bg-accent/10 text-accent')}
                  >
                    <span className="mr-2 font-semibold">{lang.flag}</span>
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notifications */}
            <NotificationsBell />

            {/* Divider */}
            <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 gap-2 pl-1.5 pr-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden flex-col items-start md:flex">
                    <span className="text-xs font-semibold leading-tight text-foreground">
                      {user.user_metadata?.first_name || user.email?.split('@')[0]}
                    </span>
                    <span className="text-[10px] leading-tight text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  <span className="sr-only">User menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">{t.nav.profile}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="text-xs">
                  <Link href="/dashboard/profile">
                    <UserIcon className="mr-2 h-3.5 w-3.5" />
                    {t.nav.profile}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-xs">
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-3.5 w-3.5" />
                    {t.nav.settings}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-xs text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  {t.auth.logout}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto" id="main-content">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
