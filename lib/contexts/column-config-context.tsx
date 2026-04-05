"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import type { ColumnConfiguration, ColumnFieldGroup, ColumnInputType } from "@/lib/types/database"

// Default column configurations (used when database table doesn't exist)
const defaultColumns: Partial<ColumnConfiguration>[] = [
  // Borrower Information
  { column_key: "borrower_name", display_name_en: "Borrower Name", display_name_ru: "Наименование заемщика", display_name_tj: "Номи қарзгиранда", field_group: "borrower", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: true, input_type: "text", display_order: 1, table_column_order: 1 },
  { column_key: "borrower_tin", display_name_en: "TIN", display_name_ru: "ИНН", display_name_tj: "РМА", field_group: "borrower", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: true, input_type: "text", display_order: 2, table_column_order: 2 },
  { column_key: "borrower_address", display_name_en: "Address", display_name_ru: "Адрес", display_name_tj: "Суроға", field_group: "borrower", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "textarea", display_order: 3, table_column_order: 0 },
  { column_key: "borrower_phone", display_name_en: "Phone", display_name_ru: "Телефон", display_name_tj: "Телефон", field_group: "borrower", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "text", display_order: 4, table_column_order: 0 },
  { column_key: "sector_id", display_name_en: "Business Sector", display_name_ru: "Сектор деятельности", display_name_tj: "Соҳаи фаъолият", field_group: "borrower", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "select", display_order: 5, table_column_order: 3 },
  
  // Legal Representative
  { column_key: "legal_rep_name", display_name_en: "Legal Representative", display_name_ru: "Законный представитель", display_name_tj: "Намояндаи қонунӣ", field_group: "legal_rep", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "text", display_order: 10, table_column_order: 0 },
  { column_key: "legal_rep_position", display_name_en: "Position", display_name_ru: "Должность", display_name_tj: "Вазифа", field_group: "legal_rep", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "text", display_order: 11, table_column_order: 0 },
  
  // Loan Details
  { column_key: "bank_id", display_name_en: "Bank", display_name_ru: "Банк", display_name_tj: "Бонк", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: true, input_type: "select", display_order: 20, table_column_order: 4 },
  { column_key: "branch_id", display_name_en: "Branch", display_name_ru: "Филиал", display_name_tj: "Филиал", field_group: "loan", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "select", display_order: 21, table_column_order: 0 },
  { column_key: "loan_officer", display_name_en: "Loan Officer", display_name_ru: "Кредитный специалист", display_name_tj: "Мутахассиси қарз", field_group: "loan", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "text", display_order: 22, table_column_order: 0 },
  { column_key: "purpose", display_name_en: "Loan Purpose", display_name_ru: "Цель кредита", display_name_tj: "Мақсади қарз", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: false, input_type: "textarea", display_order: 23, table_column_order: 5 },
  { column_key: "requested_amount", display_name_en: "Requested Amount", display_name_ru: "Запрашиваемая сумма", display_name_tj: "Маблағи дархостшуда", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: true, input_type: "currency", display_order: 24, table_column_order: 6 },
  { column_key: "currency", display_name_en: "Currency", display_name_ru: "Валюта", display_name_tj: "Асъор", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: true, input_type: "select", display_order: 25, table_column_order: 7 },
  { column_key: "loan_term_months", display_name_en: "Loan Term (months)", display_name_ru: "Срок кредита (месяцев)", display_name_tj: "Мӯҳлати қарз (моҳ)", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: false, input_type: "number", display_order: 26, table_column_order: 8 },
  { column_key: "grace_period_months", display_name_en: "Grace Period (months)", display_name_ru: "Льготный период (месяцев)", display_name_tj: "Давраи имтиёзӣ (моҳ)", field_group: "loan", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "number", display_order: 27, table_column_order: 0 },
  { column_key: "interest_rate", display_name_en: "Interest Rate (%)", display_name_ru: "Процентная ставка (%)", display_name_tj: "Фоизи қарз (%)", field_group: "loan", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: false, input_type: "number", display_order: 28, table_column_order: 9 },
  { column_key: "repayment_frequency", display_name_en: "Repayment Frequency", display_name_ru: "Периодичность погашения", display_name_tj: "Тартиби пардохт", field_group: "loan", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "select", display_order: 29, table_column_order: 0 },
  
  // Guarantee Details
  { column_key: "guarantee_coverage", display_name_en: "Guarantee Coverage (%)", display_name_ru: "Покрытие гарантии (%)", display_name_tj: "Ҳаҷми кафолат (%)", field_group: "guarantee", is_visible_in_table: true, is_visible_in_form: true, is_visible_in_detail: true, is_required: true, is_system_required: true, input_type: "number", display_order: 40, table_column_order: 10 },
  { column_key: "guarantee_amount", display_name_en: "Guarantee Amount", display_name_ru: "Сумма гарантии", display_name_tj: "Маблағи кафолат", field_group: "guarantee", is_visible_in_table: true, is_visible_in_form: false, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "currency", display_order: 41, table_column_order: 11 },
  
  // Collateral
  { column_key: "collateral_type", display_name_en: "Collateral Type", display_name_ru: "Тип залога", display_name_tj: "Навъи гарав", field_group: "collateral", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "select", display_order: 50, table_column_order: 0 },
  { column_key: "collateral_value", display_name_en: "Collateral Value", display_name_ru: "Стоимость залога", display_name_tj: "Арзиши гарав", field_group: "collateral", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "currency", display_order: 51, table_column_order: 0 },
  { column_key: "collateral_description", display_name_en: "Collateral Description", display_name_ru: "Описание залога", display_name_tj: "Тавсифи гарав", field_group: "collateral", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "textarea", display_order: 52, table_column_order: 0 },
  
  // Additional
  { column_key: "notes", display_name_en: "Internal Notes", display_name_ru: "Внутренние заметки", display_name_tj: "Қайдҳои дохилӣ", field_group: "additional", is_visible_in_table: false, is_visible_in_form: true, is_visible_in_detail: true, is_required: false, is_system_required: false, input_type: "textarea", display_order: 60, table_column_order: 0 },
  
  // System
  { column_key: "status", display_name_en: "Status", display_name_ru: "Статус", display_name_tj: "Ҳолат", field_group: "system", is_visible_in_table: true, is_visible_in_form: false, is_visible_in_detail: true, is_required: false, is_system_required: true, input_type: "select", display_order: 70, table_column_order: 12 },
  { column_key: "created_at", display_name_en: "Created Date", display_name_ru: "Дата создания", display_name_tj: "Санаи эҷод", field_group: "system", is_visible_in_table: true, is_visible_in_form: false, is_visible_in_detail: true, is_required: false, is_system_required: true, input_type: "date", display_order: 71, table_column_order: 13 },
]

