"use client"

import React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/lib/i18n/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Save, Building2, User, FileText, DollarSign, Calendar, Shield } from "lucide-react"
import Link from "next/link"

// Mock data for dropdowns
const banks = [
  { id: "1", name: "Amonatbonk" },
  { id: "2", name: "Eskhata Bank" },
  { id: "3", name: "Bank Arvand" },
  { id: "4", name: "Spitamen Bank" },
  { id: "5", name: "First MicroFinance" },
]

const branches = [
  { id: "1", bankId: "1", name: "Dushanbe Main" },
  { id: "2", bankId: "1", name: "Khujand Branch" },
  { id: "3", bankId: "2", name: "Khujand" },
  { id: "4", bankId: "3", name: "Kulyab" },
  { id: "5", bankId: "4", name: "Dushanbe" },
]

const sectors = [
  { id: "1", name: "Agriculture" },
  { id: "2", name: "Manufacturing" },
  { id: "3", name: "Trade" },
  { id: "4", name: "Services" },
  { id: "5", name: "Construction" },
  { id: "6", name: "Transport" },
  { id: "7", name: "Tourism" },
]

const products = [
  { id: "1", name: "Standard MSME Loan", maxGuarantee: 50 },
  { id: "2", name: "Agriculture Loan", maxGuarantee: 60 },
  { id: "3", name: "Women Entrepreneur Loan", maxGuarantee: 70 },
  { id: "4", name: "Green Finance Loan", maxGuarantee: 60 },
]

const legalEntityTypes = [
  { id: "individual", name: "Individual Entrepreneur" },
  { id: "llc", name: "Limited Liability Company (LLC)" },
  { id: "jsc", name: "Joint Stock Company (JSC)" },
  { id: "cooperative", name: "Cooperative" },
]

const frequencies = [
  { id: "monthly", name: "Monthly" },
  { id: "quarterly", name: "Quarterly" },
  { id: "semi-annual", name: "Semi-Annual" },
  { id: "annual", name: "Annual" },
]

