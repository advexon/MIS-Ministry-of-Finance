'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Building2,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  Send,
  FileSpreadsheet,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { exportToExcel, exportToPDF } from '@/lib/utils/export'
import { useToast } from '@/hooks/use-toast'

// Mock data - replace with real data from Supabase
const mockReport = {
  id: '1',
  reportMonth: '2026-02-01',
  reportType: 'monthly',
  bank: {
    id: 'bank-1',
    name: 'Agroinvestbank',
    code: 'AIB',
  },
  status: 'under_review',
  submissionDate: '2026-02-05T10:30:00',
  submittedBy: {
    id: 'user-1',
    name: 'Ahmad Rahimov',
    email: 'ahmad@agroinvestbank.tj',
  },
  reviewedBy: null,
  reviewDate: null,
  reviewNotes: null,
  totalLoans: 45,
  totalOutstandingPrincipal: 12500000,
  totalGuaranteeAmount: 6250000,
  createdAt: '2026-02-03T09:00:00',
  updatedAt: '2026-02-05T10:30:00',
}

const mockLoans = [
  {
    id: '1',
    loanRequestNumber: 'LA-2026-0847',
    customerName: 'Nasriddin Textile LLC',
    approvedAmount: 450000,
    disbursedAmount: 450000,
    outstandingPrincipal: 380000,
    interestRate: 18.5,
    guaranteeAmount: 225000,
    loanStatus: 'Active',
    daysOverdue: 0,
  },
  {
    id: '2',
    loanRequestNumber: 'LA-2026-0832',
    customerName: 'Pamir Fruits Trading',
    approvedAmount: 320000,
    disbursedAmount: 320000,
    outstandingPrincipal: 285000,
    interestRate: 19.0,
    guaranteeAmount: 160000,
    loanStatus: 'Active',
    daysOverdue: 0,
  },
  {
    id: '3',
    loanRequestNumber: 'LA-2026-0801',
    customerName: 'Silk Road Logistics',
    approvedAmount: 580000,
    disbursedAmount: 580000,
    outstandingPrincipal: 495000,
    interestRate: 17.5,
    guaranteeAmount: 290000,
    loanStatus: 'Active',
    daysOverdue: 15,
  },
]

const mockPayments = [
  {
    id: '1',
    loanNumber: 'LA-2026-0847',
    installmentNumber: 1,
    paymentDate: '2026-03-15',
    principalAmount: 37500,
    interestAmount: 6937,
    totalAmount: 44437,
    remainingBalance: 412500,
  },
  {
    id: '2',
    loanNumber: 'LA-2026-0847',
    installmentNumber: 2,
    paymentDate: '2026-04-15',
    principalAmount: 37500,
    interestAmount: 6354,
    totalAmount: 43854,
    remainingBalance: 375000,
  },
  {
    id: '3',
    loanNumber: 'LA-2026-0832',
    installmentNumber: 1,
    paymentDate: '2026-03-10',
    principalAmount: 26667,
    interestAmount: 5067,
    totalAmount: 31734,
    remainingBalance: 293333,
  },
]

