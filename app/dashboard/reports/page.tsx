'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { BarChart3, Download, FileSpreadsheet, TrendingUp, RefreshCw } from 'lucide-react'

const COLORS = ['#1e3a8a', '#2d8c7e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16']

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v || 0)

const fmtK = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)

export default function ReportsPage() {
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [banks, setBanks] = useState<any[]>([])
  const [bankFilter, setBankFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))

  // Report data states
  const [sectorData, setSectorData] = useState<any[]>([])
  const [bankData, setBankData] = useState<any[]>([])
  const [monthlyData, setMonthlyData] = useState<any[]>([])
  const [statusData, setStatusData] = useState<any[]>([])
  const [summaryStats, setSummaryStats] = useState({ totalLoans: 0, totalAmount: 0, totalClaims: 0, totalFees: 0, totalOutstanding: 0 })

  const fetchReports = useCallback(async () => {
    setLoading(true)
    try {
      let loanQuery = supabase
        .from('loan_applications')
        .select('id, status, approved_amount, outstanding_balance, sector, disbursement_date, bank_id, banks(name_en, code)')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59')

      if (bankFilter !== 'all') loanQuery = loanQuery.eq('bank_id', bankFilter)

      const [{ data: loans }, { data: claims }, { data: fees }] = await Promise.all([
        loanQuery,
        supabase.from('claims').select('id, claim_amount, status').gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59'),
        supabase.from('fees').select('id, amount, status').gte('created_at', dateFrom).lte('created_at', dateTo + 'T23:59:59'),
      ])

      const allLoans = loans || []
      const allClaims = claims || []
      const allFees = fees || []

      // Summary
      setSummaryStats({
        totalLoans: allLoans.length,
        totalAmount: allLoans.reduce((s, l) => s + (l.approved_amount || 0), 0),
        totalOutstanding: allLoans.reduce((s, l) => s + (l.outstanding_balance || 0), 0),
        totalClaims: allClaims.reduce((s, c) => s + (c.claim_amount || 0), 0),
        totalFees: allFees.reduce((s, f) => s + (f.amount || 0), 0),
      })

      // Sector breakdown
      const sectorMap: Record<string, { count: number; amount: number }> = {}
      for (const l of allLoans) {
        const sec = l.sector || 'Other'
        if (!sectorMap[sec]) sectorMap[sec] = { count: 0, amount: 0 }
        sectorMap[sec].count++
        sectorMap[sec].amount += l.approved_amount || 0
      }
      setSectorData(Object.entries(sectorMap).map(([sector, d]) => ({ sector, ...d })).sort((a, b) => b.amount - a.amount))

      // Bank breakdown
      const bankMap: Record<string, { name: string; count: number; amount: number; outstanding: number }> = {}
      for (const l of allLoans) {
        const bk = (l.banks as any)?.code || 'Unknown'
        const bkName = (l.banks as any)?.name_en || 'Unknown'
        if (!bankMap[bk]) bankMap[bk] = { name: bkName, count: 0, amount: 0, outstanding: 0 }
        bankMap[bk].count++
        bankMap[bk].amount += l.approved_amount || 0
        bankMap[bk].outstanding += l.outstanding_balance || 0
      }
      setBankData(Object.entries(bankMap).map(([code, d]) => ({ code, ...d })).sort((a, b) => b.amount - a.amount))

      // Monthly trend
      const monthMap: Record<string, { month: string; count: number; amount: number }> = {}
      for (const l of allLoans) {
        if (!l.disbursement_date) continue
        const m = l.disbursement_date.slice(0, 7)
        if (!monthMap[m]) monthMap[m] = { month: m, count: 0, amount: 0 }
        monthMap[m].count++
        monthMap[m].amount += l.approved_amount || 0
      }
      setMonthlyData(Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)))

      // Status distribution
      const statusMap: Record<string, number> = {}
      for (const l of allLoans) {
        const s = l.status || 'unknown'
        statusMap[s] = (statusMap[s] || 0) + 1
      }
      setStatusData(Object.entries(statusMap).map(([name, value]) => ({ name: name.replace('_', ' '), value })))

    } finally {
      setLoading(false)
    }
  }, [bankFilter, dateFrom, dateTo])

  useEffect(() => {
    supabase.from('banks').select('id, name_en, code').order('name_en').then(({ data }) => setBanks(data || []))
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${row[k]}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = filename
    a.click()
  }

  const ChartCard = ({ title, description, children, onExport }: any) => (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        {onExport && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.reports.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Portfolio analytics and performance reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={fetchReports}>
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => exportCSV(bankData, 'bank-report.csv')}>
            <FileSpreadsheet className="h-3.5 w-3.5" />{t.reports.exportExcel}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.reports.selectBank}</Label>
              <Select value={bankFilter} onValueChange={setBankFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.common.all} Banks</SelectItem>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.reports.periodFrom}</Label>
              <Input type="date" className="h-9 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.reports.periodTo}</Label>
              <Input type="date" className="h-9 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button className="h-9 w-full gap-2 text-sm" onClick={fetchReports}>
                <BarChart3 className="h-4 w-4" />{t.reports.generate}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total Loans', value: loading ? '...' : summaryStats.totalLoans.toLocaleString(), sub: 'in period' },
          { label: 'Approved Amount', value: loading ? '...' : fmt(summaryStats.totalAmount), sub: 'total approved' },
          { label: 'Outstanding', value: loading ? '...' : fmt(summaryStats.totalOutstanding), sub: 'principal balance' },
          { label: 'Claims Paid', value: loading ? '...' : fmt(summaryStats.totalClaims), sub: 'total paid out' },
          { label: 'Fee Income', value: loading ? '...' : fmt(summaryStats.totalFees), sub: 'collected' },
        ].map(stat => (
          <Card key={stat.label} className="shadow-sm">
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="charts" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="charts" className="text-xs">Charts</TabsTrigger>
          <TabsTrigger value="by-bank" className="text-xs">By Bank</TabsTrigger>
          <TabsTrigger value="by-sector" className="text-xs">By Sector</TabsTrigger>
          <TabsTrigger value="trend" className="text-xs">Monthly Trend</TabsTrigger>
        </TabsList>

        {/* Charts overview */}
        <TabsContent value="charts" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Portfolio by Bank" description="Outstanding balance per partner bank" onExport={() => exportCSV(bankData, 'portfolio-by-bank.csv')}>
              {loading ? <Skeleton className="h-56" /> : bankData.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={bankData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="amount" name="Approved" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outstanding" name="Outstanding" fill="#2d8c7e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Loan Status Distribution" description="Current status of all loans in portfolio">
              {loading ? <Skeleton className="h-56" /> : statusData.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Disbursements by Sector" description="Loan amounts distributed across economic sectors" onExport={() => exportCSV(sectorData, 'sector-report.csv')}>
              {loading ? <Skeleton className="h-56" /> : sectorData.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={sectorData.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="sector" tick={{ fontSize: 11 }} width={60} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="amount" name="Amount" fill="#1e3a8a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Monthly Disbursement Trend" description="Number of loans and amounts disbursed each month" onExport={() => exportCSV(monthlyData, 'monthly-trend.csv')}>
              {loading ? <Skeleton className="h-56" /> : monthlyData.length === 0 ? (
                <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No disbursement data for selected period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Area type="monotone" dataKey="amount" name="Amount" stroke="#1e3a8a" strokeWidth={2} fill="url(#colorAmount)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </TabsContent>

        {/* By Bank table */}
        <TabsContent value="by-bank">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Bank</TableHead>
                    <TableHead className="text-right font-semibold">Loans</TableHead>
                    <TableHead className="text-right font-semibold">Approved</TableHead>
                    <TableHead className="text-right font-semibold">Outstanding</TableHead>
                    <TableHead className="text-right font-semibold">Coverage %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>
                  )) : bankData.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No data for selected filters</TableCell></TableRow>
                  ) : bankData.map(bank => {
                    const coverage = bank.amount > 0 ? (bank.outstanding / bank.amount * 100).toFixed(1) : '0.0'
                    return (
                      <TableRow key={bank.code}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-primary">{bank.code}</span>
                            <span className="text-sm">{bank.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{bank.count}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(bank.amount)}</TableCell>
                        <TableCell className="text-right">{fmt(bank.outstanding)}</TableCell>
                        <TableCell className="text-right">
                          <span className={Number(coverage) > 80 ? 'text-red-600' : Number(coverage) > 60 ? 'text-amber-600' : 'text-emerald-600'}>
                            {coverage}%
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Sector table */}
        <TabsContent value="by-sector">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Sector</TableHead>
                    <TableHead className="text-right font-semibold">Loans</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>
                  )) : sectorData.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No data for selected filters</TableCell></TableRow>
                  ) : (() => {
                    const totalAmt = sectorData.reduce((s, r) => s + r.amount, 0)
                    return sectorData.map(row => {
                      const pct = totalAmt > 0 ? (row.amount / totalAmt * 100) : 0
                      return (
                        <TableRow key={row.sector}>
                          <TableCell className="font-medium">{row.sector}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(row.amount)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-secondary">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-sm">{pct.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Trend table */}
        <TabsContent value="trend">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Month</TableHead>
                    <TableHead className="text-right font-semibold">Loans Disbursed</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 3 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>
                  )) : monthlyData.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">No disbursement data for selected period</TableCell></TableRow>
                  ) : (
                    <>
                      {monthlyData.map(row => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.month}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(row.amount)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{monthlyData.reduce((s, r) => s + r.count, 0)}</TableCell>
                        <TableCell className="text-right">{fmt(monthlyData.reduce((s, r) => s + r.amount, 0))}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
