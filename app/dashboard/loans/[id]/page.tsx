"use client"

import { use } from "react"
import { useI18n } from "@/lib/i18n/context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft, Edit, Download, Calendar, Building2, User,
  DollarSign, FileText, AlertTriangle, CheckCircle, Clock,
  TrendingUp, Shield,
} from "lucide-react"
import Link from "next/link"

const mockLoan = {
  id: "LA-2026-0847",
  borrower: {
    name: "Tajik Agricultural LLC",
    tin: "123456789",
    registrationNumber: "REG-2020-12345",
    legalEntityType: "Limited Liability Company (LLC)",
    sector: "Agriculture",
    address: "45 Rudaki Avenue, Dushanbe",
    district: "Firdavsi",
    city: "Dushanbe",
    zipCode: "734025",
    workforce: 25,
    representative: {
      name: "Rahmon Karimov",
      gender: "Male",
      birthdate: "1975-05-15",
      tin: "987654321",
    },
  },
  bank: { name: "Agroinvestbank", branch: "Dushanbe Main", officer: "Alisher Saidov" },
  product: "Standard MSME Loan",
  status: "active",
  dates: {
    application: "2024-12-01",
    approval: "2024-12-15",
    disbursement: "2025-01-15",
    maturity: "2028-01-15",
    lastPayment: "2026-01-15",
  },
  amounts: {
    approved: 500000, disbursed: 500000, currency: "TJS",
    outstandingPrincipal: 425000, outstandingInterest: 2300,
    totalOutstanding: 427300, totalRepaid: 75000,
  },
  terms: {
    durationMonths: 36, gracePeriodMonths: 6,
    frequency: "Monthly", interestRate: 18.5, guaranteeCoverage: 50,
  },
  delinquency: { days: 0, principalOverdue: 0, interestOverdue: 0 },
  fees: { upfrontFee: 2500, annualFee: 1250 },
}

