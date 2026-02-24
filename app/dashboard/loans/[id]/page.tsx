"use client"

import { use, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, Edit, Download, Calendar, Building2, User,
  DollarSign, FileText, AlertTriangle, CheckCircle, Clock,
  TrendingUp, Shield, Printer, XCircle, ThumbsUp, ThumbsDown,
  Loader2, History, AlertCircle, CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import type { LoanApplication } from "@/lib/types/database"

const statusStyles: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-sky-100 text-sky-800",
  rejected: "bg-red-100 text-red-800",
  disbursed: "bg-indigo-100 text-indigo-800",
  active: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-800",
  defaulted: "bg-red-100 text-red-800",
  claim_pending: "bg-orange-100 text-orange-800",
  claim_paid: "bg-purple-100 text-purple-800",
  paid: "bg-emerald-100 text-emerald-800",
  upcoming: "bg-blue-100 text-blue-800",
  overdue: "bg-red-100 text-red-800",
}

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const { t } = useI18n()
  const router = useRouter()
  const supabase = createClient()

  const [loan, setLoan] = useState<LoanApplication | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Workflow dialogs
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [disbursementOpen, setDisbursementOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const [approvedAmount, setApprovedAmount] = useState("")
  const [approvedCoverage, setApprovedCoverage] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")
  const [disbursementDate, setDisbursementDate] = useState(new Date().toISOString().split("T")[0])
  const [disbursedAmount, setDisbursedAmount] = useState("")
  const [maturityDate, setMaturityDate] = useState("")

  const formatCurrency = (amount: number | null | undefined, currency = "TJS") => {
    if (!amount && amount !== 0) return "—"
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount)
  }

  const fetchLoan = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from("loan_applications")
      .select(`
        *,
        bank:banks(*),
        branch:bank_branches(*),
        borrower:borrowers(*,sector:sectors(*)),
        product:loan_products(*)
      `)
      .eq("application_number", resolvedParams.id)
      .maybeSingle()

    if (err) { setError(err.message); setLoading(false); return }
    if (!data) {
      // Try by ID
      const { data: byId } = await supabase
        .from("loan_applications")
        .select(`*,bank:banks(*),branch:bank_branches(*),borrower:borrowers(*,sector:sectors(*)),product:loan_products(*)`)
        .eq("id", resolvedParams.id)
        .maybeSingle()
      setLoan(byId || null)
    } else {
      setLoan(data)
    }

    const { data: hist } = await supabase
      .from("loan_application_history")
      .select("*")
      .eq("loan_application_id", data?.id || resolvedParams.id)
      .order("created_at", { ascending: false })
    if (hist) setHistory(hist)
    setLoading(false)
  }, [resolvedParams.id, supabase])

  useEffect(() => { fetchLoan() }, [fetchLoan])

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const performAction = async (action: string, updates: Record<string, unknown>, note?: string) => {
    if (!loan) return
    setActionLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    try {
      const { error: updateErr } = await supabase
        .from("loan_applications")
        .update(updates)
        .eq("id", loan.id)
      if (updateErr) throw updateErr

      await supabase.from("loan_application_history").insert({
        loan_application_id: loan.id,
        action,
        old_value: { status: loan.status },
        new_value: updates,
        notes: note || null,
        performed_by: user?.id || null,
      })
      await supabase.from("audit_trail").insert({
        table_name: "loan_applications",
        record_id: loan.id,
        action: "UPDATE",
        old_data: { status: loan.status },
        new_data: updates,
        changed_by: user?.id || null,
      })

      showSuccess(`Loan ${action} successfully`)
      setApproveOpen(false)
      setRejectOpen(false)
      setDisbursementOpen(false)
      fetchLoan()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setActionLoading(false)
    }
  }

  const handleApprove = () => performAction("APPROVED", {
    status: "approved",
    approved_amount: parseFloat(approvedAmount) || loan?.requested_amount,
    guarantee_coverage: parseFloat(approvedCoverage) || loan?.guarantee_coverage,
    guarantee_amount: (parseFloat(approvedAmount) || loan?.requested_amount || 0) * (parseFloat(approvedCoverage) || loan?.guarantee_coverage || 50) / 100,
    prsf_approval_date: new Date().toISOString().split("T")[0],
  }, `Approved with amount ${approvedAmount}`)

  const handleReject = () => performAction("REJECTED", {
    status: "rejected",
    rejection_reason: rejectionReason,
  }, rejectionReason)

  const handleDisburse = () => {
    const months = loan?.loan_term_months || 0
    const disbDate = new Date(disbursementDate)
    const matDate = new Date(disbDate)
    matDate.setMonth(matDate.getMonth() + months)
    return performAction("DISBURSED", {
      status: "disbursed",
      disbursed_amount: parseFloat(disbursedAmount) || loan?.approved_amount,
      disbursement_date: disbursementDate,
      maturity_date: maturityDate || matDate.toISOString().split("T")[0],
    }, `Disbursed on ${disbursementDate}`)
  }

  const printGuaranteeLetter = () => {
    if (!loan) return
    const borrowerName = loan.borrower?.company_name || `${loan.borrower?.first_name || ""} ${loan.borrower?.last_name || ""}`.trim()
    const today = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
    const bankName = loan.bank?.name_en || "Partner Bank"
    const guaranteeAmt = formatCurrency(loan.guarantee_amount, loan.currency)
    const loanAmt = formatCurrency(loan.approved_amount || loan.requested_amount, loan.currency)
    const coverage = loan.guarantee_coverage || 50
    const maturity = loan.maturity_date ? new Date(loan.maturity_date).toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" }) : "—"

    const letterHtml = `<!DOCTYPE html><html><head><title>Letter of Guarantee - ${loan.application_number}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.6; margin: 40px; color: #222; }
  .header { text-align: center; margin-bottom: 30px; }
  .header h1 { font-size: 16pt; font-weight: bold; text-transform: uppercase; }
  .header h2 { font-size: 13pt; }
  .ref { text-align: right; margin-bottom: 20px; font-size: 11pt; color: #555; }
  .body { margin: 20px 0; text-align: justify; }
  .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .table td, .table th { border: 1px solid #ccc; padding: 8px 12px; }
  .table th { background: #f0f0f0; font-weight: bold; }
  .signature { margin-top: 60px; display: flex; justify-content: space-between; }
  .sig-block { text-align: center; width: 200px; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; }
</style>
</head><body>
<div class="header">
  <h1>Partial Risk Sharing Facility (PRSF)</h1>
  <h2>Ministry of Finance – Republic of Tajikistan</h2>
  <h2>LETTER OF GUARANTEE</h2>
</div>
<div class="ref">
  <p>Ref. No.: LG-${loan.application_number}</p>
  <p>Date: ${today}</p>
</div>
<div class="body">
<p>To: <strong>${bankName}</strong></p>
<p>This Letter of Guarantee is issued by the <strong>Partial Risk Sharing Facility (PRSF)</strong>, operating under the Ministry of Finance of the Republic of Tajikistan, in accordance with the PRSF Program Agreement.</p>
<p>The PRSF hereby provides a guarantee to <strong>${bankName}</strong> for the loan extended to:</p>
<table class="table">
  <tr><th>Parameter</th><th>Details</th></tr>
  <tr><td>Borrower</td><td>${borrowerName}</td></tr>
  <tr><td>TIN / Registration</td><td>${loan.borrower?.tin_number || "—"}</td></tr>
  <tr><td>Loan Application No.</td><td>${loan.application_number}</td></tr>
  <tr><td>Loan Amount</td><td>${loanAmt}</td></tr>
  <tr><td>Currency</td><td>${loan.currency}</td></tr>
  <tr><td>Loan Term</td><td>${loan.loan_term_months} months</td></tr>
  <tr><td>Maturity Date</td><td>${maturity}</td></tr>
  <tr><td>Guarantee Coverage</td><td>${coverage}%</td></tr>
  <tr><td>Guarantee Amount</td><td>${guaranteeAmt}</td></tr>
  <tr><td>Guarantee Validity</td><td>Until maturity date plus 90 days</td></tr>
</table>
<p>This guarantee covers <strong>${coverage}% of the outstanding principal</strong> in case of borrower default, subject to the terms and conditions of the PRSF Guarantee Agreement signed between PRSF and ${bankName}.</p>
<p>This Letter of Guarantee is valid from the date of signing until the loan maturity date plus ninety (90) calendar days. Any claim must be submitted within this period in accordance with the PRSF Claims Procedure.</p>
</div>
<div class="signature">
  <div class="sig-block">
    <div class="sig-line"></div>
    <p><strong>PRSF Director</strong></p>
    <p>Partial Risk Sharing Facility</p>
    <p>Ministry of Finance, Republic of Tajikistan</p>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <p><strong>Authorized Signatory</strong></p>
    <p>${bankName}</p>
  </div>
</div>
<p style="margin-top:40px;font-size:10pt;color:#666;">This document is computer-generated and constitutes a valid guarantee instrument subject to the PRSF Program Agreement. Ref: ${loan.application_number} | Generated: ${today}</p>
</body></html>`
    const win = window.open("", "_blank")
    if (win) { win.document.write(letterHtml); win.document.close(); win.print() }
  }

  if (loading) return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )

  if (!loan) return (
    <div className="p-8 text-center">
      <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
      <p className="text-lg font-medium">Loan application not found</p>
      <Button asChild variant="outline" className="mt-4"><Link href="/dashboard/loans">Back to Loans</Link></Button>
    </div>
  )

  const borrowerName = loan.borrower?.company_name || `${loan.borrower?.first_name || ""} ${loan.borrower?.last_name || ""}`.trim() || "Unknown Borrower"
  const disbursed = loan.disbursed_amount || loan.approved_amount || loan.requested_amount
  const outstanding = disbursed // simplified — would come from monthly_reports
  const repaymentProgress = loan.status === "closed" ? 100 : loan.disbursement_date ? Math.min(50, ((new Date().getTime() - new Date(loan.disbursement_date).getTime()) / (1000 * 60 * 60 * 24 * 30)) / (loan.loan_term_months / 100)) : 0

  return (
    <div className="p-6 lg:p-8">
      {/* Messages */}
      {error && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</div>}
      {successMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{successMsg}</div>}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon"><Link href="/dashboard/loans"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">{loan.application_number}</h1>
              <Badge className={statusStyles[loan.status]} variant="secondary">{loan.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{borrowerName} · {loan.bank?.name_en || "—"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {loan.status === "submitted" && (
            <>
              <Button onClick={() => { setApprovedAmount(String(loan.requested_amount)); setApprovedCoverage(String(loan.guarantee_coverage || 50)); setApproveOpen(true) }} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><ThumbsUp className="h-4 w-4" />Approve</Button>
              <Button onClick={() => setRejectOpen(true)} variant="destructive" className="gap-2"><ThumbsDown className="h-4 w-4" />Reject</Button>
            </>
          )}
          {loan.status === "approved" && (
            <Button onClick={() => { setDisbursedAmount(String(loan.approved_amount || loan.requested_amount)); setDisbursementOpen(true) }} className="gap-2 bg-indigo-600 hover:bg-indigo-700"><CheckCircle className="h-4 w-4" />Record Disbursement</Button>
          )}
          {(loan.status === "approved" || loan.status === "disbursed" || loan.status === "active") && (
            <Button variant="outline" onClick={printGuaranteeLetter} className="gap-2"><Printer className="h-4 w-4" />Print LG</Button>
          )}
          <Button variant="outline" asChild className="gap-2"><Link href={`/dashboard/loans/${resolvedParams.id}/edit`}><Edit className="h-4 w-4" />Edit</Link></Button>
          <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />Export</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Requested / Approved</p>
                <p className="text-lg font-bold">{formatCurrency(loan.approved_amount || loan.requested_amount, loan.currency)}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2.5"><DollarSign className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Guarantee Amount</p>
                <p className="text-lg font-bold">{formatCurrency(loan.guarantee_amount, loan.currency)}</p>
              </div>
              <div className="rounded-full bg-blue-500/10 p-2.5"><Shield className="h-5 w-5 text-blue-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Coverage</p>
                <p className="text-lg font-bold">{loan.guarantee_coverage || 0}%</p>
              </div>
              <div className="rounded-full bg-emerald-500/10 p-2.5"><TrendingUp className="h-5 w-5 text-emerald-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Term</p>
                <p className="text-lg font-bold">{loan.loan_term_months} mo</p>
              </div>
              <div className="rounded-full bg-amber-500/10 p-2.5"><Calendar className="h-5 w-5 text-amber-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar (for active/disbursed loans) */}
      {loan.disbursement_date && (
        <Card className="mb-6">
          <CardContent className="pt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Loan Progress</span>
              <span className="text-sm text-muted-foreground">{repaymentProgress.toFixed(1)}% elapsed</span>
            </div>
            <Progress value={repaymentProgress} className="h-2" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>Disbursed: {new Date(loan.disbursement_date).toLocaleDateString()}</span>
              <span>Maturity: {loan.maturity_date ? new Date(loan.maturity_date).toLocaleDateString() : "—"}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details" className="gap-2 text-xs sm:text-sm"><FileText className="h-3.5 w-3.5" />Details</TabsTrigger>
          <TabsTrigger value="borrower" className="gap-2 text-xs sm:text-sm"><User className="h-3.5 w-3.5" />Borrower</TabsTrigger>
          <TabsTrigger value="financial" className="gap-2 text-xs sm:text-sm"><DollarSign className="h-3.5 w-3.5" />Financial</TabsTrigger>
          <TabsTrigger value="history" className="gap-2 text-xs sm:text-sm"><History className="h-3.5 w-3.5" />History</TabsTrigger>
        </TabsList>

        {/* Details */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Loan Terms</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Product", loan.product?.name_en || "—"],
                  ["Interest Rate", loan.interest_rate ? `${loan.interest_rate}% p.a.` : "—"],
                  ["Term", `${loan.loan_term_months} months`],
                  ["Grace Period", loan.grace_period_months ? `${loan.grace_period_months} months` : "None"],
                  ["Frequency", loan.repayment_frequency?.replace(/_/g, " ") || "—"],
                  ["Method", loan.repayment_method?.replace(/_/g, " ") || "—"],
                  ["Purpose", loan.loan_purpose?.replace(/_/g, " ") || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium capitalize">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Key Dates</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Application Date", loan.application_date],
                  ["Bank Approval", loan.bank_approval_date],
                  ["PRSF Submission", loan.prsf_submission_date],
                  ["PRSF Approval", loan.prsf_approval_date],
                  ["Disbursement", loan.disbursement_date],
                  ["Maturity", loan.maturity_date],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value ? new Date(value).toLocaleDateString() : "—"}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Bank & Officer</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Bank", loan.bank?.name_en || "—"],
                  ["Branch", loan.branch?.name_en || "—"],
                  ["Loan Officer", loan.bank_loan_officer || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            {(loan.collateral_description || loan.covenants_bank || loan.covenants_prsf) && (
              <Card>
                <CardHeader><CardTitle className="text-base">Collateral & Covenants</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {loan.collateral_description && <div><p className="text-muted-foreground text-xs">Collateral</p><p>{loan.collateral_description}</p></div>}
                  {loan.covenants_bank && <div><p className="text-muted-foreground text-xs">Bank Covenants</p><p>{loan.covenants_bank}</p></div>}
                  {loan.covenants_prsf && <div><p className="text-muted-foreground text-xs">PRSF Covenants</p><p>{loan.covenants_prsf}</p></div>}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Borrower */}
        <TabsContent value="borrower" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Borrower Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Name", borrowerName],
                  ["Legal Type", loan.borrower?.legal_type?.replace(/_/g, " ") || "—"],
                  ["TIN Number", loan.borrower?.tin_number || "—"],
                  ["Registration No.", loan.borrower?.registration_number || "—"],
                  ["Sector", loan.borrower?.sector?.name_en || "—"],
                  ["City", loan.borrower?.city || "—"],
                  ["District", loan.borrower?.district || "—"],
                  ["Employees", loan.borrower?.employee_count?.toString() || "—"],
                  ["Established", loan.borrower?.establishment_year?.toString() || "—"],
                  ["Phone", loan.borrower?.phone || "—"],
                  ["Email", loan.borrower?.email || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium capitalize">{value}</span>
                  </div>
                ))}
                {loan.borrower?.is_blacklisted && (
                  <div className="rounded-md bg-red-50 p-3">
                    <p className="text-xs font-medium text-red-700">TNB Blacklist: {loan.borrower.blacklist_reason || "Listed"}</p>
                  </div>
                )}
              </CardContent>
            </Card>
            {loan.personal_guarantors && Array.isArray(loan.personal_guarantors) && loan.personal_guarantors.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Personal Guarantors</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>ID Number</TableHead>
                        <TableHead>Relationship</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(loan.personal_guarantors as any[]).map((g, i) => (
                        <TableRow key={i}>
                          <TableCell>{g.name}</TableCell>
                          <TableCell>{g.id_number}</TableCell>
                          <TableCell>{g.relationship}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Financial */}
        <TabsContent value="financial">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Loan Amounts</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Requested", formatCurrency(loan.requested_amount, loan.currency)],
                  ["Approved", formatCurrency(loan.approved_amount, loan.currency)],
                  ["Disbursed", formatCurrency(loan.disbursed_amount, loan.currency)],
                  ["Guarantee Amount", formatCurrency(loan.guarantee_amount, loan.currency)],
                  ["Total Exposure", formatCurrency(loan.total_exposure, loan.currency)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Borrower Financials</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Annual Turnover", formatCurrency(loan.annual_turnover, loan.currency)],
                  ["Net Income", formatCurrency(loan.net_income, loan.currency)],
                  ["Risk Rating", loan.risk_rating || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">Application History</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No history records yet.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <div className="rounded-full bg-primary/10 p-2"><History className="h-4 w-4 text-primary" /></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{h.action}</p>
                        {h.notes && <p className="text-xs text-muted-foreground">{h.notes}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Loan Application</DialogTitle>
            <DialogDescription>Review and confirm the approved terms for {loan.application_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Approved Amount ({loan.currency})</Label>
              <Input type="number" value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Guarantee Coverage (%)</Label>
              <Input type="number" value={approvedCoverage} onChange={(e) => setApprovedCoverage(e.target.value)} min="0" max="100" />
            </div>
            {approvedAmount && approvedCoverage && (
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                Guarantee amount: {formatCurrency(parseFloat(approvedAmount) * parseFloat(approvedCoverage) / 100, loan.currency)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ThumbsUp className="mr-2 h-4 w-4" />Approve</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Loan Application</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this application</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Rejection Reason *</Label>
            <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why the application is being rejected..." rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading || !rejectionReason}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="mr-2 h-4 w-4" />Reject Application</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disbursement Dialog */}
      <Dialog open={disbursementOpen} onOpenChange={setDisbursementOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Disbursement</DialogTitle>
            <DialogDescription>Confirm the loan disbursement details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Disbursed Amount ({loan.currency})</Label>
              <Input type="number" value={disbursedAmount} onChange={(e) => setDisbursedAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Disbursement Date</Label>
              <Input type="date" value={disbursementDate} onChange={(e) => setDisbursementDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Maturity Date (auto-calculated if blank)</Label>
              <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisbursementOpen(false)}>Cancel</Button>
            <Button onClick={handleDisburse} disabled={actionLoading} className="bg-indigo-600 hover:bg-indigo-700">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="mr-2 h-4 w-4" />Confirm Disbursement</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