interface ColumnConfigContextType {
  columns: Partial<ColumnConfiguration>[]
  loading: boolean
  error: string | null
  
  // Getters
  getColumn: (columnKey: string) => Partial<ColumnConfiguration> | undefined
  getDisplayName: (columnKey: string, locale: string) => string
  isColumnVisible: (columnKey: string, view: 'table' | 'form' | 'detail') => boolean
  isColumnRequired: (columnKey: string) => boolean
  
  // Filtered lists
  getTableColumns: () => Partial<ColumnConfiguration>[]
  getFormColumns: () => Partial<ColumnConfiguration>[]
  getDetailColumns: () => Partial<ColumnConfiguration>[]
  getColumnsByGroup: (group: ColumnFieldGroup) => Partial<ColumnConfiguration>[]
  
  // Validation
  validateField: (columnKey: string, value: any) => { valid: boolean; error?: string }
  
  // Refresh
  refreshColumns: () => Promise<void>
}

const ColumnConfigContext = createContext<ColumnConfigContextType | undefined>(undefined)

export function ColumnConfigProvider({ children }: { children: ReactNode }) {
  const [columns, setColumns] = useState<Partial<ColumnConfiguration>[]>(defaultColumns)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchColumns = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from("column_configurations")
        .select("*")
        .eq("entity_type", "loan_applications")
        .order("display_order", { ascending: true })

      if (fetchError) {
        // Table might not exist, use defaults
        console.log("[ColumnConfig] Using default configurations")
        setColumns(defaultColumns)
      } else if (data && data.length > 0) {
        setColumns(data)
      } else {
        setColumns(defaultColumns)
      }
    } catch (err) {
      console.error("[ColumnConfig] Error loading configurations:", err)
      setError("Failed to load column configurations")
      setColumns(defaultColumns)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchColumns()
  }, [fetchColumns])

  const getColumn = useCallback((columnKey: string) => {
    return columns.find(c => c.column_key === columnKey)
  }, [columns])

  const getDisplayName = useCallback((columnKey: string, locale: string) => {
    const col = columns.find(c => c.column_key === columnKey)
    if (!col) return columnKey
    
    if (locale === "ru" && col.display_name_ru) return col.display_name_ru
    if (locale === "tj" && col.display_name_tj) return col.display_name_tj
    return col.display_name_en || columnKey
  }, [columns])

  const isColumnVisible = useCallback((columnKey: string, view: 'table' | 'form' | 'detail') => {
    const col = columns.find(c => c.column_key === columnKey)
    if (!col) return true // Default to visible if not configured
    
    switch (view) {
      case 'table': return col.is_visible_in_table ?? true
      case 'form': return col.is_visible_in_form ?? true
      case 'detail': return col.is_visible_in_detail ?? true
      default: return true
    }
  }, [columns])

  const isColumnRequired = useCallback((columnKey: string) => {
    const col = columns.find(c => c.column_key === columnKey)
    return col?.is_required || col?.is_system_required || false
  }, [columns])

  const getTableColumns = useCallback(() => {
    return columns
      .filter(c => c.is_visible_in_table)
      .sort((a, b) => (a.table_column_order || 0) - (b.table_column_order || 0))
  }, [columns])

  const getFormColumns = useCallback(() => {
    return columns
      .filter(c => c.is_visible_in_form)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  }, [columns])

  const getDetailColumns = useCallback(() => {
    return columns
      .filter(c => c.is_visible_in_detail)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  }, [columns])

  const getColumnsByGroup = useCallback((group: ColumnFieldGroup) => {
    return columns
      .filter(c => c.field_group === group)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  }, [columns])

  const validateField = useCallback((columnKey: string, value: any): { valid: boolean; error?: string } => {
    const col = columns.find(c => c.column_key === columnKey)
    if (!col) return { valid: true }

    // Check required
    if ((col.is_required || col.is_system_required) && (value === null || value === undefined || value === '')) {
      return { valid: false, error: `${col.display_name_en} is required` }
    }

    // Skip further validation if empty and not required
    if (value === null || value === undefined || value === '') {
      return { valid: true }
    }

    // Type-specific validation
    if (col.validation_type === 'number' || col.input_type === 'number' || col.input_type === 'currency') {
      const numValue = parseFloat(value)
      if (isNaN(numValue)) {
        return { valid: false, error: `${col.display_name_en} must be a valid number` }
      }
      if (col.min_value !== null && col.min_value !== undefined && numValue < col.min_value) {
        return { valid: false, error: `${col.display_name_en} must be at least ${col.min_value}` }
      }
      if (col.max_value !== null && col.max_value !== undefined && numValue > col.max_value) {
        return { valid: false, error: `${col.display_name_en} cannot exceed ${col.max_value}` }
      }
    }

    if (col.validation_type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(value)) {
        return { valid: false, error: 'Please enter a valid email address' }
      }
    }

    if (col.validation_type === 'phone') {
      const phoneRegex = /^\+?[\d\s\-()]{7,15}$/
      if (!phoneRegex.test(value)) {
        return { valid: false, error: 'Please enter a valid phone number' }
      }
    }

    if (col.validation_type === 'tin') {
      const tinClean = String(value).replace(/\D/g, '')
      if (tinClean.length !== 9) {
        return { valid: false, error: 'TIN must be exactly 9 digits' }
      }
    }

    if (col.validation_type === 'percentage') {
      const numValue = parseFloat(value)
      if (isNaN(numValue) || numValue < 0 || numValue > 100) {
        return { valid: false, error: `${col.display_name_en} must be between 0 and 100` }
      }
    }

    // Length validation
    if (col.min_length && String(value).length < col.min_length) {
      return { valid: false, error: `${col.display_name_en} must be at least ${col.min_length} characters` }
    }
    if (col.max_length && String(value).length > col.max_length) {
      return { valid: false, error: `${col.display_name_en} cannot exceed ${col.max_length} characters` }
    }

    // Regex validation
    if (col.regex_pattern) {
      try {
        const regex = new RegExp(col.regex_pattern)
        if (!regex.test(String(value))) {
          return { valid: false, error: `${col.display_name_en} format is invalid` }
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return { valid: true }
  }, [columns])

  const refreshColumns = useCallback(async () => {
    setLoading(true)
    await fetchColumns()
  }, [fetchColumns])

  const value = useMemo(() => ({
    columns,
    loading,
    error,
    getColumn,
    getDisplayName,
    isColumnVisible,
    isColumnRequired,
    getTableColumns,
    getFormColumns,
    getDetailColumns,
    getColumnsByGroup,
    validateField,
    refreshColumns,
  }), [
    columns, loading, error, getColumn, getDisplayName, isColumnVisible,
    isColumnRequired, getTableColumns, getFormColumns, getDetailColumns,
    getColumnsByGroup, validateField, refreshColumns
  ])

  return (
    <ColumnConfigContext.Provider value={value}>
      {children}
    </ColumnConfigContext.Provider>
  )
}

export function useColumnConfig() {
  const context = useContext(ColumnConfigContext)
  if (context === undefined) {
    throw new Error("useColumnConfig must be used within a ColumnConfigProvider")
  }
  return context
}

// Convenience hook for getting localized display name
export function useColumnDisplayName(columnKey: string, locale: string = 'en') {
  const { getDisplayName } = useColumnConfig()
  return getDisplayName(columnKey, locale)
}

// Hook for checking if a field is visible
export function useColumnVisibility(columnKey: string, view: 'table' | 'form' | 'detail' = 'form') {
  const { isColumnVisible } = useColumnConfig()
  return isColumnVisible(columnKey, view)
}

// Hook for form validation
export function useColumnValidation() {
  const { validateField, isColumnRequired, columns } = useColumnConfig()
  
  const validateForm = useCallback((formData: Record<string, any>) => {
    const errors: Record<string, string> = {}
    let isValid = true
    
    for (const col of columns) {
      if (!col.column_key || !col.is_visible_in_form) continue
      
      const result = validateField(col.column_key, formData[col.column_key])
      if (!result.valid && result.error) {
        errors[col.column_key] = result.error
        isValid = false
      }
    }
    
    return { isValid, errors }
  }, [columns, validateField])
  
  return { validateField, validateForm, isColumnRequired }
}

// Hook for grouped validation - returns missing required fields per section
export function useGroupedValidation() {
  const { columns, validateField } = useColumnConfig()
  
  const getMissingFieldsByGroup = useCallback((formData: Record<string, any>) => {
    const groups: Record<ColumnFieldGroup, Array<{ field: string; label: string; error: string }>> = {
      borrower: [],
      legal_rep: [],
      loan: [],
      guarantee: [],
      collateral: [],
      additional: [],
      system: [],
    }
    
    for (const col of columns) {
      if (!col.column_key || !col.is_visible_in_form || !col.field_group) continue
      
      // Only check required fields
      if (!col.is_required && !col.is_system_required) continue
      
      const result = validateField(col.column_key, formData[col.column_key])
      if (!result.valid && result.error) {
        groups[col.field_group].push({
          field: col.column_key,
          label: col.display_name_en || col.column_key,
          error: result.error,
        })
      }
    }
    
    return groups
  }, [columns, validateField])
  
  const getRequiredFieldsForGroup = useCallback((group: ColumnFieldGroup) => {
    return columns.filter(c => 
      c.field_group === group && 
      c.is_visible_in_form && 
      (c.is_required || c.is_system_required)
    )
  }, [columns])
  
  return { getMissingFieldsByGroup, getRequiredFieldsForGroup }
}
