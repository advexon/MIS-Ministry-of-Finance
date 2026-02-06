"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n/context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { DollarSign, Receipt, TrendingUp, Download } from "lucide-react"

const mockFees = [
  { id: "1", loanNumber: "LA-2026-0847", borrower: "Tajik Agricultural LLC", type: "upfront", amount: 2500, rate: 0.5, base: 500000, status: "paid", invoiceDate: "2025-01-15", paymentDate: "2025-01-20" },
  { id: "2", loanNumber: "LA-2026-0846", borrower: "Silk Road Trading Co", type: "upfront", amount: 1500, rate: 0.6, base: 250000, status: "paid", invoiceDate: "2025-02-01", paymentDate: "2025-02-05" },
  { id: "3", loanNumber: "LA-2026-0847", borrower: "Tajik Agricultural LLC", type: "quarterly", amount: 625, rate: 0.5, base: 500000, status: "paid", invoiceDate: "2025-04-01", paymentDate: "2025-04-10" },
  { id: "4", loanNumber: "LA-2026-0847", borrower: "Tajik Agricultural LLC", type: "quarterly", amount: 585, rate: 0.5, base: 468000, status: "invoiced", invoiceDate: "2025-07-01", paymentDate: null },
  { id: "5", loanNumber: "LA-2026-0843", borrower: "Mountain Textiles", type: "quarterly", amount: 188, rate: 0.5, base: 150000, status: "pending", invoiceDate: null, paymentDate: null },
  { id: "6", loanNumber: "LA-2026-0840", borrower: "Pamir Construction", type: "upfront", amount: 3100, rate: 0.5, base: 620000, status: "paid", invoiceDate: "2025-04-15", paymentDate: "2025-04-20" },
]

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  invoiced: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
}

export default function FeesPage() {
  const { t } = useI18n()

  const formatCurrency = (val: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "TJS", minimumFractionDigits: 0 }).format(val)

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = { pending: t.fees.statusPending, invoiced: t.fees.statusInvoiced, paid: t.fees.statusPaid }
    return map[status] || status
  }

  const totalCollected = mockFees.filter(f => f.status === "paid").reduce((s, f) => s + f.amount, 0)
  const totalPending = mockFees.filter(f => f.status !== "paid").reduce((s, f) => s + f.amount, 0)
  const upfrontFees = mockFees.filter(f => f.type === "upfront")
  const quarterlyFees = mockFees.filter(f => f.type === "quarterly")

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.fees.title}</h1>
          <p className="mt-1 text-muted-foreground">Track guarantee fees and commission payments</p>
        </div>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Download className="h-4 w-4" />{t.common.export}
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Collected</p>
              <p className="text-2xl font-bold">{formatCurrency(totalCollected)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-amber-500/10 p-3"><Receipt className="h-5 w-5 text-amber-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Collection</p>
              <p className="text-2xl font-bold">{formatCurrency(totalPending)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3"><TrendingUp className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Fee Income</p>
              <p className="text-2xl font-bold">{formatCurrency(totalCollected + totalPending)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">{t.common.all} ({mockFees.length})</TabsTrigger>
          <TabsTrigger value="upfront">{t.fees.upfrontFee} ({upfrontFees.length})</TabsTrigger>
          <TabsTrigger value="quarterly">{t.fees.quarterlyFee} ({quarterlyFees.length})</TabsTrigger>
        </TabsList>

        {["all", "upfront", "quarterly"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Loan</TableHead>
                        <TableHead className="font-semibold">{t.loans.borrower}</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="text-right font-semibold">{t.fees.baseAmount}</TableHead>
                        <TableHead className="text-right font-semibold">{t.fees.feeRate}</TableHead>
                        <TableHead className="text-right font-semibold">{t.fees.feeAmount}</TableHead>
                        <TableHead className="font-semibold">{t.fees.invoiceDate}</TableHead>
                        <TableHead className="font-semibold">{t.common.status}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tab === "all" ? mockFees : mockFees.filter(f => f.type === tab)).map((fee) => (
                        <TableRow key={fee.id}>
                          <TableCell className="font-medium text-primary">{fee.loanNumber}</TableCell>
                          <TableCell className="text-sm">{fee.borrower}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{fee.type === "upfront" ? t.fees.upfrontFee : t.fees.quarterlyFee}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(fee.base)}</TableCell>
                          <TableCell className="text-right text-sm">{fee.rate}%</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(fee.amount)}</TableCell>
                          <TableCell className="text-sm">{fee.invoiceDate ? new Date(fee.invoiceDate).toLocaleDateString() : "-"}</TableCell>
                          <TableCell>
                            <Badge className={statusStyles[fee.status]} variant="secondary">{getStatusLabel(fee.status)}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