export default function GuaranteeReportDetailPage() {
  const params = useParams()
  const { t } = useI18n()
  const { toast } = useToast()
  const [reviewNotes, setReviewNotes] = useState('')

  const handleExportExcel = () => {
    exportToExcel(
      { report: mockReport, loans: mockLoans, payments: mockPayments },
      mockReport.reportMonth
    )
    toast({
      title: 'Export Successful',
      description: 'Report exported to Excel',
    })
  }

  const handleExportPDF = () => {
    exportToPDF(
      { report: mockReport, loans: mockLoans, payments: mockPayments },
      mockReport.reportMonth
    )
    toast({
      title: 'Export Successful',
      description: 'Report exported to HTML/PDF',
    })
  }
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'TJS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
      draft: {
        label: t.guaranteeReports.statusDraft,
        icon: <FileText className="h-3 w-3" />,
        className: 'border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground',
      },
      submitted: {
        label: t.guaranteeReports.statusSubmitted,
        icon: <Send className="h-3 w-3" />,
        className: 'border-info/30 bg-info/10 text-info',
      },
      under_review: {
        label: t.guaranteeReports.statusUnderReview,
        icon: <AlertCircle className="h-3 w-3" />,
        className: 'border-warning/30 bg-warning/10 text-warning',
      },
      approved: {
        label: t.guaranteeReports.statusApproved,
        icon: <CheckCircle2 className="h-3 w-3" />,
        className: 'border-accent/30 bg-accent/10 text-accent',
      },
      rejected: {
        label: t.guaranteeReports.statusRejected,
        icon: <XCircle className="h-3 w-3" />,
        className: 'border-destructive/30 bg-destructive/10 text-destructive',
      },
      revision_requested: {
        label: t.guaranteeReports.statusRevisionRequested,
        icon: <AlertCircle className="h-3 w-3" />,
        className: 'border-warning/30 bg-warning/10 text-warning',
      },
    }

    const variant = variants[status] || variants.draft
    return (
      <Badge variant="outline" className={`gap-1 text-xs ${variant.className}`}>
        {variant.icon}
        {variant.label}
      </Badge>
    )
  }

  const handleApprove = async () => {
    setIsSubmitting(true)
    // Call server action to approve report
    console.log('[v0] Approving report:', params.id)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsSubmitting(false)
  }

  const handleReject = async () => {
    setIsSubmitting(true)
    // Call server action to reject report
    console.log('[v0] Rejecting report:', params.id, 'with notes:', reviewNotes)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsSubmitting(false)
  }

  const handleRequestRevision = async () => {
    setIsSubmitting(true)
    // Call server action to request revision
    console.log('[v0] Requesting revision for report:', params.id, 'with notes:', reviewNotes)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsSubmitting(false)
  }

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6">
        <Button asChild variant="outline" size="sm" className="mb-4 gap-2 bg-transparent">
          <Link href="/dashboard/guarantee-reports">
            <ArrowLeft className="h-4 w-4" />
            Back to Reports
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">
                {mockReport.bank.name}
              </h1>
              {getStatusBadge(mockReport.status)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(mockReport.reportMonth)} • {mockReport.reportType.charAt(0).toUpperCase() + mockReport.reportType.slice(1)} Report
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
              onClick={handleExportExcel}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-transparent"
              onClick={handleExportPDF}
            >
              <Download className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Bank</p>
                <p className="text-sm font-semibold text-foreground">{mockReport.bank.name}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                <FileText className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total Loans</p>
                <p className="text-sm font-semibold text-foreground">{mockReport.totalLoans}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10">
                <Calendar className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(mockReport.totalOutstandingPrincipal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <User className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Guarantee</p>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(mockReport.totalGuaranteeAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Review Actions (for PRSF admins) */}
      {mockReport.status === 'under_review' && (
        <Card className="mb-6 border-warning/20 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">Review Actions</CardTitle>
            <CardDescription className="text-xs">Take action on this report submission</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">
                {t.guaranteeReports.reviewNotes}
              </label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add your review notes here..."
                className="min-h-[100px] text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleApprove}
                disabled={isSubmitting}
                size="sm"
                className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <CheckCircle2 className="h-4 w-4" />
                {t.guaranteeReports.approveReport}
              </Button>
              <Button
                onClick={handleRequestRevision}
                disabled={isSubmitting || !reviewNotes.trim()}
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
              >
                <AlertCircle className="h-4 w-4" />
                {t.guaranteeReports.requestRevision}
              </Button>
              <Button
                onClick={handleReject}
                disabled={isSubmitting || !reviewNotes.trim()}
                variant="destructive"
                size="sm"
                className="gap-2"
              >
                <XCircle className="h-4 w-4" />
                {t.guaranteeReports.rejectReport}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Data Tabs */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Tabs defaultValue="loans" className="w-full">
            <div className="border-b px-6 pt-6">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="loans" className="text-xs">
                  {t.guaranteeReports.loansList} ({mockLoans.length})
                </TabsTrigger>
                <TabsTrigger value="payments" className="text-xs">
                  {t.guaranteeReports.paymentSchedule} ({mockPayments.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="loans" className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.loanNumber}
                      </th>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.customerName}
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.approvedAmount}
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.outstandingPrincipal}
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Rate
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.guaranteeAmount}
                      </th>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockLoans.map((loan) => (
                      <tr key={loan.id} className="border-b last:border-0">
                        <td className="py-3">
                          <span className="text-xs font-medium text-primary hover:underline">
                            {loan.loanRequestNumber}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className="text-xs font-semibold text-foreground">{loan.customerName}</span>
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {formatCurrency(loan.approvedAmount)}
                        </td>
                        <td className="py-3 text-right text-xs font-semibold text-foreground">
                          {formatCurrency(loan.outstandingPrincipal)}
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">{loan.interestRate}%</td>
                        <td className="py-3 text-right text-xs font-semibold text-warning">
                          {formatCurrency(loan.guaranteeAmount)}
                        </td>
                        <td className="py-3">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              loan.daysOverdue > 0
                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                : 'border-accent/30 bg-accent/10 text-accent'
                            }`}
                          >
                            {loan.loanStatus}
                            {loan.daysOverdue > 0 && ` (${loan.daysOverdue}d)`}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="payments" className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.loanNumber}
                      </th>
                      <th className="pb-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.installmentNo}
                      </th>
                      <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.paymentDate}
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.principalAmount}
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.interestAmount}
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.totalAmount}
                      </th>
                      <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.guaranteeReports.remainingBalance}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockPayments.map((payment) => (
                      <tr key={payment.id} className="border-b last:border-0">
                        <td className="py-3">
                          <span className="text-xs font-medium text-primary">{payment.loanNumber}</span>
                        </td>
                        <td className="py-3 text-center text-xs text-muted-foreground">{payment.installmentNumber}</td>
                        <td className="py-3">
                          <span className="text-xs text-muted-foreground">
                            {new Date(payment.paymentDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {formatCurrency(payment.principalAmount)}
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {formatCurrency(payment.interestAmount)}
                        </td>
                        <td className="py-3 text-right text-xs font-semibold text-foreground">
                          {formatCurrency(payment.totalAmount)}
                        </td>
                        <td className="py-3 text-right text-xs text-muted-foreground">
                          {formatCurrency(payment.remainingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Report Info */}
      <Card className="mt-6 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Report Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Submitted By</dt>
              <dd className="mt-1 text-xs font-semibold text-foreground">{mockReport.submittedBy.name}</dd>
              <dd className="text-[10px] text-muted-foreground">{mockReport.submittedBy.email}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Submission Date</dt>
              <dd className="mt-1 text-xs font-semibold text-foreground">{formatDate(mockReport.submissionDate)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Last Updated</dt>
              <dd className="mt-1 text-xs font-semibold text-foreground">{formatDate(mockReport.updatedAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
