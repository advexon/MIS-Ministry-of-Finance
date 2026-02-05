"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/i18n/context"
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

// Mock data for demonstration
const mockLoans = [
  {
    id: "LN-2024-001",
    borrowerName: "Tajik Agricultural LLC",
    borrowerTin: "123456789",
    bankName: "Amonatbonk",
    branch: "Dushanbe Main",
    amount: 500000,
    currency: "TJS",
    disbursementDate: "2024-01-15",
    maturityDate: "2027-01-15",
    status: "active",
    guaranteeCoverage: 50,
    outstandingPrincipal: 425000,
    sector: "Agriculture",
  },
  {
    id: "LN-2024-002",
    borrowerName: "Silk Road Trading Co",
    borrowerTin: "987654321",
    bankName: "Eskhata Bank",
    branch: "Khujand",
    amount: 250000,
    currency: "USD",
    disbursementDate: "2024-02-01",
    maturityDate: "2026-02-01",
    status: "active",
    guaranteeCoverage: 60,
    outstandingPrincipal: 225000,
    sector: "Trade",
  },
  {
    id: "LN-2024-003",
    borrowerName: "Mountain Textiles",
    borrowerTin: "456789123",
    bankName: "Bank Arvand",
    branch: "Kulyab",
    amount: 150000,
    currency: "TJS",
    disbursementDate: "2023-11-20",
    maturityDate: "2025-11-20",
    status: "delinquent",
    guaranteeCoverage: 50,
    outstandingPrincipal: 98000,
    sector: "Manufacturing",
  },
  {
    id: "LN-2024-004",
    borrowerName: "Green Valley Farms",
    borrowerTin: "789123456",
    bankName: "Spitamen Bank",
    branch: "Dushanbe",
    amount: 300000,
    currency: "TJS",
    disbursementDate: "2023-08-10",
    maturityDate: "2025-08-10",
    status: "closed",
    guaranteeCoverage: 50,
    outstandingPrincipal: 0,
    sector: "Agriculture",
  },
  {
    id: "LN-2024-005",
    borrowerName: "Tech Solutions TJ",
    borrowerTin: "321654987",
    bankName: "First MicroFinance",
    branch: "Dushanbe",
    amount: 75000,
    currency: "USD",
    disbursementDate: "2024-03-01",
    maturityDate: "2026-03-01",
    status: "pending",
    guaranteeCoverage: 70,
    outstandingPrincipal: 75000,
    sector: "Services",
  },
]

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  delinquent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  closed: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  claimed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
}

export default function LoansPage() {
  const { t } = useLanguage()
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("loans.title")}
          </h1>
          <p className="text-muted-foreground">{t("loans.subtitle")}</p>
        </div>
        <Link href="/dashboard/loans/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t("loans.newApplication")}
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{t("loans.filterLoans")}</CardTitle>
          <CardDescription>{t("loans.filterDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("loans.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t("loans.status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="pending">{t("status.pending")}</SelectItem>
                <SelectItem value="active">{t("status.active")}</SelectItem>
                <SelectItem value="delinquent">{t("status.delinquent")}</SelectItem>
                <SelectItem value="closed">{t("status.closed")}</SelectItem>
                <SelectItem value="claimed">{t("status.claimed")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bankFilter} onValueChange={setBankFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder={t("loans.selectBank")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.allBanks")}</SelectItem>
                {uniqueBanks.map((bank) => (
                  <SelectItem key={bank} value={bank}>
                    {bank}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">{t("loans.loanNumber")}</TableHead>
                  <TableHead className="font-semibold">{t("loans.borrower")}</TableHead>
                  <TableHead className="font-semibold">{t("loans.bank")}</TableHead>
                  <TableHead className="font-semibold">{t("loans.sector")}</TableHead>
                  <TableHead className="text-right font-semibold">{t("loans.amount")}</TableHead>
                  <TableHead className="font-semibold">{t("loans.disbursementDate")}</TableHead>
                  <TableHead className="text-right font-semibold">{t("loans.outstanding")}</TableHead>
                  <TableHead className="font-semibold">{t("loans.status")}</TableHead>
                  <TableHead className="text-right font-semibold">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLoans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <p>{t("loans.noLoansFound")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLoans.map((loan) => (
                    <TableRow key={loan.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{loan.id}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{loan.borrowerName}</p>
                          <p className="text-sm text-muted-foreground">TIN: {loan.borrowerTin}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p>{loan.bankName}</p>
                          <p className="text-sm text-muted-foreground">{loan.branch}</p>
                        </div>
                      </TableCell>
                      <TableCell>{loan.sector}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(loan.amount, loan.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(loan.disbursementDate).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(loan.outstandingPrincipal, loan.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[loan.status]} variant="secondary">
                          {t(`status.${loan.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.id}`} className="flex items-center">
                                <Eye className="mr-2 h-4 w-4" />
                                {t("common.view")}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.id}/edit`} className="flex items-center">
                                <Edit className="mr-2 h-4 w-4" />
                                {t("common.edit")}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/loans/${loan.id}/schedule`} className="flex items-center">
                                <FileText className="mr-2 h-4 w-4" />
                                {t("loans.paymentSchedule")}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Download className="mr-2 h-4 w-4" />
                              {t("common.export")}
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

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {t("common.showing")} {filteredLoans.length} {t("common.of")} {mockLoans.length} {t("loans.loans")}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            {t("common.previous")}
          </Button>
          <Button variant="outline" size="sm" disabled>
            {t("common.next")}
          </Button>
        </div>
      </div>
    </div>
  )
}
