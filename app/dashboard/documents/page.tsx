'use client'

import { useState, useMemo } from 'react'
import { useI18n } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n/translations'
import { DOCUMENT_LANGUAGES, DOCUMENT_LOCALES, documentText, localizeDocumentTemplate } from '@/lib/i18n/document-translations'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  FileText,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Eye,
  Settings2,
  ChevronDown,
  BarChart3,
  Filter,
  ArrowUpDown,
  Palette,
  Layout,
  FileDown,
  Layers,
  Search,
  AlertCircle,
  RefreshCw,
  GripVertical,
  FileCode2,
} from 'lucide-react'
import {
  type DocumentTemplate,
  type ExportFormat,
  type DocumentFilter,
  type ConditionalRule,
  type SortRule,
  BUILT_IN_TEMPLATES,
  applyFilters,
  selectDocumentRows,
  documentTotal,
  getConditionalStyles,
  formatCellValue,
  runExport,
} from '@/lib/utils/document-engine'
import { cn } from '@/lib/utils'
import { loadDocumentRows } from '@/lib/utils/document-data'
import { useToast } from '@/hooks/use-toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORMAT_META: Record<ExportFormat, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pdf:   { label: 'PDF',   icon: FileText,        color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
  excel: { label: 'Excel', icon: FileSpreadsheet,  color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  word:  { label: 'Word',  icon: FileCode2,         color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  csv:   { label: 'CSV',   icon: FileDown,          color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
}

const OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
]

const COND_STYLES = [
  { value: 'highlight', label: 'Highlight' },
  { value: 'bold',      label: 'Bold text' },
  { value: 'italic',    label: 'Italic' },
  { value: 'red',       label: 'Red row' },
  { value: 'green',     label: 'Green row' },
  { value: 'yellow',    label: 'Yellow row' },
]

const badgeVariantMap: Record<string, string> = {
  active:          'bg-green-100 text-green-800',
  approved:        'bg-green-100 text-green-800',
  paid:            'bg-green-100 text-green-800',
  overdue:         'bg-red-100 text-red-800',
  rejected:        'bg-red-100 text-red-800',
  submitted:       'bg-blue-100 text-blue-800',
  under_review:    'bg-yellow-100 text-yellow-800',
  pending:         'bg-yellow-100 text-yellow-800',
  disbursements:   'bg-purple-100 text-purple-800',
  blank_guarantee: 'bg-sky-100 text-sky-800',
  Agriculture:     'bg-green-100 text-green-800',
  Trade:           'bg-blue-100 text-blue-800',
  Manufacturing:   'bg-violet-100 text-violet-800',
  Services:        'bg-sky-100 text-sky-800',
  Construction:    'bg-amber-100 text-amber-800',
  Transport:       'bg-pink-100 text-pink-800',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormatButton({ format, selected, onClick }: { format: ExportFormat; selected: boolean; onClick: () => void }) {
  const meta = FORMAT_META[format]
  const Icon = meta.icon
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
        selected
          ? `${meta.bg} border-current ${meta.color} ring-2 ring-current ring-offset-1`
          : 'border-border bg-card text-muted-foreground hover:border-border hover:bg-secondary/40'
      )}
    >
      <Icon className={cn('h-7 w-7', selected && meta.color)} strokeWidth={1.5} />
      <span className={cn('text-xs font-semibold', selected && meta.color)}>{meta.label}</span>
    </button>
  )
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; accent: string
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', accent)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-bold text-foreground">{value}</p>
          {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { toast } = useToast()
  const { locale: interfaceLocale } = useI18n()
  const [downloadLanguage, setDownloadLanguage] = useState<Locale | null>(null)
  const locale = downloadLanguage ?? interfaceLocale
  const text = (key: string) => documentText(key, locale)
  const supabase = useMemo(() => createClient(), [])

  // Template state — start from built-in
  const initialTemplate: DocumentTemplate = {
    ...BUILT_IN_TEMPLATES[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const [templateState, setTemplate] = useState<DocumentTemplate>(initialTemplate)
  const template = useMemo(() => localizeDocumentTemplate(templateState, locale), [templateState, locale])
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf')
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [activeConfig, setActiveConfig] = useState<'columns' | 'filters' | 'sort' | 'conditional' | 'headerfooter' | 'page'>('columns')
  const { data: liveRows, error: queryError, isLoading, isValidating, mutate } = usePageQuery<Record<string, unknown>[]>(
    ['document-preview', template.dataSource], () => loadDocumentRows(supabase, template.dataSource),
  )
  const dataLoading = isLoading || isValidating
  const dataError = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to fetch data') : null

  const rawRows = useMemo(() => queryError ? [] : liveRows ?? [], [liveRows, queryError])
  const filteredRows = useMemo(() => applyFilters(rawRows, template.filters), [rawRows, template.filters])
  const previewRows = useMemo(() => selectDocumentRows(rawRows, template, search), [rawRows, template, search])

  const visibleCols = template.columns.filter(c => c.visible)
  const exportDisabled = exporting || dataLoading || !!dataError || !visibleCols.length || !previewRows.length
  const missingSnapshots = template.dataSource === 'loan_applications' ? rawRows.filter(row => !row.balance_as_of).length : 0

  // ── Helpers ──────────────────────────────────────────────────────────────

  const patch = (changes: Partial<DocumentTemplate>) =>
    setTemplate(prev => ({ ...localizeDocumentTemplate(prev, locale), ...changes, updatedAt: new Date().toISOString() }))

  const loadTemplate = (tmpl: Omit<DocumentTemplate, 'createdAt' | 'updatedAt'>) => {
    setTemplate({ ...tmpl, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    // A different source revalidates through its query key; refresh reused sources explicitly.
    if (tmpl.dataSource === template.dataSource) void mutate()
    toast({ title: `Loaded template: ${tmpl.name}` })
  }

  const handleRefreshData = () => {
    void mutate()
    toast({ title: 'Refreshing data...' })
  }

  const handleExport = async () => {
    if (exportDisabled) return
    setExporting(true)
    try {
      await runExport(template, selectedFormat, rawRows, search, locale)
      toast({ title: selectedFormat === 'pdf' ? 'Print dialog opened' : `Exported as ${FORMAT_META[selectedFormat].label}`,
        description: selectedFormat === 'pdf' ? `${previewRows.length} records prepared. Choose Save as PDF in the print dialog.` : `${previewRows.length} records exported` })
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  // Filter helpers
  const addFilter = () =>
    patch({ filters: [...template.filters, { id: crypto.randomUUID(), column: template.columns[0]?.key ?? '', operator: 'eq', value: '', enabled: true }] })
  const removeFilter = (id: string) =>
    patch({ filters: template.filters.filter(f => f.id !== id) })
  const updateFilter = (id: string, changes: Partial<DocumentFilter>) =>
    patch({ filters: template.filters.map(f => f.id === id ? { ...f, ...changes } : f) })

  // Sort helpers
  const addSort = () =>
    patch({ sortRules: [...template.sortRules, { column: template.columns[0]?.key ?? '', direction: 'asc' }] })
  const removeSort = (idx: number) =>
    patch({ sortRules: template.sortRules.filter((_, i) => i !== idx) })
  const updateSort = (idx: number, changes: Partial<SortRule>) =>
    patch({ sortRules: template.sortRules.map((s, i) => i === idx ? { ...s, ...changes } : s) })

  // Conditional helpers
  const addCond = () =>
    patch({ conditionalRules: [...template.conditionalRules, { id: crypto.randomUUID(), column: template.columns[0]?.key ?? '', operator: 'eq', value: '', style: 'highlight', enabled: true }] })
  const removeCond = (id: string) =>
    patch({ conditionalRules: template.conditionalRules.filter(c => c.id !== id) })
  const updateCond = (id: string, changes: Partial<ConditionalRule>) =>
    patch({ conditionalRules: template.conditionalRules.map(c => c.id === id ? { ...c, ...changes } : c) })

  // Column toggle
  const toggleColumn = (key: string) =>
    patch({ columns: template.columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c) })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex-shrink-0 border-b bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{documentText('Document Center', interfaceLocale)}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Generate, configure and export reports in PDF, Excel, Word and CSV formats
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium" htmlFor="document-language">
              {documentText('Download language', interfaceLocale)}
              <select
                id="document-language"
                value={locale}
                onChange={event => setDownloadLanguage(event.target.value as Locale)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                title={documentText('Follows your selected interface language. Custom text and source records are preserved.', interfaceLocale)}
              >
                {(['en', 'ru', 'tj'] as const).map(language => (
                  <option key={language} value={language}>{DOCUMENT_LANGUAGES[language]}</option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-transparent text-xs"
              onClick={handleRefreshData}
              disabled={dataLoading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", dataLoading && "animate-spin")} />
              {dataLoading ? 'Loading...' : 'Refresh Data'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 bg-transparent text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Load Template
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {BUILT_IN_TEMPLATES.map(t => (
                  <DropdownMenuItem key={t.id} className="text-xs" onClick={() => loadTemplate(t)}>
                    <FileText className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                    {text(t.name)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="gap-2 text-xs"
              onClick={handleExport}
              disabled={exportDisabled}
            >
              {exporting
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />}
              Export {FORMAT_META[selectedFormat].label}
            </Button>
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div className="flex-shrink-0 border-b bg-secondary/20 px-6 py-3">
        {dataError && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
            Unable to load live data: {dataError}
          </div>
        )}
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          {dataError ? 'Data could not be loaded. Exports are disabled until a successful refresh.' : dataLoading ? 'Loading all authorized records. Export is unavailable until loading completes.' : 'All records visible to your account are loaded. Search applies to both preview and export.'}
          {template.dataSource === 'loan_applications' && ` Balances and delinquency use each loan’s latest approved report, not disbursed amounts. ${missingSnapshots} loan(s) have no matching approved balance snapshot; unknown values are shown as — and excluded from delinquency results.`}
          {' Amounts retain their source currency. Unknown currencies are marked explicitly; totals never combine currencies.'}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard 
            label="Total Records" 
            value={dataLoading ? '...' : rawRows.length} 
            sub={dataLoading ? 'loading from database' : 'from live database'} 
            icon={BarChart3} 
            accent="bg-primary" 
          />
          <StatCard label="After Filters" value={filteredRows.length} sub={`${template.filters.filter(f => f.enabled).length} filter(s) active`} icon={Filter} accent="bg-accent" />
          <StatCard label="Visible Columns" value={visibleCols.length} sub={`of ${template.columns.length} total`} icon={Layout} accent="bg-info" />
          <StatCard label="Cond. Rules" value={template.conditionalRules.filter(r => r.enabled).length} sub="active formatting rules" icon={Palette} accent="bg-warning" />
        </div>
      </div>

      {/* Main three-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Template library */}
        <aside className="hidden w-56 flex-shrink-0 flex-col overflow-y-auto border-r bg-secondary/10 lg:flex">
          <div className="p-3">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Built-in Templates</p>
            <div className="space-y-0.5">
              {BUILT_IN_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => loadTemplate(t)}
                  className={cn(
                    'flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors',
                    template.id === t.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary/60 text-foreground'
                  )}
                >
                  <span className={cn('text-xs font-semibold', template.id === t.id ? 'text-primary-foreground' : 'text-foreground')}>{text(t.name)}</span>
                  <span className={cn('mt-0.5 text-[10px] leading-relaxed', template.id === t.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{text(t.description)}</span>
                </button>
              ))}
            </div>

            <Separator className="my-3" />
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Export Format</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['pdf', 'excel', 'word', 'csv'] as ExportFormat[]).map(f => (
                <FormatButton key={f} format={f} selected={selectedFormat === f} onClick={() => setSelectedFormat(f)} />
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER: Config panel */}
        <div className="flex w-80 flex-shrink-0 flex-col overflow-y-auto border-r bg-card">
          {/* Template name */}
          <div className="border-b px-4 py-3">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Template Name</Label>
            <Input
              value={template.name}
              onChange={e => patch({ name: e.target.value })}
              className="mt-1.5 h-8 text-sm font-semibold"
            />
          </div>

          {/* Config tabs */}
          <div className="flex flex-shrink-0 overflow-x-auto border-b">
            {([
              { key: 'columns', icon: Layers, label: 'Columns' },
              { key: 'filters', icon: Filter, label: 'Filters' },
              { key: 'sort', icon: ArrowUpDown, label: 'Sort' },
              { key: 'conditional', icon: Palette, label: 'Format' },
              { key: 'headerfooter', icon: Layout, label: 'Header' },
              { key: 'page', icon: Settings2, label: 'Page' },
            ] as { key: typeof activeConfig; icon: React.ElementType; label: string }[]).map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveConfig(tab.key)}
                  className={cn(
                    'flex flex-shrink-0 flex-col items-center gap-0.5 px-3 py-2.5 text-[10px] font-medium transition-colors',
                    activeConfig === tab.key
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Config panel content */}
          <div className="flex-1 overflow-y-auto p-4">

            {/* COLUMNS */}
            {activeConfig === 'columns' && (
              <div className="space-y-1">
                {template.columns.map(col => (
                  <div key={col.key} className="flex items-center gap-3 rounded-lg border bg-secondary/20 px-3 py-2">
                    <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />
                    <Checkbox
                      checked={col.visible}
                      onCheckedChange={() => toggleColumn(col.key)}
                      id={`col-${col.key}`}
                    />
                    <label htmlFor={`col-${col.key}`} className="flex-1 cursor-pointer">
                      <p className="text-xs font-medium">{col.label}</p>
                      <p className="text-[10px] text-muted-foreground">{col.key} · {col.type}</p>
                    </label>
                    <Badge variant="outline" className="text-[9px]">{col.type}</Badge>
                  </div>
                ))}
              </div>
            )}

            {/* FILTERS */}
            {activeConfig === 'filters' && (
              <div className="space-y-3">
                {template.filters.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No filters defined. Add one below.</p>
                )}
                {template.filters.map(f => (
                  <div key={f.id} className="space-y-2 rounded-lg border bg-secondary/20 p-3">
                    <div className="flex items-center justify-between">
                      <Switch checked={f.enabled} onCheckedChange={v => updateFilter(f.id, { enabled: v })} />
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFilter(f.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Select value={f.column} onValueChange={v => updateFilter(f.id, { column: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {template.columns.map(c => <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={f.operator} onValueChange={v => updateFilter(f.id, { operator: v as DocumentFilter['operator'] })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATORS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="h-7 text-xs" placeholder="Value..." value={f.value} onChange={e => updateFilter(f.id, { value: e.target.value })} />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full gap-2 bg-transparent text-xs" onClick={addFilter}>
                  <Plus className="h-3.5 w-3.5" />Add Filter
                </Button>
              </div>
            )}

            {/* SORT */}
            {activeConfig === 'sort' && (
              <div className="space-y-3">
                {template.sortRules.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No sort rules defined.</p>
                )}
                {template.sortRules.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border bg-secondary/20 p-3">
                    <div className="flex flex-1 flex-col gap-2">
                      <Select value={s.column} onValueChange={v => updateSort(idx, { column: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {template.columns.map(c => <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={s.direction} onValueChange={v => updateSort(idx, { direction: v as SortRule['direction'] })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc" className="text-xs">Ascending</SelectItem>
                          <SelectItem value="desc" className="text-xs">Descending</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-destructive" onClick={() => removeSort(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full gap-2 bg-transparent text-xs" onClick={addSort}>
                  <Plus className="h-3.5 w-3.5" />Add Sort Rule
                </Button>
              </div>
            )}

            {/* CONDITIONAL FORMATTING */}
            {activeConfig === 'conditional' && (
              <div className="space-y-3">
                {template.conditionalRules.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">No formatting rules defined.</p>
                )}
                {template.conditionalRules.map(r => (
                  <div key={r.id} className="space-y-2 rounded-lg border bg-secondary/20 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rule</span>
                      <div className="flex items-center gap-1.5">
                        <Switch checked={r.enabled} onCheckedChange={v => updateCond(r.id, { enabled: v })} />
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeCond(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">When column...</p>
                    <Select value={r.column} onValueChange={v => updateCond(r.id, { column: v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {template.columns.map(c => <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={r.operator} onValueChange={v => updateCond(r.id, { operator: v as ConditionalRule['operator'] })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATORS.slice(0, 6).map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="h-7 text-xs" placeholder="Value..." value={r.value} onChange={e => updateCond(r.id, { value: e.target.value })} />
                    <p className="text-[10px] text-muted-foreground">Apply style...</p>
                    <Select value={r.style} onValueChange={v => updateCond(r.id, { style: v as ConditionalRule['style'] })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COND_STYLES.map(s => <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full gap-2 bg-transparent text-xs" onClick={addCond}>
                  <Plus className="h-3.5 w-3.5" />Add Rule
                </Button>
              </div>
            )}

            {/* HEADER / FOOTER */}
            {activeConfig === 'headerfooter' && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Header</p>
                  <div className="space-y-2">
                    {(['headerLeft', 'headerCenter', 'headerRight'] as const).map(k => (
                      <div key={k} className="flex flex-col gap-1">
                        <Label className="text-[10px]">{k.replace('header', '')} side</Label>
                        <Input className="h-7 text-xs" value={template.headerFooter[k]} onChange={e => patch({ headerFooter: { ...template.headerFooter, [k]: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Footer</p>
                  <div className="space-y-2">
                    {(['footerLeft', 'footerCenter', 'footerRight'] as const).map(k => (
                      <div key={k} className="flex flex-col gap-1">
                        <Label className="text-[10px]">{k.replace('footer', '')} side</Label>
                        <Input className="h-7 text-xs" value={template.headerFooter[k]} onChange={e => patch({ headerFooter: { ...template.headerFooter, [k]: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  {[
                    { key: 'showDate', label: 'Show generation date' },
                    { key: 'showPageNumber', label: 'Show page number' },
                    { key: 'showLogo', label: 'Show organisation logo' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label className="text-xs">{label}</Label>
                      <Switch
                        checked={template.headerFooter[key as keyof typeof template.headerFooter] as boolean}
                        onCheckedChange={v => patch({ headerFooter: { ...template.headerFooter, [key]: v } })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PAGE SETTINGS */}
            {activeConfig === 'page' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Page Size</Label>
                  <Select value={template.pageSize} onValueChange={v => patch({ pageSize: v as DocumentTemplate['pageSize'] })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['A4', 'A3', 'Letter', 'Legal'].map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Orientation</Label>
                  <Select value={template.orientation} onValueChange={v => patch({ orientation: v as DocumentTemplate['orientation'] })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait" className="text-xs">Portrait</SelectItem>
                      <SelectItem value="landscape" className="text-xs">Landscape</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                {[
                  { key: 'includeTitle', label: 'Include document title' },
                  { key: 'includeSummary', label: 'Include summary section' },
                  { key: 'includeTotals', label: 'Include column totals row' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-xs">{label}</Label>
                    <Switch
                      checked={template[key as keyof DocumentTemplate] as boolean}
                      onCheckedChange={v => patch({ [key]: v })}
                    />
                  </div>
                ))}
                <Separator />
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Data Source</Label>
                  <Select value={template.dataSource} onValueChange={value => {
                    const sourceTemplate = BUILT_IN_TEMPLATES.find(item => item.dataSource === value)
                    if (sourceTemplate) loadTemplate(sourceTemplate)
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loan_applications" className="text-xs">Loan Applications</SelectItem>
                      <SelectItem value="guarantee_reports" className="text-xs">Guarantee Reports</SelectItem>
                      <SelectItem value="claims" className="text-xs">Claims</SelectItem>
                      <SelectItem value="fees" className="text-xs">Fees</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="flex flex-1 flex-col overflow-hidden bg-secondary/5">
          {/* Preview toolbar */}
          <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">Live Preview</span>
              <Badge variant="outline" className="text-[10px]">{previewRows.length} rows</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5">
                <Search className="h-3 w-3 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search and export..."
                  aria-label="Search report rows"
                  className="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                />
              </div>
              {/* Mobile format selector */}
              <div className="flex gap-1 lg:hidden">
                {(['pdf', 'excel', 'word', 'csv'] as ExportFormat[]).map(f => {
                  const m = FORMAT_META[f]
                  return (
                    <button key={f} onClick={() => setSelectedFormat(f)}
                      className={cn('rounded px-2 py-1 text-[10px] font-semibold', selectedFormat === f ? `${m.color}` : 'text-muted-foreground')}
                    >{m.label}</button>
                  )
                })}
              </div>
              <Button size="sm" className="gap-1.5 text-xs" onClick={handleExport} disabled={exportDisabled}>
                {exporting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                {FORMAT_META[selectedFormat].label}
              </Button>
            </div>
          </div>

          {/* Document preview */}
          <div className="flex-1 overflow-auto p-4">
            <div className="mx-auto max-w-5xl rounded-xl border bg-card shadow-sm">
              {/* Simulated page header */}
              <div className="flex items-start justify-between border-b-2 border-primary/20 px-6 py-5">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{template.headerFooter.headerLeft}</p>
                  {template.includeTitle && <h2 className="mt-1 text-xl font-bold text-foreground">{template.headerFooter.headerCenter || template.name}</h2>}
                  {template.includeSummary && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {text(template.dataSource)} · {previewRows.length} {text('Records')}
                      · {template.pageSize} {template.orientation}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{template.headerFooter.headerRight}</p>
                  {template.headerFooter.showDate && (
                    <p className="text-xs text-muted-foreground">
                      {new Date().toLocaleDateString(DOCUMENT_LOCALES[locale], { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    <div className={cn('rounded-md border px-2 py-1 text-[10px] font-semibold', FORMAT_META[selectedFormat].bg, FORMAT_META[selectedFormat].color)}>
                      {FORMAT_META[selectedFormat].label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary cards */}
              {template.includeSummary && (
                <div className="grid grid-cols-3 gap-3 border-b bg-secondary/20 px-6 py-4">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">{text('Records')}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{previewRows.length}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">{text('Columns')}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{visibleCols.length}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase">{text('Filters')}</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{template.filters.filter(f => f.enabled).length}</p>
                  </div>
                </div>
              )}

              {/* Data table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-primary/90">
                      {visibleCols.map(col => (
                        <th
                          key={col.key}
                          className={cn(
                            'px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground',
                            col.align === 'right' || col.type === 'currency' || col.type === 'number' ? 'text-right' : 'text-left'
                          )}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => {
                      const styles = getConditionalStyles(row, template.conditionalRules)
                      const rowClass = cn(
                        'border-b transition-colors',
                        styles.includes('red') ? 'bg-red-50' :
                          styles.includes('green') ? 'bg-green-50' :
                            styles.includes('yellow') ? 'bg-yellow-50' :
                              styles.includes('highlight') ? 'bg-primary/5' :
                                i % 2 === 0 ? 'bg-card' : 'bg-secondary/20'
                      )
                      return (
                        <tr key={i} className={rowClass}>
                          {visibleCols.map(col => {
                            const raw = row[col.key]
                            const formatted = formatCellValue(raw, col.type, row.currency, locale)
                            const isRight = col.align === 'right' || col.type === 'currency' || col.type === 'number' || col.type === 'percent'
                            const cellClass = cn(
                              'px-4 py-2.5',
                              isRight ? 'text-right' : 'text-left',
                              styles.includes('bold') ? 'font-semibold' : 'font-normal',
                              styles.includes('italic') && 'italic'
                            )
                            if (col.type === 'badge') {
                              const variant = badgeVariantMap[String(raw)] ?? 'bg-secondary text-secondary-foreground'
                              return (
                                <td key={col.key} className={cellClass}>
                                  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', variant)}>
                                    {formatted}
                                  </span>
                                </td>
                              )
                            }
                            return <td key={col.key} className={cellClass}>{formatted}</td>
                          })}
                        </tr>
                      )
                    })}
                    {previewRows.length === 0 && (
                      <tr>
                        <td colSpan={Math.max(1, visibleCols.length)} className="py-12 text-center text-xs text-muted-foreground">
                          {dataLoading ? 'Loading report records…' : dataError ? 'Report data could not be loaded. Use Refresh Data to retry.' : !visibleCols.length ? 'Select at least one column to preview and export.' : 'No records match the current filters or search.'}
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Totals row */}
                  {template.includeTotals && previewRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-primary/10 font-semibold">
                        {visibleCols.map((col, idx) => {
                          const isNumeric = col.type === 'currency' || col.type === 'number'
                          const total = isNumeric ? documentTotal(previewRows, col, locale) : null
                          return (
                            <td key={col.key} className={cn('border-t-2 border-primary/20 px-4 py-3 text-xs', col.type === 'currency' || col.type === 'number' ? 'text-right' : '')}>
                              {isNumeric && total !== null
                                ? <span className="font-bold text-foreground">{total}</span>
                                : idx === 0 ? <span className="font-bold text-foreground">{text('TOTAL')}</span> : null
                              }
                            </td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Simulated footer */}
              <div className="flex items-center justify-between border-t bg-secondary/10 px-6 py-3">
                <p className="text-[10px] text-muted-foreground">{template.headerFooter.footerLeft}</p>
                <p className="text-[10px] text-muted-foreground">{template.headerFooter.footerCenter}</p>
                {template.headerFooter.showPageNumber && (
                  <p className="text-[10px] text-muted-foreground">{template.headerFooter.footerRight.replace(/\{page\}|\{total\}/g, '1')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
