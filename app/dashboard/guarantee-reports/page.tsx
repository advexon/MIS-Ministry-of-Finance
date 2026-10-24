'use client'

import { useState, Suspense } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { useI18n } from '@/lib/i18n/context'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ShieldCheck,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  CheckCheck,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { one } from '@/lib/utils/supabase-relation'

interface GuaranteeReport {
  id: string
  bank_id: string
  report_month: string
  report_type: string
  status: string
  submission_date: string | null
  total_loans: number
  total_outstanding_principal: number
  total_guarantee_amount: number
  // Matches the `banks(name_en, code)` embed in fetchReports below.
  banks: { name_en: string; code: string } | null
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  draft: {
    label: 'Draft',
    className: 'border-secondary bg-secondary text-muted-foreground',
    icon: <FileText className="h-3 w-3" />,
  },
  submitted: {
    label: 'Submitted',
    className: 'border-info/30 bg-info/10 text-info',
    icon: <Clock className="h-3 w-3" />,
  },
  under_review: {
    label: 'Under Review',
    className: 'border-warning/30 bg-warning/10 text-warning',
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: 'Approved',
    className: 'border-accent/30 bg-accent/10 text-accent',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  rejected: {
    label: 'Rejected',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    icon: <XCircle className="h-3 w-3" />,
  },
  revision_requested: {
    label: 'Revision Requested',
    className: 'border-warning/30 bg-warning/10 text-warning',
    icon: <Clock className="h-3 w-3" />,
  },
}

function GuaranteeReportsContent() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [batchLoading, setBatchLoading] = useState(false)

  const { data: reports = [], isLoading, isValidating, mutate } = usePageQuery<GuaranteeReport[]>(['guarantee-reports', statusFilter, typeFilter], async () => {
    let query = supabase
      .from('guarantee_reports')
      .select('*, banks(name_en, code)')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (typeFilter !== 'all') query = query.eq('report_type', typeFilter)

    const { data, error } = await query
    if (error) throw error
    // PostgREST returns embedded relations as arrays; flatten to one record.
    return (data ?? []).map((report) => ({ ...report, banks: one(report.banks) }))
  })
  const loading = isLoading || isValidating
  const fetchReports = () => mutate()

  const filtered = reports.filter(r => {
    const bankName = r.banks?.name_en?.toLowerCase() || ''
    const month = r.report_month?.toLowerCase() || ''
    const q = search.toLowerCase()
    return bankName.includes(q) || month.includes(q)
  })

  const stats = {
    total: reports.length,
    pendingReview: reports.filter(r => r.status === 'under_review' || r.status === 'submitted').length,
    approved: reports.filter(r => r.status === 'approved').length,
    drafts: reports.filter(r => r.status === 'draft').length,
  }

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

