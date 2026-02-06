"use client"

import { useI18n } from "@/lib/i18n/context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Building2, Eye, MapPin, ChevronRight } from "lucide-react"
import Link from "next/link"

const mockBanks = [
  { id: "1", code: "AIB", name: "Agroinvestbank", branches: 12, activeBranches: 10, totalLoans: 187, activeLoans: 142, totalDisbursed: 42500000, outstandingPortfolio: 28700000, delinquencyRate: 3.2, isActive: true },
  { id: "2", code: "ESK", name: "Bank Eskhata", branches: 8, activeBranches: 7, totalLoans: 134, activeLoans: 96, totalDisbursed: 28750000, outstandingPortfolio: 19200000, delinquencyRate: 4.5, isActive: true },
  { id: "3", code: "SPT", name: "Spitamen Bank", branches: 10, activeBranches: 9, totalLoans: 156, activeLoans: 118, totalDisbursed: 35200000, outstandingPortfolio: 24100000, delinquencyRate: 2.8, isActive: true },
  { id: "4", code: "IMN", name: "IMON International", branches: 6, activeBranches: 6, totalLoans: 98, activeLoans: 78, totalDisbursed: 15300000, outstandingPortfolio: 10500000, delinquencyRate: 5.1, isActive: true },
  { id: "5", code: "AMN", name: "Amonatbonk", branches: 15, activeBranches: 12, totalLoans: 87, activeLoans: 62, totalDisbursed: 12800000, outstandingPortfolio: 8200000, delinquencyRate: 6.2, isActive: true },
  { id: "6", code: "FMF", name: "First MicroFinance", branches: 4, activeBranches: 4, totalLoans: 45, activeLoans: 32, totalDisbursed: 5200000, outstandingPortfolio: 3400000, delinquencyRate: 3.8, isActive: true },
]

export default function BanksPage() {
  const { t } = useI18n()

  const formatCurrency = (val: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "TJS", minimumFractionDigits: 0 }).format(val)

  const totalBranches = mockBanks.reduce((s, b) => s + b.branches, 0)
  const totalActiveLoans = mockBanks.reduce((s, b) => s + b.activeLoans, 0)
  const totalOutstanding = mockBanks.reduce((s, b) => s + b.outstandingPortfolio, 0)

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t.banks.title}</h1>
        <p className="mt-1 text-muted-foreground">Overview of all partner financial institutions in the PRSF program</p>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3"><Building2 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Partner Banks</p>
              <p className="text-2xl font-bold">{mockBanks.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-blue-500/10 p-3"><MapPin className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Branches</p>
              <p className="text-2xl font-bold">{totalBranches}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3"><Eye className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Active Loans</p>
              <p className="text-2xl font-bold">{totalActiveLoans}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Outstanding Portfolio</p>
            <p className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Banks Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">{t.banks.bankCode}</TableHead>
                  <TableHead className="font-semibold">{t.banks.bankName}</TableHead>
                  <TableHead className="text-right font-semibold">{t.banks.branches}</TableHead>
                  <TableHead className="text-right font-semibold">{t.banks.totalLoans}</TableHead>
                  <TableHead className="text-right font-semibold">{t.banks.activeLoans}</TableHead>
                  <TableHead className="text-right font-semibold">Total Disbursed</TableHead>
                  <TableHead className="text-right font-semibold">Outstanding</TableHead>
                  <TableHead className="text-right font-semibold">Delinquency</TableHead>
                  <TableHead className="font-semibold">{t.common.status}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockBanks.map((bank) => (
                  <TableRow key={bank.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-mono text-sm font-medium">{bank.code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{bank.code.charAt(0)}</div>
                        <span className="font-medium">{bank.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{bank.activeBranches}/{bank.branches}</TableCell>
                    <TableCell className="text-right">{bank.totalLoans}</TableCell>
                    <TableCell className="text-right font-medium">{bank.activeLoans}</TableCell>
                    <TableCell className="text-right">{formatCurrency(bank.totalDisbursed)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(bank.outstandingPortfolio)}</TableCell>
                    <TableCell className="text-right">
                      <span className={bank.delinquencyRate > 5 ? "font-medium text-red-600" : bank.delinquencyRate > 3 ? "text-amber-600" : "text-emerald-600"}>
                        {bank.delinquencyRate}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={bank.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-800"}>
                        {bank.isActive ? "Active" : "Inactive"}
                      </Badge>
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
