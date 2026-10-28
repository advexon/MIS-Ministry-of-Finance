"use client"

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useRef, useState } from "react"
import { BorrowerEditor } from '@/components/borrowers/borrower-editor'
import { BORROWER_COPY, borrowerSearchFilter, canAdministerBorrowers, type BorrowerDirectoryRecord } from '@/lib/admin/borrower-administration'
import { BANK_DIRECTORY_COPY } from '@/lib/admin/bank-directory'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { usePageQuery } from "@/lib/hooks/use-page-query"
import Link from "next/link"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { one } from "@/lib/utils/supabase-relation"
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
  DropdownMenuGroup,
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
  RefreshCw,
} from "lucide-react"
import type { Borrower } from "@/lib/types/database"
import { usePermissions } from "@/lib/contexts/permission-context"
import { canViewBorrowerCreditHistory } from "@/lib/utils/borrower-credit-history"
import { CreditHistoryDialog } from "@/components/borrowers/credit-history-dialog"

const PAGE_SIZE = 20

export default function BorrowersPage() {
  const uiText = useUiTranslation()

  const { t, locale } = useI18n()
  const copy = BORROWER_COPY[locale]
  const common = BANK_DIRECTORY_COPY[locale]
  const supabase = createClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const [historyBorrower, setHistoryBorrower] = useState<Borrower | null>(null)
  const [editingBorrower, setEditingBorrower] = useState<BorrowerDirectoryRecord | null>(null)
  const [refreshBlocked, setRefreshBlocked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const inFlight = useRef<Promise<{ borrowers: BorrowerDirectoryRecord[]; total: number }> | null>(null)
  const { profile, role, can } = usePermissions()
  const canViewHistory = canViewBorrowerCreditHistory(profile, role)
  const allowed = canAdministerBorrowers(profile, role)
  const loadBorrowers = async () => {
    let query = supabase.from("borrowers")
      .select(allowed ? "*, sector:sectors(name_en), applications:loan_applications(count)" : "*, sector:sectors(name_en)", { count: "exact" })
      .order("created_at", { ascending: false }).order("id")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (search.trim()) query = query.or(borrowerSearchFilter(search))
    const { data, count, error: queryError } = await query
    if (queryError) throw queryError
    if (!Array.isArray(data) || count === null) throw new Error('Borrower read was not confirmed')
    return { borrowers: data as unknown as BorrowerDirectoryRecord[], total: count }
  }
  const { data: result, error, isLoading, isValidating, mutate } = usePageQuery(["borrowers", page, search, allowed], loadBorrowers)
  const loadSummary = async () => {
    const [all, entities] = await Promise.all([
      supabase.from('borrowers').select('id', { count: 'exact', head: true }),
      supabase.from('borrowers').select('id', { count: 'exact', head: true }).in('legal_type', ['llc', 'jsc']),
    ])
    if (all.error || entities.error) throw all.error || entities.error
    if (all.count === null || entities.count === null) throw new Error('Borrower summary was not confirmed')
    return { totalCount: all.count, entityCount: entities.count }
  }
  const { data: summary, error: summaryError, mutate: mutateSummary } = usePageQuery(["borrower-summary"], loadSummary)
  const refresh = (): Promise<{ borrowers: BorrowerDirectoryRecord[]; total: number }> => {
    if (inFlight.current) return inFlight.current
    setRefreshing(true)
    const request = (async () => {
      try {
        const [rows] = await Promise.all([
          mutate(loadBorrowers(), { revalidate: false, throwOnError: true }),
          mutateSummary(loadSummary(), { revalidate: false, throwOnError: true }),
        ])
        if (!rows || !Array.isArray(rows.borrowers)) throw new Error('Borrower refresh was not confirmed')
        setRefreshBlocked(false)
        return rows
      } catch (failure) { setRefreshBlocked(true); throw failure }
      finally { inFlight.current = null; setRefreshing(false) }
    })()
    inFlight.current = request
    return request
  }
  const borrowers = result?.borrowers ?? []
  const total = result?.total ?? 0
  const loading = isLoading && !result
  const unavailable = Boolean(error || summaryError || refreshBlocked || !result)
  const pending = refreshing || isValidating
  const totalCount = summary?.totalCount
  const entityCount = summary?.entityCount

  // Borrowers are stored using the database vocabulary (llc / sole_proprietor / ...),
  // so map those to labels as well as the legacy form values.
  const getTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      llc: t.borrowers.legalEntity,
      jsc: t.borrowers.legalEntity,
      legal_entity: t.borrowers.legalEntity,
      sole_proprietor: t.borrowers.individualEntrepreneur,
      individual_entrepreneur: t.borrowers.individualEntrepreneur,
      individual: t.borrowers.individual,
      cooperative: copy.cooperative,
      other: copy.other,
    }
    return map[type] || type
  }

  const getBorrowerName = (b: Borrower) => b.name || "—"

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{uiText(t.borrowers.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("Manage borrower profiles and their loan history")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label={common.refresh} onClick={() => void refresh().catch(() => {})} disabled={loading || pending}>
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          </Button>
          {can('loans', 'create') && <Button asChild className="gap-2">
            <Link href="/dashboard/loans/new">
              <Plus className="h-4 w-4" />
              {t.borrowers.newBorrower}
            </Link>
          </Button>}
        </div>
      </div>

      {(error || summaryError || refreshBlocked) && <Alert variant="destructive" className="mb-6"><AlertDescription>{copy.unavailable}</AlertDescription></Alert>}
      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{uiText("Total Borrowers")}</p>
              <p className="text-2xl font-bold">{totalCount ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{copy.matching}</p>
              <p className="text-2xl font-bold">{result ? total : '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{uiText("Legal Entities")}</p>
              <p className="text-2xl font-bold">{entityCount ?? '—'}</p>
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
              placeholder={uiText("Search by name or TIN number...")}
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
                  <TableHead className="font-semibold">{uiText("Name")}</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.tinNumber}</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.legalType}</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.sector}</TableHead>
                  <TableHead className="font-semibold">{t.borrowers.city}</TableHead>
                  <TableHead className="font-semibold">{uiText(t.common.status)}</TableHead>
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
                      <p className="text-muted-foreground">{unavailable ? copy.unavailable : uiText("No borrowers found")}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  borrowers.map((b) => (
                    <TableRow key={b.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{getBorrowerName(b)}</p>
                          {b.registration_number && (
                            <p className="text-xs text-muted-foreground">{uiText("Reg: ")}{b.registration_number}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{b.tin_number || "—"}</TableCell>
                      <TableCell className="text-sm">{getTypeLabel(b.legal_type)}</TableCell>
                      <TableCell className="text-sm">
                          {one<{ name_en: string }>(b.sector)?.name_en || "—"}
                      </TableCell>
                        <TableCell className="text-sm">{b.address_city || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{copy.registered}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`${t.common.actions}: ${b.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                            {canViewHistory && (
                              <DropdownMenuItem onSelect={() => setHistoryBorrower(b)}>
                                {t.borrowers.loanHistory}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem asChild className="text-xs">
                              <Link href={`/dashboard/loans?search=${encodeURIComponent(b.tin_number || b.name || "")}`} className="flex items-center">
                                <Eye className="mr-2 h-4 w-4" />
                                {t.common.view}
                              </Link>
                            </DropdownMenuItem>
                            {allowed && <DropdownMenuItem disabled={unavailable || pending} onSelect={() => setEditingBorrower(b)}>
                              <Edit className="mr-2 h-4 w-4" />
                              {copy.edit}
                            </DropdownMenuItem>}
                            </DropdownMenuGroup>
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

      {canViewHistory && historyBorrower && (
        <CreditHistoryDialog
          key={historyBorrower.id}
          borrower={historyBorrower}
          onClose={() => setHistoryBorrower(null)}
        />
      )}

      {editingBorrower && <BorrowerEditor key={editingBorrower.id} record={borrowers.find(item => item.id === editingBorrower.id) ?? editingBorrower} available={!unavailable} refreshing={pending} refresh={refresh} onClose={() => setEditingBorrower(null)} />}

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>{uiText("Showing ")}{total === 0 ? 0 : page * PAGE_SIZE + 1}–
          {Math.min((page + 1) * PAGE_SIZE, total)} {uiText("of")} {total}{uiText(" borrowers")}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => p - 1)}
          >{uiText("Previous")}</Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage((p) => p + 1)}
          >{uiText("Next")}</Button>
        </div>
      </div>
    </div>
  )
}
