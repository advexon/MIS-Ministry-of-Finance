"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { usePermissions } from "@/lib/contexts/permission-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { 
  Settings2, Eye, EyeOff, Lock, Unlock, Save, RotateCcw, 
  GripVertical, AlertTriangle, CheckCircle2, FileText, 
  Users, Building2, Shield, Package, ClipboardList, Loader2,
  ArrowUpDown, Search
} from "lucide-react"
import type { ColumnConfiguration, ColumnFieldGroup, ColumnInputType } from "@/lib/types/database"

// Field group metadata
const fieldGroups: Record<ColumnFieldGroup, { label: string; icon: React.ElementType; color: string }> = {
  borrower: { label: "Borrower Information", icon: Users, color: "bg-blue-50 border-blue-200" },
  legal_rep: { label: "Legal Representative", icon: Users, color: "bg-purple-50 border-purple-200" },
  loan: { label: "Loan Details", icon: FileText, color: "bg-green-50 border-green-200" },
  guarantee: { label: "Guarantee Details", icon: Shield, color: "bg-teal-50 border-teal-200" },
  collateral: { label: "Collateral Information", icon: Package, color: "bg-orange-50 border-orange-200" },
  additional: { label: "Additional Information", icon: ClipboardList, color: "bg-gray-50 border-gray-200" },
  system: { label: "System Fields", icon: Settings2, color: "bg-slate-50 border-slate-200" },
}

const inputTypes: { value: ColumnInputType; label: string }[] = [
  { value: "text", label: "Text Input" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "select", label: "Dropdown Select" },
  { value: "date", label: "Date Picker" },
  { value: "textarea", label: "Text Area" },
  { value: "checkbox", label: "Checkbox" },
]

// Default column configurations (used when database table doesn't exist yet)
const defaultColumns: Partial<ColumnConfiguration>[] = [
  // Borrower Information
  { column_key: "borrower_name", display_name_en: "Borrower Name", display_name_ru: "Наименование заемщика", display_name_tj: "Номи қарзгиранда", field_group: "borrower", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: true, input_type: "text", display_order: 1, table_column_order: 1 },
  { column_key: "borrower_tin", display_name_en: "TIN", display_name_ru: "ИНН", display_name_tj: "РМА", field_group: "borrower", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: true, input_type: "text", display_order: 2, table_column_order: 2 },
  { column_key: "borrower_address", display_name_en: "Address", display_name_ru: "Адрес", display_name_tj: "Суроға", field_group: "borrower", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "textarea", display_order: 3, table_column_order: 0 },
  { column_key: "borrower_phone", display_name_en: "Phone", display_name_ru: "Телефон", display_name_tj: "Телефон", field_group: "borrower", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "text", display_order: 4, table_column_order: 0 },
  { column_key: "sector_id", display_name_en: "Business Sector", display_name_ru: "Сектор деятельности", display_name_tj: "Соҳаи фаъолият", field_group: "borrower", is_visible_in_table: true, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "select", display_order: 5, table_column_order: 3 },
  // Legal Representative
  { column_key: "legal_rep_name", display_name_en: "Legal Representative", display_name_ru: "Законный представитель", display_name_tj: "Намояндаи қонунӣ", field_group: "legal_rep", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "text", display_order: 10, table_column_order: 0 },
  { column_key: "legal_rep_position", display_name_en: "Position", display_name_ru: "Должность", display_name_tj: "Вазифа", field_group: "legal_rep", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "text", display_order: 11, table_column_order: 0 },
  // Loan Details
  { column_key: "bank_id", display_name_en: "Bank", display_name_ru: "Банк", display_name_tj: "Бонк", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: true, input_type: "select", display_order: 20, table_column_order: 4 },
  { column_key: "branch_id", display_name_en: "Branch", display_name_ru: "Филиал", display_name_tj: "Филиал", field_group: "loan", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "select", display_order: 21, table_column_order: 0 },
  { column_key: "loan_officer", display_name_en: "Loan Officer", display_name_ru: "Кредитный специалист", display_name_tj: "Мутахассиси қарз", field_group: "loan", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "text", display_order: 22, table_column_order: 0 },
  { column_key: "purpose", display_name_en: "Loan Purpose", display_name_ru: "Цель кредита", display_name_tj: "Мақсади қарз", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: false, input_type: "textarea", display_order: 23, table_column_order: 5 },
  { column_key: "requested_amount", display_name_en: "Requested Amount", display_name_ru: "Запрашиваемая сумма", display_name_tj: "Маблағи дархостшуда", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: true, input_type: "currency", display_order: 24, table_column_order: 6 },
  { column_key: "currency", display_name_en: "Currency", display_name_ru: "Валюта", display_name_tj: "Асъор", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: true, input_type: "select", display_order: 25, table_column_order: 7 },
  { column_key: "loan_term_months", display_name_en: "Loan Term (months)", display_name_ru: "Срок ��редита (месяцев)", display_name_tj: "Мӯҳлати қарз (моҳ)", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: false, input_type: "number", display_order: 26, table_column_order: 8 },
  { column_key: "interest_rate", display_name_en: "Interest Rate (%)", display_name_ru: "Процентная ставка (%)", display_name_tj: "Фоизи қарз (%)", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: false, input_type: "number", display_order: 27, table_column_order: 9 },
  // Guarantee Details
  { column_key: "guarantee_coverage", display_name_en: "Guarantee Coverage (%)", display_name_ru: "Покрытие гарантии (%)", display_name_tj: "Ҳаҷми кафолат (%)", field_group: "guarantee", is_visible_in_table: true, is_visible_in_form: true, is_required: true, is_system_required: true, input_type: "number", display_order: 40, table_column_order: 10 },
  { column_key: "guarantee_amount", display_name_en: "Guarantee Amount", display_name_ru: "Сумма гарантии", display_name_tj: "Маблағи кафолат", field_group: "guarantee", is_visible_in_table: true, is_visible_in_form: false, is_required: false, is_system_required: false, input_type: "currency", display_order: 41, table_column_order: 11 },
  // Collateral
  { column_key: "collateral_type", display_name_en: "Collateral Type", display_name_ru: "Тип залога", display_name_tj: "Навъи гарав", field_group: "collateral", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "select", display_order: 50, table_column_order: 0 },
  { column_key: "collateral_value", display_name_en: "Collateral Value", display_name_ru: "Стоимость залога", display_name_tj: "Арзиши гарав", field_group: "collateral", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "currency", display_order: 51, table_column_order: 0 },
  // Additional
  { column_key: "notes", display_name_en: "Internal Notes", display_name_ru: "Внутренние заметки", display_name_tj: "Қайдҳои дохилӣ", field_group: "additional", is_visible_in_table: false, is_visible_in_form: true, is_required: false, is_system_required: false, input_type: "textarea", display_order: 60, table_column_order: 0 },
  // System
  { column_key: "status", display_name_en: "Status", display_name_ru: "Статус", display_name_tj: "Ҳолат", field_group: "system", is_visible_in_table: true, is_visible_in_form: false, is_required: false, is_system_required: true, input_type: "select", display_order: 70, table_column_order: 12 },
  { column_key: "created_at", display_name_en: "Created Date", display_name_ru: "Дата создания", display_name_tj: "Санаи эҷод", field_group: "system", is_visible_in_table: true, is_visible_in_form: false, is_required: false, is_system_required: true, input_type: "date", display_order: 71, table_column_order: 13 },
]

