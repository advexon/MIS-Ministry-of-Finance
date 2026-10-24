"use client"

import { useMemo, useCallback } from "react"
import { validateTIN, validateEmail, validatePhone, validateCurrency, validatePercentage, validateNumeric, ValidationResult } from "@/lib/utils/validation"
import { FORM_DEFS, isEmptyValue } from "@/lib/forms/field-requirements"
import { useFieldRequirements } from "@/lib/hooks/use-field-requirements"

const LOAN_FORM_FIELD_KEYS = new Set(
  FORM_DEFS.find((d) => d.id === "loan_application")?.fields.map((f) => f.key) ?? [],
)
const registryHasField = (key: string) => LOAN_FORM_FIELD_KEYS.has(key)

export type FormStep = "borrower" | "legal_rep" | "loan" | "collateral" | "additional"

export interface FieldValidation {
  field: string
  label: string
  required: boolean
  validate: (value: string, formData?: Record<string, unknown>) => ValidationResult
}

export interface StepValidation {
  step: FormStep
  fields: FieldValidation[]
}

export interface FormValidationState {
  [field: string]: {
    touched: boolean
    error: string | null
    isValid: boolean
  }
}

export interface StepStatus {
  step: FormStep
  label: string
  isComplete: boolean
  isValid: boolean
  errorCount: number
  errors: { field: string; label: string; error: string }[]
}

