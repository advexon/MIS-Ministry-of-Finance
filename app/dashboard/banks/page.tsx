'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Building2, MapPin, TrendingUp, Plus, Search, ChevronRight, Eye } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'

interface Bank {
  id: string
  code: string
  name: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  is_active: boolean
  created_at: string
  loan_count?: number
  active_loan_count?: number
  total_disbursed?: number
  outstanding_portfolio?: number
}

function BankSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 7 }).map((_, i) => (
        <TableCell key={i}><Skeleton className="h-5 w-full" /></TableCell>
      ))}
    </TableRow>
  )
}

export default function BanksPage() {
  const { t } = useI18n()
  const supabase = createClient()
  const { toast } = useToast()

  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    code: '', name: '', contact_person: '', email: '', phone: '', address: '',
  })

  const fetchBanks = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('banks')
      .select(`
        *,
        loan_applications(count),
        loan_applications!inner(id, status, disbursed_amount, outstanding_balance)
      `)
      .order('name')

    if (error) {
      // Fallback: just get banks without aggregates
      const { data: simple } = await supabase.from('banks').select('*').order('name')
      setBanks(simple || [])
    } else {
      setBanks(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchBanks() }, [])

  const handleCreate = async () => {
    if (!form.code || !form.name) {
      toast({ title: 'Bank code and name are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('banks').insert({ ...form, is_active: true })
    if (error) {
      toast({ title: 'Failed to create bank', description: error.message, variant: 'destructive' })
    } else {
      toast({ title: 'Bank created successfully' })
      setDialogOpen(false)
      setForm({ code: '', name: '', contact_person: '', email: '', phone: '', address: '' })
      fetchBanks()
    }
    setSaving(false)
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v)

  const filtered = banks.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.code.toLowerCase().includes(search.toLowerCase())
  )

  const totalBanks = banks.length
  const activeBanks = banks.filter(b => b.is_active).length

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.banks.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Partner financial institutions in the PRSF programme
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Add Bank</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Partner Bank</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bank Code *</Label>
                  <Input placeholder="e.g. AIB" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} maxLength={6} />
                </div>
                <div className="space-y-2">
                  <Label>Bank Name *</Label>
                  <Input placeholder="Full legal name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Contact Person</Label>
                <Input placeholder="Name of focal point" value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="focal@bank.tj" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input placeholder="+992..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input placeholder="Registered address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Create Bank'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-primary/10 p-3"><Building2 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Partner Banks</p>
              <p className="text-2xl font-bold">{loading ? '...' : totalBanks}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-emerald-500/10 p-3"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold">{loading ? '...' : activeBanks}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-blue-500/10 p-3"><MapPin className="h-5 w-5 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">On Probation</p>
              <p className="text-2xl font-bold">{loading ? '...' : totalBanks - activeBanks}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-full bg-amber-500/10 p-3"><Eye className="h-5 w-5 text-amber-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Under Review</p>
              <p className="text-2xl font-bold">0</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search banks..." value={search} onChange={e => setSearch(e.target.value)} />
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
                  <TableHead className="font-semibold">Contact</TableHead>
                  <TableHead className="font-semibold">Email</TableHead>
                  <TableHead className="text-center font-semibold">{t.common.status}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <BankSkeleton key={i} />)
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      {search ? 'No banks match your search' : 'No banks added yet'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(bank => (
                    <TableRow key={bank.id} className="group">
                      <TableCell className="font-mono text-sm font-semibold text-primary">{bank.code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                            {bank.code?.charAt(0) || bank.name?.charAt(0)}
                          </div>
                          <span className="font-medium">{bank.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{bank.contact_person || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{bank.email || '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className={bank.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}>
                          {bank.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100" asChild>
                          <Link href={`/dashboard/banks/${bank.id}`}>
                            <ChevronRight className="h-4 w-4" />
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
