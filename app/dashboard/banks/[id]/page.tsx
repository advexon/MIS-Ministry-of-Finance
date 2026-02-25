'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Building2, Save, Edit2, FileText, DollarSign, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

export default function BankDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t } = useI18n()
  const supabase = createClient()
  const { toast } = useToast()
  const router = useRouter()

  const [bank, setBank] = useState<any>(null)
  const [loans, setLoans] = useState<any[]>([])
  const [claims, setClaims] = useState<any[]>([])
  const [fees, setFees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      const [{ data: bankData }, { data: loanData }, { data: claimData }, { data: feeData }] = await Promise.all([
        supabase.from('banks').select('*').eq('id', id).single(),
        supabase.from('loan_applications').select('id, application_number, status, approved_amount, outstanding_balance, disbursement_date').eq('bank_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('claims').select('id, claim_number, status, claim_amount, created_at').eq('bank_id', id).order('created_at', { ascending: false }).limit(10),
        supabase.from('fees').select('id, fee_type, amount, status, due_date').eq('bank_id', id).order('due_date', { ascending: false }).limit(10),
      ])
      if (bankData) { setBank(bankData); setForm(bankData) }
      setLoans(loanData || [])
      setClaims(claimData || [])
      setFees(feeData || [])
      setLoading(false)
    }
    fetchAll()
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('banks').update({
      name: form.name,
      contact_person: form.contact_person,
      email: form.email,
      phone: form.phone,
      address: form.address,
      is_active: form.is_active,
    }).eq('id', id)
    if (error) {
      toast({ title: 'Failed to update bank', variant: 'destructive' })
    } else {
      toast({ title: 'Bank updated successfully' })
      setBank(form)
      setEditing(false)
    }
    setSaving(false)
  }

  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v || 0)
  const totalDisbursed = loans.reduce((s, l) => s + (l.approved_amount || 0), 0)
  const totalOutstanding = loans.reduce((s, l) => s + (l.outstanding_balance || 0), 0)
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

  if (!bank) return (
    <div className="p-6 lg:p-8 text-center text-muted-foreground">Bank not found.</div>
  )

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/dashboard/banks"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
            {bank.code?.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{bank.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">{bank.code}</p>
          </div>
          <Badge className={bank.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}>
            {bank.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setForm(bank) }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setEditing(true)} className="gap-2 bg-transparent">
              <Edit2 className="h-4 w-4" />Edit
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total Loans</p>
            <p className="mt-1 text-2xl font-bold">{loans.length}</p>
            <p className="text-xs text-muted-foreground">{activeLoans} active</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total Approved</p>
            <p className="mt-1 text-xl font-bold">{fmt(totalDisbursed)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-xl font-bold">{fmt(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Claims Filed</p>
            <p className="mt-1 text-2xl font-bold">{claims.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="mb-4">
          <TabsTrigger value="info" className="gap-2"><Building2 className="h-4 w-4" />Info</TabsTrigger>
          <TabsTrigger value="loans" className="gap-2"><FileText className="h-4 w-4" />Loans ({loans.length})</TabsTrigger>
          <TabsTrigger value="claims" className="gap-2"><AlertTriangle className="h-4 w-4" />Claims ({claims.length})</TabsTrigger>
          <TabsTrigger value="fees" className="gap-2"><DollarSign className="h-4 w-4" />Fees ({fees.length})</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">Bank Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Bank Code', field: 'code', readOnly: true },
                  { label: 'Bank Name', field: 'name' },
                  { label: 'Contact Person', field: 'contact_person' },
                  { label: 'Email', field: 'email' },
                  { label: 'Phone', field: 'phone' },
                  { label: 'Address', field: 'address' },
                ].map(({ label, field, readOnly }) => (
                  <div key={field} className="space-y-2">
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={form[field] || ''}
                      onChange={e => setForm((p: any) => ({ ...p, [field]: e.target.value }))}
                      readOnly={!editing || readOnly}
                      className={!editing || readOnly ? 'bg-secondary/30 text-sm' : 'text-sm'}
                    />
                  </div>
                ))}
              </div>
              {editing && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Active Status</p>
                    <p className="text-xs text-muted-foreground">Enable or disable this bank in the system</p>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={v => setForm((p: any) => ({ ...p, is_active: v }))} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loans Tab */}
        <TabsContent value="loans">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="font-semibold">Application #</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Approved Amt</TableHead>
                    <TableHead className="text-right font-semibold">Outstanding</TableHead>
                    <TableHead className="font-semibold">Disbursed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No loans found</TableCell></TableRow>
                  ) : loans.map(loan => (
                    <TableRow key={loan.id} className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-mono text-sm font-semibold">
                        <Link href={`/dashboard/loans/${loan.id}`} className="text-primary hover:underline">{loan.application_number}</Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs capitalize">{loan.status?.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmt(loan.approved_amount)}</TableCell>
                      <TableCell className="text-right">{fmt(loan.outstanding_balance)}</TableCell>
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
                    <TableHead className="font-semibold">Claim #</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Claim Amount</TableHead>
                    <TableHead className="font-semibold">Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No claims filed</TableCell></TableRow>
                  ) : claims.map(claim => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-mono text-sm font-semibold text-primary">{claim.claim_number}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs capitalize">{claim.status}</Badge></TableCell>
                      <TableCell className="text-right font-medium">{fmt(claim.claim_amount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(claim.created_at).toLocaleDateString()}</TableCell>
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
                    <TableHead className="font-semibold">Fee Type</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-right font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">No fees found</TableCell></TableRow>
                  ) : fees.map(fee => (
                    <TableRow key={fee.id}>
                      <TableCell className="text-sm capitalize">{fee.fee_type?.replace('_', ' ')}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs capitalize">{fee.status}</Badge></TableCell>
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