// Define validation rules for each step
const stepValidations: StepValidation[] = [
  {
    step: "borrower",
    fields: [
      {
        field: "legalEntityType",
        label: "Legal Entity Type",
        required: true,
        validate: (v) => {
          if (!v) return { isValid: false, error: "Please select entity type" }
          // Only two borrower types are accepted ("individual" was retired)
          const validTypes = ["legal_entity", "individual_entrepreneur"]
          if (!validTypes.includes(v)) return { isValid: false, error: "Invalid entity type selected" }
          return { isValid: true }
        }
      },
      {
        field: "clientName",
        label: "Borrower Name",
        required: true,
        validate: (v) => v?.trim() ? { isValid: true } : { isValid: false, error: "Borrower name is required" }
      },
      {
        field: "clientTin",
        label: "TIN Number",
        required: true,
        validate: (v) => validateTIN(v, true)
      },
      {
        field: "sectorId",
        label: "Business Sector",
        required: true,
        validate: (v) => v ? { isValid: true } : { isValid: false, error: "Please select a business sector" }
      },
      {
        // Optional (no asterisk in the form)
        field: "addressStreet",
        label: "Street Address",
        required: false,
        validate: () => ({ isValid: true })
      },
      {
        // Optional (no asterisk in the form)
        field: "city",
        label: "City",
        required: false,
        validate: () => ({ isValid: true })
      },
      {
        // Optional (no asterisk in the form). Still format-checked when filled in.
        field: "phone",
        label: "Phone Number",
        required: false,
        validate: (v) => validatePhone(v, false)
      },
      {
        field: "email",
        label: "Email Address",
        required: false,
        validate: (v) => validateEmail(v, false)
      },
      {
        field: "workforce",
        label: "Number of Employees",
        required: true,
        validate: (v) => validateNumeric(v, { required: false, min: 1, allowDecimal: false, fieldName: "Number of employees" })
      },
    ],
  },
  {
    step: "legal_rep",
    fields: [
      {
        field: "legalRepSurname",
        label: "Legal Rep Surname",
        required: true,
        validate: (v) => v?.trim() ? { isValid: true } : { isValid: false, error: "Surname is required" }
      },
      {
        field: "legalRepName",
        label: "Legal Rep First Name",
        required: true,
        validate: (v) => v?.trim() ? { isValid: true } : { isValid: false, error: "First name is required" }
      },
      {
        field: "legalRepGender",
        label: "Gender",
        required: true,
        validate: (v) => v ? { isValid: true } : { isValid: false, error: "Please select gender" }
      },
      {
        // Optional (no asterisk in the form). Age rules still apply once a date is entered.
        field: "legalRepBirthdate",
        label: "Date of Birth",
        required: false,
        validate: (v) => {
          if (!v) return { isValid: true }
          const date = new Date(v)
          const today = new Date()
          const age = today.getFullYear() - date.getFullYear()
          if (age < 18) return { isValid: false, error: "Legal representative must be at least 18 years old" }
          if (age > 100) return { isValid: false, error: "Please enter a valid date of birth" }
          return { isValid: true }
        }
      },
      {
        field: "legalRepTin",
        label: "TIN Number",
        required: true,
        validate: (v) => {
          if (!v || v === "") return { isValid: false, error: "TIN Number is required for the legal representative" }
          const digitsOnly = String(v).replace(/\D/g, "")
          if (digitsOnly.length !== 9) return { isValid: false, error: "TIN Number must be exactly 9 digits" }
          return { isValid: true }
        }
      },
      {
        // Optional (no asterisk in the form)
        field: "passportNumber",
        label: "Passport Number",
        required: false,
        validate: () => ({ isValid: true })
      },
    ],
  },
  {
    step: "loan",
    fields: [
      {
        field: "bankId",
        label: "Bank",
        required: true,
        validate: (v) => v ? { isValid: true } : { isValid: false, error: "Please select a bank" }
      },
      {
        field: "requestedAmount",
        label: "Loan Amount",
        required: true,
        validate: (v) => validateCurrency(v, { required: true, maxAmount: 50000000, fieldName: "Loan amount" })
      },
      {
        field: "loanTerm",
        label: "Loan Term (months)",
        required: true,
        validate: (v) => validateNumeric(v, { required: true, min: 1, max: 360, allowDecimal: false, fieldName: "Loan term" })
      },
      {
        field: "interestRate",
        label: "Interest Rate",
        required: false,
        validate: (v) => v ? validatePercentage(v, { required: false, fieldName: "Interest rate" }) : { isValid: true }
      },
      {
        field: "guaranteeCoverage",
        label: "Guarantee Coverage",
        required: true,
        validate: (v) => {
          const result = validatePercentage(v, { required: true, fieldName: "Guarantee coverage" })
          if (!result.isValid) return result
          const num = parseFloat(v)
          if (num > 70) return { isValid: false, error: "Maximum guarantee coverage is 70%" }
          return { isValid: true }
        }
      },
      {
        field: "purpose",
        label: "Loan Purpose",
        required: true,
        validate: (v) => v ? { isValid: true } : { isValid: false, error: "Please select loan purpose" }
      },
      { field: "branchId", label: "Branch", required: true, validate: () => ({ isValid: true }) },
      { field: "currency", label: "Loan Currency", required: true, validate: () => ({ isValid: true }) },
      { field: "guaranteeType", label: "Guarantee Product", required: true, validate: () => ({ isValid: true }) },
      { field: "applicationDate", label: "Application Date", required: true, validate: () => ({ isValid: true }) },
    ],
  },
  {
    step: "collateral",
    fields: [
      {
        field: "collateralDescription",
        label: "Collateral Description",
        required: false,
        validate: () => ({ isValid: true })
      },
    ],
  },
  {
    step: "additional",
    fields: [
      {
        field: "notes",
        label: "Internal Notes",
        required: false,
        validate: () => ({ isValid: true })
      },
    ],
  },
]

