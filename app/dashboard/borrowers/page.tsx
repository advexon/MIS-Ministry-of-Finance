"use client"

import { useState } from "react"
import { useI18n } from "@/lib/i18n/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, Search, MoreHorizontal, Eye, Edit, Users, Building2, UserCheck } from "lucide-react"
import Link from "next/link"

const mockBorrowers = [
  { id: "1", name: "Tajik Agricultural LLC", tin: "123456789", type: "legal_entity", sector: "Agriculture", city: "Dushanbe", activeLoans: 2, totalBorrowed: 750000, status: "active" },
  { id: "2", name: "Silk Road Trading Co", tin: "987654321", type: "legal_entity", sector: "Trade", city: "Khujand", activeLoans: 1, totalBorrowed: 250000, status: "active" },
  { id: "3", name: "Mountain Textiles", tin: "456789123", type: "legal_entity", sector: "Manufacturing", city: "Kulyab", activeLoans: 1, totalBorrowed: 150000, status: "defaulted" },
  { id: "4", name: "Green Valley Farms", tin: "789123456", type: "individual_entrepreneur", sector: "Agriculture", city: "Dushanbe", activeLoans: 0, totalBorrowed: 300000, status: "active" },
  { id: "5", name: "Ahmadov Farrukh", tin: "321654987", type: "individual", sector: "Services", city: "Dushanbe", activeLoans: 1, totalBorrowed: 75000, status: "active" },
  { id: "6", name: "Pamir Construction LLC", tin: "654987321", type: "legal_entity", sector: "Construction", city: "Khorog", activeLoans: 1, totalBorrowed: 620000, status: "active" },
]

export default function BorrowersPage() {
  const { t } = useI18n()
  const [search, setSearch] = useState("")

  const filtered = mockBorrowers.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) || b.tin.includes(search)
  )

  const formatCurrency = (val: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "TJS", minimumFractionDigits: 0 }).format(val)

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = { individual: t.borrowers.individual, legal_entity: t.borrowers.legalEntity, individual_entrepreneur: t.borrowers.individualEntrepreneur }
    return map[type] || type
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.borrowers.title}</h1>
          <p className="mt-1 text-muted-foreground">Manage borrower profiles and their loan history</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" />{t.borrowers.newBorrower}</Button>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Total Borrowers</p>
              <p className="text-2xl font-bold">{mockBorrowers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3"><UserCheck className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Active Borrowers</p>
              <p className="text-2xl font-bold">{mockBorrowers.filter((b) => b.activeLoans > 0).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-blue-500/10 p-3"><Building2 className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Legal Entities</p>
              <p className="text-2xl font-bold">{mockBorrowers.filter((b) => b.type === "legal_entity").length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or TIN number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardContent>
      </Card>

      {/* Borrowers Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.tinNumber}</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.legalType}</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.sector}</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.city}</TableHead>
                  <TableHead className="text-right font-semibold">Active Loans</TableHead>
                  <TableHead className="text-right font-semibold">Total Borrowed</TableHead>
                  <TableHead className="font-semibold">{t.common.status}</TableHead>
                  <TableHead className="text-right font-semibold">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="font-mono text-sm">{b.tin}</TableCell>
                    <TableCell className="text-sm">{getTypeLabel(b.type)}</TableCell>
                    <TableCell className="text-sm">{b.sector}</TableCell>
                    <TableCell className="text-sm">{b.city}</TableCell>
                    <TableCell className="text-right">{b.activeLoans}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(b.totalBorrowed)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={b.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                        {b.status === "active" ? t.loans.statusActive : t.loans.statusDefaulted}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem><Eye className="mr-2 h-4 w-4" />{t.common.view}</DropdownMenuItem>
                          <DropdownMenuItem><Edit className="mr-2 h-4 w-4" />{t.common.edit}</DropdownMenuItem>
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
