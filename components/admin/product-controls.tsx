'use client'

import { useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { usePermissions } from '@/lib/contexts/permission-context'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { createClient } from '@/lib/supabase/client'
import { BANK_DIRECTORY_COPY } from '@/lib/admin/bank-directory'
import { canAdministerProducts, PRODUCT_COLUMNS, PRODUCT_COPY, type ProductRecord } from '@/lib/admin/product-administration'
import { getLocalizedName } from '@/lib/utils/localized-name'
import { ProductEditor } from '@/components/admin/product-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export function ProductControls() {
  const { locale } = useI18n()
  const common = BANK_DIRECTORY_COPY[locale]
  const copy = PRODUCT_COPY[locale]
  const { profile, role } = usePermissions()
  const allowed = canAdministerProducts(profile, role)
  const inFlight = useRef<Promise<ProductRecord[]> | null>(null)
  const [refreshBlocked, setRefreshBlocked] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const loadProducts = async (): Promise<ProductRecord[]> => {
    const { data, error } = await createClient().from('loan_products').select(PRODUCT_COLUMNS).order('code')
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Product read was not confirmed')
    return data as ProductRecord[]
  }
  const { data, error, isLoading, mutate } = usePageQuery(allowed ? ['product-administration'] : null, loadProducts)
  const refresh = (): Promise<ProductRecord[]> => {
    if (inFlight.current) return inFlight.current
    setRefreshing(true)
    const request = (async () => {
      try {
        const rows = await mutate(loadProducts(), { revalidate: false, throwOnError: true })
        if (!Array.isArray(rows)) throw new Error('Product refresh was not confirmed')
        setRefreshBlocked(false)
        return rows
      } catch (failure) { setRefreshBlocked(true); throw failure }
      finally { inFlight.current = null; setRefreshing(false) }
    })()
    inFlight.current = request
    return request
  }
  const available = allowed && Array.isArray(data) && !error && !refreshBlocked
  if (!allowed) return null
  return <Card>
    <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{copy.title}</CardTitle><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={isLoading || refreshing} onClick={() => void refresh().catch(() => {})}>{common.refresh}</Button><ProductEditor available={available} refreshing={refreshing} refresh={refresh} /></div></div><CardDescription>{copy.description}</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">{copy.effect}</p>
      <Alert><AlertDescription>{copy.fees}</AlertDescription></Alert>
      {(error || refreshBlocked) && <Alert variant="destructive" role="alert"><AlertDescription>{copy.loadFailed}</AlertDescription></Alert>}
      {isLoading ? <p role="status">{common.refresh}</p> : data && <Table>
        <TableHeader><TableRow><TableHead>{common.code}</TableHead><TableHead>{common.name_en}</TableHead><TableHead>{copy.coverage}</TableHead><TableHead>{common.status}</TableHead><TableHead>{common.actions}</TableHead></TableRow></TableHeader>
        <TableBody>{data.length === 0 ? <TableRow><TableCell colSpan={5}>{copy.empty}</TableCell></TableRow> : data.map(product => <TableRow key={product.id}>
          <TableCell className="font-mono">{product.code}</TableCell><TableCell>{getLocalizedName(product, locale)}</TableCell><TableCell>{product.guarantee_coverage ?? '—'}</TableCell><TableCell><Badge variant={product.is_active ? 'default' : 'secondary'}>{product.is_active ? common.active : common.inactive}</Badge></TableCell><TableCell><ProductEditor record={product} available={available} refreshing={refreshing} refresh={refresh} /></TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent>
  </Card>
}
