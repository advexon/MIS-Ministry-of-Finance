"use client"

import React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/lib/i18n/context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Save, Building2, User, DollarSign, Calendar, Shield, FileText } from "lucide-react"
import Link from "next/link"

const banks = [
  { id: "1", name: "Agroinvestbank" },
  { id: "2", name: "Bank Eskhata" },
  { id: "3", name: "Spitamen Bank" },
  { id: "4", name: "IMON International" },
  { id: "5", name: "Amonatbonk" },
]

const branches: Record<string, { id: string; name: string }[]> = {
  "1": [{ id: "1a", name: "Dushanbe Main" }, { id: "1b", name: "Khujand Branch" }, { id: "1c", name: "Khorog Branch" }],
  "2": [{ id: "2a", name: "Khujand" }, { id: "2b", name: "Dushanbe" }],
  "3": [{ id: "3a", name: "Dushanbe" }, { id: "3b", name: "Kulyab" }],
  "4": [{ id: "4a", name: "Dushanbe" }],
  "5": [{ id: "5a", name: "Dushanbe Main" }, { id: "5b", name: "Bokhtar Branch" }],
}

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

export default function NewLoanPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("borrower")

  const [formData, setFormData] = useState({
    legalEntityType: "", clientName: "", clientTin: "", registrationNumber: "",
    sector: "", addressStreet: "", city: "", district: "", zipCode: "", workforce: "",
    legalRepSurname: "", legalRepName: "", legalRepGender: "", legalRepBirthdate: "",
    legalRepCountry: "Tajikistan", legalRepTin: "",
    bank: "", branch: "", product: "", requestedAmount: "", currency: "TJS",
    durationMonths: "", gracePeriodMonths: "", frequency: "monthly",
    interestRate: "", guaranteeCoverage: "", loanOfficer: "", purpose: "", notes: "",
  })

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (field === "bank") setFormData((prev) => ({ ...prev, [field]: value, branch: "" }))
  }

  const filteredBranches = formData.bank ? (branches[formData.bank] || []) : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    await new Promise((r) => setTimeout(r, 1500))
    setIsSubmitting(false)
    router.push("/dashboard/loans")
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard/loans"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.loans.newApplication}</h1>
          <p className="text-muted-foreground">Fill in the form to submit a new loan guarantee application</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="borrower" className="gap-2">
              <User className="h-4 w-4" /><span className="hidden sm:inline">{t.loans.tabBorrowerInfo}</span>
            </TabsTrigger>
            <TabsTrigger value="representative" className="gap-2">
              <Shield className="h-4 w-4" /><span className="hidden sm:inline">Legal Rep</span>
            </TabsTrigger>
            <TabsTrigger value="loan" className="gap-2">
              <DollarSign className="h-4 w-4" /><span className="hidden sm:inline">{t.loans.tabFinancialInfo}</span>
            </TabsTrigger>
            <TabsTrigger value="additional" className="gap-2">
              <FileText className="h-4 w-4" /><span className="hidden sm:inline">Additional</span>
            </TabsTrigger>
          </TabsList>

          {/* Borrower Tab */}
          <TabsContent value="borrower" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{t.loans.tabBorrowerInfo}</CardTitle>
                <CardDescription>Enter the borrower company or individual details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.borrowers.legalType} *</Label>
                    <Select value={formData.legalEntityType} onValueChange={(v) => handleChange("legalEntityType", v)}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">{t.borrowers.individual}</SelectItem>
                        <SelectItem value="legal_entity">{t.borrowers.legalEntity}</SelectItem>
                        <SelectItem value="individual_entrepreneur">{t.borrowers.individualEntrepreneur}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.borrowers.sector} *</Label>
                    <Select value={formData.sector} onValueChange={(v) => handleChange("sector", v)}>
                      <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                      <SelectContent>
                        {sectors.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Client Name *</Label>
                  <Input value={formData.clientName} onChange={(e) => handleChange("clientName", e.target.value)} placeholder="Company or individual name" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.borrowers.tinNumber} *</Label>
                    <Input value={formData.clientTin} onChange={(e) => handleChange("clientTin", e.target.value)} placeholder="123456789" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.borrowers.registrationNumber}</Label>
                    <Input value={formData.registrationNumber} onChange={(e) => handleChange("registrationNumber", e.target.value)} placeholder="REG-XXXXXX" />
                  </div>
                </div>
                <Separator />
                <h4 className="font-medium">Address</h4>
                <div className="space-y-2">
                  <Label>Street Address</Label>
                  <Input value={formData.addressStreet} onChange={(e) => handleChange("addressStreet", e.target.value)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t.borrowers.city}</Label>
                    <Input value={formData.city} onChange={(e) => handleChange("city", e.target.value)} placeholder="Dushanbe" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.borrowers.district}</Label>
                    <Input value={formData.district} onChange={(e) => handleChange("district", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.borrowers.zipCode}</Label>
                    <Input value={formData.zipCode} onChange={(e) => handleChange("zipCode", e.target.value)} placeholder="734000" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t.borrowers.employeeCount}</Label>
                  <Input type="number" value={formData.workforce} onChange={(e) => handleChange("workforce", e.target.value)} placeholder="10" />
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setActiveTab("representative")}>{t.common.next}</Button>
            </div>
          </TabsContent>

          {/* Legal Representative Tab */}
          <TabsContent value="representative" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Legal Representative</CardTitle>
                <CardDescription>Information about the legal representative of the borrower</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Surname *</Label>
                    <Input value={formData.legalRepSurname} onChange={(e) => handleChange("legalRepSurname", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input value={formData.legalRepName} onChange={(e) => handleChange("legalRepName", e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t.borrowers.gender}</Label>
                    <Select value={formData.legalRepGender} onValueChange={(v) => handleChange("legalRepGender", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{t.borrowers.male}</SelectItem>
                        <SelectItem value="female">{t.borrowers.female}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.borrowers.dateOfBirth}</Label>
                    <Input type="date" value={formData.legalRepBirthdate} onChange={(e) => handleChange("legalRepBirthdate", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.borrowers.countryOfBirth}</Label>
                    <Input value={formData.legalRepCountry} onChange={(e) => handleChange("legalRepCountry", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t.borrowers.tinNumber}</Label>
                  <Input value={formData.legalRepTin} onChange={(e) => handleChange("legalRepTin", e.target.value)} placeholder="123456789" />
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("borrower")}>{t.common.previous}</Button>
              <Button type="button" onClick={() => setActiveTab("loan")}>{t.common.next}</Button>
            </div>
          </TabsContent>

          {/* Loan Details Tab */}
          <TabsContent value="loan" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />{t.loans.tabFinancialInfo}</CardTitle>
                <CardDescription>Enter the loan terms and financial details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.loans.bank} *</Label>
                    <Select value={formData.bank} onValueChange={(v) => handleChange("bank", v)}>
                      <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                      <SelectContent>
                        {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.loans.branch} *</Label>
                    <Select value={formData.branch} onValueChange={(v) => handleChange("branch", v)} disabled={!formData.bank}>
                      <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {filteredBranches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t.loans.product} *</Label>
                  <Select value={formData.product} onValueChange={(v) => handleChange("product", v)}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (Max: {p.maxGuarantee}%)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.loans.requestedAmount} *</Label>
                    <Input type="number" value={formData.requestedAmount} onChange={(e) => handleChange("requestedAmount", e.target.value)} placeholder="500000" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.common.currency} *</Label>
                    <Select value={formData.currency} onValueChange={(v) => handleChange("currency", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TJS">TJS - Tajikistani Somoni</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>{t.loans.loanTerm} *</Label>
                    <Input type="number" value={formData.durationMonths} onChange={(e) => handleChange("durationMonths", e.target.value)} placeholder="36" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.loans.gracePeriod}</Label>
                    <Input type="number" value={formData.gracePeriodMonths} onChange={(e) => handleChange("gracePeriodMonths", e.target.value)} placeholder="6" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.loans.interestRate}</Label>
                    <Input type="number" step="0.1" value={formData.interestRate} onChange={(e) => handleChange("interestRate", e.target.value)} placeholder="18.5" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.loans.repaymentFrequency}</Label>
                    <Select value={formData.frequency} onValueChange={(v) => handleChange("frequency", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">{t.loans.monthly}</SelectItem>
                        <SelectItem value="quarterly">{t.loans.quarterly}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t.loans.guaranteeCoverage}</Label>
                    <Input type="number" value={formData.guaranteeCoverage} onChange={(e) => handleChange("guaranteeCoverage", e.target.value)} placeholder="50" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("representative")}>{t.common.previous}</Button>
              <Button type="button" onClick={() => setActiveTab("additional")}>{t.common.next}</Button>
            </div>
          </TabsContent>

          {/* Additional Tab */}
          <TabsContent value="additional" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Additional Information</CardTitle>
                <CardDescription>Additional notes and officer assignment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Loan Officer</Label>
                  <Input value={formData.loanOfficer} onChange={(e) => handleChange("loanOfficer", e.target.value)} placeholder="Officer name at the bank" />
                </div>
                <div className="space-y-2">
                  <Label>{t.loans.purpose}</Label>
                  <Select value={formData.purpose} onValueChange={(v) => handleChange("purpose", v)}>
                    <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="working_capital">{t.loans.workingCapital}</SelectItem>
                      <SelectItem value="investment">{t.loans.investment}</SelectItem>
                      <SelectItem value="operational">{t.loans.operational}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => handleChange("notes", e.target.value)} placeholder="Additional notes about the application..." rows={4} />
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setActiveTab("loan")}>{t.common.previous}</Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                <Save className="h-4 w-4" />
                {isSubmitting ? t.common.loading : t.common.submit}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  )
}
