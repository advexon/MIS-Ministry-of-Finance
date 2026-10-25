"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { usePageQuery } from "@/lib/hooks/use-page-query"
import { useRouter } from "next/navigation"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Progress } from "@/components/ui/progress"
import { ArrowLeft, Save, Building2, User, DollarSign, FileText, Shield, Loader2, AlertCircle, CheckCircle2, AlertTriangle, FileEdit } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import Link from "next/link"
import type { Bank, BankBranch, Sector, LoanProduct, Borrower } from "@/lib/types/database"
import { useLoanFormValidation, type FormStep } from "@/lib/hooks/use-loan-form-validation"
import { RequiredMark } from "@/components/forms/required-mark"
import { StepValidationPanel } from "@/components/forms/step-validation-panel"
import { useLoanDraft } from "@/lib/hooks/use-loan-draft"
import { usePermissions } from "@/lib/contexts/permission-context"
import { useAuthorityReason } from '@/components/admin/authority-reason-provider'
import { getDatabaseErrorMessage } from "@/lib/utils/db-error"

interface Guarantor {
  name: string
  id_number: string
  relationship: string
}

export default function NewLoanPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = createClient()
  const { can } = usePermissions()
  const requestAuthorityReason = useAuthorityReason()
  const canCreateLoan = can("loans", "create")

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<FormStep>("borrower")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set())
  const [, setShowValidationSummary] = useState(false)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)

  const { data: referenceData, isLoading: loading } = usePageQuery<{ banks: Bank[]; sectors: Sector[]; products: LoanProduct[] }>(["loan-form-options"], async () => {
    const [banks, sectors, products] = await Promise.all([
      supabase.from("banks").select("*").eq("is_active", true).order("name_en"),
      supabase.from("sectors").select("*").eq("is_active", true).order("name_en"),
      supabase.from("loan_products").select("*").eq("is_active", true).order("name_en"),
    ])
    return { banks: banks.data ?? [], sectors: sectors.data ?? [], products: products.data ?? [] }
  })
  const { banks = [], sectors = [], products = [] } = referenceData ?? {}

  // Borrower fields
  const [legalEntityType, setLegalEntityType] = useState("")
  const [companyName, setClientName] = useState("")
  const [clientTin, setClientTin] = useState("")
  const [registrationNumber, setRegistrationNumber] = useState("")
  const [sectorId, setSectorId] = useState("")
  const [addressStreet, setAddressStreet] = useState("")
  const [city, setCity] = useState("")
  const [district, setDistrict] = useState("")
  const [workforce, setWorkforce] = useState("")
  const [establishmentYear, setEstablishmentYear] = useState("")
  const [businessDescription, setBusinessDescription] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [bankCustomerCode, setBankCustomerCode] = useState("")
  const [isBlacklisted, setIsBlacklisted] = useState(false)
  const [blacklistReason, setBlacklistReason] = useState("")
  const [guaranteeType, setGuaranteeType] = useState("individual")

  // TIN validation state
  const [tinError, setTinError] = useState<string | null>(null)
  const [tinDuplicateWarning, setTinDuplicateWarning] = useState<{ name: string; type: string } | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [checkingTin, setCheckingTin] = useState(false)
  const [foundBorrower, setFoundBorrower] = useState<Borrower | null>(null)
  const [borrowerLoaded, setBorrowerLoaded] = useState(false)

  // Legal Representative fields
  const [legalRepSurname, setLegalRepSurname] = useState("")
  const [legalRepName, setLegalRepName] = useState("")
  const [legalRepPatronymic, setLegalRepPatronymic] = useState("")
  const [legalRepGender, setLegalRepGender] = useState("")
  const [legalRepBirthdate, setLegalRepBirthdate] = useState("")
  const [legalRepCountry, setLegalRepCountry] = useState("Tajikistan")
  const [representativeTin, setLegalRepTin] = useState("")
  const [passportNumber, setPassportNumber] = useState("")

  // Loan fields
  const [bankId, setBankId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [productId] = useState("")
  const [requestedAmount, setRequestedAmount] = useState("")
  const [currency, setCurrency] = useState("TJS")
  const [loanTerm, setLoanTerm] = useState("")
  const [gracePeriod, setGracePeriod] = useState("")
  const [frequency, setFrequency] = useState("monthly")
  const [repaymentMethod, setRepaymentMethod] = useState("annuity")
  const [interestRate, setInterestRate] = useState("")
  const [coverageOverride, setGuaranteeCoverage] = useState<string>()
  const [loanOfficer, setLoanOfficer] = useState("")
  const [purpose, setPurpose] = useState("")
  const [purposeDetails, setPurposeDetails] = useState("")
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().split("T")[0])
  const [bankApprovalDate, setBankApprovalDate] = useState("")

  // Financial info
  const [annualTurnover, setAnnualTurnover] = useState("")
  const [netIncome, setNetIncome] = useState("")
  const [riskRating, setRiskRating] = useState("")
  const [totalExposure, setTotalExposure] = useState("")

  // Collateral & guarantors
  const [collateralDescription, setCollateralDescription] = useState("")
  const [covenantBank, setCovenantBank] = useState("")
  const [covenantPrsf, setCovenantPrsf] = useState("")
  const [guarantors] = useState<Guarantor[]>([{ name: "", id_number: "", relationship: "" }])

  const [notes, setNotes] = useState("")

  // An Individual Entrepreneur IS the legal representative — one and the same
  // person. For that type the person's name and TIN are captured once, in the
  // Borrower step, and mirrored into the legal-representative fields so the
  // same data is never typed twice (and can never disagree with itself).
  const isIndividualEntrepreneur = legalEntityType === "individual_entrepreneur"

  // Borrower and representative are the same person for a sole proprietor.
  const clientName = isIndividualEntrepreneur
    ? [legalRepSurname, legalRepName, legalRepPatronymic].map(part => part.trim()).filter(Boolean).join(" ")
    : companyName
  const legalRepTin = isIndividualEntrepreneur ? clientTin : representativeTin
  const product = products.find(item => item.id === productId)
  const guaranteeCoverage = coverageOverride ?? (product ? String(product.guarantee_coverage) : "")

  // Collect all form data into a single object for validation
  const formData = useMemo(() => ({
    legalEntityType, clientName, clientTin, registrationNumber, sectorId,
    addressStreet, city, district, workforce, establishmentYear,
    businessDescription, phone, email, bankCustomerCode, isBlacklisted,
    blacklistReason, guaranteeType, legalRepSurname, legalRepName,
    legalRepPatronymic, legalRepGender, legalRepBirthdate, legalRepCountry,
    legalRepTin, passportNumber, bankId, branchId, productId, requestedAmount,
    currency, loanTerm, gracePeriod, frequency, repaymentMethod, interestRate,
    guaranteeCoverage, loanOfficer, purpose, purposeDetails, applicationDate,
    bankApprovalDate, annualTurnover, netIncome, riskRating, totalExposure,
    collateralDescription, covenantBank, covenantPrsf, guarantors, notes,
  }), [
    legalEntityType, clientName, clientTin, registrationNumber, sectorId,
    addressStreet, city, district, workforce, establishmentYear,
    businessDescription, phone, email, bankCustomerCode, isBlacklisted,
    blacklistReason, guaranteeType, legalRepSurname, legalRepName,
    legalRepPatronymic, legalRepGender, legalRepBirthdate, legalRepCountry,
    legalRepTin, passportNumber, bankId, branchId, productId, requestedAmount,
    currency, loanTerm, gracePeriod, frequency, repaymentMethod, interestRate,
    guaranteeCoverage, loanOfficer, purpose, purposeDetails, applicationDate,
    bankApprovalDate, annualTurnover, netIncome, riskRating, totalExposure,
    collateralDescription, covenantBank, covenantPrsf, guarantors, notes,
  ])

  // Validation hook
  const {
    validateField,
    validateStep,
    stepsStatus,
    allErrors,
    isFormValid,
    isRequired,
  } = useLoanFormValidation(formData)

  // Draft management hook
  const {
    currentDraftId,
    isSaving: isDraftSaving,
    lastSaved,
    saveDraft,
    loadDraft,
    startAutoSave,
    stopAutoSave,
    updateFormData,
    calculateCompletion,
  } = useLoanDraft({
    autoSaveInterval: 30000,
    autoSaveEnabled: true,
    onAutoSave: () => setDraftMessage("Draft auto-saved"),
    onError: (err) => setError(`Draft error: ${err}`),
  })

  // Calculate completion percentage
  const completionPercentage = useMemo(() => calculateCompletion(formData), [formData, calculateCompletion])

  // Mark field as touched for validation display
  const markTouched = useCallback((field: string) => {
    setTouchedFields(prev => new Set(prev).add(field))
  }, [])

  // Get field error if touched
  const getFieldError = useCallback((field: string): string | null => {
    if (!touchedFields.has(field)) return null
    const result = validateField(field, formData[field as keyof typeof formData])
    return result.isValid ? null : result.error || null
  }, [touchedFields, validateField, formData])

  // Check if field has error
  const hasFieldError = useCallback((field: string): boolean => {
    return getFieldError(field) !== null
  }, [getFieldError])

  const getName = (item: { name_en: string; name_ru?: string | null; name_tj?: string | null }) => {
    if (locale === "ru" && item.name_ru) return item.name_ru
    if (locale === "tj" && item.name_tj) return item.name_tj
    return item.name_en
  }

  // Load draft from sessionStorage on mount
  useEffect(() => {
    const draftId = sessionStorage.getItem("loanDraftId")
    if (draftId) {
      sessionStorage.removeItem("loanDraftId")
      loadDraft(draftId).then(draft => {
        if (draft) {
          const data = draft.form_data
          // Restore form data
          if (data.legalEntityType) setLegalEntityType(data.legalEntityType)
          if (data.clientName) setClientName(data.clientName)
          if (data.clientTin) setClientTin(data.clientTin)
          if (data.registrationNumber) setRegistrationNumber(data.registrationNumber)
          if (data.sectorId) setSectorId(data.sectorId)
          if (data.addressStreet) setAddressStreet(data.addressStreet)
          if (data.city) setCity(data.city)
          if (data.district) setDistrict(data.district)
            if (data.workforce) setWorkforce(data.workforce)
          if (data.phone) setPhone(data.phone)
          if (data.email) setEmail(data.email)
          if (data.legalRepSurname) setLegalRepSurname(data.legalRepSurname)
          if (data.legalRepName) setLegalRepName(data.legalRepName)
          if (data.legalRepPatronymic) setLegalRepPatronymic(data.legalRepPatronymic)
          if (data.legalRepGender) setLegalRepGender(data.legalRepGender)
          if (data.legalRepBirthdate) setLegalRepBirthdate(data.legalRepBirthdate)
          if (data.passportNumber) setPassportNumber(data.passportNumber)
          if (data.bankId) setBankId(data.bankId)
          if (data.branchId) setBranchId(data.branchId)
          if (data.requestedAmount) setRequestedAmount(data.requestedAmount)
          if (data.currency) setCurrency(data.currency)
          if (data.loanTerm) setLoanTerm(data.loanTerm)
          if (data.gracePeriod) setGracePeriod(data.gracePeriod)
          if (data.interestRate) setInterestRate(data.interestRate)
          if (data.guaranteeCoverage) setGuaranteeCoverage(data.guaranteeCoverage)
          if (data.purpose) setPurpose(data.purpose)
          if (data.notes) setNotes(data.notes)
          if (data.collateralDescription) setCollateralDescription(data.collateralDescription)
          // Set active tab to where user left off
          if (draft.current_step) setActiveTab(draft.current_step as FormStep)
          setDraftMessage(`Draft "${draft.draft_name}" loaded successfully`)
        }
      })
    }
  }, [loadDraft])

  // Update auto-save with current form data
  useEffect(() => {
    updateFormData(formData, activeTab)
  }, [formData, activeTab, updateFormData])

  // Start/stop auto-save based on form activity
  useEffect(() => {
    if (clientName || clientTin || bankId) {
      startAutoSave(formData, activeTab)
    }
    return () => stopAutoSave()
  }, [clientName, clientTin, bankId, startAutoSave, stopAutoSave, formData, activeTab])

  // Clear draft message after 3 seconds
  useEffect(() => {
    if (draftMessage) {
      const timer = setTimeout(() => setDraftMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [draftMessage])

  const { data: branches = [] } = usePageQuery<BankBranch[]>(bankId ? ["bank-branches", bankId] : null, async () => {
    const { data, error } = await supabase.from("bank_branches").select("*").eq("bank_id", bankId).eq("is_active", true).order("name_en")
    if (error) throw error
    return data ?? []
  })
  const { data: bankOfficers = [] } = usePageQuery<{ id: string; full_name: string }[]>(bankId ? ["bank-officers", bankId] : null, async () => {
    const { data, error } = await supabase.from("profiles").select("id, first_name, last_name").eq("bank_id", bankId).eq("is_active", true).order("last_name")
    if (error) throw error
    return (data ?? []).map(profile => ({ id: profile.id, full_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") }))
  })
  const handleBankChange = (value: string) => {
    setBankId(value)
    setBranchId("")
    setLoanOfficer("")
  }

  // TIN validation: exactly 9 digits, check for existing borrower
  const handleTinChange = async (value: string) => {
    // Only allow digits, strip anything else
    const digitsOnly = value.replace(/\D/g, "")
    // Limit to 9 digits
    const limitedValue = digitsOnly.slice(0, 9)
    setClientTin(limitedValue)
    setTinError(null)
    setTinDuplicateWarning(null)
    setFoundBorrower(null)
    setBorrowerLoaded(false)

    // Validate length
    if (limitedValue.length > 0 && limitedValue.length !== 9) {
      setTinError(`TIN must be exactly 9 digits (currently ${limitedValue.length})`)
      return
    }

    // Check for existing borrower when we have exactly 9 digits
    if (limitedValue.length === 9) {
      setCheckingTin(true)
      try {
        // Fetch ALL borrower fields to enable auto-population
        const { data: existingBorrower } = await supabase
          .from("borrowers")
          .select("*")
          .eq("tin_number", limitedValue)
          .maybeSingle()

        if (existingBorrower) {
          // legal_type here is the STORED database value, so match on those.
          const storedTypeLabels: Record<string, string> = {
            llc: "Legal Entity",
            jsc: "Legal Entity",
            legal_entity: "Legal Entity",
            sole_proprietor: "Individual Entrepreneur",
            individual_entrepreneur: "Individual Entrepreneur",
            cooperative: "Cooperative",
            individual: "Individual (legacy)",
          }
          const typeLabel =
            storedTypeLabels[existingBorrower.legal_type as string] ?? "Other"
          setTinDuplicateWarning({
            name: existingBorrower.name,
            type: typeLabel
          })
          setFoundBorrower(existingBorrower)
          setShowDuplicateDialog(true)
        }
      } catch (err) {
        console.error("Error checking TIN:", err)
      } finally {
        setCheckingTin(false)
      }
    }
  }

  // Map a borrower's STORED legal_type onto one of the two selectable form options.
  // The DB uses llc / sole_proprietor / individual, while the form uses
  // legal_entity / individual_entrepreneur. Retired or unmappable values
  // (e.g. legacy "individual") return "" so the user must pick a current type.
  const toSelectableLegalType = (type: string | null | undefined): string => {
    switch (type) {
      case "llc":
      case "jsc":
      case "legal_entity":
        return "legal_entity"
      case "sole_proprietor":
      case "individual_entrepreneur":
        return "individual_entrepreneur"
      default:
        return ""
    }
  }

  // Load existing borrower data into form fields
  const loadBorrowerData = () => {
    if (!foundBorrower) return

    // Borrower basic info
    setClientName(foundBorrower.name || "")
    // Only set legal_type if it maps to a currently selectable option,
    // otherwise leave it empty so the user must choose one of the two types
    setLegalEntityType(toSelectableLegalType(foundBorrower.legal_type))
    setRegistrationNumber(foundBorrower.registration_number || "")
    setBankCustomerCode(foundBorrower.customer_code || "")
    setSectorId(foundBorrower.sector_id || "")

    // Address
    setAddressStreet(foundBorrower.address_street || "")
    setCity(foundBorrower.address_city || "")
    setDistrict(foundBorrower.address_district || "")

    // Contact
    setPhone(foundBorrower.phone || "")
    setEmail(foundBorrower.email || "")

    // Workforce
    setWorkforce(foundBorrower.workforce_count?.toString() || "")

    // Legal Representative
    const resolvedType = toSelectableLegalType(foundBorrower.legal_type)
    const storedSurname = foundBorrower.legal_rep_surname || ""
    const storedFirstName = foundBorrower.legal_rep_name || ""
    const storedPatronymic = foundBorrower.legal_rep_patronymic || ""

    // Older entrepreneur records may only have the single `name` with no
    // separate rep name parts. Split it so the mirrored fields are populated
    // instead of the composed borrower name coming out empty.
    if (
      resolvedType === "individual_entrepreneur" &&
      !storedSurname && !storedFirstName && !storedPatronymic &&
      (foundBorrower.name || "").trim()
    ) {
      const parts = (foundBorrower.name || "").trim().split(/\s+/)
      setLegalRepSurname(parts[0] || "")
      setLegalRepName(parts[1] || "")
      setLegalRepPatronymic(parts.slice(2).join(" "))
    } else {
      setLegalRepSurname(storedSurname)
      setLegalRepName(storedFirstName)
      setLegalRepPatronymic(storedPatronymic)
    }
    setLegalRepGender(foundBorrower.legal_rep_gender || "")
    setLegalRepBirthdate(foundBorrower.legal_rep_birthdate || "")
    setLegalRepCountry(foundBorrower.legal_rep_country_of_birth || "Tajikistan")
    setLegalRepTin(foundBorrower.legal_rep_tin || "")

    // Mark as loaded and close dialog
    setBorrowerLoaded(true)
    setShowDuplicateDialog(false)
  }

  // Step navigation with validation
  const stepOrder: FormStep[] = ["borrower", "legal_rep", "loan", "collateral", "additional"]

  const handleStepChange = (newStep: FormStep) => {
    const currentIndex = stepOrder.indexOf(activeTab)
    const newIndex = stepOrder.indexOf(newStep)

    // Mark all fields in current step as touched when leaving
    const currentStepStatus = stepsStatus.find(s => s.step === activeTab)
    if (currentStepStatus) {
      const newTouched = new Set(touchedFields)
      currentStepStatus.errors.forEach(e => newTouched.add(e.field))
      setTouchedFields(newTouched)
    }

    // If going forward, validate current step
    if (newIndex > currentIndex) {
      const { isValid, errors } = validateStep(activeTab)
      if (!isValid) {
        setError(
          `Please complete ${errors.length} required field${errors.length > 1 ? "s" : ""} to continue`,
        )
        setShowValidationSummary(true)
        return
      }
    }

    setError(null)
    setActiveTab(newStep)
  }

  const handleNextStep = () => {
    const currentIndex = stepOrder.indexOf(activeTab)
    if (currentIndex < stepOrder.length - 1) {
      handleStepChange(stepOrder[currentIndex + 1])
    }
  }

  const handlePreviousStep = () => {
    const currentIndex = stepOrder.indexOf(activeTab)
    if (currentIndex > 0) {
      setActiveTab(stepOrder[currentIndex - 1])
    }
  }

  // Manual save draft
  const handleSaveDraft = async () => {
    const result = await saveDraft(formData, activeTab, `${clientName || "Untitled"} - ${new Date().toLocaleDateString()}`)
    if (result.success) {
      setDraftMessage("Draft saved successfully")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // Validate TIN format (9 digits for Tajikistan)
    const cleanedTin = clientTin.replace(/\D/g, '')
    if (cleanedTin.length !== 9) {
      setError('TIN must be exactly 9 digits')
      setIsSubmitting(false)
      return
    }

    // Validate required fields
    if (!bankId) {
      setError('Please select a bank')
      setIsSubmitting(false)
      return
    }

    if (!clientName.trim()) {
      setError('Please enter the borrower name')
      setIsSubmitting(false)
      return
    }

    if (!requestedAmount || parseFloat(requestedAmount) <= 0) {
      setError('Please enter a valid loan amount')
      setIsSubmitting(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Validate legal_type before submission - must be one of the allowed values
      const validLegalTypes = ["legal_entity", "individual_entrepreneur"] as const
      
      if (!legalEntityType || !validLegalTypes.includes(legalEntityType as typeof validLegalTypes[number])) {
        setError("Please select a valid Legal Entity Type")
        setIsSubmitting(false)
        return
      }

      const authorityReason = await requestAuthorityReason()

      // 1. Upsert borrower by TIN
      // Map the form's legal entity types to the values allowed by the
      // borrowers_legal_type_check constraint: individual, sole_proprietor, llc, jsc, cooperative, other
      const sanitizedLegalType = legalEntityType.trim().toLowerCase()
      const legalTypeMap: Record<string, "sole_proprietor" | "llc"> = {
        "legal_entity": "llc",
        "individual_entrepreneur": "sole_proprietor",
      }
      const finalLegalType = legalTypeMap[sanitizedLegalType]
      
      if (!finalLegalType) {
        setError("Invalid Legal Entity Type. Please select a valid option.")
        setIsSubmitting(false)
        return
      }
      
      const borrowerData = {
        tin_number: clientTin,
        legal_type: finalLegalType,
        // Real DB column is `name` — holds the company name or personal full name
        name: clientName,
        registration_number: registrationNumber || null,
        sector_id: sectorId || null,
        address_street: addressStreet || null,
        address_city: city || null,
        address_district: district || null,
        phone: phone || null,
        email: email || null,
        legal_rep_name: legalRepName || null,
        legal_rep_surname: legalRepSurname || null,
        legal_rep_patronymic: legalRepPatronymic || null,
        legal_rep_gender: legalRepGender || null,
        legal_rep_birthdate: legalRepBirthdate || null,
        legal_rep_country_of_birth: legalRepCountry || null,
        legal_rep_tin: legalRepTin || null,
        workforce_count: workforce ? parseInt(workforce) : null,
        customer_code: bankCustomerCode || null,
      }

      // Identify an existing borrower by TIN — the actual identity of the
      // customer — and detect a customer_code already taken by someone else.
      //
      // These lookups go through find_borrower_for_intake (SECURITY DEFINER)
      // rather than querying `borrowers` directly. Borrower rows are now
      // RLS-scoped to the bank that has an application for them, so a direct
      // query could not see a customer first registered by another bank: TIN
      // matching would silently duplicate the customer, and the globally
      // UNIQUE customer_code check below would miss the conflict and fail
      // later with a raw constraint error. The function returns only the few
      // fields needed to match and warn, not the borrower's full PII.
      const { data: intakeMatches, error: intakeError } = await supabase.rpc(
        "find_borrower_for_intake",
        { p_tin: clientTin || null, p_customer_code: bankCustomerCode || null },
      )

      if (intakeError) {
        throw intakeError
      }

      const matches = (intakeMatches ?? []) as Array<{
        id: string
        name: string | null
        tin_number: string | null
        customer_code: string | null
        matched_by: string
      }>

      const existingBorrower = matches.find((m) => m.matched_by === "tin") ?? null

      // customer_code is globally UNIQUE, so a code already used by a
      // DIFFERENT customer must not be reused. Previously this branch reused
      // that row and the update below overwrote another customer's record
      // (name, TIN, address) with this applicant's data. Stop and explain
      // instead of silently overwriting.
      if (bankCustomerCode) {
        const codeOwner = matches.find((m) => m.matched_by === "customer_code")

        if (codeOwner && codeOwner.id !== existingBorrower?.id) {
          setError(
            `Bank Customer Code "${bankCustomerCode}" is already assigned to another customer` +
              `${codeOwner.name ? ` (${codeOwner.name})` : ""}. ` +
              `Please enter a different code, or leave the field blank.`,
          )
          setIsSubmitting(false)
          return
        }
      }

      let borrower: { id: string } | null = null

      if (existingBorrower) {
        // Refresh the existing customer's details.
        //
        // `maybeSingle()` rather than `single()`: when the customer was first
        // registered by ANOTHER bank, borrowers_update RLS returns zero rows.
        // That is intended — one bank must not overwrite another bank's record
        // of a shared customer — so fall back to linking the application to
        // the existing borrower rather than failing the whole submission.
        const { data: updatedBorrower, error: updateError } = await supabase
          .from("borrowers")
          .update(borrowerData)
          .eq("id", existingBorrower.id)
          .select("id")
          .maybeSingle()

        if (updateError) {
          throw updateError
        }
        borrower = updatedBorrower ?? { id: existingBorrower.id }
      } else {
        // Insert new borrower. created_by must be set: borrowers_insert RLS
        // requires the row to be attributable to the caller, and it is what
        // makes this row readable back by the .select() below.
        const { data: newBorrower, error: insertError } = await supabase
          .from("borrowers")
          .insert({ ...borrowerData, created_by: user?.id })
          .select("id")
          .single()

        if (insertError) {
          throw insertError
        }
        borrower = newBorrower
      }

      if (!borrower) {
        throw new Error("Failed to create or update borrower")
      }

      // 2. Calculate guarantee amount
      const reqAmount = parseFloat(requestedAmount) || 0
      const coverage = parseFloat(guaranteeCoverage) || 50
      const guaranteeAmount = (reqAmount * coverage) / 100

      // 3. Generate loan_request_id (internal tracking reference)
      const year = new Date().getFullYear()
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase()
      const loanRequestId = `LR-${year}-${randomSuffix}`

      // 4. Create loan application
      // Column names must match actual database schema (see lib/types/database.ts LoanApplication interface)
      const appData = {
        bank_id: bankId,
        branch_id: branchId || null,
        loan_officer: loanOfficer || null,
        borrower_id: borrower.id,
        product_id: productId || null,
        purpose: purpose || null,
        // Note: requested_amount doesn't exist in DB - use approved_amount for initial value
        approved_amount: reqAmount || null,
        currency,
        // Note: DB column is 'duration_months' not 'loan_term_months'
        duration_months: parseInt(loanTerm) || null,
        grace_period_months: parseInt(gracePeriod) || 0,
        interest_rate: interestRate ? parseFloat(interestRate) : null,
        // Note: DB column is 'frequency' not 'repayment_frequency'
        frequency: frequency,
        guarantee_coverage: coverage,
        guarantee_amount: guaranteeAmount,
        status: "draft" as const,
        notes: notes || null,
        ...(authorityReason ? { authority_reason: authorityReason } : {}),
        created_by: user?.id || null,
        sector_id: sectorId || null,
        loan_request_id: loanRequestId,
      }

      const { data: loanApp, error: loanError } = await supabase
        .from("loan_applications")
        .insert(appData)
        .select("id, loan_number")
        .single()

      if (loanError) {
        throw loanError
      }

      // 4. Log audit trail
      await supabase.from("audit_trail").insert({
        table_name: "loan_applications",
        record_id: loanApp.id,
        action: "INSERT",
        new_data: appData,
        changed_by: user?.id || null,
      })

      setSuccess(true)
      setTimeout(() => router.push(`/dashboard/loans/${loanApp.id}`), 1500)
    } catch (err) {
      // Never surface raw Postgres JSON to the user.
      console.error("[v0] Loan application submit failed:", err)
      setError(getDatabaseErrorMessage(err))
      setIsSubmitting(false)
    }
  }

  // Access control: only Loan Officers and Super Administrators may create
  // a New Loan Application. Block direct navigation for everyone else.
  if (!canCreateLoan) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <Shield className="h-14 w-14 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="max-w-md text-muted-foreground">
            You do not have permission to create a new loan application. This action is
            available only to Loan Officers and Super Administrators.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/loans">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Loans
          </Link>
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <h2 className="text-xl font-semibold">Application Saved for Bank Manager Review</h2>
        <p className="text-muted-foreground">Redirecting to loan list...</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header with Progress */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/dashboard/loans"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.loans.newApplication}</h1>
            <p className="text-muted-foreground">Fill in all required fields to submit a new loan guarantee application</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Draft Status */}
          {currentDraftId && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileEdit className="h-4 w-4" />
              {lastSaved && (
                <span>Saved {new Date(lastSaved).toLocaleTimeString()}</span>
              )}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isDraftSaving}
          >
            {isDraftSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Draft
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/loans/drafts">
              View Drafts
            </Link>
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Application Progress</span>
            <span className="text-sm text-muted-foreground">{completionPercentage}% Complete</span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
          <div className="flex items-center justify-between mt-3">
            {stepsStatus.map((step, index) => (
              <div key={step.step} className="flex items-center gap-1.5">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  step.isValid && step.isComplete
                    ? "bg-green-100 text-green-700"
                    : step.errorCount > 0 && touchedFields.size > 0
                    ? "bg-red-100 text-red-700"
                    : activeTab === step.step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {step.isValid && step.isComplete ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : step.errorCount > 0 && touchedFields.size > 0 ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={`text-xs hidden md:block ${activeTab === step.step ? "font-medium" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Draft Message */}
      {draftMessage && (
        <Alert className="mb-4 border-green-500/50 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{draftMessage}</AlertDescription>
        </Alert>
      )}

      {/* Navigation Error (step blocked) */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={(v) => handleStepChange(v as FormStep)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="borrower" className="gap-1.5 text-xs sm:text-sm relative">
              <User className="h-3.5 w-3.5" /><span className="hidden sm:inline">Borrower</span>
              {stepsStatus[0].errorCount > 0 && touchedFields.size > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {stepsStatus[0].errorCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="legal_rep" className="gap-1.5 text-xs sm:text-sm relative">
              <Shield className="h-3.5 w-3.5" /><span className="hidden sm:inline">Legal Rep</span>
              {stepsStatus[1].errorCount > 0 && touchedFields.size > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {stepsStatus[1].errorCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="loan" className="gap-1.5 text-xs sm:text-sm relative">
              <DollarSign className="h-3.5 w-3.5" /><span className="hidden sm:inline">Loan</span>
              {stepsStatus[2].errorCount > 0 && touchedFields.size > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {stepsStatus[2].errorCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="collateral" className="gap-1.5 text-xs sm:text-sm relative">
              <Building2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Collateral</span>
            </TabsTrigger>
            <TabsTrigger value="additional" className="gap-1.5 text-xs sm:text-sm relative">
              <FileText className="h-3.5 w-3.5" /><span className="hidden sm:inline">Additional</span>
            </TabsTrigger>
          </TabsList>

          {/* ── BORROWER TAB ── */}
          <TabsContent value="borrower" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="borrower" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Borrower Information</CardTitle>
                <CardDescription>
                  {isIndividualEntrepreneur
                    ? "Details of the individual entrepreneur"
                    : "Company or individual borrower details"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={hasFieldError("legalEntityType") ? "text-destructive" : ""}>
                      Legal Entity Type<RequiredMark show={isRequired("legalEntityType")} />
                    </Label>
                    <Select 
                      value={legalEntityType} 
                      onValueChange={(v) => {
                        // Switching to Individual Entrepreneur moves the name into
                        // parts. Carry over anything already typed as a single name
                        // so the switch never silently discards it.
                        if (
                          v === "individual_entrepreneur" &&
                          !legalRepSurname && !legalRepName && !legalRepPatronymic &&
                          clientName.trim()
                        ) {
                          const parts = clientName.trim().split(/\s+/)
                          setLegalRepSurname(parts[0] || "")
                          setLegalRepName(parts[1] || "")
                          setLegalRepPatronymic(parts.slice(2).join(" "))
                        }
                        if (isIndividualEntrepreneur) {
                          setClientName(clientName)
                          setLegalRepTin(legalRepTin)
                        }
                        setLegalEntityType(v)
                        markTouched("legalEntityType")
                      }}
                    >
                      <SelectTrigger className={hasFieldError("legalEntityType") ? "border-destructive" : ""}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Only two borrower types are accepted. "Individual" was retired —
                            legacy records keep their stored value for display purposes. */}
                        <SelectItem value="legal_entity">{t.borrowers.legalEntity}</SelectItem>
                        <SelectItem value="individual_entrepreneur">{t.borrowers.individualEntrepreneur}</SelectItem>
                      </SelectContent>
                    </Select>
                    {hasFieldError("legalEntityType") && (
                      <p className="text-xs text-destructive">{getFieldError("legalEntityType")}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className={hasFieldError("sectorId") ? "text-destructive" : ""}>
                      Business Sector<RequiredMark show={isRequired("sectorId")} />
                    </Label>
                    <Select 
                      value={sectorId} 
                      onValueChange={(v) => { setSectorId(v); markTouched("sectorId") }}
                    >
                      <SelectTrigger className={hasFieldError("sectorId") ? "border-destructive" : ""}>
                        <SelectValue placeholder="Select sector" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{getName(s)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {hasFieldError("sectorId") && (
                      <p className="text-xs text-destructive">{getFieldError("sectorId")}</p>
                    )}
                  </div>
                </div>
                {isIndividualEntrepreneur ? (
                  /* The entrepreneur is a person, not a company — capture the name
                     in parts here, which also fills the Legal Representative step. */
                  <div className="space-y-2">
                    <Label className={hasFieldError("clientName") ? "text-destructive" : ""}>
                      Client Name<RequiredMark show={isRequired("clientName")} />
                    </Label>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Input
                          value={legalRepSurname}
                          onChange={(e) => setLegalRepSurname(e.target.value)}
                          onBlur={() => markTouched("clientName")}
                          placeholder="Surname"
                          aria-label="Client surname"
                          className={hasFieldError("clientName") ? "border-destructive" : ""}
                        />
                        <p className="text-[10px] text-muted-foreground">Surname *</p>
                      </div>
                      <div className="space-y-1.5">
                        <Input
                          value={legalRepName}
                          onChange={(e) => setLegalRepName(e.target.value)}
                          onBlur={() => markTouched("clientName")}
                          placeholder="First name"
                          aria-label="Client first name"
                          className={hasFieldError("clientName") ? "border-destructive" : ""}
                        />
                        <p className="text-[10px] text-muted-foreground">First name *</p>
                      </div>
                      <div className="space-y-1.5">
                        <Input
                          value={legalRepPatronymic}
                          onChange={(e) => setLegalRepPatronymic(e.target.value)}
                          placeholder="Patronymic"
                          aria-label="Client patronymic"
                        />
                        <p className="text-[10px] text-muted-foreground">Patronymic</p>
                      </div>
                    </div>
                    {hasFieldError("clientName") ? (
                      <p className="text-xs text-destructive">{getFieldError("clientName")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This name and the TIN below carry over to the Legal Representative step automatically.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className={hasFieldError("clientName") ? "text-destructive" : ""}>
                      Client / Company Name<RequiredMark show={isRequired("clientName")} />
                    </Label>
                    <Input 
                      value={clientName} 
                      onChange={(e) => setClientName(e.target.value)} 
                      onBlur={() => markTouched("clientName")}
                      placeholder="Full name or company name" 
                      className={hasFieldError("clientName") ? "border-destructive" : ""}
                    />
                    {hasFieldError("clientName") && (
                      <p className="text-xs text-destructive">{getFieldError("clientName")}</p>
                    )}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>TIN Number<RequiredMark show={isRequired("clientTin")} /></Label>
                    <div className="relative">
                      <Input 
                        value={clientTin} 
                        onChange={(e) => handleTinChange(e.target.value)} 
                        placeholder="123456789" 
                        required 
                        maxLength={9}
                        inputMode="numeric"
                        pattern="[0-9]{9}"
                        className={
                          tinError ? "border-destructive pr-10" : 
                          borrowerLoaded ? "border-green-500 bg-green-50 pr-10" :
                          tinDuplicateWarning ? "border-amber-500 pr-10" : ""
                        }
                      />
                      {checkingTin && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                      )}
                      {borrowerLoaded && !checkingTin && (
                        <CheckCircle2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
                      )}
                      {tinDuplicateWarning && !borrowerLoaded && !checkingTin && (
                        <AlertTriangle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                      )}
                    </div>
                    {tinError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {tinError}
                      </p>
                    )}
                    {borrowerLoaded && !tinError && (
                      <p className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Borrower data loaded successfully
                      </p>
                    )}
                    {tinDuplicateWarning && !borrowerLoaded && !tinError && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> 
                        <span>Existing borrower found - </span>
                        <button 
                          type="button" 
                          onClick={() => setShowDuplicateDialog(true)} 
                          className="underline hover:no-underline font-medium"
                        >
                          click to load data
                        </button>
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">Enter exactly 9 digits (numbers only)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Registration Number</Label>
                    <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="REG-XXXXXX" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Bank Customer Code</Label>
                    <Input value={bankCustomerCode} onChange={(e) => setBankCustomerCode(e.target.value)} placeholder="Customer ID at bank" />
                  </div>
                  <div className="space-y-2">
                    <Label>Year of Establishment</Label>
                    <Input type="number" value={establishmentYear} onChange={(e) => setEstablishmentYear(e.target.value)} placeholder="2010" min="1900" max="2026" />
                  </div>
                </div>
                <Separator />
                  <h4 className="font-medium text-sm">Address *</h4>
                <div className="space-y-2">
                  <Label>Street Address (Legal Address)<RequiredMark show={isRequired("addressStreet")} /></Label>
                  <Input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Street, building" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>City<RequiredMark show={isRequired("city")} /></Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dushanbe" />
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
                  </div>
                </div>
                <Separator />
                <h4 className="font-medium text-sm">Contact & Business</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Phone<RequiredMark show={isRequired("phone")} /></Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+992XXXXXXXXX" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email<RequiredMark show={isRequired("email")} /></Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@company.tj" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Number of Employees<RequiredMark show={isRequired("workforce")} /></Label>
                    <Input type="number" value={workforce} onChange={(e) => setWorkforce(e.target.value)} placeholder="10" min="1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Business Description</Label>
                  <Textarea value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} placeholder="Brief description of business activities..." rows={2} />
                </div>
                <Separator />
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">TNB / NABPP Blacklist Check</p>
                    <p className="text-xs text-muted-foreground">Mark if this borrower appears on TNB blacklist</p>
                  </div>
                  <Switch checked={isBlacklisted} onCheckedChange={setIsBlacklisted} />
                </div>
                {isBlacklisted && (
                  <div className="space-y-2">
                    <Label>Blacklist Reason</Label>
                    <Input value={blacklistReason} onChange={(e) => setBlacklistReason(e.target.value)} placeholder="Reason for blacklist" />
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button type="button" onClick={handleNextStep}>Next: Legal Representative</Button>
            </div>
          </TabsContent>

          {/* ── LEGAL REP TAB ���─ */}
          <TabsContent value="legal_rep" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="legal_rep" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Legal Representative</CardTitle>
                <CardDescription>
                  {isIndividualEntrepreneur
                    ? "Identity details of the entrepreneur signing the application"
                    : "Details of the person authorized to sign on behalf of the borrower"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isIndividualEntrepreneur && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/50 p-3 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    <span className="text-muted-foreground">
                      An Individual Entrepreneur is their own legal representative, so the name and TIN
                      are carried over from the Borrower step.
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStepChange("borrower")}
                      className="font-medium underline hover:no-underline"
                    >
                      Edit in Borrower step
                    </button>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Surname<RequiredMark show={isRequired("legalRepSurname")} /></Label>
                    <Input
                      value={legalRepSurname}
                      onChange={(e) => setLegalRepSurname(e.target.value)}
                      readOnly={isIndividualEntrepreneur}
                      aria-readonly={isIndividualEntrepreneur}
                      className={isIndividualEntrepreneur ? "bg-muted text-muted-foreground" : ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>First Name<RequiredMark show={isRequired("legalRepName")} /></Label>
                    <Input
                      value={legalRepName}
                      onChange={(e) => setLegalRepName(e.target.value)}
                      readOnly={isIndividualEntrepreneur}
                      aria-readonly={isIndividualEntrepreneur}
                      className={isIndividualEntrepreneur ? "bg-muted text-muted-foreground" : ""}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Patronymic</Label>
                    <Input
                      value={legalRepPatronymic}
                      onChange={(e) => setLegalRepPatronymic(e.target.value)}
                      readOnly={isIndividualEntrepreneur}
                      aria-readonly={isIndividualEntrepreneur}
                      className={isIndividualEntrepreneur ? "bg-muted text-muted-foreground" : ""}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Gender<RequiredMark show={isRequired("legalRepGender")} /></Label>
                    <Select value={legalRepGender} onValueChange={setLegalRepGender}>
                      <SelectTrigger className={!legalRepGender ? "border-destructive" : ""}><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth<RequiredMark show={isRequired("legalRepBirthdate")} /></Label>
                    <Input type="date" value={legalRepBirthdate} onChange={(e) => setLegalRepBirthdate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Country of Birth</Label>
                    <Input value={legalRepCountry} onChange={(e) => setLegalRepCountry(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>TIN Number<RequiredMark show={isRequired("legalRepTin")} /></Label>
                    <Input 
                      value={legalRepTin} 
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 9)
                        setLegalRepTin(digitsOnly)
                      }} 
                      placeholder="123456789"
                      maxLength={9}
                      inputMode="numeric"
                      pattern="[0-9]{9}"
                      readOnly={isIndividualEntrepreneur}
                      aria-readonly={isIndividualEntrepreneur}
                      className={isIndividualEntrepreneur ? "bg-muted text-muted-foreground" : ""}
                      required
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {isIndividualEntrepreneur ? "Same as the borrower TIN" : "9 digits only"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Passport / ID Number<RequiredMark show={isRequired("passportNumber")} /></Label>
                    <Input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} placeholder="AA1234567" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>Previous</Button>
              <Button type="button" onClick={handleNextStep}>Next: Loan Details</Button>
            </div>
          </TabsContent>

          {/* ── LOAN TAB ── */}
          <TabsContent value="loan" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="loan" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Loan & Guarantee Details</CardTitle>
                <CardDescription>Financial terms and guarantee parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Partner Bank<RequiredMark show={isRequired("bankId")} /></Label>
                    <Select value={bankId} onValueChange={handleBankChange}>
                      <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                      <SelectContent>
                        {banks.map((b) => <SelectItem key={b.id} value={b.id}>{getName(b)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Branch<RequiredMark show={isRequired("branchId")} /></Label>
                    <Select value={branchId} onValueChange={setBranchId} disabled={!bankId || branches.length === 0}>
                      <SelectTrigger><SelectValue placeholder={bankId ? (branches.length === 0 ? "No branches" : "Select branch") : "Select bank first"} /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{getName(b)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Loan Amount<RequiredMark show={isRequired("requestedAmount")} /></Label>
                    <Input type="number" value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} placeholder="500000" min="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Loan Currency<RequiredMark show={isRequired("currency")} /></Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TJS">TJS - Tajikistani Somoni</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Loan Term (months)<RequiredMark show={isRequired("loanTerm")} /></Label>
                    <Input type="number" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} placeholder="36" min="1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Loan Grace Period (months)</Label>
                    <Input type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} placeholder="6" min="0" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Loan Repayment Frequency</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Repayment Method</Label>
                    <Select value={repaymentMethod} onValueChange={setRepaymentMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annuity">Annuity (equal payments)</SelectItem>
                        <SelectItem value="declining_balance">Declining Balance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Guarantee Coverage (%)<RequiredMark show={isRequired("guaranteeCoverage")} /></Label>
                    <Input type="number" value={guaranteeCoverage} onChange={(e) => setGuaranteeCoverage(e.target.value)} placeholder="50" min="0" max="100" />
                    {requestedAmount && guaranteeCoverage && (
                      <p className="text-xs text-muted-foreground">
                        Guarantee amount: {new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(parseFloat(requestedAmount) * parseFloat(guaranteeCoverage) / 100)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Guarantee Product<RequiredMark show={isRequired("guaranteeType")} /></Label>
                    <Select value={guaranteeType} onValueChange={setGuaranteeType}>
                      <SelectTrigger><SelectValue placeholder="Select guarantee type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual Guarantee</SelectItem>
                        <SelectItem value="blanket">Blanket Guarantee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <h4 className="text-sm font-medium">Dates</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Application Date<RequiredMark show={isRequired("applicationDate")} /></Label>
                    <Input type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Approval Date</Label>
                    <Input type="date" value={bankApprovalDate} onChange={(e) => setBankApprovalDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Loan Officer (at Bank)</Label>
                  {bankOfficers.length > 0 ? (
                    <Select value={loanOfficer} onValueChange={setLoanOfficer}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select loan officer" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankOfficers.map((officer) => (
                          <SelectItem key={officer.id} value={officer.full_name}>
                            {officer.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={loanOfficer}
                      onChange={(e) => setLoanOfficer(e.target.value)}
                      placeholder={bankId ? "No officers found — type name manually" : "Select a bank first"}
                    />
                  )}
                </div>
                <Separator />
                <h4 className="text-sm font-medium">Loan Purpose</h4>
                <div className="space-y-2">
                  <Label>Purpose<RequiredMark show={isRequired("purpose")} /></Label>
                  <Select value={purpose} onValueChange={setPurpose}>
                    <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working_capital">Working Capital</SelectItem>
                      <SelectItem value="investment">Investment / Fixed Assets</SelectItem>
                      <SelectItem value="operational">Operational Expenses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Purpose Details</Label>
                  <Textarea value={purposeDetails} onChange={(e) => setPurposeDetails(e.target.value)} placeholder="Describe how the loan will be used..." rows={2} />
                </div>
                <Separator />
                <h4 className="text-sm font-medium">Financial Analysis</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Annual Turnover ({currency})</Label>
                    <Input type="number" value={annualTurnover} onChange={(e) => setAnnualTurnover(e.target.value)} placeholder="1000000" />
                  </div>
                  <div className="space-y-2">
                    <Label>Net Income ({currency})</Label>
                    <Input type="number" value={netIncome} onChange={(e) => setNetIncome(e.target.value)} placeholder="150000" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Total Bank Exposure ({currency})</Label>
                    <Input type="number" value={totalExposure} onChange={(e) => setTotalExposure(e.target.value)} placeholder="Total outstanding at this bank" />
                  </div>
                  <div className="space-y-2">
                    <Label>Risk Rating</Label>
                    <Select value={riskRating} onValueChange={setRiskRating}>
                      <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">A - Excellent</SelectItem>
                        <SelectItem value="B">B - Good</SelectItem>
                        <SelectItem value="C">C - Satisfactory</SelectItem>
                        <SelectItem value="D">D - Substandard</SelectItem>
                        <SelectItem value="E">E - Doubtful</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>Previous</Button>
              <Button type="button" onClick={handleNextStep}>Next: Collateral</Button>
            </div>
          </TabsContent>

          {/* ── COLLATERAL TAB ── */}
          <TabsContent value="collateral" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="collateral" />
            <Card>
              <CardHeader>
                <CardTitle>Collateral & Guarantors</CardTitle>
                <CardDescription>Security provided for this loan application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Collateral Description<RequiredMark show={isRequired("collateralDescription")} /></Label>
                  <Textarea value={collateralDescription} onChange={(e) => setCollateralDescription(e.target.value)} placeholder="Type and description of collateral (real estate, equipment, inventory...)" rows={3} />
                </div>
                <Separator />
                <h4 className="text-sm font-medium">Covenants</h4>
                <div className="space-y-2">
                  <Label>Bank Covenants</Label>
                  <Textarea value={covenantBank} onChange={(e) => setCovenantBank(e.target.value)} placeholder="Conditions imposed by the bank..." rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>PRSF Covenants</Label>
                  <Textarea value={covenantPrsf} onChange={(e) => setCovenantPrsf(e.target.value)} placeholder="Conditions required by PRSF..." rows={2} />
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>Previous</Button>
              <Button type="button" onClick={handleNextStep}>Next: Additional Info</Button>
            </div>
          </TabsContent>

          {/* ── ADDITIONAL TAB ── */}
          <TabsContent value="additional" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="additional" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Notes & Submission</CardTitle>
                <CardDescription>Final review and any additional comments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Internal Notes<RequiredMark show={isRequired("notes")} /></Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes for PRSF reviewers..." rows={4} />
                </div>
                <Separator />
                {/* Summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <h4 className="font-medium text-sm">Application Summary</h4>
                  <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">Borrower:</span><span className="font-medium">{clientName || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">TIN:</span><span className="font-medium">{clientTin || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Bank:</span><span className="font-medium">{banks.find((b) => b.id === bankId)?.name_en || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount:</span><span className="font-medium">{requestedAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(parseFloat(requestedAmount)) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Term:</span><span className="font-medium">{loanTerm ? `${loanTerm} months` : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Coverage:</span><span className="font-medium">{guaranteeCoverage ? `${guaranteeCoverage}%` : "—"}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>Previous</Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !isFormValid} 
                className="gap-2 px-8"
                title={!isFormValid ? "Please complete all required fields" : ""}
              >
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</>
                ) : (
                  <><Save className="h-4 w-4" />Submit Application</>
                )}
              </Button>
            </div>
            {!isFormValid && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Please complete all required fields before submitting.{" "}
                  {allErrors.length} field{allErrors.length === 1 ? "" : "s"} still{" "}
                  {allErrors.length === 1 ? "needs" : "need"} your attention.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </form>

      {/* Existing Borrower Found Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              Existing Borrower Found
            </DialogTitle>
            <DialogDescription>
              A borrower with this TIN number already exists in the system. You can load their information to save time.
            </DialogDescription>
          </DialogHeader>
          {tinDuplicateWarning && foundBorrower && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <p className="font-medium">{tinDuplicateWarning.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <p className="font-medium">{tinDuplicateWarning.type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">TIN:</span>
                  <p className="font-medium">{clientTin}</p>
                </div>
                {foundBorrower.phone && (
                  <div>
                    <span className="text-muted-foreground">Phone:</span>
                    <p className="font-medium">{foundBorrower.phone}</p>
                  </div>
                )}
                {foundBorrower.address_city && (
                  <div>
                    <span className="text-muted-foreground">City:</span>
                    <p className="font-medium">{foundBorrower.address_city}</p>
                  </div>
                )}
                {foundBorrower.email && (
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium">{foundBorrower.email}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <Alert className="border-primary/20 bg-primary/5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription className="ml-2 text-sm">
              Click &quot;Load Borrower Data&quot; to automatically fill in all available information from this existing borrower.
            </AlertDescription>
          </Alert>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowDuplicateDialog(false)
                setClientTin("")
                setTinDuplicateWarning(null)
                setFoundBorrower(null)
              }}
            >
              Clear & Enter New TIN
            </Button>
            <Button 
              variant="secondary"
              onClick={() => setShowDuplicateDialog(false)}
            >
              Continue Without Loading
            </Button>
            <Button 
              onClick={loadBorrowerData}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Load Borrower Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
