"use client"

import { useMemo, useCallback } from "react"
import { validateTIN, validateEmail, validatePhone, validateCurrency, validatePercentage, validateNumeric, ValidationResult } from "@/lib/utils/validation"

export type FormStep = "borrower" | "legal_rep" | "loan" | "collateral" | "additional"

export interface FieldValidation {
  field: string
  label: string
  required: boolean
  validate: (value: any, formData?: Record<string, any>) => ValidationResult
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

export function useLoanFormValidation(formData: Record<string, any>) {
  // Validate a single field
  const validateField = useCallback((fieldName: string, value: any): ValidationResult => {
    for (const stepVal of stepValidations) {
      const field = stepVal.fields.find(f => f.field === fieldName)
      if (field) {
        return field.validate(value, formData)
      }
    }
    return { isValid: true }
  }, [formData])

  // Validate all fields in a step
  const validateStep = useCallback((step: FormStep): { isValid: boolean; errors: { field: string; label: string; error: string }[] } => {
    const stepConfig = stepValidations.find(s => s.step === step)
    if (!stepConfig) return { isValid: true, errors: [] }

    const errors: { field: string; label: string; error: string }[] = []

    for (const field of stepConfig.fields) {
      const value = formData[field.field]
      const result = field.validate(value, formData)
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
  }, [formData])

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
    return stepConfig.fields.filter(f => f.required).map(f => f.field)
  }, [])

  return {
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
