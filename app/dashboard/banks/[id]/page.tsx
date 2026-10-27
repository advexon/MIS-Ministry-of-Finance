'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useParams, useRouter } from 'next/navigation'
import type { LoanApplication, Claim, Fee } from '@/lib/types/database'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { BANK_DIRECTORY_COPY, type BankDirectoryRecord } from '@/lib/admin/bank-directory'
import { BankDirectoryEditor } from '@/components/admin/bank-directory-editor'
import { BankBranches } from '@/components/admin/bank-branches'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { getLocalizedName } from '@/lib/utils/localized-name'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Building2, FileText, DollarSign, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

type BankDetail = BankDirectoryRecord
type BankLoan = Pick<LoanApplication, 'id' | 'loan_number' | 'approved_amount' | 'disbursed_amount' | 'disbursement_date'> & {
  status: string | null
}
type BankClaim = Pick<Claim, 'id' | 'claim_number' | 'claim_amount'> & {
  status: string | null
  created_at: string | null
}
type BankFee = Pick<Fee, 'id'> & {
  fee_type: string
  amount: number
  status: string | null
  due_date: string
}

const bankTextFields = [
  { label: 'Bank Code', field: 'code' },
  { label: 'Bank Name (English)', field: 'name_en' },
  { label: 'Bank Name (Russian)', field: 'name_ru' },
  { label: 'Bank Name (Tajik)', field: 'name_tj' },
] as const satisfies readonly { label: string; field: keyof BankDetail }[]

