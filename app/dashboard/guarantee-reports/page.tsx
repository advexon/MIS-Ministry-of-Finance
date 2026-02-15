'use client'

import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  ShieldCheck,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  Search,
  Download,
  Filter,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

// Mock data - replace with real data from Supabase
const mockStats = {
  totalReports: 24,
  pendingReview: 5,
  approved: 18,
  draftReports: 3,
}

const mockReports = [
  {
    id: '1',
    reportMonth: '2026-02-01',
    bank: { name: 'Agroinvestbank' },
    status: 'approved',
    submissionDate: '2026-02-05',
    totalLoans: 45,
    totalOutstanding: 12500000,
    totalGuarantee: 6250000,
    submittedBy: { name: 'Ahmad Rahimov' },
  },
  {
    id: '2',
    reportMonth: '2026-01-01',
    bank: { name: 'Bank Eskhata' },
    status: 'under_review',
    submissionDate: '2026-02-03',
    totalLoans: 32,
    totalOutstanding: 8750000,
    totalGuarantee: 4375000,
    submittedBy: { name: 'Farrukh Nazarov' },
  },
  {
    id: '3',
    reportMonth: '2026-01-01',
    bank: { name: 'Spitamen Bank' },
    status: 'submitted',
    submissionDate: '2026-02-01',
    totalLoans: 28,
    totalOutstanding: 7200000,
    totalGuarantee: 3600000,
    submittedBy: { name: 'Dilshod Karimov' },
  },
  {
    id: '4',
    reportMonth: '2025-12-01',
    bank: { name: 'IMON International' },
    status: 'revision_requested',
    submissionDate: '2026-01-15',
    totalLoans: 18,
    totalOutstanding: 4500000,
    totalGuarantee: 2250000,
    submittedBy: { name: 'Aziza Mahmudova' },
  },
  {
    id: '5',
    reportMonth: '2026-02-01',
    bank: { name: 'Amonatbonk' },
    status: 'draft',
    submissionDate: null,
    totalLoans: 0,
    totalOutstanding: 0,
    totalGuarantee: 0,
    submittedBy: null,
  },
]

export default function GuaranteeReportsPage() {
  const { t } = useI18n()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [bankFilter, setBankFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
    })
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      draft: {
        label: t.guaranteeReports.statusDraft,
        className: 'border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground',
      },
      submitted: {
        label: t.guaranteeReports.statusSubmitted,
        className: 'border-info/30 bg-info/10 text-info',
      },
      under_review: {
        label: t.guaranteeReports.statusUnderReview,
        className: 'border-warning/30 bg-warning/10 text-warning',
      },
      approved: {
        label: t.guaranteeReports.statusApproved,
        className: 'border-accent/30 bg-accent/10 text-accent',
      },
      rejected: {
        label: t.guaranteeReports.statusRejected,
        className: 'border-destructive/30 bg-destructive/10 text-destructive',
      },
      revision_requested: {
        label: t.guaranteeReports.statusRevisionRequested,
        className: 'border-warning/30 bg-warning/10 text-warning',
      },
    }

    const variant = variants[status] || variants.draft
    return (
      <Badge variant="outline" className={`text-[10px] ${variant.className}`}>
        {variant.label}
      </Badge>
    )
  }

  const filteredReports = mockReports.filter((report) => {
    if (statusFilter !== 'all' && report.status !== statusFilter) return false
    if (bankFilter !== 'all' && report.bank.name !== bankFilter) return false
    if (searchQuery && !report.bank.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">
            {t.guaranteeReports.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.guaranteeReports.subtitle}
          </p>
        </div>
        <Button asChild size="sm" className="w-fit gap-2">
          <Link href="/dashboard/guarantee-reports/new">
            <PlusCircle className="h-4 w-4" />
            {t.guaranteeReports.newReport}
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total Reports
              </p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{mockStats.totalReports}</p>
            <p className="mt-1 text-xs text-muted-foreground">This year</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Pending Review
              </p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                <Clock className="h-4 w-4 text-warning" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{mockStats.pendingReview}</p>
            <p className="mt-1 text-xs text-muted-foreground">Awaiting action</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Approved
              </p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <CheckCircle2 className="h-4 w-4 text-accent" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{mockStats.approved}</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Drafts
              </p>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted-foreground/10">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground">{mockStats.draftReports}</p>
            <p className="mt-1 text-xs text-muted-foreground">Not submitted</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by bank name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[160px] text-sm">
                  <Filter className="mr-2 h-3 w-3" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="revision_requested">Revision Requested</SelectItem>
                </SelectContent>
              </Select>

              <Select value={bankFilter} onValueChange={setBankFilter}>
                <SelectTrigger className="h-9 w-[160px] text-sm">
                  <SelectValue placeholder="Bank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Banks</SelectItem>
                  <SelectItem value="Agroinvestbank">Agroinvestbank</SelectItem>
                  <SelectItem value="Bank Eskhata">Bank Eskhata</SelectItem>
                  <SelectItem value="Spitamen Bank">Spitamen Bank</SelectItem>
                  <SelectItem value="IMON International">IMON International</SelectItem>
                  <SelectItem value="Amonatbonk">Amonatbonk</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" className="h-9 gap-2 bg-transparent">
                <Download className="h-3 w-3" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Reports List</CardTitle>
          <CardDescription className="text-xs">
            {filteredReports.length} {filteredReports.length === 1 ? 'report' : 'reports'} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">{t.guaranteeReports.noReports}</h3>
              <p className="mb-4 text-xs text-muted-foreground">{t.guaranteeReports.createFirst}</p>
              <Button asChild size="sm">
                <Link href="/dashboard/guarantee-reports/new">{t.guaranteeReports.newReport}</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.guaranteeReports.reportMonth}
                    </th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.guaranteeReports.bank}
                    </th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.guaranteeReports.status}
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.guaranteeReports.totalLoans}
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.guaranteeReports.totalOutstanding}
                    </th>
                    <th className="pb-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.guaranteeReports.submissionDate}
                    </th>
                    <th className="pb-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report) => (
                    <tr key={report.id} className="border-b last:border-0 hover:bg-secondary/50">
                      <td className="py-3">
                        <span className="text-xs font-medium text-foreground">
                          {formatDate(report.reportMonth)}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="text-xs font-semibold text-foreground">{report.bank.name}</span>
                      </td>
                      <td className="py-3">{getStatusBadge(report.status)}</td>
                      <td className="py-3 text-right text-xs text-muted-foreground">{report.totalLoans}</td>
                      <td className="py-3 text-right text-xs font-semibold text-foreground">
                        {formatCurrency(report.totalOutstanding)}
                      </td>
                      <td className="py-3">
                        <span className="text-xs text-muted-foreground">{formatDate(report.submissionDate)}</span>
                      </td>
                      <td className="py-3 text-right">
                        <Button asChild variant="outline" size="sm" className="h-7 text-xs bg-transparent">
                          <Link href={`/dashboard/guarantee-reports/${report.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
