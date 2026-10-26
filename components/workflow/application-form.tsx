"use client"

import { useUiTranslation } from '@/lib/i18n/ui-text'

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { usePageQuery } from "@/lib/hooks/use-page-query"
import { useRouter } from "next/navigation"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { useLoanDraft, type LoanDraft } from "@/lib/hooks/use-loan-draft"
import type { LoanApplication } from "@/lib/types/database"
import { applicationToForm } from "@/lib/workflow/application-intake"
import { usePermissions } from "@/lib/contexts/permission-context"
import { useAuthorityReason } from '@/components/admin/authority-reason-provider'
import { getDatabaseErrorMessage } from "@/lib/utils/db-error"

interface Guarantor {
  name: string
  id_number: string
  relationship: string
}

export function ApplicationForm({ initialLoan }: { initialLoan?: LoanApplication }) {
  const uiText = useUiTranslation()

  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = createClient()
  const { can, role, profile } = usePermissions()
  const requestAuthorityReason = useAuthorityReason()
  const editing = Boolean(initialLoan)
  const initialData = useMemo(() => initialLoan ? applicationToForm(initialLoan) : {}, [initialLoan])
  const canCreateLoan = initialLoan
    ? ['draft', 'docs_incomplete'].includes(initialLoan.status) && (role?.code === 'super_admin' || (['bank_admin', 'bank_officer'].includes(role?.code ?? '') && profile?.bank_id === initialLoan.bank_id))
    : can("loans", "create")
  const inFlight = useRef(false)
  const applicationId = useRef<string | null>(initialLoan?.id ?? null)
  const [retryLocked, setRetryLocked] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<FormStep>("borrower")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set())
  const [, setShowValidationSummary] = useState(false)
  const [draftMessage, setDraftMessage] = useState<string | null>(null)

  const { data: referenceData, isLoading: loading, error: referenceError, mutate: reloadOptions } = usePageQuery<{ banks: Bank[]; sectors: Sector[]; products: LoanProduct[] }>(["loan-form-options"], async () => {
    const [banks, sectors, products] = await Promise.all([
      supabase.from("banks").select("*").eq("is_active", true).order("name_en"),
      supabase.from("sectors").select("*").eq("is_active", true).order("name_en"),
      supabase.from("loan_products").select("*").eq("is_active", true).order("name_en"),
    ])
    if (banks.error || sectors.error || products.error) throw new Error('Application options could not be loaded')
    return { banks: banks.data ?? [], sectors: sectors.data ?? [], products: products.data ?? [] }
  })
  const { banks = [], sectors = [], products = [] } = referenceData ?? {}

  // Borrower fields
  const [legalEntityType, setLegalEntityType] = useState(initialData.legalEntityType ?? "")
  const [companyName, setClientName] = useState(initialData.clientName ?? "")
  const [clientTin, setClientTin] = useState(initialData.clientTin ?? "")
  const [registrationNumber, setRegistrationNumber] = useState(initialData.registrationNumber ?? "")
  const [sectorId, setSectorId] = useState(initialData.sectorId ?? "")
  const [addressStreet, setAddressStreet] = useState(initialData.addressStreet ?? "")
  const [city, setCity] = useState(initialData.city ?? "")
  const [district, setDistrict] = useState(initialData.district ?? "")
  const [workforce, setWorkforce] = useState(initialData.workforce ?? "")
  const [establishmentYear, setEstablishmentYear] = useState(initialData.establishmentYear ?? "")
  const [businessDescription, setBusinessDescription] = useState(initialData.businessDescription ?? "")
  const [phone, setPhone] = useState(initialData.phone ?? "")
  const [email, setEmail] = useState(initialData.email ?? "")
  const [bankCustomerCode, setBankCustomerCode] = useState(initialData.bankCustomerCode ?? "")
  const [isBlacklisted, setIsBlacklisted] = useState(initialData.isBlacklisted ?? false)
  const [blacklistReason, setBlacklistReason] = useState(initialData.blacklistReason ?? "")
  const [guaranteeType, setGuaranteeType] = useState(initialData.guaranteeType ?? "individual")

  // TIN validation state
  const [tinError, setTinError] = useState<string | null>(null)
  const [tinDuplicateWarning, setTinDuplicateWarning] = useState<{ name: string; type: string } | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [checkingTin, setCheckingTin] = useState(false)
  const tinRequest = useRef(0)
  const [foundBorrower, setFoundBorrower] = useState<Borrower | null>(null)
  const [borrowerLoaded, setBorrowerLoaded] = useState(false)

  // Legal Representative fields
  const [legalRepSurname, setLegalRepSurname] = useState(initialData.legalRepSurname ?? "")
  const [legalRepName, setLegalRepName] = useState(initialData.legalRepName ?? "")
  const [legalRepPatronymic, setLegalRepPatronymic] = useState(initialData.legalRepPatronymic ?? "")
  const [legalRepGender, setLegalRepGender] = useState(initialData.legalRepGender ?? "")
  const [legalRepBirthdate, setLegalRepBirthdate] = useState(initialData.legalRepBirthdate ?? "")
  const [legalRepCountry, setLegalRepCountry] = useState(initialData.legalRepCountry ?? "Tajikistan")
  const [representativeTin, setLegalRepTin] = useState(initialData.legalRepTin ?? "")
  const [passportNumber, setPassportNumber] = useState(initialData.passportNumber ?? "")

  // Loan fields
  const [bankId, setBankId] = useState(initialData.bankId ?? "")
  const [branchId, setBranchId] = useState(initialData.branchId ?? "")
  const [productId, setProductId] = useState(initialData.productId ?? "")
  const [requestedAmount, setRequestedAmount] = useState(initialData.requestedAmount ?? "")
  const [currency, setCurrency] = useState(initialData.currency ?? "TJS")
  const [loanTerm, setLoanTerm] = useState(initialData.loanTerm ?? "")
  const [gracePeriod, setGracePeriod] = useState(initialData.gracePeriod ?? "")
  const [frequency, setFrequency] = useState(initialData.frequency ?? "monthly")
  const [repaymentMethod, setRepaymentMethod] = useState(initialData.repaymentMethod ?? "annuity")
  const [interestRate, setInterestRate] = useState(initialData.interestRate ?? "")
  const [coverageOverride, setGuaranteeCoverage] = useState<string | undefined>(initialData.guaranteeCoverage)
  const [loanOfficer, setLoanOfficer] = useState(initialData.loanOfficer ?? "")
  const [purpose, setPurpose] = useState(initialData.purpose ?? "")
  const [purposeDetails, setPurposeDetails] = useState(initialData.purposeDetails ?? "")
  const [applicationDate, setApplicationDate] = useState(initialData.applicationDate ?? new Date().toISOString().split("T")[0])
  const [bankApprovalDate, setBankApprovalDate] = useState(initialData.bankApprovalDate ?? "")

  // Financial info
  const [annualTurnover, setAnnualTurnover] = useState(initialData.annualTurnover ?? "")
  const [netIncome, setNetIncome] = useState(initialData.netIncome ?? "")
  const [riskRating, setRiskRating] = useState(initialData.riskRating ?? "")
  const [totalExposure, setTotalExposure] = useState(initialData.totalExposure ?? "")

  // Collateral & guarantors
  const [collateralDescription, setCollateralDescription] = useState(initialData.collateralDescription ?? "")
  const [covenantBank, setCovenantBank] = useState(initialData.covenantBank ?? "")
  const [covenantPrsf, setCovenantPrsf] = useState(initialData.covenantPrsf ?? "")
  const [guarantors, setGuarantors] = useState<Guarantor[]>(initialData.guarantors ?? [{ name: "", id_number: "", relationship: "" }])

  const [notes, setNotes] = useState(initialData.notes ?? "")

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
    getCurrentDraftId,
    waitForSave,
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
    autoSaveEnabled: !editing && !retryLocked && !isSubmitting && !success,
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

  const restoreDraft = useCallback((draft: Pick<LoanDraft, 'form_data' | 'current_step' | 'draft_name'> | null) => {
        if (draft) {
          const data = draft.form_data
          // Restore form data
          setLegalEntityType(data.legalEntityType ?? "")
          setClientName(data.clientName ?? "")
          setClientTin(data.clientTin ?? "")
          setRegistrationNumber(data.registrationNumber ?? "")
          setSectorId(data.sectorId ?? "")
          setAddressStreet(data.addressStreet ?? "")
          setCity(data.city ?? "")
          setDistrict(data.district ?? "")
          setWorkforce(data.workforce ?? "")
          setEstablishmentYear(data.establishmentYear ?? "")
          setBusinessDescription(data.businessDescription ?? "")
          setPhone(data.phone ?? "")
          setEmail(data.email ?? "")
          setBankCustomerCode(data.bankCustomerCode ?? "")
          setIsBlacklisted(data.isBlacklisted ?? false)
          setBlacklistReason(data.blacklistReason ?? "")
          setGuaranteeType(data.guaranteeType ?? "individual")
          setLegalRepSurname(data.legalRepSurname ?? "")
          setLegalRepName(data.legalRepName ?? "")
          setLegalRepPatronymic(data.legalRepPatronymic ?? "")
          setLegalRepGender(data.legalRepGender ?? "")
          setLegalRepBirthdate(data.legalRepBirthdate ?? "")
          setLegalRepCountry(data.legalRepCountry ?? "Tajikistan")
          setLegalRepTin(data.legalRepTin ?? "")
          setPassportNumber(data.passportNumber ?? "")
          setBankId(data.bankId ?? "")
          setBranchId(data.branchId ?? "")
          setProductId(data.productId ?? "")
          setRequestedAmount(data.requestedAmount ?? "")
          setCurrency(data.currency ?? "TJS")
          setLoanTerm(data.loanTerm ?? "")
          setGracePeriod(data.gracePeriod ?? "")
          setFrequency(data.frequency ?? "monthly")
          setRepaymentMethod(data.repaymentMethod ?? "annuity")
          setInterestRate(data.interestRate ?? "")
          setGuaranteeCoverage(data.guaranteeCoverage)
          setLoanOfficer(data.loanOfficer ?? "")
          setPurpose(data.purpose ?? "")
          setPurposeDetails(data.purposeDetails ?? "")
          setApplicationDate(data.applicationDate ?? new Date().toISOString().split("T")[0])
          setBankApprovalDate(data.bankApprovalDate ?? "")
          setAnnualTurnover(data.annualTurnover ?? "")
          setNetIncome(data.netIncome ?? "")
          setRiskRating(data.riskRating ?? "")
          setTotalExposure(data.totalExposure ?? "")
          setCollateralDescription(data.collateralDescription ?? "")
          setCovenantBank(data.covenantBank ?? "")
          setCovenantPrsf(data.covenantPrsf ?? "")
          setGuarantors(data.guarantors ?? [{ name: "", id_number: "", relationship: "" }])
          setNotes(data.notes ?? "")
          // Set active tab to where user left off
          if (draft.current_step) setActiveTab(draft.current_step as FormStep)
          setDraftMessage(`Draft "${draft.draft_name}" loaded successfully`)
        }
  }, [])

  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (initialLoan) return
    const draftId = sessionStorage.getItem('loanDraftId')
    if (draftId) {
      sessionStorage.removeItem('loanDraftId')
      void loadDraft(draftId).then(restoreDraft)
    }
  }, [initialLoan, loadDraft, restoreDraft])

  // Update auto-save with current form data
  useEffect(() => {
    updateFormData(formData, activeTab)
  }, [formData, activeTab, updateFormData])

  const hasActivity = Boolean(clientName || clientTin || bankId)
  // Start/stop auto-save based on form activity
  useEffect(() => {
    if (canCreateLoan && !editing && !isSubmitting && !success && !retryLocked && hasActivity) startAutoSave()
    return () => stopAutoSave()
  }, [hasActivity, canCreateLoan, editing, isSubmitting, success, retryLocked, startAutoSave, stopAutoSave])

  // Clear draft message after 3 seconds
  useEffect(() => {
    if (draftMessage) {
      const timer = setTimeout(() => setDraftMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [draftMessage])

  const { data: branches = [], error: branchError, isLoading: branchesLoading } = usePageQuery<BankBranch[]>(bankId ? ["bank-branches", bankId] : null, async () => {
    const { data, error } = await supabase.from("bank_branches").select("*").eq("bank_id", bankId).eq("is_active", true).order("name_en")
    if (error) throw error
    return data ?? []
  })
  const { data: bankOfficers = [], error: officerError } = usePageQuery<{ id: string; full_name: string }[]>(bankId ? ["bank-officers", bankId] : null, async () => {
    const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, role:roles!inner(code)").eq("role.code", "bank_officer").eq("bank_id", bankId).eq("is_active", true).order("last_name")
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
    if (editing) return
    const request = ++tinRequest.current
    setCheckingTin(false)
    setShowDuplicateDialog(false)
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
        const { data: existingBorrower, error: lookupError } = await supabase
          .from("borrowers")
          .select("*")
          .eq("tin_number", limitedValue)
          .maybeSingle()

        if (request !== tinRequest.current) return
        if (lookupError) throw lookupError
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
      } catch {
        if (request === tinRequest.current) setTinError('Existing borrower lookup is unavailable. Retry the TIN check; saving still verifies identity atomically.')
      } finally {
        if (request === tinRequest.current) setCheckingTin(false)
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
    } else setError(result.error ?? 'Draft could not be saved. Please retry.')
  }

  const pendingSubmission = useRef<{ form: typeof formData; reason: string | null | undefined } | null>(null)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current || !canCreateLoan) return
    if (!retryLocked && !isFormValid) {
      setTouchedFields(new Set(allErrors.map(item => item.field)))
      setError('Complete all required fields before saving.')
      return
    }
    inFlight.current = true
    setIsSubmitting(true)
    setError(null)
    stopAutoSave()
    let sent = false
    try {
      if (!pendingSubmission.current) pendingSubmission.current = { form: structuredClone(formData), reason: await requestAuthorityReason() }
      await waitForSave()
      applicationId.current ??= crypto.randomUUID()
      sent = true
      const { data, error: saveError } = await supabase.rpc('cgf_save_application', {
        p_id: applicationId.current,
        p_form: pendingSubmission.current.form,
        p_expected_revision: initialLoan?.intake_revision ?? null,
        p_expected_status: initialLoan?.status ?? null,
        p_draft: editing ? null : getCurrentDraftId(),
        p_reason: pendingSubmission.current.reason ?? null,
      })
      if (saveError) {
        if (saveError.code && !saveError.code.startsWith('PGRST') && saveError.code !== '40001') pendingSubmission.current = null
        throw saveError
      }
      if (data?.id !== applicationId.current || !['draft', 'docs_incomplete'].includes(data?.status) || !Number.isSafeInteger(data?.revision)) throw new Error('Save receipt was not confirmed. Retry the same save to check its result.')
      setSuccess(true)
      router.push(`/dashboard/loans/${data.id}`)
    } catch (err) {
      setRetryLocked(sent && pendingSubmission.current !== null)
      setError(sent && pendingSubmission.current ? 'Save could not be confirmed. Retry to check the identical request; do not create another application. If another user changed it, reload its detail page.' : getDatabaseErrorMessage(err))
    } finally {
      inFlight.current = false
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
          <h2 className="text-xl font-semibold">{uiText("Access Restricted")}</h2>
          <p className="max-w-md text-muted-foreground">{uiText("You do not have permission to create a new loan application. This action is available only to Loan Officers and Super Administrators.")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/loans">
            <ArrowLeft className="mr-2 h-4 w-4" />{uiText("Back to Loans")}</Link>
        </Button>
      </div>
    )
  }

  if (referenceError) return <div className="flex flex-col gap-4 p-6"><Alert variant="destructive"><AlertDescription>{uiText("Application options could not be loaded. Your form has not been submitted.")}</AlertDescription></Alert><Button className="self-start" variant="outline" onClick={() => void reloadOptions()}>{uiText("Retry loading options")}</Button></div>

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
        <h2 className="text-xl font-semibold">{uiText("Application Saved for Bank Manager Review")}</h2>
        <p className="text-muted-foreground">{uiText("Redirecting to loan list...")}</p>
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
            <h1 className="text-2xl font-bold text-foreground">{editing ? uiText("Correct application") : t.loans.newApplication}</h1>
            <p className="text-muted-foreground">{uiText("Save all application details for bank review. Existing shared borrower records are not overwritten; this file retains its own borrower and financial snapshot.")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Draft Status */}
          {currentDraftId && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileEdit className="h-4 w-4" />
              {lastSaved && (
                <span>{uiText("Saved")} {new Date(lastSaved).toLocaleTimeString()}</span>
              )}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isDraftSaving || editing || isSubmitting || retryLocked}
          >
            {isDraftSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{uiText("Save Draft")}</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/loans/drafts">{uiText("View Drafts")}</Link>
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{uiText("Application Progress")}</span>
            <span className="text-sm text-muted-foreground">{completionPercentage}{uiText("% Complete")}</span>
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
                  {uiText(step.label)}
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
          <AlertDescription>{uiText(error)}</AlertDescription>
        </Alert>
      )}

      {retryLocked && <Button onClick={(event) => void handleSubmit(event)} disabled={isSubmitting}>{isSubmitting ? uiText("Checking save…") : uiText("Retry identical save")}</Button>}
      <form onSubmit={handleSubmit}>
        <fieldset disabled={retryLocked || isSubmitting} className="min-w-0">
        <Tabs value={activeTab} onValueChange={(v) => handleStepChange(v as FormStep)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="borrower" className="gap-1.5 text-xs sm:text-sm relative">
              <User className="h-3.5 w-3.5" /><span className="hidden sm:inline">{uiText("Borrower")}</span>
              {stepsStatus[0].errorCount > 0 && touchedFields.size > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {stepsStatus[0].errorCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="legal_rep" className="gap-1.5 text-xs sm:text-sm relative">
              <Shield className="h-3.5 w-3.5" /><span className="hidden sm:inline">{uiText("Legal Rep")}</span>
              {stepsStatus[1].errorCount > 0 && touchedFields.size > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {stepsStatus[1].errorCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="loan" className="gap-1.5 text-xs sm:text-sm relative">
              <DollarSign className="h-3.5 w-3.5" /><span className="hidden sm:inline">{uiText("Loan")}</span>
              {stepsStatus[2].errorCount > 0 && touchedFields.size > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {stepsStatus[2].errorCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="collateral" className="gap-1.5 text-xs sm:text-sm relative">
              <Building2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">{uiText("Collateral")}</span>
            </TabsTrigger>
            <TabsTrigger value="additional" className="gap-1.5 text-xs sm:text-sm relative">
              <FileText className="h-3.5 w-3.5" /><span className="hidden sm:inline">{uiText("Additional")}</span>
            </TabsTrigger>
          </TabsList>

          {/* ── BORROWER TAB ── */}
          <TabsContent value="borrower" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="borrower" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{uiText("Borrower Information")}</CardTitle>
                <CardDescription>
                  {isIndividualEntrepreneur
                    ? uiText("Details of the individual entrepreneur")
                    : uiText("Company or individual borrower details")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className={hasFieldError("legalEntityType") ? "text-destructive" : ""}>{uiText("Legal Entity Type")}<RequiredMark show={isRequired("legalEntityType")} />
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
                        <SelectValue placeholder={uiText("Select type")} />
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
                    <Label className={hasFieldError("sectorId") ? "text-destructive" : ""}>{uiText("Business Sector")}<RequiredMark show={isRequired("sectorId")} />
                    </Label>
                    <Select 
                      value={sectorId} 
                      onValueChange={(v) => { setSectorId(v); markTouched("sectorId") }}
                    >
                      <SelectTrigger className={hasFieldError("sectorId") ? "border-destructive" : ""}>
                        <SelectValue placeholder={uiText("Select sector")} />
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
                    <Label className={hasFieldError("clientName") ? "text-destructive" : ""}>{uiText("Client Name")}<RequiredMark show={isRequired("clientName")} />
                    </Label>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Input
                          value={legalRepSurname}
                          onChange={(e) => setLegalRepSurname(e.target.value)}
                          onBlur={() => markTouched("clientName")}
                          placeholder={uiText("Surname")}
                          aria-label={uiText("Client surname")}
                          className={hasFieldError("clientName") ? "border-destructive" : ""}
                        />
                        <p className="text-[10px] text-muted-foreground">{uiText("Surname *")}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Input
                          value={legalRepName}
                          onChange={(e) => setLegalRepName(e.target.value)}
                          onBlur={() => markTouched("clientName")}
                          placeholder={uiText("First name")}
                          aria-label={uiText("Client first name")}
                          className={hasFieldError("clientName") ? "border-destructive" : ""}
                        />
                        <p className="text-[10px] text-muted-foreground">{uiText("First name *")}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Input
                          value={legalRepPatronymic}
                          onChange={(e) => setLegalRepPatronymic(e.target.value)}
                          placeholder={uiText("Patronymic")}
                          aria-label={uiText("Client patronymic")}
                        />
                        <p className="text-[10px] text-muted-foreground">{uiText("Patronymic")}</p>
                      </div>
                    </div>
                    {hasFieldError("clientName") ? (
                      <p className="text-xs text-destructive">{getFieldError("clientName")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{uiText("This name and the TIN below carry over to the Legal Representative step automatically.")}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className={hasFieldError("clientName") ? "text-destructive" : ""}>{uiText("Client / Company Name")}<RequiredMark show={isRequired("clientName")} />
                    </Label>
                    <Input 
                      value={clientName} 
                      onChange={(e) => setClientName(e.target.value)} 
                      onBlur={() => markTouched("clientName")}
                      placeholder={uiText("Full name or company name")} 
                      className={hasFieldError("clientName") ? "border-destructive" : ""}
                    />
                    {hasFieldError("clientName") && (
                      <p className="text-xs text-destructive">{getFieldError("clientName")}</p>
                    )}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("TIN Number")}<RequiredMark show={isRequired("clientTin")} /></Label>
                    <div className="relative">
                      <Input 
                      value={clientTin}
                      readOnly={editing}
                      aria-readonly={editing}
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
                        <CheckCircle2 className="h-3 w-3" />{uiText(" Borrower data loaded successfully")}</p>
                    )}
                    {tinDuplicateWarning && !borrowerLoaded && !tinError && (
                      <p className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> 
                        <span>{uiText("Existing borrower found -")} </span>
                        <button 
                          type="button" 
                          onClick={() => setShowDuplicateDialog(true)} 
                          className="underline hover:no-underline font-medium"
                        >{uiText("click to load data")}</button>
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">{uiText("Enter exactly 9 digits (numbers only)")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Registration Number")}</Label>
                    <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder={uiText("REG-XXXXXX")} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Bank Customer Code")}</Label>
                    <Input value={bankCustomerCode} onChange={(e) => setBankCustomerCode(e.target.value)} placeholder={uiText("Customer ID at bank")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Year of Establishment")}</Label>
                    <Input type="number" value={establishmentYear} onChange={(e) => setEstablishmentYear(e.target.value)} placeholder="2010" min="1900" max="2026" />
                  </div>
                </div>
                <Separator />
                  <h4 className="font-medium text-sm">{uiText("Address")} </h4>
                <div className="space-y-2">
                  <Label>{uiText("Street Address (Legal Address)")}<RequiredMark show={isRequired("addressStreet")} /></Label>
                  <Input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder={uiText("Street, building")} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("City")}<RequiredMark show={isRequired("city")} /></Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={uiText("Dushanbe")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("District")}</Label>
                    <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
                  </div>
                </div>
                <Separator />
                <h4 className="font-medium text-sm">{uiText("Contact & Business")}</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Phone")}<RequiredMark show={isRequired("phone")} /></Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={uiText("+992XXXXXXXXX")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Email")}<RequiredMark show={isRequired("email")} /></Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={uiText("contact@company.tj")} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Number of Employees")}<RequiredMark show={isRequired("workforce")} /></Label>
                    <Input type="number" value={workforce} onChange={(e) => setWorkforce(e.target.value)} placeholder="10" min="1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{uiText("Business Description")}</Label>
                  <Textarea value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} placeholder={uiText("Brief description of business activities...")} rows={2} />
                </div>
                <Separator />
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium">{uiText("TNB / NABPP Blacklist Check")}</p>
                    <p className="text-xs text-muted-foreground">{uiText("Mark if this borrower appears on TNB blacklist")}</p>
                  </div>
                  <Switch checked={isBlacklisted} onCheckedChange={setIsBlacklisted} />
                </div>
                {isBlacklisted && (
                  <div className="space-y-2">
                    <Label>{uiText("Blacklist Reason")}</Label>
                    <Input value={blacklistReason} onChange={(e) => setBlacklistReason(e.target.value)} placeholder={uiText("Reason for blacklist")} />
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button type="button" onClick={handleNextStep}>{uiText("Next: Legal Representative")}</Button>
            </div>
          </TabsContent>

          {/* ── LEGAL REP TAB ── */}
          <TabsContent value="legal_rep" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="legal_rep" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />{uiText("Legal Representative")}</CardTitle>
                <CardDescription>
                  {isIndividualEntrepreneur
                    ? uiText("Identity details of the entrepreneur signing the application")
                    : uiText("Details of the person authorized to sign on behalf of the borrower")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {isIndividualEntrepreneur && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/50 p-3 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    <span className="text-muted-foreground">{uiText("An Individual Entrepreneur is their own legal representative, so the name and TIN are carried over from the Borrower step.")}</span>
                    <button
                      type="button"
                      onClick={() => handleStepChange("borrower")}
                      className="font-medium underline hover:no-underline"
                    >{uiText("Edit in Borrower step")}</button>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{uiText("Surname")}<RequiredMark show={isRequired("legalRepSurname")} /></Label>
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
                    <Label>{uiText("First Name")}<RequiredMark show={isRequired("legalRepName")} /></Label>
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
                    <Label>{uiText("Patronymic")}</Label>
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
                    <Label>{uiText("Gender")}<RequiredMark show={isRequired("legalRepGender")} /></Label>
                    <Select value={legalRepGender} onValueChange={setLegalRepGender}>
                      <SelectTrigger className={!legalRepGender ? "border-destructive" : ""}><SelectValue placeholder={uiText("Select")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{uiText("Male")}</SelectItem>
                        <SelectItem value="female">{uiText("Female")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Date of Birth")}<RequiredMark show={isRequired("legalRepBirthdate")} /></Label>
                    <Input type="date" value={legalRepBirthdate} onChange={(e) => setLegalRepBirthdate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Country of Birth")}</Label>
                    <Input value={legalRepCountry} onChange={(e) => setLegalRepCountry(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("TIN Number")}<RequiredMark show={isRequired("legalRepTin")} /></Label>
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
                      {isIndividualEntrepreneur ? uiText("Same as the borrower TIN") : uiText("9 digits only")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Passport / ID Number")}<RequiredMark show={isRequired("passportNumber")} /></Label>
                    <Input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} placeholder={uiText("AA1234567")} />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>{uiText("Previous")}</Button>
              <Button type="button" onClick={handleNextStep}>{uiText("Next: Loan Details")}</Button>
            </div>
          </TabsContent>

          {/* ── LOAN TAB ── */}
          <TabsContent value="loan" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="loan" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />{uiText("Loan & Guarantee Details")}</CardTitle>
                <CardDescription>{uiText("Financial terms and guarantee parameters")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Partner Bank")}<RequiredMark show={isRequired("bankId")} /></Label>
                    <Select value={bankId} onValueChange={handleBankChange} disabled={editing}>
                      <SelectTrigger><SelectValue placeholder={uiText("Select bank")} /></SelectTrigger>
                      <SelectContent>
                        {banks.map((b) => <SelectItem key={b.id} value={b.id}>{getName(b)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Branch")}<RequiredMark show={isRequired("branchId")} /></Label>
                    {branchError && <p role="alert" className="text-sm text-destructive">{uiText("Branches could not be loaded. Reload before choosing a branch.")}</p>}
                    {bankId && !branchesLoading && !branchError && branches.length === 0 && <p role="status" className="text-sm text-destructive">{uiText("No active branch is configured for this bank.")} {isRequired('branchId') ? uiText("Ask an administrator to add or activate a branch before saving.") : uiText("Branch is optional under the current field settings.")} <Link className="underline" href={`/dashboard/banks/${bankId}`}>{uiText("Open bank directory")}</Link></p>}
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
                    <Label>{uiText("Loan Amount")}<RequiredMark show={isRequired("requestedAmount")} /></Label>
                    <Input type="number" value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} placeholder="500000" min="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Loan Currency")}<RequiredMark show={isRequired("currency")} /></Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TJS">{uiText("TJS - Tajikistani Somoni")}</SelectItem>

                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Loan Term (months)")}<RequiredMark show={isRequired("loanTerm")} /></Label>
                    <Input type="number" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} placeholder="36" min="1" />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Loan Grace Period (months)")}</Label>
                    <Input type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} placeholder="6" min="0" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Loan Repayment Frequency")}</Label>
                    <Select value={frequency} onValueChange={setFrequency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">{uiText("Monthly")}</SelectItem>
                        <SelectItem value="quarterly">{uiText("Quarterly")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Repayment Method")}</Label>
                    <Select value={repaymentMethod} onValueChange={setRepaymentMethod}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annuity">{uiText("Annuity (equal payments)")}</SelectItem>
                        <SelectItem value="declining_balance">{uiText("Declining Balance")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Guarantee Coverage (%)")}<RequiredMark show={isRequired("guaranteeCoverage")} /></Label>
                    <Input type="number" value={guaranteeCoverage} onChange={(e) => setGuaranteeCoverage(e.target.value)} placeholder={uiText("Enter coverage")} min="0.01" max="70" step="0.01" />
                    {requestedAmount && guaranteeCoverage && (
                      <p className="text-xs text-muted-foreground">{uiText("Guarantee amount: ")}{new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(parseFloat(requestedAmount) * parseFloat(guaranteeCoverage) / 100)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Guarantee Type")}<RequiredMark show={isRequired("guaranteeType")} /></Label>
                    <Select value={guaranteeType} onValueChange={setGuaranteeType}>
                      <SelectTrigger><SelectValue placeholder={uiText("Select guarantee type")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">{uiText("Individual Guarantee")}</SelectItem>
                        <SelectItem value="blanket">{uiText("Blanket Guarantee")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <div className="flex flex-col gap-2"><Label htmlFor="configured-product">{uiText("Configured guarantee product (optional)")}</Label><Select value={productId || 'none'} onValueChange={(value) => { setProductId(value === 'none' ? '' : value); setGuaranteeCoverage(undefined) }}><SelectTrigger id="configured-product"><SelectValue placeholder={uiText("Choose a configured product")} /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">{uiText("No configured product — enter coverage explicitly")}</SelectItem>{products.map(item => <SelectItem key={item.id} value={item.id}>{getName(item)}</SelectItem>)}</SelectGroup></SelectContent></Select><p className="text-sm text-muted-foreground">{uiText("The selected product supplies its configured coverage. An explicit valid coverage is required; no default percentage is silently applied.")}</p></div>
                <h4 className="text-sm font-medium">{uiText("Dates")}</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Application Date")}<RequiredMark show={isRequired("applicationDate")} /></Label>
                    <Input type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Bank Approval Date")}</Label>
                    <Input type="date" value={bankApprovalDate} onChange={(e) => setBankApprovalDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                    <Label>{uiText("Loan Officer (at Bank)")}</Label>
                    {officerError && <p role="alert" className="text-sm text-destructive">{uiText("Loan officer options could not be loaded. Reload to retry.")}</p>}
                  {bankOfficers.length > 0 ? (
                    <Select value={loanOfficer} onValueChange={setLoanOfficer}>
                      <SelectTrigger>
                        <SelectValue placeholder={uiText("Select loan officer")} />
                      </SelectTrigger>
                      <SelectContent>
                        {bankOfficers.map((officer) => (
                          <SelectItem key={officer.id} value={officer.id}>
                            {officer.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">{bankId ? uiText("No active loan officers are available. This optional assignment can be left blank.") : uiText("Select a bank first.")}</p>
                  )}
                </div>
                <Separator />
                <h4 className="text-sm font-medium">{uiText("Loan Purpose")}</h4>
                <div className="space-y-2">
                  <Label>{uiText("Purpose")}<RequiredMark show={isRequired("purpose")} /></Label>
                  <Select value={purpose} onValueChange={setPurpose}>
                    <SelectTrigger><SelectValue placeholder={uiText("Select purpose")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working_capital">{uiText("Working Capital")}</SelectItem>
                      <SelectItem value="investment">{uiText("Investment / Fixed Assets")}</SelectItem>
                      <SelectItem value="operational">{uiText("Operational Expenses")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{uiText("Purpose Details")}</Label>
                  <Textarea value={purposeDetails} onChange={(e) => setPurposeDetails(e.target.value)} placeholder={uiText("Describe how the loan will be used...")} rows={2} />
                </div>
                <Separator />
                <h4 className="text-sm font-medium">{uiText("Financial Analysis")}</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Annual Turnover (")}{currency})</Label>
                    <Input type="number" value={annualTurnover} onChange={(e) => setAnnualTurnover(e.target.value)} placeholder="1000000" />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Net Income (")}{currency})</Label>
                    <Input type="number" value={netIncome} onChange={(e) => setNetIncome(e.target.value)} placeholder="150000" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{uiText("Total Bank Exposure (")}{currency})</Label>
                    <Input type="number" value={totalExposure} onChange={(e) => setTotalExposure(e.target.value)} placeholder={uiText("Total outstanding at this bank")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{uiText("Risk Rating")}</Label>
                    <Select value={riskRating} onValueChange={setRiskRating}>
                      <SelectTrigger><SelectValue placeholder={uiText("Select rating")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">{uiText("A - Excellent")}</SelectItem>
                        <SelectItem value="B">{uiText("B - Good")}</SelectItem>
                        <SelectItem value="C">{uiText("C - Satisfactory")}</SelectItem>
                        <SelectItem value="D">{uiText("D - Substandard")}</SelectItem>
                        <SelectItem value="E">{uiText("E - Doubtful")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>{uiText("Previous")}</Button>
              <Button type="button" onClick={handleNextStep}>{uiText("Next: Collateral")}</Button>
            </div>
          </TabsContent>

          {/* ── COLLATERAL TAB ── */}
          <TabsContent value="collateral" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="collateral" />
            <Card>
              <CardHeader>
                <CardTitle>{uiText("Collateral & Guarantors")}</CardTitle>
                <CardDescription>{uiText("Security provided for this loan application")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>{uiText("Collateral Description")}<RequiredMark show={isRequired("collateralDescription")} /></Label>
                  <Textarea value={collateralDescription} onChange={(e) => setCollateralDescription(e.target.value)} placeholder={uiText("Type and description of collateral (real estate, equipment, inventory...)")} rows={3} />
                </div>
                <Separator />
                <h4 className="text-sm font-medium">{uiText("Covenants")}</h4>
                <div className="space-y-2">
                  <Label>{uiText("Bank Covenants")}</Label>
                  <Textarea value={covenantBank} onChange={(e) => setCovenantBank(e.target.value)} placeholder={uiText("Conditions imposed by the bank...")} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>{uiText("PRSF Covenants")}</Label>
                  <Textarea value={covenantPrsf} onChange={(e) => setCovenantPrsf(e.target.value)} placeholder={uiText("Conditions required by PRSF...")} rows={2} />
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>{uiText("Previous")}</Button>
              <Button type="button" onClick={handleNextStep}>{uiText("Next: Additional Info")}</Button>
            </div>
          </TabsContent>

          {/* ── ADDITIONAL TAB ── */}
          <TabsContent value="additional" className="space-y-6">
            <StepValidationPanel stepsStatus={stepsStatus} hasTouchedFields={touchedFields.size > 0} step="additional" />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{uiText("Notes & Submission")}</CardTitle>
                <CardDescription>{uiText("Final review and any additional comments")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>{uiText("Internal Notes")}<RequiredMark show={isRequired("notes")} /></Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={uiText("Additional notes for PRSF reviewers...")} rows={4} />
                </div>
                <Separator />
                {/* Summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <h4 className="font-medium text-sm">{uiText("Application Summary")}</h4>
                  <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">{uiText("Borrower:")}</span><span className="font-medium">{clientName || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{uiText("TIN:")}</span><span className="font-medium">{clientTin || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{uiText("Bank:")}</span><span className="font-medium">{banks.find((b) => b.id === bankId)?.name_en || "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{uiText("Amount:")}</span><span className="font-medium">{requestedAmount ? new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(parseFloat(requestedAmount)) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{uiText("Term:")}</span><span className="font-medium">{loanTerm ? uiText("{0} months", loanTerm) : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{uiText("Coverage:")}</span><span className="font-medium">{guaranteeCoverage ? `${guaranteeCoverage}%` : "—"}</span></div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={handlePreviousStep}>{uiText("Previous")}</Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || (!retryLocked && !isFormValid)} 
                className="gap-2 px-8"
                title={!isFormValid ? "Please complete all required fields" : ""}
              >
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />{uiText("Submitting...")}</>
                ) : (
                  <><Save className="h-4 w-4" />{editing ? uiText("Save corrections") : uiText("Save for bank review")}</>
                )}
              </Button>
            </div>
            {!isFormValid && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{uiText("Please complete all required fields before submitting.")}{" "}
                  {allErrors.length} {uiText("field")}{allErrors.length === 1 ? "" : "s"} {uiText("still")}{" "}
                  {allErrors.length === 1 ? uiText("needs") : uiText("need")}{uiText(" your attention.")}</AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
        </fieldset>
      </form>

      {/* Existing Borrower Found Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />{uiText("Existing Borrower Found")}</DialogTitle>
            <DialogDescription>{uiText("A borrower with this TIN number already exists in the system. You can load their information to save time.")}</DialogDescription>
          </DialogHeader>
          {tinDuplicateWarning && foundBorrower && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{uiText("Name:")}</span>
                  <p className="font-medium">{tinDuplicateWarning.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{uiText("Type:")}</span>
                  <p className="font-medium">{tinDuplicateWarning.type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{uiText("TIN:")}</span>
                  <p className="font-medium">{clientTin}</p>
                </div>
                {foundBorrower.phone && (
                  <div>
                    <span className="text-muted-foreground">{uiText("Phone:")}</span>
                    <p className="font-medium">{foundBorrower.phone}</p>
                  </div>
                )}
                {foundBorrower.address_city && (
                  <div>
                    <span className="text-muted-foreground">{uiText("City:")}</span>
                    <p className="font-medium">{foundBorrower.address_city}</p>
                  </div>
                )}
                {foundBorrower.email && (
                  <div>
                    <span className="text-muted-foreground">{uiText("Email:")}</span>
                    <p className="font-medium">{foundBorrower.email}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <Alert className="border-primary/20 bg-primary/5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription className="ml-2 text-sm">{uiText("Click \"Load Borrower Data\" to automatically fill in all available information from this existing borrower.")}</AlertDescription>
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
            >{uiText("Clear & Enter New TIN")}</Button>
            <Button 
              variant="secondary"
              onClick={() => setShowDuplicateDialog(false)}
            >{uiText("Continue Without Loading")}</Button>
            <Button 
              onClick={loadBorrowerData}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />{uiText("Load Borrower Data")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
