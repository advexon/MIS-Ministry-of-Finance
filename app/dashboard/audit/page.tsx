'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Filter, Eye, Download, RefreshCw, Shield } from 'lucide-react'

interface AuditEntry {
  id: string
  table_name: string
  record_id: string
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_at: string
  ip_address: string | null
  profiles?: { full_name: string; email: string } | null
}

const ACTION_COLORS: Record<string, string> = {
  insert: 'bg-emerald-100 text-emerald-800',
  create: 'bg-emerald-100 text-emerald-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  login: 'bg-purple-100 text-purple-800',
  export: 'bg-amber-100 text-amber-800',
}

const TABLE_LABELS: Record<string, string> = {
  loan_applications: 'Loan Application',
  guarantee_reports: 'Guarantee Report',
  claims: 'Claim',
  fees: 'Fee',
  banks: 'Bank',
  profiles: 'User Profile',
  borrowers: 'Borrower',
  recoveries: 'Recovery',
}

function RowSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableCell key={i}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  )
}

export default function AuditTrailPage() {
  const supabase = createClient()

  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditEntry | null>(null)

  const [filters, setFilters] = useState({
    search: '',
    table: 'all',
    action: 'all',
    dateFrom: '',
    dateTo: '',
  })

  const PAGE_SIZE = 25

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('audit_trail')
      .select('*, profiles(full_name, email)', { count: 'exact' })
      .order('changed_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filters.table !== 'all') q = q.eq('table_name', filters.table)
    if (filters.action !== 'all') q = q.eq('action', filters.action)
    if (filters.dateFrom) q = q.gte('changed_at', filters.dateFrom)
    if (filters.dateTo) q = q.lte('changed_at', filters.dateTo + 'T23:59:59')
    if (filters.search) q = q.or(`table_name.ilike.%${filters.search}%,action.ilike.%${filters.search}%`)

    const { data, count } = await q
    setEntries(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [filters, page])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const exportCSV = () => {
    const rows = [
      ['Timestamp', 'User', 'Table', 'Action', 'Record ID', 'IP Address'],
      ...entries.map(e => [
        new Date(e.changed_at).toLocaleString(),
        e.profiles?.full_name || e.profiles?.email || 'System',
        TABLE_LABELS[e.table_name] || e.table_name,
        e.action,
        e.record_id || '',
        e.ip_address || '',
      ]),
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const resetFilters = () => {
    setFilters({ search: '', table: 'all', action: 'all', dateFrom: '', dateTo: '' })
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2"><Shield className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Trail</h1>
            <p className="text-sm text-muted-foreground">Complete log of all system activity — {total.toLocaleString()} records</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={fetchEntries}>
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="pt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 text-sm" placeholder="Search tables, actions..." value={filters.search}
                onChange={e => { setFilters(p => ({ ...p, search: e.target.value })); setPage(0) }} />
            </div>
            <Select value={filters.table} onValueChange={v => { setFilters(p => ({ ...p, table: v })); setPage(0) }}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="All tables" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                {Object.entries(TABLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.action} onValueChange={v => { setFilters(p => ({ ...p, action: v })); setPage(0) }}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="All actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="insert">Insert</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-2 bg-transparent h-9" onClick={resetFilters}>
              <Filter className="h-3.5 w-3.5" />Reset
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" className="h-8 text-sm" value={filters.dateFrom}
                onChange={e => { setFilters(p => ({ ...p, dateFrom: e.target.value })); setPage(0) }} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" className="h-8 text-sm" value={filters.dateTo}
                onChange={e => { setFilters(p => ({ ...p, dateTo: e.target.value })); setPage(0) }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Timestamp</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">User</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Table</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Action</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">Record ID</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wide">IP</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => <RowSkeleton key={i} />)
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Shield className="h-8 w-8 opacity-30" />
                        <p className="text-sm">No audit records found for the selected filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map(entry => (
                    <TableRow key={entry.id} className="group text-sm">
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {new Date(entry.changed_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{entry.profiles?.full_name || 'System'}</span>
                          <span className="text-xs text-muted-foreground">{entry.profiles?.email || ''}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{TABLE_LABELS[entry.table_name] || entry.table_name}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs capitalize ${ACTION_COLORS[entry.action] || 'bg-gray-100 text-gray-700'}`}>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {entry.record_id ? entry.record_id.slice(0, 8) + '...' : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.ip_address || '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => setSelected(entry)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()} records
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 text-xs">Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 text-xs">Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge className={`text-xs capitalize ${ACTION_COLORS[selected?.action || ''] || 'bg-gray-100 text-gray-700'}`}>
                {selected?.action}
              </Badge>
              {TABLE_LABELS[selected?.table_name || ''] || selected?.table_name}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 pt-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <p className="font-medium">{new Date(selected.changed_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Performed By</p>
                  <p className="font-medium">{selected.profiles?.full_name || selected.profiles?.email || 'System'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Record ID</p>
                  <p className="font-mono text-xs">{selected.record_id || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">IP Address</p>
                  <p className="font-medium">{selected.ip_address || '—'}</p>
                </div>
              </div>
              {selected.old_data && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous State</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-900">
                    {JSON.stringify(selected.old_data, null, 2)}
                  </pre>
                </div>
              )}
              {selected.new_data && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New State</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">
                    {JSON.stringify(selected.new_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
