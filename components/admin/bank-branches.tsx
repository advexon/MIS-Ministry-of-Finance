'use client'

import { useI18n } from '@/lib/i18n/context'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { createClient } from '@/lib/supabase/client'
import { BANK_DIRECTORY_COPY, type BankDirectoryRecord } from '@/lib/admin/bank-directory'
import { getLocalizedName } from '@/lib/utils/localized-name'
import { BankDirectoryEditor } from '@/components/admin/bank-directory-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export function BankBranches({ bankId }: { bankId: string }) {
  const { locale } = useI18n()
  const copy = BANK_DIRECTORY_COPY[locale]
  const { data, error, isLoading, isValidating, mutate } = usePageQuery<BankDirectoryRecord[]>(['bank-branches', bankId], async () => {
    const { data, error } = await createClient().from('bank_branches').select('id,bank_id,code,name_en,name_ru,name_tj,city,district,is_active,administration_revision').eq('bank_id', bankId).order('name_en')
    if (error) throw error
    return data ?? []
  })
  const refresh = async () => { await mutate() }
  return <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{copy.branches}</CardTitle><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={isValidating} onClick={() => void refresh().catch(() => {})}>{copy.refresh}</Button><BankDirectoryEditor bankId={bankId} onSaved={refresh} /></div></div><CardDescription>{copy.description}</CardDescription></CardHeader>
    <CardContent>
      {error && <Alert variant="destructive"><AlertDescription>{copy.loadFailed}</AlertDescription></Alert>}
      {isLoading ? <Skeleton className="h-24 w-full" /> : !error && <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>{copy.code}</TableHead><TableHead>{copy.branch}</TableHead><TableHead>{copy.city}</TableHead><TableHead>{copy.district}</TableHead><TableHead>{copy.status}</TableHead><TableHead>{copy.actions}</TableHead></TableRow></TableHeader>
        <TableBody>{!data?.length ? <TableRow><TableCell colSpan={6}>{copy.empty}</TableCell></TableRow> : data.map(branch => <TableRow key={branch.id}><TableCell className="font-mono">{branch.code}</TableCell><TableCell>{getLocalizedName(branch, locale)}</TableCell><TableCell>{branch.city || '—'}</TableCell><TableCell>{branch.district || '—'}</TableCell><TableCell><Badge variant={branch.is_active ? 'default' : 'secondary'}>{branch.is_active ? copy.active : copy.inactive}</Badge></TableCell><TableCell><BankDirectoryEditor record={branch} bankId={bankId} onSaved={refresh} /></TableCell></TableRow>)}</TableBody>
      </Table></div>}
    </CardContent>
  </Card>
}
