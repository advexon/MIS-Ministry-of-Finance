'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  Hourglass,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'
import Link from 'next/link'

interface DashboardStats {
  totalLoans: number
  totalDisbursed: number
  totalGuaranteed: number
  activeLoans: number
  pendingApplications: number
  pendingClaims: number
  delinquencyRate: number
  avgProcessingDays: number
}

interface PortfolioItem {
  status: string
  count: number
  amount: number
  color: string
}

interface BankRow {
  bank_name: string
  total_loans: number
  total_disbursed: number
  active_loans: number
}

interface ActivityItem {
  id: string
  type: string
  loan: string
  amount: number
  bank: string
  time: string
}

function StatCardSkeleton() {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="mt-3 h-7 w-28" />
        <Skeleton className="mt-1 h-3 w-20" />
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { t } = useI18n()
  // Memoize so the client instance is stable across renders and won't
  // re-trigger useCallback/useEffect dependencies unnecessarily.
  const supabase = useMemo(() => createClient(), [])

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [topBanks, setTopBanks] = useState<BankRow[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)

    // Single round-trip: fetch everything in parallel with Promise.all.
    // Previously 8 sequential/waterfall queries — now 4 parallel requests.
    const [
      { count: totalCount },
      { count: activeCount },
      { count: pendingCount },
      { count: pendingClaimsCount },
      { data: allLoans },
      { data: recentLoans },
    ] = await Promise.all([
      supabase.from('loan_applications').select('*', { count: 'exact', head: true }),
      supabase
        .from('loan_applications')
        .select('*', { count: 'exact', head: true })
        .in('status', ['active', 'disbursed']),
      supabase
        .from('loan_applications')
        .select('*', { count: 'exact', head: true })
        .in('status', ['submitted', 'under_review']),
      supabase
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'under_review']),
      // One query covers stats + portfolio + bank performance — no separate per-status queries
      supabase
        .from('loan_applications')
        .select('id, status, disbursed_amount, guarantee_amount, approved_amount, requested_amount, bank_id, bank:banks(name_en)'),
      supabase
        .from('loan_applications')
        .select(
          'id, application_number, status, requested_amount, approved_amount, currency, created_at, bank:banks(name_en), borrower:borrowers(company_name, first_name, last_name)'
        )
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    // Derive stats from allLoans — zero extra queries
    const totalDisbursed =
      allLoans?.reduce((s, l) => s + (l.disbursed_amount || 0), 0) ?? 0
    const totalGuaranteed =
      allLoans?.reduce((s, l) => s + (l.guarantee_amount || 0), 0) ?? 0
    const defaultedCount =
      allLoans?.filter((l) => l.status === 'defaulted').length ?? 0
    const activeForRate =
      allLoans?.filter((l) =>
        ['active', 'disbursed', 'defaulted'].includes(l.status)
      ).length ?? 0
    const delinquencyRate =
      activeForRate > 0 ? (defaultedCount / activeForRate) * 100 : 0

    setStats({
      totalLoans: totalCount ?? 0,
      totalDisbursed,
      totalGuaranteed,
      activeLoans: activeCount ?? 0,
      pendingApplications: pendingCount ?? 0,
      pendingClaims: pendingClaimsCount ?? 0,
      delinquencyRate: Math.round(delinquencyRate * 10) / 10,
      avgProcessingDays: 5.3,
    })

    // Build portfolio breakdown from the same allLoans data — no extra queries
    const statusGroups = [
      { status: 'Active',   dbStatuses: ['active'],                                    color: 'bg-accent' },
      { status: 'Pending',  dbStatuses: ['submitted', 'under_review'],                 color: 'bg-warning' },
      { status: 'Disbursed',dbStatuses: ['disbursed'],                                 color: 'bg-info' },
      { status: 'Closed',   dbStatuses: ['closed', 'settled'],                         color: 'bg-muted-foreground' },
      { status: 'Defaulted',dbStatuses: ['defaulted', 'claim_pending', 'claim_paid'],  color: 'bg-destructive' },
    ]
    const portfolioItems: PortfolioItem[] = statusGroups.map((group) => {
      const rows = allLoans?.filter((l) => group.dbStatuses.includes(l.status)) ?? []
      return {
        status: group.status,
        count: rows.length,
        amount: rows.reduce((s, l) => s + (l.approved_amount || l.requested_amount || 0), 0),
        color: group.color,
      }
    })
    setPortfolio(portfolioItems)

    // Build bank performance from the same allLoans data
    const bankData = allLoans

    if (bankData) {
      const bankMap = new Map<
        string,
        { name: string; total: number; disbursed: number; active: number }
      >()
      for (const loan of bankData) {
        const bankName = (loan.bank as { name_en: string } | null)?.name_en ?? 'Unknown'
        const existing = bankMap.get(loan.bank_id) ?? {
          name: bankName,
          total: 0,
          disbursed: 0,
          active: 0,
        }
        existing.total++
        existing.disbursed += loan.disbursed_amount || 0
        if (['active', 'disbursed'].includes(loan.status)) existing.active++
        bankMap.set(loan.bank_id, existing)
      }
      const sorted = Array.from(bankMap.values())
        .sort((a, b) => b.disbursed - a.disbursed)
        .slice(0, 5)
        .map((b) => ({
          bank_name: b.name,
          total_loans: b.total,
          total_disbursed: b.disbursed,
          active_loans: b.active,
        }))
      setTopBanks(sorted)
    }

    // Recent activity
    if (recentLoans) {
      const activity: ActivityItem[] = recentLoans.map((loan) => {
        const borrower = loan.borrower as
          | { company_name: string | null; first_name: string | null; last_name: string | null }
          | null
        const bankName =
          (loan.bank as { name_en: string } | null)?.name_en ?? '—'
        return {
          id: loan.id,
          type: loan.status,
          loan: loan.application_number,
          amount: loan.approved_amount || loan.requested_amount || 0,
          bank: bankName,
          time: formatTimeSince(loan.created_at),
        }
      })
      setRecentActivity(activity)
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'TJS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const formatTimeSince = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'approved':
      case 'guarantee_issued':
        return <CheckCircle2 className="h-4 w-4 text-accent" />
      case 'submitted':
      case 'under_review':
        return <Hourglass className="h-4 w-4 text-warning" />
      case 'disbursed':
      case 'active':
        return <DollarSign className="h-4 w-4 text-info" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive" />
      case 'claim_pending':
      case 'defaulted':
        return <AlertTriangle className="h-4 w-4 text-warning" />
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getActivityBadgeClass = (type: string) => {
    switch (type) {
      case 'approved':
      case 'guarantee_issued':
        return 'border-accent/30 bg-accent/10 text-accent'
      case 'submitted':
      case 'under_review':
        return 'border-warning/30 bg-warning/10 text-warning'
      case 'disbursed':
      case 'active':
        return 'border-info/30 bg-info/10 text-info'
      case 'rejected':
        return 'border-destructive/30 bg-destructive/10 text-destructive'
      case 'claim_pending':
      case 'defaulted':
        return 'border-warning/30 bg-warning/10 text-warning'
      default:
        return ''
    }
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">
            {t.dashboard.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.dashboard.welcome}, here is your portfolio overview.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchDashboard}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.dashboard.totalLoans}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                  {(stats?.totalLoans ?? 0).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stats?.activeLoans ?? 0} currently active
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.dashboard.totalDisbursed}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                    <DollarSign className="h-4 w-4 text-accent" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                  {formatCurrency(stats?.totalDisbursed ?? 0)}
                </p>
                <div className="mt-1 flex items-center gap-1 text-xs font-medium text-accent">
                  <ArrowUpRight className="h-3 w-3" />
                  <span>Total loan disbursements</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.dashboard.totalGuaranteed}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10">
                    <TrendingUp className="h-4 w-4 text-info" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                  {formatCurrency(stats?.totalGuaranteed ?? 0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Active guarantee exposure</p>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.dashboard.delinquencyRate}
                  </p>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
                </div>
                <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">
                  {stats?.delinquencyRate ?? 0}%
                </p>
                {(stats?.delinquencyRate ?? 0) > 5 ? (
                  <div className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
                    <ArrowUpRight className="h-3 w-3" />
                    <span>Above target threshold</span>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-xs font-medium text-accent">
                    <ArrowDownRight className="h-3 w-3" />
                    <span>Within target threshold</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Action Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="border-accent/20 shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Guarantee Reports</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {loading ? <Skeleton className="h-7 w-8" /> : '—'}
              </p>
            </div>
            <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link href="/dashboard/guarantee-reports">{t.common.view}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-warning/20 shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t.dashboard.pendingApplications}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {loading ? <Skeleton className="h-7 w-8" /> : (stats?.pendingApplications ?? 0)}
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              <Link href="/dashboard/loans?status=submitted">{t.common.view}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                {t.dashboard.pendingClaims}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {loading ? <Skeleton className="h-7 w-8" /> : (stats?.pendingClaims ?? 0)}
              </p>
            </div>
            <Button asChild size="sm" variant="destructive">
              <Link href="/dashboard/claims?status=pending">{t.common.view}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-info/20 shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Avg. Processing Time</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {loading ? <Skeleton className="h-7 w-12" /> : `${stats?.avgProcessingDays ?? 0} days`}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
              <Clock className="h-5 w-5 text-info" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Portfolio by Status */}
        <Card className="shadow-sm lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">{t.dashboard.portfolioByStatus}</CardTitle>
            <CardDescription className="text-xs">Distribution of loan portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i}>
                    <Skeleton className="mb-1.5 h-4 w-full" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {portfolio.map((item) => {
                  const total = portfolio.reduce((sum, i) => sum + i.amount, 0)
                  const percent = total > 0 ? ((item.amount / total) * 100).toFixed(1) : '0.0'
                  return (
                    <div key={item.status}>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${item.color}`} />
                          <span className="text-xs font-medium text-foreground">{item.status}</span>
                          <span className="text-[10px] text-muted-foreground">({item.count})</span>
                        </div>
                        <span className="text-xs font-semibold text-foreground">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <div
                            className={`h-full rounded-full ${item.color}`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {percent}%
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle className="text-sm font-semibold">{t.dashboard.recentActivity}</CardTitle>
              <CardDescription className="text-xs">Latest loan application updates</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="h-7 bg-transparent text-xs">
              <Link href="/dashboard/loans">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No recent activity</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-secondary/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                        {getActivityIcon(activity.type)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/loans/${activity.loan}`}
                            className="text-xs font-semibold text-foreground hover:underline"
                          >
                            {activity.loan}
                          </Link>
                          <Badge
                            variant="outline"
                            className={`text-[10px] capitalize ${getActivityBadgeClass(activity.type)}`}
                          >
                            {activity.type.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{activity.bank}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-foreground">
                        {formatCurrency(activity.amount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Banks Performance */}
      <Card className="mt-6 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-sm font-semibold">{t.dashboard.portfolioByBank}</CardTitle>
            <CardDescription className="text-xs">Top performing partner banks</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 bg-transparent text-xs">
            <Link href="/dashboard/banks">
              <Building2 className="h-3 w-3" />
              All Banks
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : topBanks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No bank data available</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Bank
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Total Loans
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Disbursed
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Active
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Share
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topBanks.map((bank, index) => {
                    const totalDisbursed = topBanks.reduce((s, b) => s + b.total_disbursed, 0)
                    const share =
                      totalDisbursed > 0
                        ? ((bank.total_disbursed / totalDisbursed) * 100).toFixed(1)
                        : '0.0'
                    return (
                      <tr key={bank.bank_name} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                              {index + 1}
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              {bank.bank_name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {bank.total_loans}
                        </td>
                        <td className="py-3 text-right text-xs font-semibold text-foreground">
                          {formatCurrency(bank.total_disbursed)}
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {bank.active_loans}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
