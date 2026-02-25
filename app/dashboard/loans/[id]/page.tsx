"use client"

import { use, useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft, Printer, CheckCircle2, XCircle, Shield, Banknote,
  RefreshCw, AlertTriangle, TrendingDown, Loader2, ChevronRight,
  Building2, User, Calendar, DollarSign, FileText, Clock,
} from "lucide-react"
import Link from "next/link"
import type { LoanApplication } from "@/lib/types/database"

// ─── Workflow definition ──────────────────────────────────────────────────────
// Mirrors the 9-step diagram exactly:
// Step1: draft/submitted  →  Step2: bank approval (submitted)
// Step3: under_review  →  Step4A: rejected / Step4B: approved
// Step5A: bank notified (rejection) → END
// Step5B: bank notified (approval)
// Step6: guarantee_issued OR cancelled → END
// Step7: disbursed → Step7A: settled | Step7B: rescheduled | Step7C: claim_pending
// Step7B: rescheduled → settled → END
// Step7C: claim → Step8B: claim review → approved → payment → recoveries → END
//                             → rejected → END

type WorkflowStepKey =
  | "initiation"
  | "bank_approval"
  | "prsf_receipt"
  | "prsf_decision"
  | "notification"
  | "guarantee_issuance"
  | "disbursement"
  | "outcome"
  | "claim_review"
  | "recoveries"

interface WorkflowStep {
  key: WorkflowStepKey
  label: string
  substep?: string
  statuses: string[]
  terminalStatuses?: string[]
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { key: "initiation",        label: "Step 1 · Loan Initiation",      statuses: ["draft"] },
  { key: "bank_approval",     label: "Step 2 · Bank Approval",         statuses: ["submitted"] },
  { key: "prsf_receipt",      label: "Step 3 · Received by PRSF",      statuses: ["under_review"] },
  { key: "prsf_decision",     label: "Step 4 · PRSF Credit Decision",  statuses: ["approved", "rejected"] },
  { key: "notification",      label: "Step 5 · Bank Notified",         statuses: ["approved", "rejected"] },
  { key: "guarantee_issuance",label: "Step 6 · Guarantee / Cancellation", statuses: ["guarantee_issued", "cancelled"], terminalStatuses: ["cancelled"] },
  { key: "disbursement",      label: "Step 7 (C) · Disbursement",      statuses: ["disbursed", "active"] },
  { key: "outcome",           label: "Step 7 · Outcome",               statuses: ["settled", "rescheduled", "claim_pending", "claim_paid"] },
  { key: "claim_review",      label: "Step 8 · Claim Review",          statuses: ["claim_pending", "claim_paid"] },
  { key: "recoveries",        label: "Step 9 · Recoveries",            statuses: ["claim_paid", "closed"] },
]

function getActiveStep(status: string): number {
  if (["draft"].includes(status)) return 0
  if (["submitted"].includes(status)) return 1
  if (["under_review"].includes(status)) return 2
  if (["rejected"].includes(status)) return 3
  if (["approved"].includes(status)) return 4
  if (["guarantee_issued", "cancelled"].includes(status)) return 5
  if (["disbursed", "active"].includes(status)) return 6
  if (["settled", "rescheduled", "claim_pending"].includes(status)) return 7
  if (["claim_paid"].includes(status)) return 8
  if (["closed"].includes(status)) return 9
  return 0
}

// ─── Status badge helpers ─────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  draft:           "bg-gray-100 text-gray-700 border-gray-200",
  submitted:       "bg-amber-100 text-amber-800 border-amber-200",
  under_review:    "bg-blue-100 text-blue-800 border-blue-200",
  approved:        "bg-sky-100 text-sky-800 border-sky-200",
  rejected:        "bg-red-100 text-red-800 border-red-200",
  guarantee_issued:"bg-teal-100 text-teal-800 border-teal-200",
  cancelled:       "bg-red-100 text-red-800 border-red-200",
  disbursed:       "bg-indigo-100 text-indigo-800 border-indigo-200",
  active:          "bg-emerald-100 text-emerald-800 border-emerald-200",
  settled:         "bg-emerald-100 text-emerald-800 border-emerald-200",
  rescheduled:     "bg-orange-100 text-orange-800 border-orange-200",
  claim_pending:   "bg-rose-100 text-rose-800 border-rose-200",
  claim_paid:      "bg-purple-100 text-purple-800 border-purple-200",
  closed:          "bg-gray-100 text-gray-700 border-gray-200",
  defaulted:       "bg-red-100 text-red-800 border-red-200",
}