const mockPaymentSchedule = [
  { number: 1, date: "2025-01-15", principal: 0, interest: 7708.33, total: 7708.33, outstanding: 500000, status: "paid" },
  { number: 2, date: "2025-02-15", principal: 0, interest: 7708.33, total: 7708.33, outstanding: 500000, status: "paid" },
  { number: 3, date: "2025-03-15", principal: 0, interest: 7708.33, total: 7708.33, outstanding: 500000, status: "paid" },
  { number: 4, date: "2025-04-15", principal: 0, interest: 7708.33, total: 7708.33, outstanding: 500000, status: "paid" },
  { number: 5, date: "2025-05-15", principal: 0, interest: 7708.33, total: 7708.33, outstanding: 500000, status: "paid" },
  { number: 6, date: "2025-06-15", principal: 0, interest: 7708.33, total: 7708.33, outstanding: 500000, status: "paid" },
  { number: 7, date: "2025-07-15", principal: 16666.67, interest: 7708.33, total: 24375, outstanding: 483333.33, status: "paid" },
  { number: 8, date: "2025-08-15", principal: 16666.67, interest: 7451.39, total: 24118.06, outstanding: 466666.66, status: "paid" },
  { number: 9, date: "2025-09-15", principal: 16666.67, interest: 7194.44, total: 23861.11, outstanding: 449999.99, status: "paid" },
  { number: 10, date: "2025-10-15", principal: 16666.67, interest: 6937.50, total: 23604.17, outstanding: 433333.32, status: "paid" },
  { number: 11, date: "2025-11-15", principal: 16666.67, interest: 6680.56, total: 23347.23, outstanding: 416666.65, status: "upcoming" },
  { number: 12, date: "2025-12-15", principal: 16666.67, interest: 6423.61, total: 23090.28, outstanding: 399999.98, status: "upcoming" },
  { number: 13, date: "2026-01-15", principal: 16666.67, interest: 6166.67, total: 22833.34, outstanding: 383333.31, status: "upcoming" },
  { number: 14, date: "2026-02-15", principal: 16666.67, interest: 5909.72, total: 22576.39, outstanding: 366666.64, status: "upcoming" },
]

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  submitted: "bg-amber-100 text-amber-800",
  disbursed: "bg-indigo-100 text-indigo-800",
  defaulted: "bg-red-100 text-red-800",
  closed: "bg-gray-100 text-gray-800",
  claim_pending: "bg-orange-100 text-orange-800",
  paid: "bg-emerald-100 text-emerald-800",
  upcoming: "bg-blue-100 text-blue-800",
  overdue: "bg-red-100 text-red-800",
}

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const { t } = useI18n()
  const loan = mockLoan

  const formatCurrency = (amount: number, currency: string = "TJS") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount)
  }

  const repaymentProgress = ((loan.amounts.disbursed - loan.amounts.outstandingPrincipal) / loan.amounts.disbursed) * 100

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard/loans"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{resolvedParams.id}</h1>
              <Badge className={statusStyles[loan.status]} variant="secondary">
                {t.loans.statusActive}
              </Badge>
            </div>
            <p className="text-muted-foreground">{loan.borrower.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 bg-transparent">
            <Download className="h-4 w-4" />{t.common.export}
          </Button>
          <Button className="gap-2">
            <Edit className="h-4 w-4" />{t.common.edit}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t.loans.disbursedAmount}</p>
                <p className="text-2xl font-bold">{formatCurrency(loan.amounts.disbursed, loan.amounts.currency)}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-3"><DollarSign className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold">{formatCurrency(loan.amounts.totalOutstanding, loan.amounts.currency)}</p>
              </div>
              <div className="rounded-full bg-orange-500/10 p-3"><TrendingUp className="h-5 w-5 text-orange-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t.loans.guaranteeCoverage}</p>
                <p className="text-2xl font-bold">{loan.terms.guaranteeCoverage}%</p>
              </div>
              <div className="rounded-full bg-blue-500/10 p-3"><Shield className="h-5 w-5 text-blue-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Delinquency Days</p>
                <p className="text-2xl font-bold">{loan.delinquency.days}</p>
              </div>
              <div className={`rounded-full p-3 ${loan.delinquency.days > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                {loan.delinquency.days > 0
                  ? <AlertTriangle className="h-5 w-5 text-red-500" />
                  : <CheckCircle className="h-5 w-5 text-emerald-500" />}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Repayment Progress */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Repayment Progress</span>
            <span className="text-sm text-muted-foreground">{repaymentProgress.toFixed(1)}%</span>
          </div>
          <Progress value={repaymentProgress} className="h-3" />
          <div className="mt-2 flex justify-between text-sm text-muted-foreground">
            <span>Repaid: {formatCurrency(loan.amounts.totalRepaid, loan.amounts.currency)}</span>
            <span>Remaining: {formatCurrency(loan.amounts.outstandingPrincipal, loan.amounts.currency)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2"><FileText className="h-4 w-4" />{t.loans.tabBasicInfo}</TabsTrigger>
          <TabsTrigger value="schedule" className="gap-2"><Calendar className="h-4 w-4" />{t.loans.tabPaymentSchedule}</TabsTrigger>
          <TabsTrigger value="borrower" className="gap-2"><User className="h-4 w-4" />{t.loans.tabBorrowerInfo}</TabsTrigger>
        </TabsList>

        {/* Loan Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5" />Loan Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.product}</p>
                    <p className="font-medium">{loan.product}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.interestRate}</p>
                    <p className="font-medium">{loan.terms.interestRate}% p.a.</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.loanTerm}</p>
                    <p className="font-medium">{loan.terms.durationMonths} months</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.gracePeriod}</p>
                    <p className="font-medium">{loan.terms.gracePeriodMonths} months</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.repaymentFrequency}</p>
                    <p className="font-medium">{loan.terms.frequency}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.guaranteeCoverage}</p>
                    <p className="font-medium">{loan.terms.guaranteeCoverage}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5" />Key Dates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.applicationDate}</p>
                    <p className="font-medium">{new Date(loan.dates.application).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Approval Date</p>
                    <p className="font-medium">{new Date(loan.dates.approval).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.disbursementDate}</p>
                    <p className="font-medium">{new Date(loan.dates.disbursement).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.maturityDate}</p>
                    <p className="font-medium">{new Date(loan.dates.maturity).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Payment</p>
                    <p className="font-medium">{new Date(loan.dates.lastPayment).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5" />Bank Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.bank}</p>
                    <p className="font-medium">{loan.bank.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.loans.branch}</p>
                    <p className="font-medium">{loan.bank.branch}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Loan Officer</p>
                    <p className="font-medium">{loan.bank.officer}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />{t.fees.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t.fees.upfrontFee}</p>
                    <p className="font-medium">{formatCurrency(loan.fees.upfrontFee, loan.amounts.currency)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Annual Fee</p>
                    <p className="font-medium">{formatCurrency(loan.fees.annualFee, loan.amounts.currency)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Payment Schedule Tab */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>{t.paymentSchedule.title}</CardTitle>
              <CardDescription>Amortization schedule with payment tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>{t.paymentSchedule.dueDate}</TableHead>
                      <TableHead className="text-right">{t.paymentSchedule.principalAmount}</TableHead>
                      <TableHead className="text-right">{t.paymentSchedule.interestAmount}</TableHead>
                      <TableHead className="text-right">{t.paymentSchedule.totalAmount}</TableHead>
                      <TableHead className="text-right">{t.paymentSchedule.outstandingPrincipal}</TableHead>
                      <TableHead>{t.common.status}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockPaymentSchedule.map((payment) => (
                      <TableRow key={payment.number} className={payment.status === "overdue" ? "bg-red-50" : ""}>
                        <TableCell className="font-medium">{payment.number}</TableCell>
                        <TableCell>{new Date(payment.date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.principal, loan.amounts.currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.interest, loan.amounts.currency)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(payment.total, loan.amounts.currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(payment.outstanding, loan.amounts.currency)}</TableCell>
                        <TableCell>
                          <Badge className={statusStyles[payment.status] || ""} variant="secondary">
                            {payment.status === "paid" && <CheckCircle className="mr-1 h-3 w-3" />}
                            {payment.status === "upcoming" && <Clock className="mr-1 h-3 w-3" />}
                            {payment.status === "overdue" && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Borrower Tab */}
        <TabsContent value="borrower" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Building2 className="h-5 w-5" />Company Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Company Name</p>
                    <p className="font-medium">{loan.borrower.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.tinNumber}</p>
                    <p className="font-medium">{loan.borrower.tin}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.registrationNumber}</p>
                    <p className="font-medium">{loan.borrower.registrationNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.legalType}</p>
                    <p className="font-medium">{loan.borrower.legalEntityType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.sector}</p>
                    <p className="font-medium">{loan.borrower.sector}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.employeeCount}</p>
                    <p className="font-medium">{loan.borrower.workforce}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" />Legal Representative
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="font-medium">{loan.borrower.representative.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.gender}</p>
                    <p className="font-medium">{loan.borrower.representative.gender}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.dateOfBirth}</p>
                    <p className="font-medium">{new Date(loan.borrower.representative.birthdate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.tinNumber}</p>
                    <p className="font-medium">{loan.borrower.representative.tin}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Street Address</p>
                    <p className="font-medium">{loan.borrower.address}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.city}</p>
                    <p className="font-medium">{loan.borrower.city}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.district}</p>
                    <p className="font-medium">{loan.borrower.district}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t.borrowers.zipCode}</p>
                    <p className="font-medium">{loan.borrower.zipCode}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
