"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Eye, 
  Edit, 
  FileText,
  Download,
  Calendar
} from "lucide-react"
import Link from "next/link"

const mockLoans = [
  {
    id: "LA-2026-0847",
    borrowerName: "Tajik Agricultural LLC",
    borrowerTin: "123456789",
    bankName: "Agroinvestbank",
    branch: "Dushanbe Main",
    amount: 500000,
    currency: "TJS",
    disbursementDate: "2025-01-15",
    maturityDate: "2028-01-15",
    status: "active",
    guaranteeCoverage: 50,
    outstandingPrincipal: 425000,
    sector: "Agriculture",
  },
  {
    id: "LA-2026-0846",
    borrowerName: "Silk Road Trading Co",
    borrowerTin: "987654321",
    bankName: "Bank Eskhata",
    branch: "Khujand",
    amount: 250000,
    currency: "USD",
    disbursementDate: "2025-02-01",
    maturityDate: "2027-02-01",
    status: "active",
    guaranteeCoverage: 60,
    outstandingPrincipal: 225000,
    sector: "Trade",
  },
  {
    id: "LA-2026-0843",
    borrowerName: "Mountain Textiles",
    borrowerTin: "456789123",
    bankName: "Spitamen Bank",
    branch: "Kulyab",
    amount: 150000,
    currency: "TJS",
    disbursementDate: "2024-11-20",
    maturityDate: "2026-11-20",
    status: "defaulted",
    guaranteeCoverage: 50,
    outstandingPrincipal: 98000,
    sector: "Manufacturing",
  },
  {
    id: "LA-2026-0842",
    borrowerName: "Green Valley Farms",
    borrowerTin: "789123456",
    bankName: "IMON International",
    branch: "Dushanbe",
    amount: 300000,
    currency: "TJS",
    disbursementDate: "2024-08-10",
    maturityDate: "2026-08-10",
    status: "closed",
    guaranteeCoverage: 50,
    outstandingPrincipal: 0,
    sector: "Agriculture",
  },
  {
    id: "LA-2026-0841",
    borrowerName: "Tech Solutions TJ",
    borrowerTin: "321654987",
    bankName: "Amonatbonk",
    branch: "Dushanbe",
    amount: 75000,
    currency: "USD",
    disbursementDate: "2025-03-01",
    maturityDate: "2027-03-01",
    status: "submitted",
    guaranteeCoverage: 70,
    outstandingPrincipal: 75000,
    sector: "Services",
  },
  {
    id: "LA-2026-0840",
    borrowerName: "Pamir Construction",
    borrowerTin: "654987321",
    bankName: "Agroinvestbank",
    branch: "Khorog",
    amount: 620000,
    currency: "TJS",
    disbursementDate: "2025-04-15",
    maturityDate: "2028-04-15",
    status: "disbursed",
    guaranteeCoverage: 50,
    outstandingPrincipal: 580000,
    sector: "Construction",
  },
  {
    id: "LA-2025-0712",
    borrowerName: "Dushanbe Logistics",
    borrowerTin: "147258369",
    bankName: "Bank Eskhata",
    branch: "Dushanbe",
    amount: 180000,
    currency: "TJS",
    disbursementDate: "2024-06-01",
    maturityDate: "2026-06-01",
    status: "claim_pending",
    guaranteeCoverage: 60,
    outstandingPrincipal: 95000,
    sector: "Transport",
  },
]

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-sky-100 text-sky-800",
  disbursed: "bg-indigo-100 text-indigo-800",
  defaulted: "bg-red-100 text-red-800",
  closed: "bg-gray-100 text-gray-800",
  claim_pending: "bg-orange-100 text-orange-800",
  rejected: "bg-rose-100 text-rose-800",
}

