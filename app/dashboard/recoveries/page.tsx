'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, TrendingUp, Download, RefreshCw, DollarSign } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Recovery {
  id: string
  claim_id: string
  recovery_amount: number
  prsf_share: number
  recovery_date: string
  recovery_method: string
  notes: string | null
  created_at: string
  claims?: {
    claim_number: string
    claim_amount: number
    banks?: { name_en: string; code: string }
    loan_applications?: { loan_number: string | null }
  }
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v || 0)

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  collateral_sale: 'Collateral Sale',
  court_order: 'Court Order',
  voluntary: 'Voluntary Payment',
  insurance: 'Insurance',
  other: 'Other',
}

export default function RecoveriesPage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [recoveries, setRecoveries] = useState<Recovery[]>([])
  const [claims, setClaims] = useState<any[]>([])
  const [banks, setBanks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [bankFilter, setBankFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    claim_id: '',
    recovery_amount: '',
    prsf_share: '',
    recovery_date: new Date().toISOString().slice(0, 10),
    recovery_method: 'cash',
    notes: '',
  })

  const fetchRecoveries = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('recoveries')
      .select(`
        *,
        claims(claim_number, claim_amount, banks(name_en, code), loan_applications(loan_number))
      `)
      .order('recovery_date', { ascending: false })
    setRecoveries(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRecoveries()
    supabase.from('banks').select('id, name_en, code').order('name_en').then(({ data }) => setBanks(data || []))
    supabase.from('claims').select('id, claim_number, bank_id, banks(name_en)').eq('status', 'paid').order('claim_number').then(({ data }) => setClaims(data || []))
  }, [fetchRecoveries])

  const handleCreate = async () => {
    if (!form.claim_id || !form.recovery_amount || !form.recovery_date) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('recoveries').insert({
      claim_id: form.claim_id,
      recovery_amount: Number(form.recovery_amount),
      prsf_share: Number(form.prsf_share) || Number(form.recovery_amount) * 0.5,
      recovery_date: form.recovery_date,
      recovery_method: form.recovery_method,
      notes: form.notes || null,
    })
    if (error) {
      toast({ title: 'Failed to record recovery', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Recovery recorded successfully' })
      setDialogOpen(false)
      setForm({ claim_id: '', recovery_amount: '', prsf_share: '', recovery_date: new Date().toISOString().slice(0, 10), recovery_method: 'cash', notes: '' })
      fetchRecoveries()
    }
    setSaving(false)
  }

  const filtered = recoveries.filter(r => {
    const matchSearch = !search ||
      r.claims?.claim_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.claims?.loan_applications?.loan_number?.toLowerCase().includes(search.toLowerCase()) ||
      r.claims?.banks?.name_en?.toLowerCase().includes(search.toLowerCase())
    const matchBank = bankFilter === 'all' || (r.claims?.banks as any)?.id === bankFilter
    const matchMethod = methodFilter === 'all' || r.recovery_method === methodFilter
    return matchSearch && matchBank && matchMethod
  })

  const totalRecovered = filtered.reduce((s, r) => s + r.recovery_amount, 0)
  const totalPrsfShare = filtered.reduce((s, r) => s + r.prsf_share, 0)

  const exportCSV = () => {
    const headers = ['Date', 'Claim #', 'Loan #', 'Bank', 'Recovery Amount', 'PRSF Share', 'Method', 'Notes']
    const rows = filtered.map(r => [
      r.recovery_date,
      r.claims?.claim_number || '',
          r.claims?.loan_applications?.loan_number || '',
      r.claims?.banks?.name_en || '',
      r.recovery_amount,
      r.prsf_share,
      METHOD_LABELS[r.recovery_method] || r.recovery_method,
      r.notes || '',
    ])
    const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `recoveries-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Recovery Tracking</h1>
            <p className="text-sm text-muted-foreground">Track post-claim repayments and recoveries from borrowers</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={fetchRecoveries}>
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Record Recovery</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Record Post-Claim Recovery</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Related Claim *</Label>
                  <Select value={form.claim_id} onValueChange={v => setForm(p => ({ ...p, claim_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select paid claim..." /></SelectTrigger>
                    <SelectContent>
                      {claims.length === 0 && <SelectItem value="_none" disabled>No paid claims found</SelectItem>}
                      {claims.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.claim_number} — {(c.banks as any)?.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Recovery Amount (TJS) *</Label>
                    <Input type="number" placeholder="0.00" value={form.recovery_amount}
                      onChange={e => setForm(p => ({ ...p, recovery_amount: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>PRSF Share (TJS)</Label>
                    <Input type="number" placeholder="Auto: 50%" value={form.prsf_share}
                      onChange={e => setForm(p => ({ ...p, prsf_share: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Recovery Date *</Label>
                    <Input type="date" value={form.recovery_date}
                      onChange={e => setForm(p => ({ ...p, recovery_date: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Recovery Method</Label>
                    <Select value={form.recovery_method} onValueChange={v => setForm(p => ({ ...p, recovery_method: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea placeholder="Optional notes about this recovery..." rows={3} value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Record Recovery'}</Button>
                </div>
              </div>
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
              <p className="text-xs text-muted-foreground">Total Recovered</p>
              <p className="text-xl font-bold">{fmt(totalRecovered)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-xl bg-primary/10 p-3"><TrendingUp className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">PRSF Share</p>
              <p className="text-xl font-bold">{fmt(totalPrsfShare)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-xl bg-blue-500/10 p-3"><Search className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Recovery Events</p>
              <p className="text-xl font-bold">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9 h-9 text-sm" placeholder="Search by claim, loan, or bank..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={bankFilter} onValueChange={setBankFilter}>
          <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="All Banks" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Banks</SelectItem>
            {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="All Methods" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
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
                  <TableHead className="font-semibold">Recovery Date</TableHead>
                  <TableHead className="font-semibold">Claim #</TableHead>
                  <TableHead className="font-semibold">Loan #</TableHead>
                  <TableHead className="font-semibold">Bank</TableHead>
                  <TableHead className="text-right font-semibold">Recovery Amt</TableHead>
                  <TableHead className="text-right font-semibold">PRSF Share</TableHead>
                  <TableHead className="font-semibold">Method</TableHead>
                  <TableHead className="font-semibold">Notes</TableHead>
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
                        <p className="text-sm">{search || bankFilter !== 'all' ? 'No recoveries match your filters' : 'No recoveries recorded yet'}</p>
                        {!search && bankFilter === 'all' && (
                          <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={() => setDialogOpen(true)}>
                            <Plus className="h-3.5 w-3.5" />Record First Recovery
                          </Button>
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
                      <TableCell className="text-right font-semibold text-emerald-700">{fmt(rec.recovery_amount)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(rec.prsf_share)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {METHOD_LABELS[rec.recovery_method] || rec.recovery_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                        {rec.notes || '—'}
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