const STATUS_LABELS: Record<string, string> = {
  draft:           "Draft",
  submitted:       "Submitted",
  under_review:    "Under Review",
  approved:        "Approved",
  rejected:        "Rejected",
  guarantee_issued:"Guarantee Issued",
  cancelled:       "Cancelled",
  disbursed:       "Disbursed",
  active:          "Active",
  settled:         "Settled",
  rescheduled:     "Rescheduled",
  claim_pending:   "Claim Pending",
  claim_paid:      "Claim Paid",
  closed:          "Closed",
  defaulted:       "Defaulted",
}

// ─── Workflow Stepper component ───────────────────────────────────────────────
function WorkflowStepper({ status }: { status: string }) {
  const activeIdx = getActiveStep(status)
  const isTerminal = ["rejected", "cancelled", "settled", "closed", "claim_paid"].includes(status)

  const steps = [
    { num: 1, label: "Initiation",     sub: "Bank submits loan" },
    { num: 2, label: "Bank Approval",  sub: "Bank internal approval" },
    { num: 3, label: "PRSF Receipt",   sub: "Received for processing" },
    { num: 4, label: "Credit Decision",sub: "PRSF approve / reject" },
    { num: 5, label: "Notification",   sub: "Bank notified of decision" },
    { num: 6, label: "Guarantee",      sub: "Issued or cancelled" },
    { num: 7, label: "Disbursement",   sub: "Loan disbursed to borrower" },
    { num: 8, label: "Outcome",        sub: "Settled / Rescheduled / Claim" },
    { num: 9, label: "Closure",        sub: "Claim paid / Recoveries" },
  ]

  return (
    <div className="relative overflow-x-auto pb-2">
      <div className="flex min-w-max items-start gap-0">
        {steps.map((step, idx) => {
          const done    = idx < activeIdx
          const current = idx === activeIdx
          const future  = idx > activeIdx
          const isRed   = current && ["rejected", "cancelled"].includes(status)

          return (
            <div key={step.num} className="flex items-center">
              <div className="flex flex-col items-center gap-1" style={{ minWidth: 88 }}>
                {/* Circle */}
                <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all
                  ${done    ? "border-primary bg-primary text-primary-foreground" : ""}
                  ${current && !isRed ? "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20" : ""}
                  ${isRed   ? "border-red-500 bg-red-500 text-white ring-4 ring-red-200" : ""}
                  ${future  ? "border-border bg-background text-muted-foreground" : ""}
                `}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : step.num}
                </div>
                {/* Labels */}
                <span className={`text-center text-[10px] font-semibold leading-tight
                  ${done || current ? "text-foreground" : "text-muted-foreground"}
                `}>{step.label}</span>
                <span className="text-center text-[9px] leading-tight text-muted-foreground">{step.sub}</span>
              </div>
              {/* Connector */}
              {idx < steps.length - 1 && (
                <div className={`h-0.5 w-8 flex-shrink-0 -mt-8 transition-all
                  ${idx < activeIdx ? "bg-primary" : "bg-border"}
                `} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Action buttons based on current status ───────────────────────────────────
function getAvailableActions(status: string, userRole: string): string[] {
  const isPrsf = ["super_admin", "prsf_admin", "prsf_analyst"].includes(userRole)
  const isBank = ["bank_admin", "bank_officer"].includes(userRole)

  switch (status) {
    case "draft":        return isBank ? ["submit"] : []
    case "submitted":    return isPrsf ? ["mark_received"] : []
    case "under_review": return isPrsf ? ["approve", "reject"] : []
    case "approved":     return isPrsf ? ["issue_guarantee", "cancel"] : []
    case "guarantee_issued": return isBank ? ["record_disbursement"] : []
    case "disbursed":
    case "active":       return isBank ? ["mark_settled", "reschedule", "file_claim"] : []
    case "rescheduled":  return isBank ? ["mark_settled", "file_claim"] : []
    case "claim_pending":return isPrsf ? ["approve_claim", "reject_claim"] : []
    default: return []
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [loan, setLoan]     = useState<LoanApplication | null>(null)
  const [claims, setClaims] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState("bank_officer")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  // Dialog visibility
  const [dialog, setDialog] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form fields (shared across dialogs)
  const [notes, setNotes]             = useState("")
  const [amount, setAmount]           = useState("")
  const [coverage, setCoverage]       = useState("")
  const [dateField, setDateField]     = useState(new Date().toISOString().split("T")[0])
  const [dateField2, setDateField2]   = useState("")
  const [reason, setReason]           = useState("")
  const [claimPrincipal, setClaimPrincipal] = useState("")
  const [claimInterest, setClaimInterest]   = useState("")

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const fmt = (v: number | null | undefined, ccy = "TJS") =>
    v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, minimumFractionDigits: 0 }).format(v)

  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchLoan = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("loan_applications")
      .select(`*, bank:banks(*), branch:bank_branches(*), borrower:borrowers(*), product:loan_products(*)`)
      .eq("id", resolvedParams.id)
      .single()
    if (!error && data) setLoan(data as LoanApplication)
    setLoading(false)
  }, [resolvedParams.id, supabase])

  useEffect(() => {
    fetchLoan()
    // Get current user role
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role:roles(code)")
          .eq("id", user.id)
          .single()
        if (profile?.role) setUserRole((profile.role as any).code)
      }
    })
    // Fetch related claims
    supabase
      .from("claims")
      .select("*")
      .eq("loan_application_id", resolvedParams.id)
      .then(({ data }) => setClaims(data || []))
  }, [fetchLoan, resolvedParams.id, supabase])

  // ── Workflow transitions ───────────────────────────────────────────────────
  const transition = async (newStatus: string, extra: Record<string, unknown> = {}) => {
    if (!loan) return
    setSaving(true)
    const payload: Record<string, unknown> = { status: newStatus, updated_at: new Date().toISOString(), ...extra }

    const { error } = await supabase.from("loan_applications").update(payload).eq("id", loan.id)
    if (error) {
      showToast("Action failed: " + error.message, "error")
    } else {
      showToast("Status updated successfully")
      setDialog(null)
      fetchLoan()
    }
    setSaving(false)
  }

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleSubmit = () => transition("submitted", { prsf_submission_date: dateField })

  const handleMarkReceived = () => transition("under_review", { prsf_submission_date: dateField })

  const handleApprove = () => transition("approved", {
    prsf_approval_date: dateField,
    approved_amount: parseFloat(amount) || loan?.requested_amount,
    guarantee_coverage: parseFloat(coverage) || loan?.guarantee_coverage,
    guarantee_amount: (parseFloat(amount) || loan?.requested_amount || 0) * ((parseFloat(coverage) || loan?.guarantee_coverage || 50) / 100),
    notes,
  })

  const handleReject = () => transition("rejected", { rejection_reason: reason })

  const handleIssueGuarantee = () => transition("guarantee_issued", {
    guarantee_issued_date: dateField,
    notes,
  })

  const handleCancel = () => transition("cancelled", { cancellation_reason: reason })

  const handleDisbursement = () => transition("active", {
    disbursement_date: dateField,
    disbursed_amount: parseFloat(amount) || loan?.approved_amount,
    maturity_date: dateField2,
  })

  const handleSettle = () => transition("settled", {
    settlement_date: dateField,
    settlement_amount: parseFloat(amount) || 0,
  })

  const handleReschedule = () => transition("rescheduled", {
    reschedule_date: dateField,
    reschedule_reason: reason,
    new_maturity_date: dateField2,
  })

  const handleFileClaim = async () => {
    if (!loan) return
    setSaving(true)
    const total = (parseFloat(claimPrincipal) || 0) + (parseFloat(claimInterest) || 0)
    const { error } = await supabase.from("claims").insert({
      loan_application_id: loan.id,
      claim_date: dateField,
      claim_amount: total,
      principal_claimed: parseFloat(claimPrincipal) || 0,
      interest_claimed: parseFloat(claimInterest) || 0,
      status: "pending",
    })
    if (error) { showToast("Failed to file claim: " + error.message, "error") }
    else {
      await transition("claim_pending", {})
      showToast("Claim filed successfully")
      setDialog(null)
    }
    setSaving(false)
  }

  const handleApproveClaim = async () => {
    if (!loan || !claims[0]) return
    setSaving(true)
    await supabase.from("claims").update({
      status: "approved",
      review_date: dateField,
      review_notes: notes,
      approved_amount: parseFloat(amount) || claims[0].claim_amount,
    }).eq("id", claims[0].id)
    await transition("claim_paid", {})
    setSaving(false)
  }

  const handleRejectClaim = async () => {
    if (!loan || !claims[0]) return
    setSaving(true)
    await supabase.from("claims").update({ status: "rejected", review_date: dateField, review_notes: reason }).eq("id", claims[0].id)
    await transition("closed", {})
    setSaving(false)
  }

  // ── Print Letter of Guarantee ─────────────────────────────────────────────
  const printGuarantee = () => {
    if (!loan) return
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Letter of Guarantee</title>
    <style>
      body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 40px; color: #000; }
      .header { text-align: center; margin-bottom: 32px; }
      .logo-row { display: flex; justify-content: center; align-items: center; gap: 16px; margin-bottom: 8px; }
      h1 { font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 0; }
      h2 { font-size: 15px; font-weight: normal; margin: 4px 0; }
      .ref { font-size: 13px; color: #555; margin-top: 8px; }
      .section { margin: 20px 0; }
      .section h3 { font-size: 14px; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
      td { padding: 6px 8px; vertical-align: top; }
      td:first-child { width: 45%; color: #555; }
      .highlight { font-weight: bold; font-size: 15px; }
      .footer { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
      .sig-line { border-top: 1px solid #000; padding-top: 6px; font-size: 12px; color: #555; }
      .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg);
        font-size: 80px; color: rgba(0,0,0,0.04); font-weight: bold; pointer-events: none; z-index: -1; }
    </style></head><body>
    <div class="watermark">CGF</div>
    <div class="header">
      <div class="logo-row"><h1>Credit Guarantee Fund</h1></div>
      <h2>Ministry of Finance — Republic of Tajikistan</h2>
      <p class="ref">LETTER OF GUARANTEE</p>
      <p class="ref">No. LG-${loan.application_number} &nbsp;|&nbsp; Date: ${fmtDate(loan.guarantee_issued_date || loan.prsf_approval_date)}</p>
    </div>

    <div class="section">
      <p>This Letter of Guarantee is issued by the <strong>Credit Guarantee Fund (CGF)</strong>, established under the Ministry of Finance of the Republic of Tajikistan, in favour of:</p>
      <table>
        <tr><td>Partner Bank:</td><td class="highlight">${(loan.bank as any)?.name_en ?? "—"}</td></tr>
        <tr><td>Borrower:</td><td class="highlight">${loan.borrower ? [(loan.borrower as any).company_name, (loan.borrower as any).first_name, (loan.borrower as any).last_name].filter(Boolean).join(" ") : "—"}</td></tr>
        <tr><td>TIN Number:</td><td>${(loan.borrower as any)?.tin_number ?? "—"}</td></tr>
      </table>
    </div>

    <div class="section">
      <h3>Guarantee Terms</h3>
      <table>
        <tr><td>Application Reference:</td><td>${loan.application_number}</td></tr>
        <tr><td>Loan Amount Approved:</td><td class="highlight">${fmt(loan.approved_amount, loan.currency)}</td></tr>
        <tr><td>Guarantee Coverage:</td><td>${loan.guarantee_coverage ?? 50}%</td></tr>
        <tr><td>Guaranteed Amount:</td><td class="highlight">${fmt(loan.guarantee_amount, loan.currency)}</td></tr>
        <tr><td>Loan Term:</td><td>${loan.loan_term_months} months</td></tr>
        <tr><td>Interest Rate:</td><td>${loan.interest_rate ?? "—"}% per annum</td></tr>
        <tr><td>Validity of Guarantee:</td><td>Until maturity of the loan: ${fmtDate(loan.maturity_date)}</td></tr>
      </table>
    </div>

    <div class="section">
      <h3>Conditions</h3>
      <p style="font-size:13px; line-height:1.7;">
        PRSF hereby guarantees ${loan.guarantee_coverage ?? 50}% of the principal outstanding in the event of default by the borrower, subject to the terms and conditions of the Guarantee Agreement and the Operational Manual of the PRSF Programme. This guarantee is non-transferable and shall expire upon full repayment of the loan or upon the maturity date stated above.
      </p>
    </div>

    <div class="footer">
      <div>
        <div class="sig-line">Authorised Signatory — PRSF</div>
        <p style="font-size:12px; margin-top:4px;">Name: ________________________</p>
        <p style="font-size:12px;">Title: Director, PRSF</p>
      </div>
      <div>
        <div class="sig-line">Acknowledged — Partner Bank</div>
        <p style="font-size:12px; margin-top:4px;">Name: ________________________</p>
        <p style="font-size:12px;">Title: ________________________</p>
      </div>
    </div>

    <p style="font-size:11px; color:#888; margin-top:48px; text-align:center;">
      This document is generated by the PRSF Management Information System. For verification contact prsf@minfin.tj
    </p>
    </body></html>`)
    w.document.close()
    w.print()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )

  if (!loan) return (
    <div className="flex h-64 flex-col items-center justify-center gap-3">
      <p className="text-muted-foreground">Loan application not found.</p>
      <Button asChild variant="outline"><Link href="/dashboard/loans"><ArrowLeft className="mr-2 h-4 w-4" />Back to Loans</Link></Button>
    </div>
  )

  const actions = getAvailableActions(loan.status, userRole)
  const borrowerName = loan.borrower
    ? [(loan.borrower as any).company_name, (loan.borrower as any).first_name, (loan.borrower as any).last_name].filter(Boolean).join(" ")
    : "—"

  return (
    <div className="p-4 lg:p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all
          ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/dashboard/loans"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-foreground">{loan.application_number}</h1>
            <Badge className={`border text-xs ${STATUS_COLORS[loan.status] ?? "bg-gray-100 text-gray-700"}`}>
              {STATUS_LABELS[loan.status] ?? loan.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{borrowerName} · {(loan.bank as any)?.name_en}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loan.status === "guarantee_issued" && (
            <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={printGuarantee}>
              <Printer className="h-3.5 w-3.5" />Print Letter of Guarantee
            </Button>
          )}
          {/* Primary action buttons */}
          {actions.includes("submit")            && <Button size="sm" className="gap-1.5" onClick={() => { setDateField(new Date().toISOString().split("T")[0]); setDialog("submit") }}>Submit to PRSF</Button>}
          {actions.includes("mark_received")     && <Button size="sm" className="gap-1.5" onClick={() => setDialog("mark_received")}>Mark as Received</Button>}
          {actions.includes("approve")           && <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setAmount(String(loan.approved_amount ?? loan.requested_amount)); setCoverage(String(loan.guarantee_coverage ?? 50)); setDialog("approve") }}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button>}
          {actions.includes("reject")            && <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setDialog("reject")}><XCircle className="h-3.5 w-3.5" />Reject</Button>}
          {actions.includes("issue_guarantee")   && <Button size="sm" className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setDialog("issue_guarantee")}><Shield className="h-3.5 w-3.5" />Issue Guarantee</Button>}
          {actions.includes("cancel")            && <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 bg-transparent" onClick={() => setDialog("cancel")}><XCircle className="h-3.5 w-3.5" />Cancel</Button>}
          {actions.includes("record_disbursement")&& <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => { setAmount(String(loan.approved_amount ?? "")); setDialog("disbursement") }}><Banknote className="h-3.5 w-3.5" />Record Disbursement</Button>}
          {actions.includes("mark_settled")      && <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setDialog("settle")}><CheckCircle2 className="h-3.5 w-3.5" />Mark Settled</Button>}
          {actions.includes("reschedule")        && <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" onClick={() => setDialog("reschedule")}><RefreshCw className="h-3.5 w-3.5" />Reschedule</Button>}
          {actions.includes("file_claim")        && <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setDialog("claim")}><AlertTriangle className="h-3.5 w-3.5" />File Claim</Button>}
          {actions.includes("approve_claim")     && <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setAmount(String(claims[0]?.claim_amount ?? "")); setDialog("approve_claim") }}>Approve Claim</Button>}
          {actions.includes("reject_claim")      && <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setDialog("reject_claim")}>Reject Claim</Button>}
        </div>
      </div>

      {/* ── Workflow Stepper ── */}
      <Card className="mb-6 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Workflow Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowStepper status={loan.status} />

          {/* Branch indicators */}
          {loan.status === "rejected" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              <span><strong>Step 4A — Rejected.</strong> Bank has been notified. End of process.</span>
              {loan.rejection_reason && <span className="ml-2 text-xs opacity-75">Reason: {loan.rejection_reason}</span>}
            </div>
          )}
          {loan.status === "cancelled" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              <span><strong>Step 6A — Cancelled.</strong> Guarantee cancelled before disbursement. End of process.</span>
            </div>
          )}
          {loan.status === "settled" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span><strong>Step 7A — Loan Settled.</strong> Borrower repaid in full. End of process.</span>
            </div>
          )}
          {loan.status === "rescheduled" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-700">
              <RefreshCw className="h-4 w-4 flex-shrink-0" />
              <span><strong>Step 7B — Rescheduled.</strong> New maturity: {fmtDate(loan.new_maturity_date)}. Awaiting settlement or claim.</span>
            </div>
          )}
          {loan.status === "claim_pending" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span><strong>Step 7C — Claim Filed.</strong> Awaiting PRSF review (Step 8B).</span>
            </div>
          )}
          {loan.status === "claim_paid" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span><strong>Step 8B2 — Claim Approved & Paid.</strong> Recovery tracking in progress (Step 9).</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Detail Tabs ── */}
      <Tabs defaultValue="overview">
        <TabsList className="mb-4 h-9">
          <TabsTrigger value="overview"   className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="borrower"   className="text-xs">Borrower</TabsTrigger>
          <TabsTrigger value="financials" className="text-xs">Financials</TabsTrigger>
          <TabsTrigger value="claims"     className="text-xs">Claims {claims.length > 0 && `(${claims.length})`}</TabsTrigger>
          <TabsTrigger value="timeline"   className="text-xs">Timeline</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Building2 className="h-3.5 w-3.5" />Bank & Branch</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="font-medium">{(loan.bank as any)?.name_en ?? "—"}</div>
                <div className="text-muted-foreground">{(loan.branch as any)?.name_en ?? "Head Office"}</div>
                <div className="text-muted-foreground">Officer: {loan.bank_loan_officer ?? "—"}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><DollarSign className="h-3.5 w-3.5" />Loan Amount</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="text-lg font-bold text-foreground">{fmt(loan.approved_amount ?? loan.requested_amount, loan.currency)}</div>
                <div className="text-xs text-muted-foreground">Requested: {fmt(loan.requested_amount, loan.currency)}</div>
                <div className="text-xs text-muted-foreground">Disbursed: {fmt(loan.disbursed_amount, loan.currency)}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Shield className="h-3.5 w-3.5" />Guarantee</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="text-lg font-bold text-foreground">{fmt(loan.guarantee_amount, loan.currency)}</div>
                <div className="text-xs text-muted-foreground">Coverage: {loan.guarantee_coverage ?? 50}%</div>
                <div className="text-xs text-muted-foreground">Issued: {fmtDate(loan.guarantee_issued_date)}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Calendar className="h-3.5 w-3.5" />Key Dates</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Application:</span><span className="text-foreground">{fmtDate(loan.application_date)}</span></div>
                <div className="flex justify-between"><span>Bank Approval:</span><span className="text-foreground">{fmtDate(loan.bank_approval_date)}</span></div>
                <div className="flex justify-between"><span>PRSF Approval:</span><span className="text-foreground">{fmtDate(loan.prsf_approval_date)}</span></div>
                <div className="flex justify-between"><span>Disbursement:</span><span className="text-foreground">{fmtDate(loan.disbursement_date)}</span></div>
                <div className="flex justify-between"><span>Maturity:</span><span className="text-foreground">{fmtDate(loan.new_maturity_date ?? loan.maturity_date)}</span></div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><FileText className="h-3.5 w-3.5" />Loan Terms</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Product:</span><span className="text-foreground">{(loan.product as any)?.name_en ?? "—"}</span></div>
                <div className="flex justify-between"><span>Term:</span><span className="text-foreground">{loan.loan_term_months} months</span></div>
                <div className="flex justify-between"><span>Interest Rate:</span><span className="text-foreground">{loan.interest_rate ?? "—"}% p.a.</span></div>
                <div className="flex justify-between"><span>Repayment:</span><span className="text-foreground capitalize">{loan.repayment_method?.replace("_", " ") ?? "—"}</span></div>
                <div className="flex justify-between"><span>Frequency:</span><span className="text-foreground capitalize">{loan.repayment_frequency}</span></div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Clock className="h-3.5 w-3.5" />Rescheduling</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                {loan.reschedule_date ? (<>
                  <div className="flex justify-between"><span>Reschedule Date:</span><span className="text-foreground">{fmtDate(loan.reschedule_date)}</span></div>
                  <div className="flex justify-between"><span>New Maturity:</span><span className="text-foreground">{fmtDate(loan.new_maturity_date)}</span></div>
                  <div className="flex justify-between"><span>Reason:</span><span className="text-foreground">{loan.reschedule_reason ?? "—"}</span></div>
                </>) : <div className="text-muted-foreground">No rescheduling recorded.</div>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Borrower */}
        <TabsContent value="borrower">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User className="h-4 w-4" />Borrower Information</CardTitle></CardHeader>
            <CardContent>
              {loan.borrower ? (
                <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    ["Legal Type", (loan.borrower as any).legal_type?.replace("_", " ")],
                    ["Company Name", (loan.borrower as any).company_name],
                    ["First Name", (loan.borrower as any).first_name],
                    ["Last Name", (loan.borrower as any).last_name],
                    ["TIN Number", (loan.borrower as any).tin_number],
                    ["Passport", (loan.borrower as any).passport_number],
                    ["Date of Birth", fmtDate((loan.borrower as any).date_of_birth)],
                    ["Gender", (loan.borrower as any).gender],
                    ["Phone", (loan.borrower as any).phone],
                    ["Email", (loan.borrower as any).email],
                    ["City", (loan.borrower as any).city],
                    ["District", (loan.borrower as any).district],
                    ["Legal Address", (loan.borrower as any).legal_address],
                    ["Employees", (loan.borrower as any).employee_count],
                    ["Est. Year", (loan.borrower as any).establishment_year],
                    ["Blacklisted", (loan.borrower as any).is_blacklisted ? "YES" : "No"],
                  ].map(([label, value]) => value ? (
                    <div key={label as string}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-medium text-foreground capitalize">{value as string}</p>
                    </div>
                  ) : null)}
                </div>
              ) : <p className="text-sm text-muted-foreground">No borrower data.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financials */}
        <TabsContent value="financials">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-sm">Borrower Financials</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  ["Annual Turnover", fmt(loan.annual_turnover, loan.currency)],
                  ["Net Income", fmt(loan.net_income, loan.currency)],
                  ["Total Exposure", fmt(loan.total_exposure, loan.currency)],
                  ["Risk Rating", loan.risk_rating],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b pb-2 last:border-0">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-medium">{v ?? "—"}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-sm">Collateral & Covenants</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Collateral Description</p>
                  <p className="mt-1">{loan.collateral_description ?? "—"}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground">Bank Covenants</p>
                  <p className="mt-1">{loan.covenants_bank ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">PRSF Covenants</p>
                  <p className="mt-1">{loan.covenants_prsf ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Claims */}
        <TabsContent value="claims">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">Claims History</CardTitle></CardHeader>
            <CardContent>
              {claims.length === 0 ? (
                <p className="text-sm text-muted-foreground">No claims filed for this loan.</p>
              ) : (
                <div className="space-y-3">
                  {claims.map(c => (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-semibold">{c.claim_number ?? c.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">Filed: {fmtDate(c.claim_date)} · Amount: {fmt(c.claim_amount)}</p>
                        {c.review_notes && <p className="text-xs text-muted-foreground mt-1">Notes: {c.review_notes}</p>}
                      </div>
                      <Badge className={`border text-xs ${STATUS_COLORS[c.status] ?? ""}`}>{c.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">Workflow Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative border-l border-border ml-3 space-y-6">
                {[
                  { label: "Step 1 — Loan Initiated",      date: loan.application_date,      done: true },
                  { label: "Step 2 — Bank Approved",        date: loan.bank_approval_date,     done: !!loan.bank_approval_date },
                  { label: "Step 3 — Received by PRSF",     date: loan.prsf_submission_date,   done: !!loan.prsf_submission_date },
                  { label: "Step 4 — PRSF Decision",        date: loan.prsf_approval_date,     done: !!loan.prsf_approval_date, extra: loan.status === "rejected" ? `Rejected: ${loan.rejection_reason ?? ""}` : loan.status !== "draft" ? "Approved" : "" },
                  { label: "Step 5 — Bank Notified",        date: loan.prsf_approval_date,     done: ["approved","rejected","guarantee_issued","disbursed","active","settled","rescheduled","claim_pending","claim_paid","closed","cancelled"].includes(loan.status) },
                  { label: "Step 6 — Guarantee Decision",   date: loan.guarantee_issued_date,  done: !!loan.guarantee_issued_date, extra: loan.status === "cancelled" ? `Cancelled: ${loan.cancellation_reason ?? ""}` : loan.guarantee_issued_date ? "Guarantee Issued" : "" },
                  { label: "Step 7C — Disbursement",        date: loan.disbursement_date,      done: !!loan.disbursement_date },
                  { label: "Step 7A — Loan Settled",        date: loan.settlement_date,        done: !!loan.settlement_date },
                  { label: "Step 7B — Rescheduled",         date: loan.reschedule_date,        done: !!loan.reschedule_date, extra: loan.reschedule_reason },
                  { label: "Step 7C — Claim Filed",         date: claims[0]?.claim_date,       done: !!claims[0] },
                  { label: "Step 8B — Claim Reviewed",      date: claims[0]?.review_date,      done: !!claims[0]?.review_date, extra: claims[0]?.review_notes },
                ].filter(e => e.done || e.date).map((e, i) => (
                  <li key={i} className="ml-6">
                    <span className={`absolute -left-1.5 flex h-3 w-3 items-center justify-center rounded-full border-2
                      ${e.done ? "border-primary bg-primary" : "border-border bg-background"}`} />
                    <p className={`text-sm font-medium ${e.done ? "text-foreground" : "text-muted-foreground"}`}>{e.label}</p>
                    {e.date && <p className="text-xs text-muted-foreground">{fmtDate(e.date)}</p>}
                    {e.extra && <p className="text-xs text-muted-foreground italic">{e.extra}</p>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Action Dialogs ── */}

      {/* Submit to PRSF */}
      <Dialog open={dialog === "submit"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 2 · Submit to PRSF</DialogTitle><DialogDescription>Confirm bank internal approval and submit this loan application to PRSF for processing.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Bank Approval Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Notes (optional)</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit to PRSF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Received */}
      <Dialog open={dialog === "mark_received"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 3 · Mark as Received by PRSF</DialogTitle><DialogDescription>Confirm PRSF has received this application and it is now under review.</DialogDescription></DialogHeader>
          <div><Label className="text-xs">Receipt Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleMarkReceived} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm Receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve — Step 4B */}
      <Dialog open={dialog === "approve"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Step 4B · Approve Application</DialogTitle><DialogDescription>PRSF credit decision: Approve. Bank will be notified (Step 5B) and guarantee will be issued (Step 6).</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">PRSF Approval Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Approved Amount ({loan.currency})</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Guarantee Coverage (%)</Label><Input type="number" min={1} max={100} value={coverage} onChange={e => setCoverage(e.target.value)} className="mt-1" /></div>
            <div className="rounded-lg bg-secondary/50 p-3 text-sm">
              Guaranteed Amount: <strong>{fmt((parseFloat(amount) || 0) * ((parseFloat(coverage) || 50) / 100), loan.currency)}</strong>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleApprove} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject — Step 4A */}
      <Dialog open={dialog === "reject"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 4A · Reject Application</DialogTitle><DialogDescription>PRSF credit decision: Reject. Bank will be notified (Step 5A). This is end of process.</DialogDescription></DialogHeader>
          <div><Label className="text-xs">Rejection Reason *</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Provide detailed reason..." className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={saving || !reason.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue Guarantee — Step 6B */}
      <Dialog open={dialog === "issue_guarantee"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 6 · Issue Letter of Guarantee</DialogTitle><DialogDescription>Issue the formal PRSF guarantee. A printable Letter of Guarantee will be available after this step.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Guarantee Issue Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleIssueGuarantee} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Issue Guarantee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel — Step 6A */}
      <Dialog open={dialog === "cancel"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 6A · Cancel Guarantee</DialogTitle><DialogDescription>Cancel the guarantee before disbursement. This is end of process.</DialogDescription></DialogHeader>
          <div><Label className="text-xs">Cancellation Reason *</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={saving || !reason.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cancel Guarantee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Disbursement — Step 7C */}
      <Dialog open={dialog === "disbursement"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 7C · Record Disbursement</DialogTitle><DialogDescription>Record the actual loan disbursement to the borrower.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Disbursement Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Disbursed Amount ({loan.currency})</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Maturity Date</Label><Input type="date" value={dateField2} onChange={e => setDateField2(e.target.value)} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleDisbursement} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record Disbursement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Settled — Step 7A */}
      <Dialog open={dialog === "settle"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 7A · Mark Loan as Settled</DialogTitle><DialogDescription>Borrower has repaid the loan in full. This is end of process.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Settlement Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Final Settlement Amount ({loan.currency})</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSettle} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mark Settled
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule — Step 7B */}
      <Dialog open={dialog === "reschedule"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 7B · Reschedule Loan</DialogTitle><DialogDescription>Extend the loan maturity. After rescheduling the loan can still be settled (Step 8A) or proceed to claim (Step 7C).</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Reschedule Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">New Maturity Date</Label><Input type="date" value={dateField2} onChange={e => setDateField2(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Reason for Rescheduling *</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleReschedule} disabled={saving || !reason.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Claim — Step 7C */}
      <Dialog open={dialog === "claim"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 7C · File Guarantee Claim</DialogTitle><DialogDescription>Borrower has defaulted. File a claim with PRSF for review under the guarantee (Step 8B).</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Claim Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Principal Claimed ({loan.currency})</Label><Input type="number" value={claimPrincipal} onChange={e => setClaimPrincipal(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Interest Claimed ({loan.currency})</Label><Input type="number" value={claimInterest} onChange={e => setClaimInterest(e.target.value)} className="mt-1" /></div>
            <div className="rounded-lg bg-secondary/50 p-3 text-sm">
              Total Claim: <strong>{fmt((parseFloat(claimPrincipal) || 0) + (parseFloat(claimInterest) || 0), loan.currency)}</strong>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleFileClaim} disabled={saving || !claimPrincipal}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}File Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Claim — Step 8B2 */}
      <Dialog open={dialog === "approve_claim"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 8B2 · Approve & Pay Claim</DialogTitle><DialogDescription>Approve the claim and record payment. Recoveries tracking begins (Step 9).</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Review Date</Label><Input type="date" value={dateField} onChange={e => setDateField(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Approved Amount ({loan.currency})</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1" /></div>
            <div><Label className="text-xs">Review Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleApproveClaim} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Approve & Pay Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Claim — Step 8B1 */}
      <Dialog open={dialog === "reject_claim"} onOpenChange={o => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Step 8B1 · Reject Claim</DialogTitle><DialogDescription>Reject the guarantee claim. This is end of process for this claim.</DialogDescription></DialogHeader>
          <div><Label className="text-xs">Rejection Reason *</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} className="mt-1" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRejectClaim} disabled={saving || !reason.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Reject Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