  const toggleAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map(r => r.id))

  const batchAction = async (action: 'approve' | 'reject') => {
    if (!selected.length) return
    setBatchLoading(true)
    await supabase
      .from('guarantee_reports')
      .update({ status: action === 'approve' ? 'approved' : 'rejected', updated_at: new Date().toISOString() })
      .in('id', selected)
    setSelected([])
    fetchReports()
    setBatchLoading(false)
  }

  const deleteReport = async (id: string) => {
    await supabase.from('guarantee_reports').delete().eq('id', id)
    fetchReports()
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v)

  const fmtMonth = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="p-4 lg:p-6">
      {/* Page Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground lg:text-2xl">
            {t.guaranteeReports.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.guaranteeReports.subtitle}
          </p>
        </div>
        <Button asChild size="sm" className="gap-2">
          <Link href="/dashboard/guarantee-reports/new">
            <Plus className="h-4 w-4" />
            {t.guaranteeReports.newReport}
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total Reports',
            value: stats.total,
            icon: <ShieldCheck className="h-4 w-4 text-primary" />,
            bg: 'bg-primary/10',
            text: 'text-foreground',
          },
          {
            label: 'Pending Review',
            value: stats.pendingReview,
            icon: <Clock className="h-4 w-4 text-warning" />,
            bg: 'bg-warning/10',
            text: 'text-warning',
          },
          {
            label: 'Approved',
            value: stats.approved,
            icon: <CheckCircle2 className="h-4 w-4 text-accent" />,
            bg: 'bg-accent/10',
            text: 'text-accent',
          },
          {
            label: 'Drafts',
            value: stats.drafts,
            icon: <FileText className="h-4 w-4 text-muted-foreground" />,
            bg: 'bg-secondary',
            text: 'text-muted-foreground',
          },
        ].map(s => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', s.bg)}>
                {s.icon}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                <p className={cn('text-2xl font-bold', s.text)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + Batch Actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search bank or period..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-9 text-xs"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">{t.guaranteeReports.statusDraft}</SelectItem>
            <SelectItem value="submitted">{t.guaranteeReports.statusSubmitted}</SelectItem>
            <SelectItem value="under_review">{t.guaranteeReports.statusUnderReview}</SelectItem>
            <SelectItem value="approved">{t.guaranteeReports.statusApproved}</SelectItem>
            <SelectItem value="rejected">{t.guaranteeReports.statusRejected}</SelectItem>
            <SelectItem value="revision_requested">{t.guaranteeReports.statusRevisionRequested}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="blank_guarantee">{t.guaranteeReports.blankGuaranteeReport}</SelectItem>
            <SelectItem value="disbursements">{t.guaranteeReports.disbursementsReport}</SelectItem>
          </SelectContent>
        </Select>

        {selected.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.length} selected</span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-accent/30 bg-transparent text-xs text-accent hover:bg-accent/5"
              onClick={() => batchAction('approve')}
              disabled={batchLoading}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Approve All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-destructive/30 bg-transparent text-xs text-destructive hover:bg-destructive/5"
              onClick={() => batchAction('reject')}
              disabled={batchLoading}
            >
              <X className="h-3.5 w-3.5" />
              Reject All
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Period</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Loans</TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Outstanding</TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Guarantee Amt</TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Submitted</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <TableCell key={j} className="py-3">
                        <div className="h-4 animate-pulse rounded bg-secondary" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                        <ShieldCheck className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.guaranteeReports.noReports}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.guaranteeReports.createFirst}</p>
                      </div>
                      <Button asChild size="sm" className="mt-1 gap-2">
                        <Link href="/dashboard/guarantee-reports/new">
                          <Plus className="h-4 w-4" />
                          {t.guaranteeReports.newReport}
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(report => {
                  const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft
                  return (
                    <TableRow
                      key={report.id}
                      className="cursor-pointer hover:bg-secondary/40"
                      onClick={() => router.push(`/dashboard/guarantee-reports/${report.id}`)}
                    >
                      <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.includes(report.id)}
                          onCheckedChange={() => toggleSelect(report.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-foreground">
                        {report.banks?.name_en || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtMonth(report.report_month)}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {report.report_type === 'blank_guarantee'
                            ? t.guaranteeReports.blankGuaranteeReport
                            : t.guaranteeReports.disbursementsReport}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('gap-1 text-[11px]', cfg.className)}>
                          {cfg.icon}
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium text-foreground">
                        {report.total_loans}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-foreground">
                        {fmt(report.total_outstanding_principal)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold text-foreground">
                        {fmt(report.total_guarantee_amount)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {report.submission_date
                          ? new Date(report.submission_date).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/guarantee-reports/${report.id}`} className="flex items-center gap-2 text-xs">
                                <Eye className="h-3.5 w-3.5" /> View
                              </Link>
                            </DropdownMenuItem>
                            {report.status === 'draft' && (
                              <DropdownMenuItem asChild>
                                <Link href={`/dashboard/guarantee-reports/${report.id}/edit`} className="flex items-center gap-2 text-xs">
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="flex items-center gap-2 text-xs text-destructive focus:text-destructive"
                              onClick={() => deleteReport(report.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}

export default function GuaranteeReportsPage() {
  return (
    <Suspense>
      <GuaranteeReportsContent />
    </Suspense>
  )
}
