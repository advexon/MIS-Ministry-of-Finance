'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { getLocalizedName } from '@/lib/utils/localized-name'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, MapPin, TrendingUp, Search, ChevronRight, Eye } from 'lucide-react'
import Link from 'next/link'
import { BankDirectoryEditor } from '@/components/admin/bank-directory-editor'

interface Bank {
  id: string
  code: string
  name_en: string
  name_ru?: string
  name_tj?: string
  is_active: boolean
  created_at: string
  updated_at?: string
  loan_count?: number
  active_loan_count?: number
  total_disbursed?: number
  outstanding_portfolio?: number
}

function BankSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableCell key={i}><Skeleton className="h-5 w-full" /></TableCell>
      ))}
    </TableRow>
  )
}

export default function BanksPage() {
  const uiText = useUiTranslation()

  const { t, locale } = useI18n()
  const supabase = createClient()

  const [search, setSearch] = useState('')

  // Helper to get localized bank name
  const getBankName = (bank: Bank) => getLocalizedName(bank, locale)

  const { data: banks = [], isLoading, isValidating, mutate } = usePageQuery<Bank[]>(['banks'], async () => {
    const { data, error } = await supabase.from('banks').select('*').order('name_en')
    if (!error) return data ?? []
    // Preserve the existing unordered fallback for servers without ordering support.
    const { data: simple, error: fallbackError } = await supabase.from('banks').select('*')
    if (fallbackError) throw fallbackError
    return simple ?? []
  })
  const loading = isLoading || isValidating

  const filtered = banks.filter(b => {
    const name = getBankName(b)
    return name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase())
  })

  const totalBanks = banks.length
  const activeBanks = banks.filter(b => b.is_active).length

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{uiText(t.banks.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("Partner financial institutions in the PRSF programme")}</p>
        </div>
        <BankDirectoryEditor onSaved={async () => { await mutate() }} />
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3"><Building2 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Partner Banks")}</p>
              <p className="text-2xl font-bold">{loading ? '...' : totalBanks}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Active")}</p>
              <p className="text-2xl font-bold">{loading ? '...' : activeBanks}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-blue-500/10 p-3"><MapPin className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{uiText("On Probation")}</p>
              <p className="text-2xl font-bold">{loading ? '...' : totalBanks - activeBanks}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-amber-500/10 p-3"><Eye className="h-5 w-5 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Under Review")}</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" aria-label={`${t.common.search}: ${t.nav.banks}`} placeholder={uiText("Search banks...")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold">{t.banks.bankCode}</TableHead>
                  <TableHead className="font-semibold">{t.banks.bankName}</TableHead>
                  <TableHead className="text-center font-semibold">{uiText(t.common.status)}</TableHead>
                  <TableHead className="w-10"><span className="sr-only">{t.common.actions}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <BankSkeleton key={i} />)
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                      {search ? uiText("No banks match your search") : uiText("No banks added yet")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(bank => (
                    <TableRow key={bank.id} className="group">
                      <TableCell className="font-mono text-sm font-semibold text-primary">{bank.code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                            {bank.code?.charAt(0) || getBankName(bank).charAt(0)}
                          </div>
                          <span className="font-medium">{getBankName(bank)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className={bank.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}>
                          {bank.is_active ? uiText("Active") : uiText("Inactive")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link href={`/dashboard/banks/${bank.id}`} aria-label={`${t.common.view}: ${getBankName(bank)}`}>
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
