'use client'

import { useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { useParams, useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Building2,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  Send,
  Clock,
  ShieldCheck,
  Pencil,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

interface ReportLoan {
  id: string
  row_number: number
  loan_request_number: string
  customer_name: string
  customer_code: string | null
  tin_number: string | null
  sector: string | null
  currency: string
  approved_amount: number
  disbursed_amount: number | null
  outstanding_principal: number
  interest_rate: number | null
  loan_term_months: number | null
  disbursement_date: string | null
  maturity_date: string | null
  guarantee_coverage: number
  guarantee_amount: number
  loan_status: string
  days_overdue: number
}

interface ReportPayment {
  id: string
  loan_number: string
  installment_number: number
  payment_date: string
  principal_amount: number
  interest_amount: number
  total_amount: number
  remaining_balance: number
}

interface Report {
  id: string
  bank_id: string
  report_month: string
  report_type: string
  status: string
  submission_date: string | null
  review_date: string | null
  review_notes: string | null
  total_loans: number
  total_outstanding_principal: number
  total_guarantee_amount: number
  created_at: string
  banks: { id: string; name_en: string; code: string | null } | null
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', className: 'border-secondary bg-secondary text-muted-foreground', icon: <FileText className="h-3 w-3" /> },
  submitted: { label: 'Submitted', className: 'border-info/30 bg-info/10 text-info', icon: <Send className="h-3 w-3" /> },
  under_review: { label: 'Under Review', className: 'border-warning/30 bg-warning/10 text-warning', icon: <Clock className="h-3 w-3" /> },
  approved: { label: 'Approved', className: 'border-accent/30 bg-accent/10 text-accent', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: 'Rejected', className: 'border-destructive/30 bg-destructive/10 text-destructive', icon: <XCircle className="h-3 w-3" /> },
  revision_requested: { label: 'Revision Requested', className: 'border-warning/30 bg-warning/10 text-warning', icon: <AlertCircle className="h-3 w-3" /> },
}

export default function GuaranteeReportDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { t } = useI18n()
  const { toast } = useToast()
  const supabase = createClient()
  const id = params.id as string

  const [notesEdit, setNotesEdit] = useState<{ id: string; value: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const { data: details, isLoading, isValidating, mutate } = usePageQuery<{ report: Report | null; loans: ReportLoan[]; payments: ReportPayment[] }>(['guarantee-report', id], async () => {
    const [{ data: reportData }, { data: loansData }, { data: paymentsData }] = await Promise.all([
      supabase
        .from('guarantee_reports')
        .select('*, banks(id, name_en, code)')
        .eq('id', id)
        .single(),
      supabase
        .from('guarantee_report_loans')
        .select('*')
        .eq('report_id', id)
        .order('row_number'),
      supabase
        .from('guarantee_report_payments')
        .select('*')
        .eq('report_id', id)
        .order('loan_number')
        .order('installment_number'),
    ])
    return { report: reportData, loans: loansData ?? [], payments: paymentsData ?? [] }
  })
  const report = details?.report ?? null
  const loans = details?.loans ?? []
  const payments = details?.payments ?? []
  const loading = isLoading || isValidating
  const reviewNotes = notesEdit?.id === id ? notesEdit.value : report?.review_notes ?? ''
  const setReviewNotes = (value: string) => setNotesEdit({ id, value })
  const fetchReport = () => mutate()

  const takeAction = async (action: 'approve' | 'reject' | 'revision_requested' | 'submitted') => {
    setActionLoading(true)
    try {
      const statusMap = {
        approve: 'approved',
        reject: 'rejected',
        revision_requested: 'revision_requested',
        submitted: 'submitted',
      }
      await supabase.from('guarantee_reports').update({
        status: statusMap[action],
        review_notes: reviewNotes || null,
        review_date: ['approve', 'reject', 'revision_requested'].includes(action) ? new Date().toISOString() : null,
        submission_date: action === 'submitted' ? new Date().toISOString() : report?.submission_date,
      }).eq('id', id)
      toast({ title: action === 'approve' ? 'Report approved' : action === 'reject' ? 'Report rejected' : action === 'submitted' ? 'Report submitted' : 'Revision requested' })
      fetchReport()
    } catch {
      toast({ title: 'Action failed', variant: 'destructive' })
    } finally {
      setActionLoading(false)
    }
  }

  const exportExcel = async () => {
    if (!report || !loans.length) {
      toast({ title: 'Nothing to export', variant: 'destructive' })
      return
    }
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const loansRows = [
        ['#', 'Loan Number', 'Customer', 'TIN', 'Sector', 'CCY', 'Approved', 'Outstanding', 'Rate %', 'Disbursed', 'Maturity', 'Guarantee %', 'Guarantee Amt', 'Status', 'Days Overdue'],
        ...loans.map(l => [
          l.row_number, l.loan_request_number, l.customer_name, l.tin_number, l.sector, l.currency,
          l.approved_amount, l.outstanding_principal, l.interest_rate, l.disbursement_date, l.maturity_date,
          l.guarantee_coverage, l.guarantee_amount, l.loan_status, l.days_overdue,
        ]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(loansRows), 'Loans')
      if (payments.length) {
        const payRows = [
          ['Loan #', 'Installment', 'Payment Date', 'Principal', 'Interest', 'Total', 'Remaining'],
          ...payments.map(p => [p.loan_number, p.installment_number, p.payment_date, p.principal_amount, p.interest_amount, p.total_amount, p.remaining_balance]),
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payRows), 'Payments')
      }
      const bankName = report.banks?.name_en || 'report'
      const month = new Date(report.report_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-')
      XLSX.writeFile(wb, `guarantee-report-${bankName}-${month}.xlsx`)
      toast({ title: 'Exported to Excel' })
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' })
    }
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v)

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-secondary" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <ShieldCheck className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Report not found</p>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/guarantee-reports">Back to Reports</Link>
        </Button>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft
  const canReview = report.status === 'under_review' || report.status === 'submitted'
  const canSubmit = report.status === 'draft' || report.status === 'revision_requested'

  return (
    <div className="p-4 lg:p-6">
      {/* Back + Header */}
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4 gap-2 text-muted-foreground hover:text-foreground">
          <Link href="/dashboard/guarantee-reports">
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </Link>
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">
                {report.banks?.name_en || '—'}
              </h1>
              <Badge variant="outline" className={cn('gap-1 text-xs', cfg.className)}>
                {cfg.icon}
                {cfg.label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(report.report_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              {' · '}
              {report.report_type === 'blank_guarantee' ? t.guaranteeReports.blankGuaranteeReport : t.guaranteeReports.disbursementsReport}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSubmit && (
              <Button size="sm" className="gap-2" onClick={() => takeAction('submitted')} disabled={actionLoading}>
                <Send className="h-3.5 w-3.5" />
                {t.guaranteeReports.submitReport}
              </Button>
            )}
            {report.status === 'draft' && (
              <Button asChild size="sm" variant="outline" className="gap-2 bg-transparent">
                <Link href={`/dashboard/guarantee-reports/${id}/edit`}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={exportExcel}>
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bank</p>
              <p className="truncate text-sm font-semibold text-foreground">{report.banks?.name_en || '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total Loans</p>
              <p className="text-sm font-semibold text-foreground">{report.total_loans}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-info/10">
              <Calendar className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
              <p className="text-sm font-semibold text-foreground">{fmt(report.total_outstanding_principal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <ShieldCheck className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Guarantee Amt</p>
              <p className="text-sm font-semibold text-foreground">{fmt(report.total_guarantee_amount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-4">
          {[
            { label: 'Submission Date', value: fmtDate(report.submission_date) },
            { label: 'Review Date', value: fmtDate(report.review_date) },
            { label: 'Created', value: fmtDate(report.created_at) },
            { label: 'Report Period', value: new Date(report.report_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
          ].map(item => (
            <div key={item.label}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{item.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Review Notes (read-only if already decided) */}
      {report.review_notes && !canReview && (
        <Card className="mb-6 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t.guaranteeReports.reviewNotes}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{report.review_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Review Actions */}
      {canReview && (
        <Card className="mb-6 border-warning/20 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Review Actions</CardTitle>
            <CardDescription className="text-xs">Approve, request revision, or reject this report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">{t.guaranteeReports.reviewNotes}</label>
              <Textarea
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Add review notes..."
                className="min-h-[80px] text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => takeAction('approve')}
                disabled={actionLoading}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t.guaranteeReports.approveReport}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 bg-transparent"
                onClick={() => takeAction('revision_requested')}
                disabled={actionLoading || !reviewNotes.trim()}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {t.guaranteeReports.requestRevision}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-2"
                onClick={() => takeAction('reject')}
                disabled={actionLoading || !reviewNotes.trim()}
              >
                <XCircle className="h-3.5 w-3.5" />
                {t.guaranteeReports.rejectReport}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loan & Payment Tabs */}
      <Tabs defaultValue="loans">
        <TabsList className="mb-0 h-9">
          <TabsTrigger value="loans" className="text-xs">
            {t.guaranteeReports.loansList}
            <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{loans.length}</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">
            {t.guaranteeReports.paymentSchedule}
            <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{payments.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="loans" className="mt-0">
          <Card className="rounded-tl-none shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {['#', 'Loan Number', 'Customer', 'TIN', 'Sector', 'CCY', 'Approved', 'Outstanding', 'Rate', 'Maturity', 'Coverage', 'Guarantee Amt', 'Status'].map(h => (
                        <TableHead key={h} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="py-10 text-center text-xs text-muted-foreground">No loans in this report</TableCell>
                      </TableRow>
                    ) : loans.map(loan => (
                      <TableRow key={loan.id} className="hover:bg-secondary/30">
                        <TableCell className="text-xs text-muted-foreground">{loan.row_number}</TableCell>
                        <TableCell className="text-xs font-medium text-primary">{loan.loan_request_number}</TableCell>
                        <TableCell className="text-xs font-semibold text-foreground">{loan.customer_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{loan.tin_number || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{loan.sector || '—'}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{loan.currency}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{fmt(loan.approved_amount)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold text-foreground">{fmt(loan.outstanding_principal)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{loan.interest_rate ? `${loan.interest_rate}%` : '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(loan.maturity_date)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{loan.guarantee_coverage}%</TableCell>
                        <TableCell className="text-right text-xs font-semibold text-warning">{fmt(loan.guarantee_amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px]', loan.days_overdue > 0
                              ? 'border-destructive/30 bg-destructive/10 text-destructive'
                              : 'border-accent/30 bg-accent/10 text-accent'
                            )}
                          >
                            {loan.loan_status}{loan.days_overdue > 0 ? ` (${loan.days_overdue}d)` : ''}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Loans totals footer */}
              {loans.length > 0 && (
                <div className="flex flex-wrap items-center gap-6 border-t px-4 py-3 text-xs">
                  <span className="text-muted-foreground">
                    Total Loans: <span className="font-semibold text-foreground">{loans.length}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Total Outstanding:{' '}
                    <span className="font-semibold text-foreground">
                      {fmt(loans.reduce((s, l) => s + l.outstanding_principal, 0))}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Total Guarantee:{' '}
                    <span className="font-semibold text-warning">
                      {fmt(loans.reduce((s, l) => s + l.guarantee_amount, 0))}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Overdue Loans:{' '}
                    <span className="font-semibold text-destructive">
                      {loans.filter(l => l.days_overdue > 0).length}
                    </span>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-0">
          <Card className="rounded-tl-none shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {['Loan Number', 'Installment', 'Payment Date', 'Principal', 'Interest', 'Total', 'Remaining Balance'].map(h => (
                        <TableHead key={h} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-xs text-muted-foreground">No payment schedule in this report</TableCell>
                      </TableRow>
                    ) : payments.map(pay => (
                      <TableRow key={pay.id} className="hover:bg-secondary/30">
                        <TableCell className="text-xs font-medium text-primary">{pay.loan_number}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{pay.installment_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(pay.payment_date)}</TableCell>
                        <TableCell className="text-right text-xs text-foreground">{fmt(pay.principal_amount)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{fmt(pay.interest_amount)}</TableCell>
                        <TableCell className="text-right text-xs font-semibold text-foreground">{fmt(pay.total_amount)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{fmt(pay.remaining_balance)}</TableCell>
                      </TableRow>
                    ))}
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
