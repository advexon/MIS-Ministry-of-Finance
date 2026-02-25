"use client"

import { useState, useEffect, useCallback } from "react"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Users,
  Building2,
  UserCheck,
  Loader2,
  RefreshCw,
} from "lucide-react"
import type { Borrower } from "@/lib/types/database"

const PAGE_SIZE = 20

export default function BorrowersPage() {
  const { t } = useI18n()
  const supabase = createClient()

  const [borrowers, setBorrowers] = useState<Borrower[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")

  // Summary stats
  const [totalCount, setTotalCount] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [entityCount, setEntityCount] = useState(0)

  const fetchBorrowers = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from("borrowers")
      .select("*, sector:sectors(name_en)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search.trim()) {
      query = query.or(
        `tin_number.ilike.%${search}%,name.ilike.%${search}%`
      )
    }

    const { data, count, error } = await query
    if (error) console.error("Error fetching borrowers:", error)
    if (data) setBorrowers(data)
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search, supabase])

  useEffect(() => {
    // Fetch summary stats once
    supabase
      .from("borrowers")
      .select("id, legal_type", { count: "exact" })
      .then(({ data, count }) => {
        setTotalCount(count ?? 0)
        if (data) {
          setActiveCount(count ?? 0)
          setEntityCount(data.filter((b) => b.legal_type === "legal_entity").length)
        }
      })
  }, [supabase])

  useEffect(() => {
    fetchBorrowers()
  }, [fetchBorrowers])

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "TJS",
      minimumFractionDigits: 0,
    }).format(val)

  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      individual: t.borrowers.individual,
      legal_entity: t.borrowers.legalEntity,
      individual_entrepreneur: t.borrowers.individualEntrepreneur,
    }
    return map[type] || type
  }

  const getBorrowerName = (b: Borrower) => b.name || "—"

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.borrowers.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage borrower profiles and their loan history
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={fetchBorrowers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t.borrowers.newBorrower}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Borrowers</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3">
              <UserCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Not Blacklisted</p>
              <p className="text-2xl font-bold">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-blue-500/10 p-3">
              <Building2 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Legal Entities</p>
              <p className="text-2xl font-bold">{entityCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or TIN number..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(0)
              }}
              className="pl-9"
            />
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
                  <TableHead className="font-semibold">{t.common.status}</TableHead>
                  <TableHead className="text-right font-semibold">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : borrowers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No borrowers found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  borrowers.map((b) => (
                    <TableRow key={b.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{getBorrowerName(b)}</p>
                          {b.registration_number && (
                            <p className="text-xs text-muted-foreground">
                              Reg: {b.registration_number}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{b.tin_number || "—"}</TableCell>
                      <TableCell className="text-sm">{getTypeLabel(b.legal_type)}</TableCell>
                      <TableCell className="text-sm">
                        {(b.sector as { name_en: string } | null)?.name_en || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{b.city || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
                          Active
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-xs">
                              <Eye className="mr-2 h-4 w-4" />
                              {t.common.view}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-xs">
                              <Edit className="mr-2 h-4 w-4" />
                              {t.common.edit}
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
        <p>
          Showing {total === 0 ? 0 : page * PAGE_SIZE + 1}–
          {Math.min((page + 1) * PAGE_SIZE, total)} of {total} borrowers
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