export function useLoanFormValidation(formData: Record<string, unknown>) {
  // Admin-configurable (Required fields page). The asterisk on each label and
  // this check both read the same setting, so they can never disagree.
  const requirements = useFieldRequirements("loan_application")

  const isFieldRequired = useCallback(
    (field: FieldValidation) =>
      registryHasField(field.field) ? requirements.isRequired(field.field) : field.required,
    [requirements],
  )

  // Empty + required → "required" error; empty + optional → valid; otherwise
  // the field's own format rules run (TIN length, coverage cap, …).
  const runField = useCallback((field: FieldValidation, value: unknown): ValidationResult => {
    if (isEmptyValue(value)) {
      return isFieldRequired(field)
        ? { isValid: false, error: `${field.label} is required` }
        : { isValid: true }
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      return { isValid: false, error: `${field.label} has an invalid value` }
    }
    return field.validate(String(value), formData)
  }, [formData, isFieldRequired])

  // Validate a single field
  const validateField = useCallback((fieldName: string, value: unknown): ValidationResult => {
    for (const stepVal of stepValidations) {
      const field = stepVal.fields.find(f => f.field === fieldName)
      if (field) {
        return runField(field, value)
      }
    }
    return { isValid: true }
  }, [runField])

  // Validate all fields in a step
  const validateStep = useCallback((step: FormStep): { isValid: boolean; errors: { field: string; label: string; error: string }[] } => {
    const stepConfig = stepValidations.find(s => s.step === step)
    if (!stepConfig) return { isValid: true, errors: [] }

    const errors: { field: string; label: string; error: string }[] = []

    for (const field of stepConfig.fields) {
      const value = formData[field.field]
      const result = runField(field, value)
      if (!result.isValid && result.error) {
        errors.push({
          field: field.field,
          label: field.label,
          error: result.error,
        })
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }, [formData, runField])

  // Get validation status for all steps
  const stepsStatus = useMemo((): StepStatus[] => {
    const stepLabels: Record<FormStep, string> = {
      borrower: "Borrower",
      legal_rep: "Legal Rep",
      loan: "Loan",
      collateral: "Collateral",
      additional: "Additional",
    }

    return stepValidations.map(stepConfig => {
      const { isValid, errors } = validateStep(stepConfig.step)
      
      // Check if step has been touched (any required field has a value)
      const hasAnyValue = stepConfig.fields.some(f => {
        const value = formData[f.field]
        return value !== undefined && value !== null && value !== ""
      })

      return {
        step: stepConfig.step,
        label: stepLabels[stepConfig.step],
        isComplete: hasAnyValue && isValid,
        isValid,
        errorCount: errors.length,
        errors,
      }
    })
  }, [formData, validateStep])

  // Check if can proceed to next step
  const canProceedToStep = useCallback((targetStep: FormStep): { canProceed: boolean; blockedBy: FormStep | null } => {
    const stepOrder: FormStep[] = ["borrower", "legal_rep", "loan", "collateral", "additional"]
    const targetIndex = stepOrder.indexOf(targetStep)

    for (let i = 0; i < targetIndex; i++) {
      const status = stepsStatus.find(s => s.step === stepOrder[i])
      if (status && !status.isValid) {
        return { canProceed: false, blockedBy: stepOrder[i] }
      }
    }

    return { canProceed: true, blockedBy: null }
  }, [stepsStatus])

  // Get all validation errors across all steps
  const allErrors = useMemo(() => {
    return stepsStatus.flatMap(s => s.errors.map(e => ({ ...e, step: s.step })))
  }, [stepsStatus])

  // Check if form is complete and valid
  const isFormValid = useMemo(() => {
    return stepsStatus.every(s => s.isValid)
  }, [stepsStatus])

  // Get required fields for a step
  const getRequiredFields = useCallback((step: FormStep): string[] => {
    const stepConfig = stepValidations.find(s => s.step === step)
    if (!stepConfig) return []
    return stepConfig.fields.filter(isFieldRequired).map(f => f.field)
  }, [isFieldRequired])

  return {
    isRequired: requirements.isRequired,
    validateField,
    validateStep,
    stepsStatus,
    canProceedToStep,
    allErrors,
    isFormValid,
    getRequiredFields,
  }
}

export { stepValidations }

/**
 * The canonical list of genuinely required field names, derived from
 * `stepValidations` so it can never drift from the form's own validation.
 * Used by the draft completion calculator.
 */
export const REQUIRED_FIELD_NAMES: string[] = stepValidations.flatMap((step) =>
  step.fields.filter((f) => f.required).map((f) => f.field),
)
