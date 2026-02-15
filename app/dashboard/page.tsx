'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
} from 'lucide-react'
import Link from 'next/link'

const stats = {
  totalLoans: 847,
  totalDisbursed: 125_750_000,
  totalGuaranteed: 62_875_000,
  activeLoans: 523,
  pendingApplications: 34,
  pendingClaims: 8,
  delinquencyRate: 4.2,
  avgProcessingDays: 5.3,
  guaranteeReports: {
    total: 24,
    submitted: 5,
    approved: 18,
    pendingReview: 1,
  },
}

const recentActivity = [
  { id: 1, type: 'approved', loan: 'LA-2026-0847', amount: 450000, bank: 'Agroinvestbank', time: '2 hours ago' },
  { id: 2, type: 'submitted', loan: 'LA-2026-0846', amount: 280000, bank: 'Bank Eskhata', time: '4 hours ago' },
  { id: 3, type: 'disbursed', loan: 'LA-2026-0843', amount: 620000, bank: 'Spitamen Bank', time: '6 hours ago' },
  { id: 4, type: 'rejected', loan: 'LA-2026-0842', amount: 150000, bank: 'IMON International', time: '1 day ago' },
  { id: 5, type: 'claim', loan: 'LA-2025-0712', amount: 95000, bank: 'Amonatbonk', time: '1 day ago' },
]

const portfolioByStatus = [
  { status: 'Active', count: 523, amount: 98_500_000, color: 'bg-accent' },
  { status: 'Pending', count: 34, amount: 8_750_000, color: 'bg-warning' },
  { status: 'Disbursed', count: 156, amount: 28_500_000, color: 'bg-info' },
  { status: 'Closed', count: 112, amount: 18_250_000, color: 'bg-muted-foreground' },
  { status: 'Defaulted', count: 22, amount: 4_500_000, color: 'bg-destructive' },
]

const topBanks = [
  { name: 'Agroinvestbank', loans: 187, disbursed: 42_500_000, active: 142 },
  { name: 'Spitamen Bank', loans: 156, disbursed: 35_200_000, active: 118 },
  { name: 'Bank Eskhata', loans: 134, disbursed: 28_750_000, active: 96 },
  { name: 'IMON International', loans: 98, disbursed: 15_300_000, active: 78 },
  { name: 'Amonatbonk', loans: 87, disbursed: 12_800_000, active: 62 },
]

export default function DashboardPage() {
  const { t } = useI18n()

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'TJS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'approved':
        return <CheckCircle2 className="h-4 w-4 text-accent" />
      case 'submitted':
        return <Hourglass className="h-4 w-4 text-warning" />
      case 'disbursed':
        return <DollarSign className="h-4 w-4 text-info" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-destructive" />
      case 'claim':
        return <AlertTriangle className="h-4 w-4 text-warning" />
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getActivityBadgeClass = (type: string) => {
    switch (type) {
      case 'approved':
        return 'border-accent/30 bg-accent/10 text-accent'
      case 'submitted':
        return 'border-warning/30 bg-warning/10 text-warning'
      case 'disbursed':
        return 'border-info/30 bg-info/10 text-info'
      case 'rejected':
        return 'border-destructive/30 bg-destructive/10 text-destructive'
      case 'claim':
        return 'border-warning/30 bg-warning/10 text-warning'
      default:
        return ''
    }
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">
          {t.dashboard.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.dashboard.welcome}, here is your portfolio overview.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{stats.totalLoans.toLocaleString()}</p>
            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-accent">
              <ArrowUpRight className="h-3 w-3" />
              <span>+12% from last month</span>
            </div>
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
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{formatCurrency(stats.totalDisbursed)}</p>
            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-accent">
              <ArrowUpRight className="h-3 w-3" />
              <span>+8.5% from last month</span>
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
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{formatCurrency(stats.totalGuaranteed)}</p>
            <p className="mt-1 text-xs text-muted-foreground">50% coverage ratio</p>
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
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{stats.delinquencyRate}%</p>
            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-destructive">
              <ArrowDownRight className="h-3 w-3" />
              <span>+0.3% from last month</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="border-accent/20 shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Guarantee Reports
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {stats.guaranteeReports.pendingReview}
              </p>
            </div>
            <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link href="/dashboard/guarantee-reports?status=under_review">{t.common.view}</Link>
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
                {stats.pendingApplications}
              </p>
            </div>
            <Button asChild size="sm" className="bg-warning text-warning-foreground hover:bg-warning/90">
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
                {stats.pendingClaims}
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
              <p className="text-xs font-medium text-muted-foreground">
                Avg. Processing Time
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {stats.avgProcessingDays} days
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
            <div className="flex flex-col gap-4">
              {portfolioByStatus.map((item) => {
                const total = portfolioByStatus.reduce((sum, i) => sum + i.amount, 0)
                const percent = ((item.amount / total) * 100).toFixed(1)
                return (
                  <div key={item.status}>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${item.color}`} />
                        <span className="text-xs font-medium text-foreground">{item.status}</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground">{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground">{percent}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
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
                        <Badge variant="outline" className={`text-[10px] capitalize ${getActivityBadgeClass(activity.type)}`}>
                          {activity.type}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{activity.bank}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-foreground">{formatCurrency(activity.amount)}</p>
                    <p className="text-[10px] text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank</th>
                  <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Total Loans</th>
                  <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Disbursed</th>
                  <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active</th>
                  <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Share</th>
                </tr>
              </thead>
              <tbody>
                {topBanks.map((bank, index) => (
                  <tr key={bank.name} className="border-b last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                          {index + 1}
                        </div>
                        <span className="text-xs font-semibold text-foreground">{bank.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-xs text-muted-foreground">{bank.loans}</td>
                    <td className="py-3 text-right text-xs font-semibold text-foreground">
                      {formatCurrency(bank.disbursed)}
                    </td>
                    <td className="py-3 text-right text-xs text-muted-foreground">{bank.active}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${(bank.disbursed / stats.totalDisbursed) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {((bank.disbursed / stats.totalDisbursed) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
