"use client"

import { useState, useMemo, Suspense } from "react"
import { usePageQuery } from "@/lib/hooks/use-page-query"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, Search, Filter, MoreHorizontal, Eye, Edit, FileText, Download, Loader2, RefreshCw } from "lucide-react"
import { toCSV, downloadCSV } from "@/lib/utils/export"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import type { LoanApplication, Bank } from "@/lib/types/database"
import { useColumnConfig } from "@/lib/contexts/column-config-context"
import { usePermissions } from "@/lib/contexts/permission-context"
import { Alert, AlertDescription } from '@/components/ui/alert'
import { APPLICATION_STATUS_LABELS, ACTIVE_APPLICATION_STATUSES, PENDING_APPLICATION_STATUSES } from '@/lib/workflow/application-status'

const statusStyles: Record<string, string> = {
  draft:              "bg-gray-100 text-gray-800",
  submitted:          "bg-amber-100 text-amber-800",
  under_review:       "bg-blue-100 text-blue-800",
  approved:           "bg-sky-100 text-sky-800",
  rejected:           "bg-red-100 text-red-800",
  guarantee_issued:   "bg-teal-100 text-teal-800",
  extension_pending:  "bg-yellow-100 text-yellow-800",
  cancelled:          "bg-red-100 text-red-800",
  disbursed:          "bg-indigo-100 text-indigo-800",
  active:             "bg-emerald-100 text-emerald-800",
  defaulted:          "bg-red-100 text-red-800",
  settled:            "bg-emerald-100 text-emerald-800",
  rescheduled:        "bg-orange-100 text-orange-800",
  claim_pending:      "bg-rose-100 text-rose-800",
  claim_rejected:     "bg-red-100 text-red-800",
  claim_paid:         "bg-purple-100 text-purple-800",
  closed:             "bg-gray-100 text-gray-800",
}

const statusLabels: Record<string, string> = {
  ...APPLICATION_STATUS_LABELS,
  draft:              "Draft",
  submitted:          "Submitted",
  under_review:       "Under Review",
  approved:           "Approved",
  rejected:           "Rejected",
  guarantee_issued:   "Guarantee Issued",
  extension_pending:  "Extension Pending",
  cancelled:          "Cancelled",
  disbursed:          "Disbursed",
  active:             "Active",
  defaulted:          "Defaulted",
  settled:            "Settled",
  rescheduled:        "Rescheduled",
  claim_pending:      "Claim Pending",
  claim_rejected:     "Claim Rejected",
  claim_paid:         "Claim Paid",
  closed:             "Closed",
}

const PAGE_SIZE = 15