export default function LoansPage() {
  const { t } = useI18n()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [bankFilter, setBankFilter] = useState<string>("all")

  const filteredLoans = mockLoans.filter((loan) => {
    const matchesSearch =
      loan.borrowerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.borrowerTin.includes(searchTerm)
    const matchesStatus = statusFilter === "all" || loan.status === statusFilter
    const matchesBank = bankFilter === "all" || loan.bankName === bankFilter
    return matchesSearch && matchesStatus && matchesBank
  })

  const uniqueBanks = [...new Set(mockLoans.map((loan) => loan.bankName))]

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      active: t.loans.statusActive,
      submitted: t.loans.statusSubmitted,
      under_review: t.loans.statusUnderReview,
      approved: t.loans.statusApproved,
      disbursed: t.loans.statusDisbursed,
      defaulted: t.loans.statusDefaulted,
      closed: t.loans.statusClosed,
      claim_pending: t.loans.statusClaimPending,
      rejected: t.loans.statusRejected,
    }
    return statusMap[status] || status
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t.loans.title}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage and track all loan guarantee applications
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/dashboard/loans/new">
            <Plus className="h-4 w-4" />
            {t.loans.newApplication}
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">{t.common.filter}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by loan number, borrower name, or TIN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t.common.status} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.common.all}</SelectItem>
                <SelectItem value="submitted">{t.loans.statusSubmitted}</SelectItem>
                <SelectItem value="under_review">{t.loans.statusUnderReview}</SelectItem>
                <SelectItem value="approved">{t.loans.statusApproved}</SelectItem>
                <SelectItem value="disbursed">{t.loans.statusDisbursed}</SelectItem>
                <SelectItem value="active">{t.loans.statusActive}</SelectItem>
                <SelectItem value="defaulted">{t.loans.statusDefaulted}</SelectItem>
                <SelectItem value="closed">{t.loans.statusClosed}</SelectItem>
                <SelectItem value="claim_pending">{t.loans.statusClaimPending}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bankFilter} onValueChange={setBankFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t.loans.bank} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.common.all}</SelectItem>
                {uniqueBanks.map((bank) => (
                  <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loans Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">{t.loans.applicationNumber}</TableHead>
                  <TableHead className="font-semibold">{t.loans.borrower}</TableHead>
                  <TableHead className="font-semibold">{t.loans.bank}</TableHead>
                  <TableHead className="font-semibold">Sector</TableHead>
                  <TableHead className="text-right font-semibold">{t.common.amount}</TableHead>
                  <TableHead className="font-semibold">{t.loans.disbursementDate}</TableHead>
                  <TableHead className="text-right font-semibold">Outstanding</TableHead>
                  <TableHead className="font-semibold">{t.common.status}</TableHead>
                  <TableHead className="text-right font-semibold">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLoans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <p>{t.common.noData}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLoans.map((loan) => (
                    <TableRow key={loan.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Link href={`/dashboard/loans/${loan.id}`} className="font-medium text-primary hover:underline">
                          {loan.id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{loan.borrowerName}</p>
                          <p className="text-xs text-muted-foreground">TIN: {loan.borrowerTin}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{loan.bankName}</p>
                          <p className="text-xs text-muted-foreground">{loan.branch}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{loan.sector}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(loan.amount, loan.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {new Date(loan.disbursementDate).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(loan.outstandingPrincipal, loan.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusStyles[loan.status] || "bg-gray-100 text-gray-800"} variant="secondary">
                          {getStatusLabel(loan.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">{t.common.actions}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.id}`} className="flex items-center">
                                <Eye className="mr-2 h-4 w-4" />
                                {t.common.view}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.id}/edit`} className="flex items-center">
                                <Edit className="mr-2 h-4 w-4" />
                                {t.common.edit}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              {t.common.export}
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

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Showing {filteredLoans.length} of {mockLoans.length} applications
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>{t.common.previous}</Button>
          <Button variant="outline" size="sm" disabled>{t.common.next}</Button>
        </div>
      </div>
    </div>
  )
}