export default function NewLoanPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedBank, setSelectedBank] = useState("")
  const [activeTab, setActiveTab] = useState("borrower")

  const [formData, setFormData] = useState({
    // Borrower Information
    legalEntityType: "",
    clientName: "",
    clientTin: "",
    registrationNumber: "",
    sector: "",
    addressStreet: "",
    city: "",
    district: "",
    zipCode: "",
    workforce: "",
    
    // Legal Representative
    legalRepSurname: "",
    legalRepName: "",
    legalRepGender: "",
    legalRepBirthdate: "",
    legalRepCountry: "Tajikistan",
    legalRepTin: "",
    
    // Loan Details
    bank: "",
    branch: "",
    product: "",
    requestedAmount: "",
    currency: "TJS",
    durationMonths: "",
    gracePeriodMonths: "",
    frequency: "monthly",
    interestRate: "",
    guaranteeCoverage: "",
    
    // Additional
    loanOfficer: "",
    purpose: "",
    notes: "",
  })

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (field === "bank") {
      setSelectedBank(value)
      setFormData((prev) => ({ ...prev, branch: "" }))
    }
  }

  const filteredBranches = branches.filter((b) => b.bankId === selectedBank)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    
    setIsSubmitting(false)
    router.push("/dashboard/loans")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/loans">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("loans.newApplication")}
          </h1>
          <p className="text-muted-foreground">{t("loans.newApplicationDescription")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="borrower" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{t("loans.borrowerInfo")}</span>
            </TabsTrigger>
            <TabsTrigger value="representative" className="gap-2">
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">{t("loans.legalRep")}</span>
            </TabsTrigger>
            <TabsTrigger value="loan" className="gap-2">
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">{t("loans.loanDetails")}</span>
            </TabsTrigger>
            <TabsTrigger value="additional" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{t("loans.additional")}</span>
            </TabsTrigger>
          </TabsList>

          {/* Borrower Information Tab */}
          <TabsContent value="borrower" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {t("loans.borrowerInfo")}
                </CardTitle>
                <CardDescription>{t("loans.borrowerInfoDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="legalEntityType">{t("loans.legalEntityType")} *</Label>
                    <Select
                      value={formData.legalEntityType}
                      onValueChange={(v) => handleInputChange("legalEntityType", v)}
                    >
                      <SelectTrigger id="legalEntityType">
                        <SelectValue placeholder={t("common.select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {legalEntityTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sector">{t("loans.sector")} *</Label>
                    <Select
                      value={formData.sector}
                      onValueChange={(v) => handleInputChange("sector", v)}
                    >
                      <SelectTrigger id="sector">
                        <SelectValue placeholder={t("common.select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {sectors.map((sector) => (
                          <SelectItem key={sector.id} value={sector.id}>
                            {sector.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientName">{t("loans.clientName")} *</Label>
                  <Input
                    id="clientName"
                    value={formData.clientName}
                    onChange={(e) => handleInputChange("clientName", e.target.value)}
                    placeholder={t("loans.clientNamePlaceholder")}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clientTin">{t("loans.clientTin")} *</Label>
                    <Input
                      id="clientTin"
                      value={formData.clientTin}
                      onChange={(e) => handleInputChange("clientTin", e.target.value)}
                      placeholder="123456789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="registrationNumber">{t("loans.registrationNumber")}</Label>
                    <Input
                      id="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={(e) => handleInputChange("registrationNumber", e.target.value)}
                      placeholder="REG-XXXXXX"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h4 className="font-medium">{t("loans.address")}</h4>
                  <div className="space-y-2">
                    <Label htmlFor="addressStreet">{t("loans.street")}</Label>
                    <Input
                      id="addressStreet"
                      value={formData.addressStreet}
                      onChange={(e) => handleInputChange("addressStreet", e.target.value)}
                      placeholder={t("loans.streetPlaceholder")}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("loans.city")}</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => handleInputChange("city", e.target.value)}
                        placeholder="Dushanbe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="district">{t("loans.district")}</Label>
                      <Input
                        id="district"
                        value={formData.district}
                        onChange={(e) => handleInputChange("district", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zipCode">{t("loans.zipCode")}</Label>
                      <Input
                        id="zipCode"
                        value={formData.zipCode}
                        onChange={(e) => handleInputChange("zipCode", e.target.value)}
                        placeholder="734000"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workforce">{t("loans.workforce")}</Label>
                  <Input
                    id="workforce"
                    type="number"
                    value={formData.workforce}
                    onChange={(e) => handleInputChange("workforce", e.target.value)}
                    placeholder="10"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setActiveTab("representative")}>
                {t("common.next")}
              </Button>
            </div>
          </TabsContent>

          {/* Legal Representative Tab */}
          <TabsContent value="representative" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t("loans.legalRepInfo")}
                </CardTitle>
                <CardDescription>{t("loans.legalRepDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="legalRepSurname">{t("loans.surname")} *</Label>
                    <Input
                      id="legalRepSurname"
                      value={formData.legalRepSurname}
                      onChange={(e) => handleInputChange("legalRepSurname", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalRepName">{t("loans.name")} *</Label>
                    <Input
                      id="legalRepName"
                      value={formData.legalRepName}
                      onChange={(e) => handleInputChange("legalRepName", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="legalRepGender">{t("loans.gender")}</Label>
                    <Select
                      value={formData.legalRepGender}
                      onValueChange={(v) => handleInputChange("legalRepGender", v)}
                    >
                      <SelectTrigger id="legalRepGender">
                        <SelectValue placeholder={t("common.select")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{t("common.male")}</SelectItem>
                        <SelectItem value="female">{t("common.female")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalRepBirthdate">{t("loans.birthdate")}</Label>
                    <Input
                      id="legalRepBirthdate"
                      type="date"
                      value={formData.legalRepBirthdate}
                      onChange={(e) => handleInputChange("legalRepBirthdate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalRepCountry">{t("loans.country")}</Label>
                    <Input
                      id="legalRepCountry"
                      value={formData.legalRepCountry}
                      onChange={(e) => handleInputChange("legalRepCountry", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="legalRepTin">{t("loans.representativeTin")}</Label>
                  <Input
                    id="legalRepTin"
                    value={formData.legalRepTin}
                    onChange={(e) => handleInputChange("legalRepTin", e.target.value)}
                    placeholder="123456789"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("borrower")}>
                {t("common.previous")}
              </Button>
              <Button type="button" onClick={() => setActiveTab("loan")}>
                {t("common.next")}
              </Button>
            </div>
          </TabsContent>

          {/* Loan Details Tab */}
          <TabsContent value="loan" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  {t("loans.loanDetails")}
                </CardTitle>
                <CardDescription>{t("loans.loanDetailsDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bank">{t("loans.bank")} *</Label>
                    <Select
                      value={formData.bank}
                      onValueChange={(v) => handleInputChange("bank", v)}
                    >
                      <SelectTrigger id="bank">
                        <SelectValue placeholder={t("loans.selectBank")} />
                      </SelectTrigger>
                      <SelectContent>
                        {banks.map((bank) => (
                          <SelectItem key={bank.id} value={bank.id}>
                            {bank.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="branch">{t("loans.branch")} *</Label>
                    <Select
                      value={formData.branch}
                      onValueChange={(v) => handleInputChange("branch", v)}
                      disabled={!selectedBank}
                    >
                      <SelectTrigger id="branch">
                        <SelectValue placeholder={t("loans.selectBranch")} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredBranches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product">{t("loans.product")} *</Label>
                  <Select
                    value={formData.product}
                    onValueChange={(v) => handleInputChange("product", v)}
                  >
                    <SelectTrigger id="product">
                      <SelectValue placeholder={t("loans.selectProduct")} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({t("loans.maxGuarantee")}: {product.maxGuarantee}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="requestedAmount">{t("loans.requestedAmount")} *</Label>
                    <Input
                      id="requestedAmount"
                      type="number"
                      value={formData.requestedAmount}
                      onChange={(e) => handleInputChange("requestedAmount", e.target.value)}
                      placeholder="500000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currency">{t("loans.currency")} *</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(v) => handleInputChange("currency", v)}
                    >
                      <SelectTrigger id="currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TJS">TJS (Somoni)</SelectItem>
                        <SelectItem value="USD">USD (US Dollar)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="durationMonths">{t("loans.durationMonths")} *</Label>
                    <Input
                      id="durationMonths"
                      type="number"
                      value={formData.durationMonths}
                      onChange={(e) => handleInputChange("durationMonths", e.target.value)}
                      placeholder="36"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gracePeriodMonths">{t("loans.gracePeriod")}</Label>
                    <Input
                      id="gracePeriodMonths"
                      type="number"
                      value={formData.gracePeriodMonths}
                      onChange={(e) => handleInputChange("gracePeriodMonths", e.target.value)}
                      placeholder="6"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency">{t("loans.frequency")} *</Label>
                    <Select
                      value={formData.frequency}
                      onValueChange={(v) => handleInputChange("frequency", v)}
                    >
                      <SelectTrigger id="frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {frequencies.map((freq) => (
                          <SelectItem key={freq.id} value={freq.id}>
                            {freq.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="interestRate">{t("loans.interestRate")} (% p.a.)</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      step="0.01"
                      value={formData.interestRate}
                      onChange={(e) => handleInputChange("interestRate", e.target.value)}
                      placeholder="18.5"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guaranteeCoverage">{t("loans.guaranteeCoverage")} (%)</Label>
                    <Input
                      id="guaranteeCoverage"
                      type="number"
                      value={formData.guaranteeCoverage}
                      onChange={(e) => handleInputChange("guaranteeCoverage", e.target.value)}
                      placeholder="50"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("representative")}>
                {t("common.previous")}
              </Button>
              <Button type="button" onClick={() => setActiveTab("additional")}>
                {t("common.next")}
              </Button>
            </div>
          </TabsContent>

          {/* Additional Information Tab */}
          <TabsContent value="additional" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("loans.additionalInfo")}
                </CardTitle>
                <CardDescription>{t("loans.additionalInfoDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="loanOfficer">{t("loans.loanOfficer")}</Label>
                  <Input
                    id="loanOfficer"
                    value={formData.loanOfficer}
                    onChange={(e) => handleInputChange("loanOfficer", e.target.value)}
                    placeholder={t("loans.loanOfficerPlaceholder")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="purpose">{t("loans.purpose")}</Label>
                  <Textarea
                    id="purpose"
                    value={formData.purpose}
                    onChange={(e) => handleInputChange("purpose", e.target.value)}
                    placeholder={t("loans.purposePlaceholder")}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">{t("loans.notes")}</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    placeholder={t("loans.notesPlaceholder")}
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("loan")}>
                {t("common.previous")}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                <Save className="h-4 w-4" />
                {isSubmitting ? t("common.submitting") : t("loans.submitApplication")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}