function LoansContent() {
  const { t, locale } = useI18n()
  const supabase = useMemo(() => createClient(), [])
  const { isColumnVisible, getDisplayName } = useColumnConfig()
  const { can } = usePermissions()
  const canCreateLoan = can("loans", "create")

  const [page, setPage] = useState(0)

  // Seed the search box from ?search=, so links into this page (e.g. "view a
  // borrower's loans") land with the filter already applied.
  const querySearch = useSearchParams().get("search") ?? ""
  const [searchTerm, setSearchTerm] = useState(querySearch)
  const [statusFilter, setStatusFilter] = useState("all")
  const [bankFilter, setBankFilter] = useState("all")

  const getName = (item: { name_en: string; name_ru?: string | null; name_tj?: string | null }) => {
    if (locale === "ru" && item.name_ru) return item.name_ru
    if (locale === "tj" && item.name_tj) return item.name_tj
    return item.name_en
  }

  const { data: result, isLoading, isValidating, error: loadError, mutate } = usePageQuery<{ loans: LoanApplication[]; total: number; active: number; pending: number }>(["loans", page, statusFilter, bankFilter, searchTerm], async () => {
    const filtered = (columns: string, head = false) => {
      let query = supabase.rpc('cgf_search_applications', { p_search: searchTerm.trim() }, { count: 'exact', head }).select(columns)
      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (bankFilter !== 'all') query = query.eq('bank_id', bankFilter)
      return query
    }
    const [rows, active, pending] = await Promise.all([
      filtered('*,bank:banks(id,name_en,name_ru,name_tj),borrower:borrowers(id,name,tin_number),branch:bank_branches(id,name_en)').order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
      filtered('id', true).in('status', ACTIVE_APPLICATION_STATUSES),
      filtered('id', true).in('status', PENDING_APPLICATION_STATUSES),
    ])
    if (rows.error || active.error || pending.error) throw rows.error ?? active.error ?? pending.error
    return { loans: (rows.data ?? []) as unknown as LoanApplication[], total: rows.count ?? 0, active: active.count ?? 0, pending: pending.count ?? 0 }
  })
  const loans = result?.loans ?? []
  const total = result?.total ?? 0
  const loading = isLoading || isValidating
  const fetchLoans = () => mutate()

  const { data: banks = [] } = usePageQuery<Bank[]>(["active-bank-options"], async () => {
    const { data, error } = await supabase.from("banks").select("*").eq("is_active", true).order("name_en")
    if (error) throw error
    return data ?? []
  })

  const formatCurrency = (amount: number | null | undefined, currency = "TJS") => {
    if (!amount && amount !== 0) return "—"
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount)
  }

  const getBorrowerName = (loan: LoanApplication) => {
    return loan.intake_data?.clientName || loan.borrower?.name || "—"
  }

  // Single-loan export for the row action menu. Amounts stay unformatted so the
  // file is spreadsheet-ready rather than carrying currency glyphs.
  const exportLoan = (loan: LoanApplication) => {
    const headers = ["Application #", "Borrower", "TIN", "Bank", "Branch", "Approved Amount", "Currency", "Guarantee Coverage (%)", "Status", "Created"]
    const rows = [[
      loan.loan_number || loan.id,
      getBorrowerName(loan),
      loan.borrower?.tin_number ?? "",
      loan.bank ? getName(loan.bank) : "",
      loan.branch?.name_en ?? "",
      loan.approved_amount ?? "",
      loan.currency ?? "",
      loan.guarantee_coverage ?? "",
      loan.status,
      loan.created_at ?? "",
    ]]
    downloadCSV(toCSV(headers, rows), `loan-${loan.loan_number || loan.id.slice(0, 8)}.csv`)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Summary stats
  const activeLoans = result?.active ?? 0
  const pendingLoans = result?.pending ?? 0

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.loans.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and track all loan guarantee applications</p>
        </div>
        {canCreateLoan && (
          <Button asChild className="gap-2">
            <Link href="/dashboard/loans/new"><Plus className="h-4 w-4" />{t.loans.newApplication}</Link>
          </Button>
        )}
      </div>

      {loadError && <Alert variant="destructive" className="mb-4"><AlertDescription>Applications could not be loaded. This is not an empty register. Use Refresh applications to retry.</AlertDescription></Alert>}
      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Matching applications</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Active / Disbursed</p><p className="text-2xl font-bold text-emerald-600">{activeLoans}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Pending Review</p><p className="text-2xl font-bold text-amber-600">{pendingLoans}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search applications by number, borrower or TIN" maxLength={200} placeholder="Search application, borrower or TIN…" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0) }}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={bankFilter} onValueChange={(v) => { setBankFilter(v); setPage(0) }}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All Banks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Banks</SelectItem>
                {banks.map((b) => <SelectItem key={b.id} value={b.id}>{getName(b)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" aria-label="Refresh applications" disabled={loading} onClick={() => void fetchLoans().catch(() => {})}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Application #</TableHead>
                  {isColumnVisible("borrower_name", "table") && (
                    <TableHead className="font-semibold">{getDisplayName("borrower_name", locale)}</TableHead>
                  )}
                  {isColumnVisible("bank_id", "table") && (
                    <TableHead className="font-semibold">{getDisplayName("bank_id", locale)}</TableHead>
                  )}
                  {isColumnVisible("requested_amount", "table") && (
                    <TableHead className="text-right font-semibold">{getDisplayName("requested_amount", locale)}</TableHead>
                  )}
                  {isColumnVisible("created_at", "table") && (
                    <TableHead className="font-semibold">{getDisplayName("created_at", locale)}</TableHead>
                  )}
                  {isColumnVisible("guarantee_coverage", "table") && (
                    <TableHead className="text-right font-semibold">{getDisplayName("guarantee_coverage", locale)}</TableHead>
                  )}
                  {isColumnVisible("status", "table") && (
                    <TableHead className="font-semibold">{getDisplayName("status", locale)}</TableHead>
                  )}
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={99} className="py-12 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : loadError ? <TableRow><TableCell colSpan={99} className="py-12 text-center">The register is temporarily unavailable. Refresh to retry.</TableCell></TableRow> : loans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={99} className="py-12 text-center">
                      <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No loan applications found</p>
                      {canCreateLoan && (
                        <Button asChild variant="outline" size="sm" className="mt-3">
                          <Link href="/dashboard/loans/new">Create First Application</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  loans.map((loan) => (
                    <TableRow key={loan.id} className="hover:bg-muted/30">
                      <TableCell>
                        <Link href={`/dashboard/loans/${loan.id}`} className="font-medium text-primary hover:underline">
                          {loan.loan_number || loan.id.slice(0, 8)}
                        </Link>
                      </TableCell>
                      {isColumnVisible("borrower_name", "table") && (
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{getBorrowerName(loan)}</p>
                            <p className="text-xs text-muted-foreground">TIN: {loan.borrower?.tin_number || "—"}</p>
                          </div>
                        </TableCell>
                      )}
                      {isColumnVisible("bank_id", "table") && (
                        <TableCell>
                          <p className="text-sm">{loan.bank ? getName(loan.bank) : "—"}</p>
                          <p className="text-xs text-muted-foreground">{loan.branch?.name_en || ""}</p>
                        </TableCell>
                      )}
                      {isColumnVisible("requested_amount", "table") && (
                        <TableCell className="text-right font-medium">
                          {formatCurrency(loan.approved_amount, loan.currency)}
                          <p className="text-xs text-muted-foreground">{loan.currency}</p>
                        </TableCell>
                      )}
                      {isColumnVisible("created_at", "table") && (
                        <TableCell className="text-sm">{loan.created_at ? new Date(loan.created_at).toLocaleDateString() : "—"}</TableCell>
                      )}
                      {isColumnVisible("guarantee_coverage", "table") && (
                        <TableCell className="text-right text-sm">{loan.guarantee_coverage ? `${loan.guarantee_coverage}%` : "—"}</TableCell>
                      )}
                      {isColumnVisible("status", "table") && (
                        <TableCell>
                          <Badge className={statusStyles[loan.status] || "bg-gray-100 text-gray-800"} variant="secondary">
                            {statusLabels[loan.status] ?? loan.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${loan.loan_number || loan.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.id}`} className="flex items-center">
                                <Eye className="mr-2 h-4 w-4" />View Details
                              </Link>
                            </DropdownMenuItem>
                            {/* There is no /edit route in the app — loan changes are
                                made through the workflow actions on the detail page —
                                so this pointed at a non-existent page. */}
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.id}`} className="flex items-center">
                                <Edit className="mr-2 h-4 w-4" />Manage
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportLoan(loan)}>
                              <Download className="mr-2 h-4 w-4" />Export
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>Showing {Math.min(page * PAGE_SIZE + 1, total)}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total} applications</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  )
}

// useSearchParams requires a Suspense boundary, matching the pattern already
// used by the guarantee-reports page.
export default function LoansPage() {
  return (
    <Suspense>
      <LoansContent />
    </Suspense>
  )
}
