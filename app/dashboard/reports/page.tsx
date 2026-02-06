"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n/context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  BarChart3, Download, FileSpreadsheet, FileText, PieChart,
  TrendingUp, Calendar, Building2, Briefcase, AlertTriangle
} from "lucide-react"

const reportTypes = [
  { id: "disbursement", icon: TrendingUp, color: "text-emerald-600 bg-emerald-100" },
  { id: "balance", icon: BarChart3, color: "text-blue-600 bg-blue-100" },
  { id: "delinquency", icon: AlertTriangle, color: "text-red-600 bg-red-100" },
  { id: "claims", icon: FileText, color: "text-orange-600 bg-orange-100" },
  { id: "recoveries", icon: TrendingUp, color: "text-indigo-600 bg-indigo-100" },
  { id: "fee", icon: Briefcase, color: "text-amber-600 bg-amber-100" },
  { id: "portfolio", icon: PieChart, color: "text-primary bg-primary/10" },
  { id: "bank", icon: Building2, color: "text-sky-600 bg-sky-100" },
  { id: "sector", icon: BarChart3, color: "text-teal-600 bg-teal-100" },
]

// Mock monthly disbursement data
const monthlyDisbursements = [
  { month: "Jul 2025", count: 18, amount: 8500000, cumulative: 98500000 },
  { month: "Aug 2025", count: 22, amount: 10200000, cumulative: 108700000 },
  { month: "Sep 2025", count: 15, amount: 6800000, cumulative: 115500000 },
  { month: "Oct 2025", count: 20, amount: 9100000, cumulative: 124600000 },
  { month: "Nov 2025", count: 17, amount: 7800000, cumulative: 132400000 },
  { month: "Dec 2025", count: 12, amount: 5400000, cumulative: 137800000 },
  { month: "Jan 2026", count: 24, amount: 11200000, cumulative: 149000000 },
]

// Mock portfolio by sector
const sectorData = [
  { sector: "Agriculture", count: 245, amount: 42500000, percentage: 33.8 },
  { sector: "Trade", count: 187, amount: 28750000, percentage: 22.9 },
  { sector: "Manufacturing", count: 134, amount: 22100000, percentage: 17.6 },
  { sector: "Services", count: 112, amount: 15800000, percentage: 12.6 },
  { sector: "Construction", count: 78, amount: 9200000, percentage: 7.3 },
  { sector: "Transport", count: 52, amount: 4500000, percentage: 3.6 },
  { sector: "Tourism", count: 39, amount: 2900000, percentage: 2.3 },
]

