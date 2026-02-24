"use client"

import { useState, useEffect, useCallback } from "react"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, Search, Filter, MoreHorizontal, Eye, Edit, FileText, Download, Loader2, RefreshCw } from "lucide-react"
import Link from "next/link"
import type { LoanApplication, Bank, Sector } from "@/lib/types/database"

const statusStyles: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-sky-100 text-sky-800",
  rejected: "bg-red-100 text-red-800",
  disbursed: "bg-indigo-100 text-indigo-800",
  active: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-800",
  defaulted: "bg-red-100 text-red-800",
  claim_pending: "bg-orange-100 text-orange-800",
  claim_paid: "bg-purple-100 text-purple-800",
}

const PAGE_SIZE = 15

export default function LoansPage() {
  const { t, locale } = useI18n()
  const supabase = createClient()

  const [loans, setLoans] = useState<LoanApplication[]>([])
  const [banks, setBanks] = useState<Bank[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [bankFilter, setBankFilter] = useState("all")

  const getName = (item: { name_en: string; name_ru?: string | null; name_tj?: string | null }) => {
    if (locale === "ru" && item.name_ru) return item.name_ru
    if (locale === "tj" && item.name_tj) return item.name_tj
    return item.name_en
  }

  const fetchLoans = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from("loan_applications")
      .select(`*, bank:banks(id,name_en,name_ru,name_tj), borrower:borrowers(id,company_name,first_name,last_name,tin_number), branch:bank_branches(id,name_en)`, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (statusFilter !== "all") query = query.eq("status", statusFilter)
    if (bankFilter !== "all") query = query.eq("bank_id", bankFilter)
    if (searchTerm) {
      query = query.or(`application_number.ilike.%${searchTerm}%`)
    }

    const { data, count, error } = await query
    if (!error && data) {
      setLoans(data)
      setTotal(count || 0)
    }
    setLoading(false)
  }, [page, statusFilter, bankFilter, searchTerm, supabase])

  useEffect(() => {
    supabase.from("banks").select("*").eq("is_active", true).order("name_en").then(({ data }) => { if (data) setBanks(data) })
    supabase.from("sectors").select("*").eq("is_active", true).order("name_en").then(({ data }) => { if (data) setSectors(data) })
  }, [])

  useEffect(() => { fetchLoans() }, [fetchLoans])

  const formatCurrency = (amount: number | null | undefined, currency = "TJS") => {
    if (!amount && amount !== 0) return "—"
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(amount)
  }

  const getBorrowerName = (loan: LoanApplication) => {
    if (!loan.borrower) return "—"
    return loan.borrower.company_name || `${loan.borrower.first_name || ""} ${loan.borrower.last_name || ""}`.trim() || "—"
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Summary stats
  const activeLoans = loans.filter((l) => l.status === "active" || l.status === "disbursed").length
  const pendingLoans = loans.filter((l) => l.status === "submitted" || l.status === "under_review").length
  const totalAmount = loans.reduce((s, l) => s + (l.requested_amount || 0), 0)

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.loans.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and track all loan guarantee applications</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/dashboard/loans/new"><Plus className="h-4 w-4" />{t.loans.newApplication}</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Total (this page)</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Active / Disbursed</p><p className="text-2xl font-bold text-emerald-600">{activeLoans}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">Pending Review</p><p className="text-2xl font-bold text-amber-600">{pendingLoans}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by application number..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0) }}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="disbursed">Disbursed</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="defaulted">Defaulted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="claim_pending">Claim Pending</SelectItem>
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
            <Button variant="outline" size="icon" onClick={fetchLoans}><RefreshCw className="h-4 w-4" /></Button>
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
                  <TableHead className="font-semibold">Borrower</TableHead>
                  <TableHead className="font-semibold">Bank</TableHead>
                  <TableHead className="text-right font-semibold">Amount</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="text-right font-semibold">Coverage</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : loans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No loan applications found</p>
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <Link href="/dashboard/loans/new">Create First Application</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  loans.map((loan) => (
                    <TableRow key={loan.id} className="hover:bg-muted/30">
                      <TableCell>
                        <Link href={`/dashboard/loans/${loan.application_number}`} className="font-medium text-primary hover:underline">
                          {loan.application_number}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{getBorrowerName(loan)}</p>
                          <p className="text-xs text-muted-foreground">TIN: {loan.borrower?.tin_number || "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{loan.bank ? getName(loan.bank) : "—"}</p>
                        <p className="text-xs text-muted-foreground">{loan.branch?.name_en || ""}</p>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(loan.approved_amount || loan.requested_amount, loan.currency)}
                        <p className="text-xs text-muted-foreground">{loan.currency}</p>
                      </TableCell>
                      <TableCell className="text-sm">{new Date(loan.application_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-sm">{loan.guarantee_coverage ? `${loan.guarantee_coverage}%` : "—"}</TableCell>
                      <TableCell>
                        <Badge className={statusStyles[loan.status] || "bg-gray-100 text-gray-800"} variant="secondary">
                          {loan.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.application_number}`} className="flex items-center">
                                <Eye className="mr-2 h-4 w-4" />View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.application_number}/edit`} className="flex items-center">
                                <Edit className="mr-2 h-4 w-4" />Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
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
