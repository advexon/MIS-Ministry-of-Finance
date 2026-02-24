"use client"

import React, { useState, useEffect } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Save, Building2, User, DollarSign, FileText, Shield, Plus, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import type { Bank, BankBranch, Sector, LoanProduct } from "@/lib/types/database"

interface Guarantor {
  name: string
  id_number: string
  relationship: string
}

export default function NewLoanPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = createClient()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("borrower")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Reference data
  const [banks, setBanks] = useState<Bank[]>([])
  const [branches, setBranches] = useState<BankBranch[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [products, setProducts] = useState<LoanProduct[]>([])
  const [loading, setLoading] = useState(true)

  // Borrower fields
  const [legalEntityType, setLegalEntityType] = useState("")
  const [clientName, setClientName] = useState("")
  const [clientTin, setClientTin] = useState("")
  const [registrationNumber, setRegistrationNumber] = useState("")
  const [sectorId, setSectorId] = useState("")
  const [addressStreet, setAddressStreet] = useState("")
  const [city, setCity] = useState("")
  const [district, setDistrict] = useState("")
  const [zipCode, setZipCode] = useState("")
  const [workforce, setWorkforce] = useState("")
  const [establishmentYear, setEstablishmentYear] = useState("")
  const [businessDescription, setBusinessDescription] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [bankCustomerCode, setBankCustomerCode] = useState("")
  const [isBlacklisted, setIsBlacklisted] = useState(false)
  const [blacklistReason, setBlacklistReason] = useState("")

  // Legal Representative fields
  const [legalRepSurname, setLegalRepSurname] = useState("")
  const [legalRepName, setLegalRepName] = useState("")
  const [legalRepPatronymic, setLegalRepPatronymic] = useState("")
  const [legalRepGender, setLegalRepGender] = useState("")
  const [legalRepBirthdate, setLegalRepBirthdate] = useState("")
  const [legalRepCountry, setLegalRepCountry] = useState("Tajikistan")
  const [legalRepTin, setLegalRepTin] = useState("")
  const [passportNumber, setPassportNumber] = useState("")

  // Loan fields
  const [bankId, setBankId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [productId, setProductId] = useState("")
  const [requestedAmount, setRequestedAmount] = useState("")
  const [currency, setCurrency] = useState("TJS")
  const [loanTerm, setLoanTerm] = useState("")
  const [gracePeriod, setGracePeriod] = useState("")
  const [frequency, setFrequency] = useState("monthly")
  const [repaymentMethod, setRepaymentMethod] = useState("annuity")
  const [interestRate, setInterestRate] = useState("")
  const [guaranteeCoverage, setGuaranteeCoverage] = useState("")
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
  const [guarantors, setGuarantors] = useState<Guarantor[]>([{ name: "", id_number: "", relationship: "" }])

  const [notes, setNotes] = useState("")

  const getName = (item: { name_en: string; name_ru?: string | null; name_tj?: string | null }) => {
    if (locale === "ru" && item.name_ru) return item.name_ru
    if (locale === "tj" && item.name_tj) return item.name_tj
    return item.name_en
  }

  useEffect(() => {
    const fetchData = async () => {
      const [banksRes, sectorsRes, productsRes] = await Promise.all([
        supabase.from("banks").select("*").eq("is_active", true).order("name_en"),
        supabase.from("sectors").select("*").eq("is_active", true).order("name_en"),
        supabase.from("loan_products").select("*").eq("is_active", true).order("name_en"),
      ])
      if (banksRes.data) setBanks(banksRes.data)
      if (sectorsRes.data) setSectors(sectorsRes.data)
      if (productsRes.data) setProducts(productsRes.data)
      setLoading(false)
    }
    fetchData()
  }, [])

  useEffect(() => {
    if (!bankId) {
      setBranches([])
      setBranchId("")
      return
    }
    supabase
      .from("bank_branches")
      .select("*")
      .eq("bank_id", bankId)
      .eq("is_active", true)
      .order("name_en")
      .then(({ data }) => {
        if (data) setBranches(data)
        setBranchId("")
      })
  }, [bankId])

  // Auto-fill guarantee coverage from product
  useEffect(() => {
    const p = products.find((x) => x.id === productId)
    if (p) setGuaranteeCoverage(String(p.guarantee_coverage))
  }, [productId, products])

  const addGuarantor = () => setGuarantors([...guarantors, { name: "", id_number: "", relationship: "" }])
  const removeGuarantor = (i: number) => setGuarantors(guarantors.filter((_, idx) => idx !== i))
  const updateGuarantor = (i: number, field: keyof Guarantor, value: string) => {
    const updated = [...guarantors]
    updated[i] = { ...updated[i], [field]: value }
    setGuarantors(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // 1. Upsert borrower by TIN
      const borrowerData = {
        tin_number: clientTin,
        legal_type: legalEntityType as "individual" | "legal_entity" | "individual_entrepreneur",
        company_name: legalEntityType === "legal_entity" ? clientName : null,
        first_name: legalEntityType !== "legal_entity" ? legalRepName : null,
        last_name: legalEntityType !== "legal_entity" ? legalRepSurname : null,
        patronymic: legalRepPatronymic || null,
        gender: legalRepGender as "male" | "female" | null || null,
        date_of_birth: legalRepBirthdate || null,
        country_of_birth: legalRepCountry || null,
        passport_number: passportNumber || null,
        registration_number: registrationNumber || null,
        sector_id: sectorId || null,
        city: city || null,
        district: district || null,
        zip_code: zipCode || null,
        legal_address: addressStreet || null,
        phone: phone || null,
        email: email || null,
        business_description: businessDescription || null,
        establishment_year: establishmentYear ? parseInt(establishmentYear) : null,
        employee_count: workforce ? parseInt(workforce) : null,
        bank_customer_code: bankCustomerCode || null,
        is_blacklisted: isBlacklisted,
        blacklist_reason: isBlacklisted ? blacklistReason : null,
      }

      const { data: borrower, error: borrowerError } = await supabase
        .from("borrowers")
        .upsert(borrowerData, { onConflict: "tin_number" })
        .select("id")
        .single()

      if (borrowerError) throw borrowerError

      // 2. Calculate guarantee amount
      const reqAmount = parseFloat(requestedAmount) || 0
      const coverage = parseFloat(guaranteeCoverage) || 50
      const guaranteeAmount = (reqAmount * coverage) / 100

      // 3. Create loan application
      const appData = {
        bank_id: bankId,
        branch_id: branchId || null,
        bank_loan_officer: loanOfficer || null,
        borrower_id: borrower.id,
        product_id: productId || null,
        loan_purpose: purpose as "working_capital" | "investment" | "operational" || null,
        loan_purpose_details: purposeDetails || null,
        requested_amount: reqAmount,
        currency,
        loan_term_months: parseInt(loanTerm) || 0,
        grace_period_months: parseInt(gracePeriod) || 0,
        interest_rate: interestRate ? parseFloat(interestRate) : null,
        repayment_frequency: frequency as "monthly" | "quarterly",
        repayment_method: repaymentMethod as "annuity" | "declining_balance" || null,
        guarantee_coverage: coverage,
        guarantee_amount: guaranteeAmount,
        application_date: applicationDate,
        bank_approval_date: bankApprovalDate || null,
        status: "submitted" as const,
        annual_turnover: annualTurnover ? parseFloat(annualTurnover) : null,
        net_income: netIncome ? parseFloat(netIncome) : null,
        risk_rating: riskRating || null,
        total_exposure: totalExposure ? parseFloat(totalExposure) : null,
        collateral_description: collateralDescription || null,
        personal_guarantors: guarantors.filter((g) => g.name || g.id_number),
        covenants_bank: covenantBank || null,
        covenants_prsf: covenantPrsf || null,
        notes: notes || null,
        created_by: user?.id || null,
        sector_id: sectorId || null,
      }

      const { data: loanApp, error: loanError } = await supabase
        .from("loan_applications")
        .insert(appData)
        .select("id, application_number")
        .single()

      if (loanError) throw loanError

      // 4. Log audit trail
      await supabase.from("audit_trail").insert({
        table_name: "loan_applications",
        record_id: loanApp.id,
        action: "INSERT",
        new_data: appData,
        changed_by: user?.id || null,
      })

      setSuccess(true)
      setTimeout(() => router.push("/dashboard/loans"), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit application")
      setIsSubmitting(false)
    }
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
        <h2 className="text-xl font-semibold">Application Submitted Successfully</h2>
        <p className="text-muted-foreground">Redirecting to loan list...</p>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard/loans"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.loans.newApplication}</h1>
          <p className="text-muted-foreground">Fill in all required fields to submit a new loan guarantee application</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="borrower" className="gap-1.5 text-xs sm:text-sm">
              <User className="h-3.5 w-3.5" /><span className="hidden sm:inline">Borrower</span>
            </TabsTrigger>
            <TabsTrigger value="representative" className="gap-1.5 text-xs sm:text-sm">
              <Shield className="h-3.5 w-3.5" /><span className="hidden sm:inline">Legal Rep</span>
            </TabsTrigger>
            <TabsTrigger value="loan" className="gap-1.5 text-xs sm:text-sm">
              <DollarSign className="h-3.5 w-3.5" /><span className="hidden sm:inline">Loan</span>
            </TabsTrigger>
            <TabsTrigger value="collateral" className="gap-1.5 text-xs sm:text-sm">
              <Building2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Collateral</span>
            </TabsTrigger>
            <TabsTrigger value="additional" className="gap-1.5 text-xs sm:text-sm">
              <FileText className="h-3.5 w-3.5" /><span className="hidden sm:inline">Additional</span>
            </TabsTrigger>
          </TabsList>

          {/* ── BORROWER TAB ── */}
          <TabsContent value="borrower" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Borrower Information</CardTitle>
                <CardDescription>Company or individual borrower details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Legal Entity Type *</Label>
                    <Select value={legalEntityType} onValueChange={setLegalEntityType} required>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">{t.borrowers.individual}</SelectItem>
                        <SelectItem value="legal_entity">{t.borrowers.legalEntity}</SelectItem>
                        <SelectItem value="individual_entrepreneur">{t.borrowers.individualEntrepreneur}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Business Sector *</Label>
                    <Select value={sectorId} onValueChange={setSectorId} required>
                      <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                      <SelectContent>
                        {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{getName(s)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Client / Company Name *</Label>
                  <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Full name or company name" required />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>TIN Number *</Label>
                    <Input value={clientTin} onChange={(e) => setClientTin(e.target.value)} placeholder="123456789" required />
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
                <h4 className="font-medium text-sm">Address</h4>
                <div className="space-y-2">
                  <Label>Street Address (Legal Address)</Label>
                  <Input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="Street, building" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Dushanbe" />
                  </div>
                  <div className="space-y-2">
                    <Label>District</Label>
                    <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Zip Code</Label>
                    <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="734000" />
                  </div>
                </div>
                <Separator />
                <h4 className="font-medium text-sm">Contact & Business</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+992XXXXXXXXX" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@company.tj" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Number of Employees</Label>
                    <Input type="number" value={workforce} onChange={(e) => setWorkforce(e.target.value)} placeholder="10" min="0" />
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
              <Button type="button" onClick={() => setActiveTab("representative")}>Next</Button>
            </div>
          </TabsContent>

          {/* ── LEGAL REP TAB ── */}
          <TabsContent value="representative" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Legal Representative</CardTitle>
                <CardDescription>Details of the person authorized to sign on behalf of the borrower</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Surname *</Label>
                    <Input value={legalRepSurname} onChange={(e) => setLegalRepSurname(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input value={legalRepName} onChange={(e) => setLegalRepName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Patronymic</Label>
                    <Input value={legalRepPatronymic} onChange={(e) => setLegalRepPatronymic(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={legalRepGender} onValueChange={setLegalRepGender}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={legalRepBirthdate} onChange={(e) => setLegalRepBirthdate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Country of Birth</Label>
                    <Input value={legalRepCountry} onChange={(e) => setLegalRepCountry(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>TIN Number</Label>
                    <Input value={legalRepTin} onChange={(e) => setLegalRepTin(e.target.value)} placeholder="123456789" />
                  </div>
                  <div className="space-y-2">
                    <Label>Passport / ID Number</Label>
                    <Input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} placeholder="AA1234567" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("borrower")}>Previous</Button>
              <Button type="button" onClick={() => setActiveTab("loan")}>Next</Button>
            </div>
          </TabsContent>

          {/* ── LOAN TAB ── */}
          <TabsContent value="loan" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Loan & Guarantee Details</CardTitle>
                <CardDescription>Financial terms and guarantee parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Partner Bank *</Label>
                    <Select value={bankId} onValueChange={setBankId} required>
                      <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                      <SelectContent>
                        {banks.map((b) => <SelectItem key={b.id} value={b.id}>{getName(b)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Branch *</Label>
                    <Select value={branchId} onValueChange={setBranchId} disabled={!bankId || branches.length === 0}>
                      <SelectTrigger><SelectValue placeholder={bankId ? (branches.length === 0 ? "No branches" : "Select branch") : "Select bank first"} /></SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{getName(b)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Loan Product</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{getName(p)} (Max: {p.guarantee_coverage}%)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Requested Amount *</Label>
                    <Input type="number" value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} placeholder="500000" required min="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Currency *</Label>
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
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Loan Term (months) *</Label>
                    <Input type="number" value={loanTerm} onChange={(e) => setLoanTerm(e.target.value)} placeholder="36" required min="1" />
                  </div>
                  <div className="space-y-2">
                    <Label>Grace Period (months)</Label>
                    <Input type="number" value={gracePeriod} onChange={(e) => setGracePeriod(e.target.value)} placeholder="6" min="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Interest Rate (%)</Label>
                    <Input type="number" step="0.1" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} placeholder="18.5" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Repayment Frequency</Label>
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
                <div className="space-y-2">
                  <Label>Guarantee Coverage (%) *</Label>
                  <Input type="number" value={guaranteeCoverage} onChange={(e) => setGuaranteeCoverage(e.target.value)} placeholder="50" min="0" max="100" required />
                  {requestedAmount && guaranteeCoverage && (
                    <p className="text-xs text-muted-foreground">
                      Guarantee amount: {new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(parseFloat(requestedAmount) * parseFloat(guaranteeCoverage) / 100)}
                    </p>
                  )}
                </div>
                <Separator />
                <h4 className="text-sm font-medium">Dates</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Application Date *</Label>
                    <Input type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Approval Date</Label>
                    <Input type="date" value={bankApprovalDate} onChange={(e) => setBankApprovalDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Loan Officer (at Bank)</Label>
                  <Input value={loanOfficer} onChange={(e) => setLoanOfficer(e.target.value)} placeholder="Full name of the loan officer" />
                </div>
                <Separator />
                <h4 className="text-sm font-medium">Loan Purpose</h4>
                <div className="space-y-2">
                  <Label>Purpose *</Label>
                  <Select value={purpose} onValueChange={setPurpose} required>
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
              <Button type="button" variant="outline" onClick={() => setActiveTab("representative")}>Previous</Button>
              <Button type="button" onClick={() => setActiveTab("collateral")}>Next</Button>
            </div>
          </TabsContent>

          {/* ── COLLATERAL TAB ── */}
          <TabsContent value="collateral" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Collateral & Guarantors</CardTitle>
                <CardDescription>Security provided for this loan application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Collateral Description</Label>
                  <Textarea value={collateralDescription} onChange={(e) => setCollateralDescription(e.target.value)} placeholder="Type and description of collateral (real estate, equipment, inventory...)" rows={3} />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Personal Guarantors</h4>
                  <Button type="button" variant="outline" size="sm" onClick={addGuarantor} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />Add Guarantor
                  </Button>
                </div>
                {guarantors.map((g, i) => (
                  <div key={i} className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <Badge variant="secondary">Guarantor #{i + 1}</Badge>
                      {guarantors.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeGuarantor(i)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Full Name</Label>
                        <Input value={g.name} onChange={(e) => updateGuarantor(i, "name", e.target.value)} placeholder="Full name" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">ID / Passport Number</Label>
                        <Input value={g.id_number} onChange={(e) => updateGuarantor(i, "id_number", e.target.value)} placeholder="AA1234567" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Relationship to Borrower</Label>
                        <Input value={g.relationship} onChange={(e) => updateGuarantor(i, "relationship", e.target.value)} placeholder="Director, Spouse, etc." />
                      </div>
                    </div>
                  </div>
                ))}
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
              <Button type="button" variant="outline" onClick={() => setActiveTab("loan")}>Previous</Button>
              <Button type="button" onClick={() => setActiveTab("additional")}>Next</Button>
            </div>
          </TabsContent>

          {/* ── ADDITIONAL TAB ── */}
          <TabsContent value="additional" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Notes & Submission</CardTitle>
                <CardDescription>Final review and any additional comments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Internal Notes</Label>
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
              <Button type="button" variant="outline" onClick={() => setActiveTab("collateral")}>Previous</Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2 px-8">
                {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</> : <><Save className="h-4 w-4" />Submit Application</>}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}
