"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, Search, Filter, MoreHorizontal, Eye, CheckCircle, XCircle, AlertTriangle, DollarSign, Clock } from "lucide-react"

const mockClaims = [
  { id: "CLM-2026-001", loanNumber: "LA-2025-0712", borrower: "Dushanbe Logistics", bank: "Bank Eskhata", claimDate: "2026-01-15", claimAmount: 95000, principalClaimed: 80000, interestClaimed: 15000, status: "pending", approvedAmount: null },
  { id: "CLM-2026-002", loanNumber: "LA-2024-0534", borrower: "Samarkand Imports", bank: "Agroinvestbank", claimDate: "2025-12-20", claimAmount: 45000, principalClaimed: 38000, interestClaimed: 7000, status: "under_review", approvedAmount: null },
  { id: "CLM-2025-018", loanNumber: "LA-2024-0412", borrower: "Pamiri Crafts LLC", bank: "IMON International", claimDate: "2025-10-05", claimAmount: 120000, principalClaimed: 100000, interestClaimed: 20000, status: "approved", approvedAmount: 110000 },
  { id: "CLM-2025-015", loanNumber: "LA-2024-0389", borrower: "Northern Textiles", bank: "Spitamen Bank", claimDate: "2025-09-10", claimAmount: 65000, principalClaimed: 55000, interestClaimed: 10000, status: "paid", approvedAmount: 60000 },
  { id: "CLM-2025-012", loanNumber: "LA-2024-0290", borrower: "Vahdat Foods", bank: "Amonatbonk", claimDate: "2025-08-01", claimAmount: 30000, principalClaimed: 25000, interestClaimed: 5000, status: "rejected", approvedAmount: 0 },
]

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  paid: "bg-indigo-100 text-indigo-800",
  rejected: "bg-red-100 text-red-800",
}

export default function ClaimsPage() {
  const { t } = useI18n()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filtered = mockClaims.filter((c) => {
    const matchesSearch = c.id.toLowerCase().includes(search.toLowerCase()) || c.borrower.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const formatCurrency = (val: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "TJS", minimumFractionDigits: 0 }).format(val)

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = { pending: t.claims.statusPending, under_review: t.claims.statusUnderReview, approved: t.claims.statusApproved, paid: t.claims.statusPaid, rejected: t.claims.statusRejected }
    return map[status] || status
  }

  const totalClaimed = mockClaims.reduce((sum, c) => sum + c.claimAmount, 0)
  const totalApproved = mockClaims.filter(c => c.approvedAmount).reduce((sum, c) => sum + (c.approvedAmount || 0), 0)
  const pendingCount = mockClaims.filter(c => c.status === "pending" || c.status === "under_review").length

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.claims.title}</h1>
          <p className="mt-1 text-muted-foreground">Manage guarantee claim requests from partner banks</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" />{t.claims.newClaim}</Button>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-amber-500/10 p-3"><Clock className="h-5 w-5 text-amber-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Claims</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-red-500/10 p-3"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Claimed</p>
              <p className="text-2xl font-bold">{formatCurrency(totalClaimed)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Approved/Paid</p>
              <p className="text-2xl font-bold">{formatCurrency(totalApproved)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by claim number or borrower..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t.common.status} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.common.all}</SelectItem>
                <SelectItem value="pending">{t.claims.statusPending}</SelectItem>
                <SelectItem value="under_review">{t.claims.statusUnderReview}</SelectItem>
                <SelectItem value="approved">{t.claims.statusApproved}</SelectItem>
                <SelectItem value="paid">{t.claims.statusPaid}</SelectItem>
                <SelectItem value="rejected">{t.claims.statusRejected}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Claims Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">{t.claims.claimNumber}</TableHead>
                  <TableHead className="font-semibold">Loan</TableHead>
                  <TableHead className="font-semibold">{t.loans.borrower}</TableHead>
                  <TableHead className="font-semibold">{t.loans.bank}</TableHead>
                  <TableHead className="font-semibold">{t.claims.claimDate}</TableHead>
                  <TableHead className="text-right font-semibold">{t.claims.principalClaimed}</TableHead>
                  <TableHead className="text-right font-semibold">{t.claims.interestClaimed}</TableHead>
                  <TableHead className="text-right font-semibold">{t.claims.claimAmount}</TableHead>
                  <TableHead className="font-semibold">{t.common.status}</TableHead>
                  <TableHead className="text-right font-semibold">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium text-primary">{claim.id}</TableCell>
                    <TableCell className="text-sm">{claim.loanNumber}</TableCell>
                    <TableCell className="text-sm">{claim.borrower}</TableCell>
                    <TableCell className="text-sm">{claim.bank}</TableCell>
                    <TableCell className="text-sm">{new Date(claim.claimDate).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(claim.principalClaimed)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(claim.interestClaimed)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(claim.claimAmount)}</TableCell>
                    <TableCell>
                      <Badge className={statusStyles[claim.status]} variant="secondary">{getStatusLabel(claim.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Eye className="mr-2 h-4 w-4" />{t.common.view}</DropdownMenuItem>
                          {claim.status === "pending" && <DropdownMenuItem><CheckCircle className="mr-2 h-4 w-4" />{t.common.approve}</DropdownMenuItem>}
                          {claim.status === "pending" && <DropdownMenuItem className="text-destructive"><XCircle className="mr-2 h-4 w-4" />{t.common.reject}</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