export default function ColumnConfigPage() {
  const { t, locale } = useI18n()
  const { role } = usePermissions()
  const supabase = useMemo(() => createClient(), [])

  const [columns, setColumns] = useState<Partial<ColumnConfiguration>[]>([])
  const [originalColumns, setOriginalColumns] = useState<Partial<ColumnConfiguration>[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedColumn, setSelectedColumn] = useState<Partial<ColumnConfiguration> | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Check if user is superadmin (tier 1 OR has admin role) - tier 1 takes precedence
  const isSuperAdmin = role?.tier === 1 || role?.name_en?.toLowerCase().includes('admin')

  const getDisplayName = useCallback((col: Partial<ColumnConfiguration>) => {
    if (locale === "ru" && col.display_name_ru) return col.display_name_ru
    if (locale === "tj" && col.display_name_tj) return col.display_name_tj
    return col.display_name_en || col.column_key || ""
  }, [locale])

  const fetchColumns = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("column_configurations")
        .select("*")
        .eq("entity_type", "loan_applications")
        .order("display_order", { ascending: true })

      if (error) {
        console.log("[v0] Error fetching columns, using defaults:", error.message)
        // Use default columns if table doesn't exist
        setColumns(defaultColumns)
        setOriginalColumns(defaultColumns)
      } else if (data && data.length > 0) {
        setColumns(data)
        setOriginalColumns(data)
      } else {
        // No data, use defaults
        setColumns(defaultColumns)
        setOriginalColumns(defaultColumns)
      }
    } catch (err) {
      console.error("[v0] Failed to fetch columns:", err)
      setColumns(defaultColumns)
      setOriginalColumns(defaultColumns)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchColumns()
  }, [fetchColumns])

  // Check for unsaved changes
  useEffect(() => {
    const changed = JSON.stringify(columns) !== JSON.stringify(originalColumns)
    setHasChanges(changed)
  }, [columns, originalColumns])

  const handleToggleVisibility = (columnKey: string, field: 'is_visible_in_table' | 'is_visible_in_form' | 'is_visible_in_detail') => {
    setColumns(prev => prev.map(col => {
      if (col.column_key === columnKey) {
        return { ...col, [field]: !col[field] }
      }
      return col
    }))
  }

  const handleToggleRequired = (columnKey: string) => {
    setColumns(prev => prev.map(col => {
      if (col.column_key === columnKey && !col.is_system_required) {
        return { ...col, is_required: !col.is_required }
      }
      return col
    }))
  }

  const handleEditColumn = (col: Partial<ColumnConfiguration>) => {
    setSelectedColumn({ ...col })
    setEditDialogOpen(true)
  }

  const handleSaveColumnEdit = () => {
    if (!selectedColumn) return
    setColumns(prev => prev.map(col => 
      col.column_key === selectedColumn.column_key ? selectedColumn : col
    ))
    setEditDialogOpen(false)
    setSelectedColumn(null)
  }

  const handleSaveAll = async () => {
    setSaving(true)
    setErrorMessage(null)
    
    try {
      // Try to upsert to database
      const { error } = await supabase
        .from("column_configurations")
        .upsert(
          columns.map(col => ({
            ...col,
            entity_type: "loan_applications",
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "entity_type,column_key" }
        )

      if (error) {
        console.log("[v0] Save error (table may not exist):", error.message)
        // For now, just update local state as success
        setOriginalColumns([...columns])
        setSuccessMessage("Configuration saved locally. Database table needs to be created for persistence.")
      } else {
        setOriginalColumns([...columns])
        setSuccessMessage("Column configurations saved successfully!")
      }
    } catch (err) {
      setErrorMessage("Failed to save configurations")
      console.error("[v0] Save error:", err)
    } finally {
      setSaving(false)
      setTimeout(() => {
        setSuccessMessage(null)
        setErrorMessage(null)
      }, 3000)
    }
  }

  const handleResetChanges = () => {
    setColumns([...originalColumns])
  }

  const groupedColumns = useMemo(() => {
    const groups: Record<ColumnFieldGroup, Partial<ColumnConfiguration>[]> = {
      borrower: [],
      legal_rep: [],
      loan: [],
      guarantee: [],
      collateral: [],
      additional: [],
      system: [],
    }

    const filtered = searchTerm
      ? columns.filter(col => 
          getDisplayName(col).toLowerCase().includes(searchTerm.toLowerCase()) ||
          col.column_key?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : columns

    filtered.forEach(col => {
      const group = col.field_group as ColumnFieldGroup || "additional"
      if (groups[group]) {
        groups[group].push(col)
      }
    })

    return groups
  }, [columns, searchTerm, getDisplayName])

  const tableVisibleColumns = useMemo(() => 
    columns.filter(c => c.is_visible_in_table).sort((a, b) => (a.table_column_order || 0) - (b.table_column_order || 0)),
    [columns]
  )

  const formVisibleColumns = useMemo(() => 
    columns.filter(c => c.is_visible_in_form).sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [columns]
  )

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access this page. Column Settings is only available for administrators.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Column Configuration</h1>
          <p className="text-muted-foreground mt-1">
            Customize which fields are visible and required in loan applications
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              Unsaved Changes
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={handleResetChanges}
            disabled={!hasChanges || saving}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={!hasChanges || saving}
            className="bg-primary"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
        </Alert>
      )}
      {errorMessage && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="form-requirements" className="space-y-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="form-requirements" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Form Requirements
          </TabsTrigger>
          <TabsTrigger value="configure" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Column Settings
          </TabsTrigger>
          <TabsTrigger value="preview-table" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Table Preview
          </TabsTrigger>
          <TabsTrigger value="preview-form" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Form Preview
          </TabsTrigger>
        </TabsList>

        {/* Form Requirements Tab - New dedicated interface for mandatory/optional fields */}
        <TabsContent value="form-requirements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Loan Application Form Field Requirements
              </CardTitle>
              <CardDescription>
                Configure which fields are mandatory (*) or optional in the loan application form. 
                Mandatory fields will show an asterisk and trigger validation errors when left empty.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {(Object.entries(fieldGroups) as Array<[ColumnFieldGroup, { label: string; icon: React.ElementType; color: string }]>).map(([groupKey, group]) => {
                const groupCols = columns.filter(c => c.field_group === groupKey && c.is_visible_in_form)
                if (groupCols.length === 0 || groupKey === 'system') return null

                const GroupIcon = group.icon
                const requiredCount = groupCols.filter(c => c.is_required).length
                const totalCount = groupCols.length

                return (
                  <div key={groupKey} className={`rounded-lg border ${group.color}`}>
                    <div className="p-4 border-b flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GroupIcon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <h3 className="font-semibold">{group.label}</h3>
                          <p className="text-sm text-muted-foreground">
                            {requiredCount} of {totalCount} fields are mandatory
                          </p>
                        </div>
                      </div>
                      <Badge variant={requiredCount > 0 ? "default" : "secondary"}>
                        {requiredCount} required
                      </Badge>
                    </div>
                    <div className="p-4">
                      <div className="grid gap-3">
                        {groupCols.map((col) => (
                          <div 
                            key={col.column_key} 
                            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                              col.is_required ? 'bg-primary/5 border-primary/20' : 'bg-background'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${col.is_required ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{getDisplayName(col)}</span>
                                  {col.is_required && <span className="text-destructive font-bold">*</span>}
                                  {col.is_system_required && (
                                    <Badge variant="outline" className="text-xs">System Required</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{col.column_key}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm ${col.is_required ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                {col.is_required ? 'Mandatory' : 'Optional'}
                              </span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Switch
                                      checked={col.is_required || false}
                                      onCheckedChange={() => handleToggleRequired(col.column_key!)}
                                      disabled={col.is_system_required}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {col.is_system_required 
                                      ? "This field is required by the system and cannot be changed"
                                      : col.is_required 
                                        ? "Click to make this field optional"
                                        : "Click to make this field mandatory"
                                    }
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Info Box */}
              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-800">
                  <strong>How it works:</strong> When a field is set to mandatory, the loan application form will:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Display an asterisk (*) next to the field label</li>
                    <li>Show a validation error if the field is left empty</li>
                    <li>List missing mandatory fields in a &quot;fields missing&quot; notification per section</li>
                    <li>Prevent form submission until all mandatory fields are filled</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configure" className="space-y-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search columns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Column Groups */}
          <Accordion type="multiple" defaultValue={["borrower", "loan", "guarantee"]} className="space-y-3">
            {(Object.entries(fieldGroups) as Array<[ColumnFieldGroup, any]>).map(([groupKey, group]) => {
              const groupCols = groupedColumns[groupKey]
              if (groupCols.length === 0) return null

              const GroupIcon = group.icon
              return (
                <AccordionItem 
                  key={groupKey} 
                  value={groupKey}
                  className={`border rounded-lg ${group.color}`}
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex items-center gap-3">
                      <GroupIcon className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{group.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {groupCols.length} fields
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="rounded-lg border bg-background overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="w-[200px]">Field Name</TableHead>
                            <TableHead className="w-[120px] text-center">Show in Table</TableHead>
                            <TableHead className="w-[120px] text-center">Show in Form</TableHead>
                            <TableHead className="w-[100px] text-center">Required</TableHead>
                            <TableHead className="w-[100px] text-center">Input Type</TableHead>
                            <TableHead className="w-[80px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groupCols.map((col) => (
                            <TableRow key={col.column_key} className="hover:bg-muted/30">
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                                  <div>
                                    <div className="font-medium">{getDisplayName(col)}</div>
                                    <div className="text-xs text-muted-foreground">{col.column_key}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleToggleVisibility(col.column_key!, 'is_visible_in_table')}
                                        className={col.is_visible_in_table ? "text-green-600" : "text-muted-foreground"}
                                      >
                                        {col.is_visible_in_table ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {col.is_visible_in_table ? "Visible in table" : "Hidden in table"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-center">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleToggleVisibility(col.column_key!, 'is_visible_in_form')}
                                        className={col.is_visible_in_form ? "text-green-600" : "text-muted-foreground"}
                                      >
                                        {col.is_visible_in_form ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {col.is_visible_in_form ? "Visible in form" : "Hidden in form"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-center">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleToggleRequired(col.column_key!)}
                                        disabled={col.is_system_required}
                                        className={col.is_required ? "text-red-600" : "text-muted-foreground"}
                                      >
                                        {col.is_system_required ? (
                                          <Lock className="h-4 w-4" />
                                        ) : col.is_required ? (
                                          <Lock className="h-4 w-4" />
                                        ) : (
                                          <Unlock className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {col.is_system_required 
                                        ? "System required (cannot change)" 
                                        : col.is_required 
                                          ? "Required field" 
                                          : "Optional field"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-xs">
                                  {col.input_type}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditColumn(col)}
                                >
                                  <Settings2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </TabsContent>

        {/* Table Preview Tab */}
        <TabsContent value="preview-table">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Table View Preview</CardTitle>
              <CardDescription>
                Preview how the loan applications table will appear with current settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {tableVisibleColumns.map((col) => (
                        <TableHead key={col.column_key} className="whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {getDisplayName(col)}
                            {col.is_required && <span className="text-red-500">*</span>}
                          </div>
                        </TableHead>
                      ))}
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Sample rows */}
                    {[1, 2, 3].map((row) => (
                      <TableRow key={row}>
                        {tableVisibleColumns.map((col) => (
                          <TableCell key={col.column_key} className="text-muted-foreground">
                            <span className="inline-block bg-muted rounded px-2 py-1 text-xs">
                              Sample data
                            </span>
                          </TableCell>
                        ))}
                        <TableCell>
                          <Button variant="ghost" size="sm" disabled>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Showing {tableVisibleColumns.length} of {columns.length} columns
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Form Preview Tab */}
        <TabsContent value="preview-form">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Form View Preview</CardTitle>
              <CardDescription>
                Preview how the loan application form will appear with current settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 max-w-2xl">
                {(Object.entries(fieldGroups) as Array<[ColumnFieldGroup, { label: string; icon: React.ElementType; color: string }]>).map(([groupKey, group]) => {
                  const groupCols = formVisibleColumns.filter(c => c.field_group === groupKey)
                  if (groupCols.length === 0) return null

                  const GroupIcon = group.icon
                  return (
                    <div key={groupKey} className={`p-4 rounded-lg border ${group.color}`}>
                      <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
                        <GroupIcon className="h-4 w-4" />
                        {group.label}
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {groupCols.map((col) => (
                          <div key={col.column_key} className="space-y-1.5">
                            <Label className="text-sm">
                              {getDisplayName(col)}
                              {col.is_required && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {col.input_type === "textarea" ? (
                              <div className="h-20 rounded-md border bg-muted/30" />
                            ) : col.input_type === "select" ? (
                              <div className="h-10 rounded-md border bg-muted/30 flex items-center px-3 text-sm text-muted-foreground">
                                Select...
                              </div>
                            ) : (
                              <div className="h-10 rounded-md border bg-muted/30" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Showing {formVisibleColumns.length} form fields ({formVisibleColumns.filter(c => c.is_required).length} required)
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Column Settings</DialogTitle>
            <DialogDescription>
              Configure advanced settings for {selectedColumn?.display_name_en}
            </DialogDescription>
          </DialogHeader>
          {selectedColumn && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Display Name (English)</Label>
                <Input
                  value={selectedColumn.display_name_en || ""}
                  onChange={(e) => setSelectedColumn({ ...selectedColumn, display_name_en: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Display Name (Russian)</Label>
                <Input
                  value={selectedColumn.display_name_ru || ""}
                  onChange={(e) => setSelectedColumn({ ...selectedColumn, display_name_ru: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Display Name (Tajik)</Label>
                <Input
                  value={selectedColumn.display_name_tj || ""}
                  onChange={(e) => setSelectedColumn({ ...selectedColumn, display_name_tj: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Input Type</Label>
                <Select
                  value={selectedColumn.input_type}
                  onValueChange={(value: ColumnInputType) => setSelectedColumn({ ...selectedColumn, input_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inputTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Display Order</Label>
                  <Input
                    type="number"
                    value={selectedColumn.display_order || 0}
                    onChange={(e) => setSelectedColumn({ ...selectedColumn, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Table Column Order</Label>
                  <Input
                    type="number"
                    value={selectedColumn.table_column_order || 0}
                    onChange={(e) => setSelectedColumn({ ...selectedColumn, table_column_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Visible in Table</Label>
                <Switch
                  checked={selectedColumn.is_visible_in_table || false}
                  onCheckedChange={(checked) => setSelectedColumn({ ...selectedColumn, is_visible_in_table: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Visible in Form</Label>
                <Switch
                  checked={selectedColumn.is_visible_in_form || false}
                  onCheckedChange={(checked) => setSelectedColumn({ ...selectedColumn, is_visible_in_form: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Required Field</Label>
                <Switch
                  checked={selectedColumn.is_required || false}
                  onCheckedChange={(checked) => setSelectedColumn({ ...selectedColumn, is_required: checked })}
                  disabled={selectedColumn.is_system_required}
                />
              </div>
              {selectedColumn.is_system_required && (
                <p className="text-xs text-muted-foreground">
                  This is a system-required field and cannot be made optional.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveColumnEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