export default function BankDetailPage() {
  const uiText = useUiTranslation()

  const { id } = useParams<{ id: string }>()
  const { locale, t } = useI18n()
  const supabase = createClient()
  const router = useRouter()
  const copy = BANK_DIRECTORY_COPY[locale]
  const { data, error, isLoading: loading, isValidating, mutate } = usePageQuery(['bank-detail', id], async () => {
    const [bankResult, loanResult, claimResult, feeResult] = await Promise.all([
      supabase.from('banks').select('id, code, name_en, name_ru, name_tj, is_active, administration_revision').eq('id', id).single().overrideTypes<BankDetail, { merge: false }>(),
      supabase.from('loan_applications').select('id, loan_number, status, approved_amount, disbursed_amount, disbursement_date').eq('bank_id', id).order('created_at', { ascending: false }).limit(20).overrideTypes<BankLoan[], { merge: false }>(),
      supabase.from('claims').select('id, claim_number, status, claim_amount, created_at').eq('bank_id', id).order('created_at', { ascending: false }).limit(10).overrideTypes<BankClaim[], { merge: false }>(),
      supabase.from('fees').select('id, fee_type, amount, status, due_date').eq('bank_id', id).order('due_date', { ascending: false }).limit(10).overrideTypes<BankFee[], { merge: false }>(),
    ])
    for (const result of [bankResult, loanResult, claimResult, feeResult]) if (result.error) throw result.error
    return { bank: bankResult.data, loans: loanResult.data ?? [], claims: claimResult.data ?? [], fees: feeResult.data ?? [] }
  })
  const bank = data?.bank
  const loans = data?.loans ?? []
  const claims = data?.claims ?? []
  const fees = data?.fees ?? []

  const getBankName = (b: BankDetail) => getLocalizedName(b, locale)

  const fmt = (v: number | null) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v || 0)
  const totalDisbursed = loans.reduce((s, l) => s + (l.approved_amount || 0), 0)
  const totalOutstanding = loans.reduce((s, l) => s + (l.disbursed_amount || 0), 0)
  const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'disbursed').length

  if (loading) return (
    <div className="p-6 lg:p-8 space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  )

  if (error || !bank) return (
    <div className="flex flex-col gap-4 p-6 lg:p-8"><Alert variant="destructive"><AlertDescription>{copy.loadFailed}</AlertDescription></Alert><Button variant="outline" onClick={() => void mutate().catch(() => {})}>{copy.refresh}</Button></div>
  )

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/dashboard/banks" aria-label={`${t.common.back}: ${t.nav.banks}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
        </Button>
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
            {bank.code?.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{bank.code}</h1>
            <p className="text-sm text-muted-foreground">{getBankName(bank)}</p>
          </div>
          <Badge className={bank.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}>
            {bank.is_active ? uiText("Active") : uiText("Inactive")}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isValidating} onClick={() => void mutate().catch(() => {})}>{copy.refresh}</Button>
          <BankDirectoryEditor record={bank} onSaved={async next => { if (!next) router.push('/dashboard/banks'); else await mutate(current => current ? { ...current, bank: next } : current) }} />
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{uiText("Total Loans")}</p>
            <p className="mt-1 text-2xl font-bold">{loans.length}</p>
            <p className="text-xs text-muted-foreground">{activeLoans} {uiText("active")}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{uiText("Total Approved")}</p>
            <p className="mt-1 text-xl font-bold">{fmt(totalDisbursed)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{uiText("Outstanding")}</p>
            <p className="mt-1 text-xl font-bold">{fmt(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{uiText("Claims Filed")}</p>
            <p className="mt-1 text-2xl font-bold">{claims.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="mb-4 h-auto flex-wrap justify-start">
          <TabsTrigger value="info" className="gap-2"><Building2 className="h-4 w-4" />{uiText("Info")}</TabsTrigger>
          <TabsTrigger value="branches">{copy.branches}</TabsTrigger>
          <TabsTrigger value="loans" className="gap-2"><FileText className="h-4 w-4" />{uiText("Loans (")}{loans.length})</TabsTrigger>
          <TabsTrigger value="claims" className="gap-2"><AlertTriangle className="h-4 w-4" />{uiText("Claims (")}{claims.length})</TabsTrigger>
          <TabsTrigger value="fees" className="gap-2"><DollarSign className="h-4 w-4" />{uiText("Fees (")}{fees.length})</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">{uiText("Bank Information")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {bankTextFields.map(({ label, field }) => (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={`bank-${field}`}>{uiText(label)}</Label>
                    <Input
                      id={`bank-${field}`}
                      value={bank[field] || ''}
                      readOnly
                      className="bg-secondary/30 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{uiText("Active Status")}</p>
                  <p className="text-xs text-muted-foreground">{uiText("Enable or disable this bank in the system")}</p>
                </div>
                <Badge variant={bank.is_active ? 'default' : 'secondary'}>{bank.is_active ? copy.active : copy.inactive}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches"><BankBranches bankId={id} /></TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">{uiText("Application #")}</TableHead>
                    <TableHead className="font-semibold">{uiText("Status")}</TableHead>
                    <TableHead className="text-right font-semibold">{uiText("Approved Amt")}</TableHead>
                    <TableHead className="text-right font-semibold">{uiText("Outstanding")}</TableHead>
                    <TableHead className="font-semibold">{uiText("Disbursed")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">{uiText("No loans found")}</TableCell></TableRow>
                  ) : loans.map(loan => (
                    <TableRow key={loan.id} className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-semibold">
                        <Link href={`/dashboard/loans/${loan.id}`} className="text-primary hover:underline">{loan.loan_number || loan.id.slice(0, 8)}</Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs capitalize">{loan.status?.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmt(loan.approved_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(loan.disbursed_amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {loan.disbursement_date ? new Date(loan.disbursement_date).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Claims Tab */}
        <TabsContent value="claims">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">{uiText("Claim #")}</TableHead>
                    <TableHead className="font-semibold">{uiText("Status")}</TableHead>
                    <TableHead className="text-right font-semibold">{uiText("Claim Amount")}</TableHead>
                    <TableHead className="font-semibold">{uiText("Filed")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">{uiText("No claims filed")}</TableCell></TableRow>
                  ) : claims.map(claim => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-mono text-sm font-semibold text-primary">{claim.claim_number}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs capitalize">{uiText(claim.status)}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{fmt(claim.claim_amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{claim.created_at ? new Date(claim.created_at).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fees Tab */}
        <TabsContent value="fees">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">{uiText("Fee Type")}</TableHead>
                    <TableHead className="font-semibold">{uiText("Status")}</TableHead>
                    <TableHead className="text-right font-semibold">{uiText("Amount")}</TableHead>
                    <TableHead className="font-semibold">{uiText("Due Date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">{uiText("No fees found")}</TableCell></TableRow>
                  ) : fees.map(fee => (
                    <TableRow key={fee.id}>
                      <TableCell className="text-sm capitalize">{fee.fee_type?.replace('_', ' ')}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs capitalize">{uiText(fee.status)}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{fmt(fee.amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fee.due_date ? new Date(fee.due_date).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