export default function ReportsPage() {
  const { t } = useI18n()
  const [selectedReport, setSelectedReport] = useState("disbursement")
  const [periodFrom, setPeriodFrom] = useState("2025-07-01")
  const [periodTo, setPeriodTo] = useState("2026-01-31")
  const [bankFilter, setBankFilter] = useState("all")

  const formatCurrency = (val: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "TJS", minimumFractionDigits: 0 }).format(val)

  const getReportTitle = (id: string) => {
    const map: Record<string, string> = {
      disbursement: t.reports.disbursementReport,
      balance: t.reports.balanceReport,
      delinquency: t.reports.delinquencyReport,
      claims: t.reports.claimsReport,
      recoveries: t.reports.recoveriesReport,
      fee: t.reports.feeReport,
      portfolio: t.reports.portfolioReport,
      bank: t.reports.bankReport,
      sector: t.reports.sectorReport,
    }
    return map[id] || id
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.reports.title}</h1>
          <p className="mt-1 text-muted-foreground">Generate and export portfolio reports and analytics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 bg-transparent">
            <FileSpreadsheet className="h-4 w-4" />{t.reports.exportExcel}
          </Button>
          <Button variant="outline" className="gap-2 bg-transparent">
            <Download className="h-4 w-4" />{t.reports.exportCsv}
          </Button>
        </div>
      </div>

      {/* Report Type Selection */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {reportTypes.map((rt) => {
          const Icon = rt.icon
          const isActive = selectedReport === rt.id
          return (
            <button
              key={rt.id}
              onClick={() => setSelectedReport(rt.id)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                isActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
              }`}
            >
              <div className={`rounded-lg p-2 ${rt.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">{getReportTitle(rt.id)}</span>
            </button>
          )
        })}
      </div>

      {/* Report Filters */}
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Report Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>{t.reports.periodFrom}</Label>
              <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t.reports.periodTo}</Label>
              <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t.reports.selectBank}</Label>
              <Select value={bankFilter} onValueChange={setBankFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.common.all}</SelectItem>
                  <SelectItem value="aib">Agroinvestbank</SelectItem>
                  <SelectItem value="esk">Bank Eskhata</SelectItem>
                  <SelectItem value="spt">Spitamen Bank</SelectItem>
                  <SelectItem value="imn">IMON International</SelectItem>
                  <SelectItem value="amn">Amonatbonk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full gap-2">
                <BarChart3 className="h-4 w-4" />{t.reports.generate}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      <Tabs defaultValue="table" className="space-y-4">
        <TabsList>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="table">
          {selectedReport === "disbursement" && (
            <Card>
              <CardHeader>
                <CardTitle>{t.reports.disbursementReport}</CardTitle>
                <CardDescription>Monthly loan disbursement breakdown for the selected period</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Month</TableHead>
                        <TableHead className="text-right font-semibold">Loans Disbursed</TableHead>
                        <TableHead className="text-right font-semibold">Amount</TableHead>
                        <TableHead className="text-right font-semibold">Cumulative</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyDisbursements.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.month}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(row.amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatCurrency(row.cumulative)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{monthlyDisbursements.reduce((s, r) => s + r.count, 0)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(monthlyDisbursements.reduce((s, r) => s + r.amount, 0))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(monthlyDisbursements[monthlyDisbursements.length - 1].cumulative)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedReport === "sector" && (
            <Card>
              <CardHeader>
                <CardTitle>{t.reports.sectorReport}</CardTitle>
                <CardDescription>Portfolio distribution by economic sector</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Sector</TableHead>
                        <TableHead className="text-right font-semibold">Loans</TableHead>
                        <TableHead className="text-right font-semibold">Amount</TableHead>
                        <TableHead className="text-right font-semibold">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sectorData.map((row) => (
                        <TableRow key={row.sector}>
                          <TableCell className="font-medium">{row.sector}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(row.amount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                                <div className="h-full bg-primary" style={{ width: `${row.percentage}%` }} />
                              </div>
                              <span className="text-sm">{row.percentage}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedReport !== "disbursement" && selectedReport !== "sector" && (
            <Card>
              <CardHeader>
                <CardTitle>{getReportTitle(selectedReport)}</CardTitle>
                <CardDescription>Select report parameters and click Generate to view data</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12" />
                  <p className="text-center">Click the Generate button above to generate this report with the selected parameters.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="summary">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Total Portfolio</p>
                <p className="text-2xl font-bold">{formatCurrency(149000000)}</p>
                <p className="mt-1 text-xs text-emerald-600">+8.1% vs previous period</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Active Guarantees</p>
                <p className="text-2xl font-bold">523</p>
                <p className="mt-1 text-xs text-emerald-600">+12 new this period</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Claims Paid</p>
                <p className="text-2xl font-bold">{formatCurrency(4850000)}</p>
                <p className="mt-1 text-xs text-red-600">3.25% of portfolio</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Fee Income</p>
                <p className="text-2xl font-bold">{formatCurrency(2340000)}</p>
                <p className="mt-1 text-xs text-emerald-600">On track with targets</p>
              </CardContent>
            </Card>
          </div>

          {/* Sector Summary */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Portfolio by Sector</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {sectorData.map((row) => (
                  <div key={row.sector} className="flex items-center gap-4">
                    <div className="w-28 text-sm font-medium">{row.sector}</div>
                    <div className="flex-1">
                      <div className="h-4 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${row.percentage}%` }} />
                      </div>
                    </div>
                    <div className="w-20 text-right text-sm font-medium">{row.percentage}%</div>
                    <div className="w-32 text-right text-sm text-muted-foreground">{formatCurrency(row.amount)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
