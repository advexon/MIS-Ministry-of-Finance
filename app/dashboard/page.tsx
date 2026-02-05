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
  Users,
  CheckCircle2,
  XCircle,
  Hourglass,
} from 'lucide-react'
import Link from 'next/link'

// Mock data - will be replaced with real Supabase data
const stats = {
  totalLoans: 847,
  totalDisbursed: 125_750_000,
  totalGuaranteed: 62_875_000,
  activeLoans: 523,
  pendingApplications: 34,
  pendingClaims: 8,
  delinquencyRate: 4.2,
  avgProcessingDays: 5.3,
}

const recentActivity = [
  { id: 1, type: 'approved', loan: 'LA-2026-0847', amount: 450000, bank: 'Agroinvestbank', time: '2 hours ago' },
  { id: 2, type: 'submitted', loan: 'LA-2026-0846', amount: 280000, bank: 'Bank Eskhata', time: '4 hours ago' },
  { id: 3, type: 'disbursed', loan: 'LA-2026-0843', amount: 620000, bank: 'Spitamen Bank', time: '6 hours ago' },
  { id: 4, type: 'rejected', loan: 'LA-2026-0842', amount: 150000, bank: 'IMON International', time: '1 day ago' },
  { id: 5, type: 'claim', loan: 'LA-2025-0712', amount: 95000, bank: 'Amonatbonk', time: '1 day ago' },
]

const portfolioByStatus = [
  { status: 'Active', count: 523, amount: 98_500_000, color: 'bg-green-500' },
  { status: 'Pending', count: 34, amount: 8_750_000, color: 'bg-amber-500' },
  { status: 'Disbursed', count: 156, amount: 28_500_000, color: 'bg-blue-500' },
  { status: 'Closed', count: 112, amount: 18_250_000, color: 'bg-gray-500' },
  { status: 'Defaulted', count: 22, amount: 4_500_000, color: 'bg-red-500' },
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
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'submitted':
        return <Hourglass className="h-4 w-4 text-amber-500" />
      case 'disbursed':
        return <DollarSign className="h-4 w-4 text-blue-500" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'claim':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />
      default:
        return <FileText className="h-4 w-4 text-gray-500" />
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground lg:text-3xl">
          {t.dashboard.title}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t.dashboard.welcome}, here is your portfolio overview
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.dashboard.totalLoans}
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLoans.toLocaleString()}</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <ArrowUpRight className="h-3 w-3" />
              <span>+12% from last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.dashboard.totalDisbursed}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalDisbursed)}</div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <ArrowUpRight className="h-3 w-3" />
              <span>+8.5% from last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.dashboard.totalGuaranteed}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalGuaranteed)}</div>
            <p className="text-xs text-muted-foreground">50% coverage ratio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.dashboard.delinquencyRate}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.delinquencyRate}%</div>
            <div className="flex items-center gap-1 text-xs text-red-600">
              <ArrowDownRight className="h-3 w-3" />
              <span>+0.3% from last month</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-amber-800">
                {t.dashboard.pendingApplications}
              </p>
              <p className="mt-1 text-2xl font-bold text-amber-900">
                {stats.pendingApplications}
              </p>
            </div>
            <Button asChild size="sm" className="bg-amber-600 hover:bg-amber-700">
              <Link href="/dashboard/loans?status=submitted">{t.common.view}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-red-800">
                {t.dashboard.pendingClaims}
              </p>
              <p className="mt-1 text-2xl font-bold text-red-900">
                {stats.pendingClaims}
              </p>
            </div>
            <Button asChild size="sm" variant="destructive">
              <Link href="/dashboard/claims?status=pending">{t.common.view}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-blue-800">
                Avg. Processing Time
              </p>
              <p className="mt-1 text-2xl font-bold text-blue-900">
                {stats.avgProcessingDays} days
              </p>
            </div>
            <Clock className="h-8 w-8 text-blue-400" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Portfolio by Status */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t.dashboard.portfolioByStatus}</CardTitle>
            <CardDescription>Distribution of loan portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {portfolioByStatus.map((item) => (
                <div key={item.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${item.color}`} />
                    <div>
                      <p className="text-sm font-medium">{item.status}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.count} loans
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t.dashboard.recentActivity}</CardTitle>
              <CardDescription>Latest loan application updates</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/loans">View All</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {getActivityIcon(activity.type)}
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/loans/${activity.loan}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {activity.loan}
                        </Link>
                        <Badge variant="outline" className="text-xs capitalize">
                          {activity.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {activity.bank}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatCurrency(activity.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Banks Performance */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t.dashboard.portfolioByBank}</CardTitle>
            <CardDescription>Top performing partner banks</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/banks">
              <Building2 className="mr-2 h-4 w-4" />
              All Banks
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="pb-3 font-medium">Bank</th>
                  <th className="pb-3 font-medium text-right">Total Loans</th>
                  <th className="pb-3 font-medium text-right">Total Disbursed</th>
                  <th className="pb-3 font-medium text-right">Active Loans</th>
                  <th className="pb-3 font-medium text-right">Portfolio Share</th>
                </tr>
              </thead>
              <tbody>
                {topBanks.map((bank, index) => (
                  <tr key={bank.name} className="border-b last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {index + 1}
                        </div>
                        <span className="font-medium">{bank.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right">{bank.loans}</td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(bank.disbursed)}
                    </td>
                    <td className="py-3 text-right">{bank.active}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${(bank.disbursed / stats.totalDisbursed) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">
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
