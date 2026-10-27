'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Download, GitCompare } from 'lucide-react'
import { toCSV, downloadCSV } from '@/lib/utils/export'
import type { Bank } from '@/lib/types/database'

type ReconciliationStatus = 'matched' | 'discrepancy' | 'missing'

interface ReconciliationRow {
  bank_id: string
  bank_name: string
  bank_code: string
  prsf_loan_count: number
  bank_loan_count: number | null
  prsf_outstanding: number
  bank_outstanding: number | null
  prsf_fees: number
  bank_fees: number | null
  loan_discrepancy: number
  outstanding_discrepancy: number
  fee_discrepancy: number
  status: ReconciliationStatus
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v || 0)

const STATUS_CONFIG = {
  matched: { label: 'Matched', icon: CheckCircle2, classes: 'bg-emerald-100 text-emerald-800' },
  discrepancy: { label: 'Discrepancy', icon: AlertTriangle, classes: 'bg-amber-100 text-amber-800' },
  missing: { label: 'Missing Data', icon: XCircle, classes: 'bg-red-100 text-red-800' },
}

export default function ReconciliationPage() {
  const uiText = useUiTranslation()

  const supabase = createClient()

  const [bankFilter, setBankFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7))
  const { data: banks = [] } = usePageQuery<Pick<Bank, 'id' | 'name_en' | 'code'>[]>(['reconciliation-bank-options'], async () => {
    const { data, error } = await supabase.from('banks').select('id, name_en, code').order('name_en')
    if (error) throw error
    return data ?? []
  })

  const { data: rows = [], isLoading, isValidating, mutate } = usePageQuery<ReconciliationRow[]>(['reconciliation', bankFilter, period], async () => {
    const periodStart = period + '-01'
    const periodEnd = new Date(period + '-01')
    periodEnd.setMonth(periodEnd.getMonth() + 1)
    const periodEndStr = periodEnd.toISOString().slice(0, 10)

    const { data: banksData } = await supabase.from('banks').select('id, name_en, code').eq('is_active', true).order('name_en')
    const allBanks = bankFilter === 'all' ? (banksData || []) : (banksData || []).filter(b => b.id === bankFilter)

    const results: ReconciliationRow[] = []

    for (const bank of allBanks) {
      const [{ data: loans }, { data: fees }, { data: report }] = await Promise.all([
        supabase.from('loan_applications')
          .select('id, disbursed_amount, status')
          .eq('bank_id', bank.id)
          .gte('disbursement_date', periodStart)
          .lt('disbursement_date', periodEndStr),
        supabase.from('fees')
          .select('id, amount, status')
          .eq('bank_id', bank.id)
          .gte('due_date', periodStart)
          .lt('due_date', periodEndStr),
        supabase.from('guarantee_reports')
          .select('*')
          .eq('bank_id', bank.id)
          .gte('report_month', periodStart)
          .lt('report_month', periodEndStr)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const prsfLoans = (loans || []).length
      const prsfOutstanding = (loans || []).reduce((s, l) => s + (l.disbursed_amount || 0), 0)
      const prsfFees = (fees || []).reduce((s, f) => s + (f.amount || 0), 0)

      const bankLoans = report ? report.total_loans : null
      const bankOutstanding = report ? report.total_outstanding_principal : null
      const bankFees = report ? report.total_guarantee_amount : null

      const loanDisc = bankLoans !== null ? Math.abs(prsfLoans - bankLoans) : 0
      const outstandingDisc = bankOutstanding !== null ? Math.abs(prsfOutstanding - bankOutstanding) : 0
      const feeDisc = bankFees !== null ? Math.abs(prsfFees - bankFees) : 0

      let status: ReconciliationStatus = 'matched'
      if (bankLoans === null) status = 'missing'
      else if (loanDisc > 0 || outstandingDisc > 1000 || feeDisc > 100) status = 'discrepancy'

      results.push({
        bank_id: bank.id,
        bank_name: bank.name_en,
        bank_code: bank.code,
        prsf_loan_count: prsfLoans,
        bank_loan_count: bankLoans,
        prsf_outstanding: prsfOutstanding,
        bank_outstanding: bankOutstanding,
        prsf_fees: prsfFees,
        bank_fees: bankFees,
        loan_discrepancy: loanDisc,
        outstanding_discrepancy: outstandingDisc,
        fee_discrepancy: feeDisc,
        status,
      })
    }

    return results
  })
  const loading = isLoading || isValidating
  const runReconciliation = () => mutate()

  const filtered = statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter)
  const matched = rows.filter(r => r.status === 'matched').length
  const discrepancies = rows.filter(r => r.status === 'discrepancy').length
  const missing = rows.filter(r => r.status === 'missing').length

  const exportCSV = () => {
    const headers = ['Bank', 'Code', 'PRSF Loans', 'Bank Loans', 'Loan Diff', 'PRSF Outstanding', 'Bank Outstanding', 'Outstanding Diff', 'Status']
    // Export what the user is actually looking at. This previously mapped over
    // `rows`, so filtering the table to e.g. only discrepancies still produced
    // a download containing every bank.
    const csvRows = filtered.map(r => [r.bank_name, r.bank_code, r.prsf_loan_count, r.bank_loan_count ?? 'N/A', r.loan_discrepancy, fmt(r.prsf_outstanding), r.bank_outstanding !== null ? fmt(r.bank_outstanding) : 'N/A', fmt(r.outstanding_discrepancy), r.status])
    downloadCSV(toCSV(headers, csvRows), `reconciliation-${period}.csv`)
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2"><GitCompare className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{uiText("Reconciliation")}</h1>
            <p className="text-sm text-muted-foreground">{uiText("Compare PRSF records against bank-reported figures")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={runReconciliation}>
            <RefreshCw className="h-3.5 w-3.5" />{uiText("Run Again")}</Button>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />{uiText("Export CSV")}</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{uiText("Period (Month)")}</Label>
              <Input type="month" className="h-9 text-sm" value={period} onChange={e => setPeriod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{uiText("Bank")}</Label>
              <Select value={bankFilter} onValueChange={setBankFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{uiText("All Banks")}</SelectItem>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{uiText("Status")}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{uiText("All Statuses")}</SelectItem>
                  <SelectItem value="matched">{uiText("Matched")}</SelectItem>
                  <SelectItem value="discrepancy">{uiText("Discrepancy")}</SelectItem>
                  <SelectItem value="missing">{uiText("Missing Data")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="shadow-sm border-emerald-200">
          <CardContent className="flex items-center gap-4 pt-5">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Matched")}</p>
              <p className="text-2xl font-bold text-emerald-700">{matched}</p>
              <p className="text-xs text-muted-foreground">{uiText("banks reconciled")}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-amber-200">
          <CardContent className="flex items-center gap-4 pt-5">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Discrepancies")}</p>
              <p className="text-2xl font-bold text-amber-700">{discrepancies}</p>
              <p className="text-xs text-muted-foreground">{uiText("need review")}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-red-200">
          <CardContent className="flex items-center gap-4 pt-5">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Missing Data")}</p>
              <p className="text-2xl font-bold text-red-700">{missing}</p>
              <p className="text-xs text-muted-foreground">{uiText("no report submitted")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Table */}
      <Tabs defaultValue="summary">
        <TabsList className="mb-4 h-9">
          <TabsTrigger value="summary" className="text-xs">{uiText("Summary")}</TabsTrigger>
          <TabsTrigger value="detail" className="text-xs">{uiText("Detailed Comparison")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-semibold">{uiText("Bank")}</TableHead>
                      <TableHead className="text-center font-semibold">{uiText("Loans")}</TableHead>
                      <TableHead className="text-center font-semibold">{uiText("Outstanding")}</TableHead>
                      <TableHead className="text-center font-semibold">{uiText("Fees")}</TableHead>
                      <TableHead className="text-center font-semibold">{uiText("Status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>
                    )) : filtered.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{uiText("No data for selected period")}</TableCell></TableRow>
                    ) : filtered.map(row => {
                      const cfg = STATUS_CONFIG[row.status]
                      const Icon = cfg.icon
                      return (
                        <TableRow key={row.bank_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-primary">{row.bank_code}</span>
                              <span className="text-sm font-medium">{row.bank_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {row.loan_discrepancy > 0 ? (
                              <span className="font-medium text-amber-600">{uiText("Diff:")} {row.loan_discrepancy}</span>
                            ) : <span className="text-emerald-600 text-xs">{uiText("OK")}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.outstanding_discrepancy > 1000 ? (
                              <span className="font-medium text-amber-600">{fmt(row.outstanding_discrepancy)}</span>
                            ) : <span className="text-emerald-600 text-xs">{uiText("OK")}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.fee_discrepancy > 100 ? (
                              <span className="font-medium text-amber-600">{fmt(row.fee_discrepancy)}</span>
                            ) : <span className="text-emerald-600 text-xs">{uiText("OK")}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`gap-1 text-xs ${cfg.classes}`}>
                              <Icon className="h-3 w-3" />{uiText(cfg.label)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="detail">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{uiText("PRSF vs Bank Reported Figures")}</CardTitle>
              <CardDescription className="text-xs">{uiText("Side-by-side comparison of PRSF system data and bank-submitted guarantee reports")}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-semibold" rowSpan={2}>{uiText("Bank")}</TableHead>
                      <TableHead className="text-center font-semibold border-l" colSpan={3}>{uiText("Loans")}</TableHead>
                      <TableHead className="text-center font-semibold border-l" colSpan={3}>{uiText("Outstanding (TJS)")}</TableHead>
                      <TableHead className="font-semibold border-l">{uiText("Status")}</TableHead>
                    </TableRow>
                    <TableRow className="bg-muted/30 hover:bg-muted/30 text-xs">
                      <TableHead className="text-right border-l font-normal text-muted-foreground">{uiText("PRSF")}</TableHead>
                      <TableHead className="text-right font-normal text-muted-foreground">{uiText("Bank")}</TableHead>
                      <TableHead className="text-right font-normal text-muted-foreground">{uiText("Diff")}</TableHead>
                      <TableHead className="text-right border-l font-normal text-muted-foreground">{uiText("PRSF")}</TableHead>
                      <TableHead className="text-right font-normal text-muted-foreground">{uiText("Bank")}</TableHead>
                      <TableHead className="text-right font-normal text-muted-foreground">{uiText("Diff")}</TableHead>
                      <TableHead className="border-l"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>
                    )) : filtered.map(row => {
                      const cfg = STATUS_CONFIG[row.status]
                      return (
                        <TableRow key={row.bank_id} className="text-sm">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-primary">{row.bank_code}</span>
                              <span className="font-medium">{row.bank_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right border-l font-medium">{row.prsf_loan_count}</TableCell>
                          <TableCell className="text-right">{row.bank_loan_count ?? <span className="text-muted-foreground text-xs">N/A</span>}</TableCell>
                          <TableCell className={`text-right font-medium ${row.loan_discrepancy > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {row.loan_discrepancy > 0 ? `+${row.loan_discrepancy}` : '—'}
                          </TableCell>
                          <TableCell className="text-right border-l font-medium">{fmt(row.prsf_outstanding)}</TableCell>
                          <TableCell className="text-right">{row.bank_outstanding !== null ? fmt(row.bank_outstanding) : <span className="text-muted-foreground text-xs">N/A</span>}</TableCell>
                          <TableCell className={`text-right font-medium ${row.outstanding_discrepancy > 1000 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {row.outstanding_discrepancy > 1000 ? fmt(row.outstanding_discrepancy) : '—'}
                          </TableCell>
                          <TableCell className="border-l">
                            <Badge className={`text-xs ${cfg.classes}`}>{uiText(cfg.label)}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
