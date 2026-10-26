'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { one } from '@/lib/utils/supabase-relation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { RecoveryForm, RECOVERY_METHODS as METHOD_LABELS } from '@/components/admin/recovery-form'
import { usePermissions } from '@/lib/contexts/permission-context'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, TrendingUp, Download, RefreshCw, DollarSign } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { toCSV, downloadCSV } from '@/lib/utils/export'
import type { Bank } from '@/lib/types/database'

interface Recovery {
  id: string
  claim_id: string
  recovery_amount: number
  currency: string | null
  bank_share: number | null
  documented_costs: number | null
  payment_reference: string | null
  policy_revision: number | null
  prsf_share: number
  recovery_date: string
  recovery_method: string
  notes: string | null
  created_at: string
  claims?: {
    claim_number: string
    claim_amount: number
    bank_id: string
    banks?: { name_en: string; code: string }
    loan_applications?: { loan_number: string | null }
  }
}

interface RecoveryClaimOption {
  id: string
  claim_number: string
  bank_id: string
  loan_id: string
  loan_application_id: string | null
  banks: { name_en: string } | null
  loan_application: { currency: string } | null
}

const fmt = (value: number, currency: string | null) => currency
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value)
  : `${value.toLocaleString()} (currency unreconciled)`

export default function RecoveriesPage() {
  const uiText = useUiTranslation()

  const supabase = createClient()
  const { toast } = useToast()
  const { role } = usePermissions()
  const canRecord = ['super_admin', 'prsf_admin', 'accountant'].includes(role?.code ?? '')

  const [search, setSearch] = useState('')
  const [bankFilter, setBankFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedClaimId, setSelectedClaimId] = useState('')

  const { data: recoveries = [], isLoading, isValidating, mutate } = usePageQuery<Recovery[]>(['recoveries'], async () => {
    const { data, error } = await supabase
      .from('recoveries')
      .select(`*, claims(claim_number, claim_amount, bank_id, banks(name_en, code), loan_applications!loan_application_id(loan_number))`)
      .order('recovery_date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((recovery) => {
      const claim = one(recovery.claims)
      return {
        ...recovery,
        claims: claim ? { ...claim, banks: one(claim.banks) ?? undefined, loan_applications: one(claim.loan_applications) ?? undefined } : undefined,
      }
    })
  })
  const loading = isLoading || isValidating
  const fetchRecoveries = () => mutate()

  const { data: banks = [] } = usePageQuery<Pick<Bank, 'id' | 'name_en' | 'code'>[]>(['recovery-bank-options'], async () => {
    const { data, error } = await supabase.from('banks').select('id, name_en, code').order('name_en')
    if (error) throw error
    return data ?? []
  })
  const { data: claims = [] } = usePageQuery<RecoveryClaimOption[]>(['paid-claim-options'], async () => {
    // recoveries.loan_id is required and comes from the selected paid claim.
    const { data, error } = await supabase.from('claims').select('id, claim_number, bank_id, loan_id, loan_application_id, banks(name_en), loan_application:loan_applications!loan_application_id(currency)').eq('status', 'paid').order('claim_number')
    if (error) throw error
    return (data ?? []).map((claim) => ({ ...claim, banks: one(claim.banks), loan_application: one(claim.loan_application) }))
  })

  const selectedClaim = claims.find((claim) => claim.id === selectedClaimId)

  const filtered = recoveries.filter(r => {
    const matchSearch = !search ||
      r.claims?.claim_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.claims?.loan_applications?.loan_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.claims?.banks?.name_en?.toLowerCase().includes(search.toLowerCase())
    const matchBank = bankFilter === 'all' || r.claims?.bank_id === bankFilter
    const matchMethod = methodFilter === 'all' || r.recovery_method === methodFilter
    return matchSearch && matchBank && matchMethod
  })

  const currencies = [...new Set(filtered.map((receipt) => receipt.currency))]
  const totalRecovered = currencies.map((currency) => fmt(filtered.filter((receipt) => receipt.currency === currency).reduce((sum, receipt) => sum + receipt.recovery_amount, 0), currency)).join(' · ') || 'No recoveries'
  const totalPrsfShare = currencies.map((currency) => fmt(filtered.filter((receipt) => receipt.currency === currency).reduce((sum, receipt) => sum + (receipt.prsf_share ?? 0), 0), currency)).join(' · ') || 'No recoveries'

  const exportCSV = () => {
    const headers = ['Date', 'Claim #', 'Loan #', 'Bank', 'Recovery Amount', 'PRSF Share', 'Method', 'Notes', 'Currency', 'Bank Share', 'Documented Costs', 'Reference', 'Policy Revision']
    const rows = filtered.map(r => [
      r.recovery_date,
      r.claims?.claim_number || '',
          r.claims?.loan_applications?.loan_number || '',
      r.claims?.banks?.name_en || '',
      r.recovery_amount,
      r.prsf_share,
      METHOD_LABELS[r.recovery_method] || r.recovery_method,
      r.notes || '',
      r.currency ?? '', r.bank_share ?? '', r.documented_costs ?? '', r.payment_reference ?? '', r.policy_revision ?? '',
    ])
    downloadCSV(toCSV(headers, rows), `recoveries-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{uiText("Recovery Tracking")}</h1>
            <p className="text-sm text-muted-foreground">{uiText("Track post-claim repayments and recoveries from borrowers")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={fetchRecoveries}>
            <RefreshCw className="h-3.5 w-3.5" />{uiText("Refresh")}</Button>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />{uiText("Export CSV")}</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            {canRecord && <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />{uiText("Record Recovery")}</Button>
            </DialogTrigger>}
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{uiText("Record Post-Claim Recovery")}</DialogTitle>
                <DialogDescription>{uiText("Enter the details of a recovered amount from a paid claim.")}</DialogDescription>
              </DialogHeader>
              <Field><FieldLabel htmlFor="recovery-claim">{uiText("Related paid claim")}</FieldLabel><Select value={selectedClaimId} onValueChange={setSelectedClaimId}><SelectTrigger id="recovery-claim"><SelectValue placeholder={uiText("Select paid claim…")} /></SelectTrigger><SelectContent><SelectGroup>{claims.length === 0 && <SelectItem value="_none" disabled>{uiText("No paid claims found")}</SelectItem>}{claims.map((claim) => <SelectItem key={claim.id} value={claim.id}>{claim.claim_number} — {claim.banks?.name_en}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              {selectedClaim && <RecoveryForm key={selectedClaim.id} claim={selectedClaim} onRecorded={async (receipt) => {
                setDialogOpen(false)
                toast({ title: 'Recovery recorded', description: `Fund ${receipt.prsf_share} ${receipt.currency}; bank ${receipt.bank_share} ${receipt.currency}; policy ${receipt.policy_revision}.` })
                try { await fetchRecoveries() } catch { toast({ title: 'Recovery saved; list refresh failed', description: 'Refresh the page. Do not submit another recovery.', variant: 'destructive' }) }
              }} />}
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{uiText("Cancel")}</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-xl bg-emerald-500/10 p-3"><DollarSign className="h-5 w-5 text-emerald-600" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Total Recovered")}</p>
              <p className="text-xl font-bold">{totalRecovered}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-xl bg-primary/10 p-3"><TrendingUp className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{uiText("PRSF Share")}</p>
              <p className="text-xl font-bold">{totalPrsfShare}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-xl bg-blue-500/10 p-3"><Search className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{uiText("Recovery Events")}</p>
              <p className="text-xl font-bold">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 h-9 text-sm" placeholder={uiText("Search by claim, loan, or bank...")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={bankFilter} onValueChange={setBankFilter}>
          <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder={uiText("All Banks")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{uiText("All Banks")}</SelectItem>
            {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder={uiText("All Methods")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{uiText("All Methods")}</SelectItem>
            {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold">{uiText("Recovery Date")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Claim #")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Loan #")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Bank")}</TableHead>
                  <TableHead className="text-right font-semibold">{uiText("Recovery Amt")}</TableHead>
                  <TableHead className="text-right font-semibold">{uiText("PRSF Share")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Method")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Notes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4" /></TableCell>)}</TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <TrendingUp className="h-8 w-8 opacity-30" />
                        <p className="text-sm">{search || bankFilter !== 'all' ? uiText("No recoveries match your filters") : uiText("No recoveries recorded yet")}</p>
                        {canRecord && !search && bankFilter === 'all' && (
                          <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setDialogOpen(true)}>
                            <Plus className="h-3.5 w-3.5" />{uiText("Record First Recovery")}</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(rec => (
                    <TableRow key={rec.id} className="text-sm">
                      <TableCell className="whitespace-nowrap font-medium">
                        {new Date(rec.recovery_date).toLocaleDateString('en-GB')}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {rec.claims?.claim_number || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {rec.claims?.loan_applications?.loan_number || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">{rec.claims?.banks?.code}</span>
                          <span>{rec.claims?.banks?.name_en}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">{fmt(rec.recovery_amount, rec.currency)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(rec.prsf_share ?? 0, rec.currency)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {METHOD_LABELS[rec.recovery_method] || rec.recovery_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-56 text-sm text-muted-foreground"><div className="flex flex-col gap-1"><span>{rec.notes || '—'}</span>{rec.policy_revision ? <><span>{uiText("Policy")} {rec.policy_revision} {uiText("· reference")} {rec.payment_reference}</span><span>{uiText("Bank:")} {fmt(rec.bank_share ?? 0, rec.currency)} {uiText("· costs:")} {fmt(rec.documented_costs ?? 0, rec.currency)}</span></> : <span>{uiText("Legacy receipt · reconciliation required")}</span>}</div></TableCell>
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
