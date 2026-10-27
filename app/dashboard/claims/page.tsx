"use client"

import { useUiTranslation } from '@/lib/i18n/ui-text'

import { useState } from "react"
import { usePageQuery } from "@/lib/hooks/use-page-query"
import Link from "next/link"
import { usePermissions } from "@/lib/contexts/permission-context"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Plus, Search, Filter, MoreHorizontal, Eye,
  AlertTriangle, DollarSign, Clock, Loader2, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react"
import type { Claim } from "@/lib/types/database"
import { one } from "@/lib/utils/supabase-relation"
import { useFieldRequirements } from "@/lib/hooks/use-field-requirements"
import { RequiredMark, missingFieldsMessage } from "@/components/forms/required-mark"
import { getDatabaseErrorMessage } from "@/lib/utils/db-error"
import { ClaimPaymentForm } from '@/components/admin/claim-payment-form'
import { RecoveryForm } from '@/components/admin/recovery-form'
import { useAuthorityReason } from '@/components/admin/authority-reason-provider'

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  paid: "bg-indigo-100 text-indigo-800",
  rejected: "bg-red-100 text-red-800",
}

export default function ClaimsPage() {
  const uiText = useUiTranslation()

  const { t } = useI18n()
  const { role } = usePermissions()
  const requestAuthorityReason = useAuthorityReason()
  const fundStaff = !!role && !["bank_admin", "bank_officer"].includes(role.code)
  const supabase = createClient()

  interface LoanOption {
    id: string
    loan_number: string | null
    approved_amount: number | null
    currency: string
    bank_id: string | null
    borrower: { name: string } | null
  }

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Dialogs
  const [viewOpen, setViewOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null)
  const [saving, setSaving] = useState(false)

  // New claim form
  const [newLoanId, setNewLoanId] = useState("")
  const [newClaimDate, setNewClaimDate] = useState(new Date().toISOString().split("T")[0])
  const [newPrincipal, setNewPrincipal] = useState("")
  const [newInterest, setNewInterest] = useState("")
  const [newPenalties, setNewPenalties] = useState("0")

  const showMessage = (type: "success" | "error", msg: string) => {
    if (type === "success") { setSuccessMsg(msg); setErrorMsg(null) }
    else { setErrorMsg(msg); setSuccessMsg(null) }
    setTimeout(() => { setSuccessMsg(null); setErrorMsg(null) }, 5000)
  }

  const { data: claims = [], isLoading, isValidating, mutate } = usePageQuery<Claim[]>(["claims", statusFilter, search], async () => {
    let query = supabase
      .from("claims")
      .select(`*, loan_application:loan_applications!loan_application_id(id,loan_number,currency,bank:banks(name_en),borrower:borrowers(name))`)
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") query = query.eq("status", statusFilter)
    if (search) query = query.ilike("claim_number", `%${search}%`)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Claim[]
  })
  const loading = isLoading || isValidating
  const fetchClaims = () => mutate()

  const { data: loans = [] } = usePageQuery<LoanOption[]>(["claim-loan-options"], async () => {
    const { data, error } = await supabase
      .from("loan_applications")
      .select("id,loan_number,approved_amount,currency,bank_id,borrower:borrowers(name)")
      .in("status", ["active", "defaulted", "claim_pending"])
      .order("loan_number")
    if (error) throw error
    // PostgREST returns embedded relations as arrays; flatten to one record.
    return (data ?? []).map((loan) => ({ ...loan, borrower: one(loan.borrower) }))
  })

  const formatCurrency = (val: number | null | undefined, cur = "TJS") => {
    if (!val && val !== 0) return "—"
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 0 }).format(val)
  }

  const getBorrowerName = (claim: Claim) => {
    const b = claim.loan_application?.borrower
    return b?.name || "—"
  }

  const totalPending = claims.filter((c) => c.status === "pending" || c.status === "under_review").length
  const totalClaimed = claims.reduce((s, c) => s + (c.claim_amount || 0), 0)
  const totalApproved = claims.filter((c) => c.approved_amount).reduce((s, c) => s + (c.approved_amount || 0), 0)

  const createReq = useFieldRequirements("claim_create")

  const newClaimValues = {
    loan_id: newLoanId,
    claim_date: newClaimDate,
    principal_claimed: newPrincipal,
    interest_claimed: newInterest,
    penalties_claimed: newPenalties,
  }

  const handleSubmitNewClaim = async () => {
    const missing = createReq.missingFields(newClaimValues)
    if (missing.length) {
      showMessage("error", missingFieldsMessage(missing)); return
    }
    const principal = Number(newPrincipal)
    const interest = Number(newInterest)
    const penalties = Number(newPenalties)
    const total = principal + interest + penalties
    if (![principal, interest, penalties, total].every(Number.isFinite)
        || Math.min(principal, interest, penalties) < 0 || total <= 0) {
      showMessage("error", "Enter nonnegative claim amounts with a positive total."); return
    }
    const claimBankId = loans.find((loan) => loan.id === newLoanId)?.bank_id
    if (!claimBankId) {
      showMessage("error", "The selected loan has no partner bank assigned, so a claim cannot be filed."); return
    }

    setSaving(true)
    try {
      const authorityReason = await requestAuthorityReason()
      // The database commits the claim, loan status, history and audit together.
      const { data, error } = await supabase.from("claims").insert({
        loan_application_id: newLoanId,
        loan_id: newLoanId,
        bank_id: claimBankId,
        claim_date: newClaimDate,
        claim_amount: total,
        principal_claimed: principal,
        interest_claimed: interest,
        penalties_claimed: penalties,
        status: "pending",
        ...(authorityReason ? { reason: authorityReason } : {}),
      }).select("id").single()
      if (error) throw error
      if (!data?.id) throw new Error("The claim submission could not be confirmed.")

      setNewOpen(false)
      setNewLoanId(""); setNewClaimDate(new Date().toISOString().split("T")[0])
      setNewPrincipal(""); setNewInterest(""); setNewPenalties("0")
      showMessage("success", "Claim submitted successfully")
      try {
        await fetchClaims()
      } catch {
        showMessage("error", "Claim submitted, but the list could not refresh. Refresh the page; do not resubmit.")
      }
    } catch (error) {
      showMessage("error", getDatabaseErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {successMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{successMsg}</div>}
      {errorMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{errorMsg}</div>}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{uiText(t.claims.title)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("Manage guarantee claims. Approval requires a unanimous signed claims committee protocol; payment is a separate controlled process.")}</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2"><Plus className="h-4 w-4" />{uiText("New Claim")}</Button>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-amber-500/10 p-3"><Clock className="h-5 w-5 text-amber-500" /></div>
            <div><p className="text-sm text-muted-foreground">{uiText("Pending Review")}</p><p className="text-2xl font-bold">{totalPending}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-red-500/10 p-3"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">{uiText("Total Claimed")}</p><p className="text-2xl font-bold">{formatCurrency(totalClaimed)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-emerald-500/10 p-3"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
            <div><p className="text-sm text-muted-foreground">{uiText("Total Approved")}</p><p className="text-2xl font-bold">{formatCurrency(totalApproved)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={uiText("Search by claim number...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={uiText("Status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{uiText("All Statuses")}</SelectItem>
                <SelectItem value="pending">{uiText("Pending")}</SelectItem>
                <SelectItem value="under_review">{uiText("Under Review")}</SelectItem>
                <SelectItem value="approved">{uiText("Approved")}</SelectItem>
                <SelectItem value="paid">{uiText("Paid")}</SelectItem>
                <SelectItem value="rejected">{uiText("Rejected")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchClaims}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Claims Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">{uiText("Claim #")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Loan")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Borrower")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Bank")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Date")}</TableHead>
                  <TableHead className="text-right font-semibold">{uiText("Principal")}</TableHead>
                  <TableHead className="text-right font-semibold">{uiText("Interest")}</TableHead>
                  <TableHead className="text-right font-semibold">{uiText("Total")}</TableHead>
                  <TableHead className="font-semibold">{uiText("Status")}</TableHead>
                  <TableHead className="text-right font-semibold">{uiText("Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></TableCell></TableRow>
                ) : claims.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground">{uiText("No claims found")}</TableCell></TableRow>
                ) : (
                  claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium text-primary">{claim.claim_number}</TableCell>
                      <TableCell className="text-sm">{claim.loan_application?.loan_number || "—"}</TableCell>
                      <TableCell className="text-sm">{getBorrowerName(claim)}</TableCell>
                      <TableCell className="text-sm">{claim.loan_application?.bank?.name_en || "—"}</TableCell>
                      <TableCell className="text-sm">{new Date(claim.claim_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(claim.principal_claimed)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(claim.interest_claimed)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(claim.claim_amount)}</TableCell>
                      <TableCell>
                        <Badge className={statusStyles[claim.status]} variant="secondary">
                          {uiText(claim.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedClaim(claim); setViewOpen(true) }}>
                              <Eye className="mr-2 h-4 w-4" />{uiText("View Details")}</DropdownMenuItem>
                            {fundStaff && ["pending", "submitted", "under_review", "rejected"].includes(claim.status) && (
                              <DropdownMenuItem asChild><Link href="/dashboard/committee#claims-committee">{uiText("Review in claims committee")}</Link></DropdownMenuItem>
                            )}
                            {claim.status === 'approved' && ['super_admin', 'accountant', 'deputy_director', 'fkg_management'].includes(role?.code ?? '') && <DropdownMenuItem onSelect={() => { setSelectedClaim(claim); setPaymentOpen(true) }}>{uiText("Authorize / record payment")}</DropdownMenuItem>}
                        {claim.status === 'paid' && ['super_admin', 'prsf_admin', 'accountant'].includes(role?.code ?? '') && (
                              <DropdownMenuItem onClick={() => { setSelectedClaim(claim); setRecoveryOpen(true) }}>
                                <DollarSign className="mr-2 h-4 w-4" />{uiText("Record Recovery")}</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* New Claim Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{uiText("Submit New Claim")}</DialogTitle>
            <DialogDescription>{uiText("Submit a guarantee claim for a defaulted or overdue loan")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{uiText("Loan Application")}<RequiredMark show={createReq.isRequired("loan_id")} /></Label>
              <Select value={newLoanId} onValueChange={setNewLoanId}>
                <SelectTrigger><SelectValue placeholder={uiText("Select loan")} /></SelectTrigger>
                <SelectContent>
                  {loans.map((l) => {
                    const borrower = l.borrower
            const name = borrower?.name || "—"
            return <SelectItem key={l.id} value={l.id}>{l.loan_number || l.id.slice(0, 8)} – {name}</SelectItem>
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{uiText("Claim Date")}<RequiredMark show={createReq.isRequired("claim_date")} /></Label>
              <Input type="date" value={newClaimDate} onChange={(e) => setNewClaimDate(e.target.value)} />
            </div>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{uiText("Principal Claimed")}<RequiredMark show={createReq.isRequired("principal_claimed")} /></Label>
                <Input type="number" value={newPrincipal} onChange={(e) => setNewPrincipal(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{uiText("Interest Claimed")}<RequiredMark show={createReq.isRequired("interest_claimed")} /></Label>
                <Input type="number" value={newInterest} onChange={(e) => setNewInterest(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>{uiText("Penalties")}<RequiredMark show={createReq.isRequired("penalties_claimed")} /></Label>
                <Input type="number" value={newPenalties} onChange={(e) => setNewPenalties(e.target.value)} placeholder="0" />
              </div>
            </div>
            {newPrincipal && (
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">{uiText("Total claim: ")}{formatCurrency((parseFloat(newPrincipal) || 0) + (parseFloat(newInterest) || 0) + (parseFloat(newPenalties) || 0))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>{uiText("Cancel")}</Button>
            <Button onClick={handleSubmitNewClaim} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : uiText("Submit Claim")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Claim Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedClaim?.claim_number}</DialogTitle>
            <DialogDescription>{uiText("Claim details")}</DialogDescription>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-3 text-sm">
              {[
                ["Loan", selectedClaim.loan_application?.loan_number],
                ["Borrower", getBorrowerName(selectedClaim)],
                ["Claim Date", new Date(selectedClaim.claim_date).toLocaleDateString()],
                ["Principal Claimed", formatCurrency(selectedClaim.principal_claimed)],
                ["Interest Claimed", formatCurrency(selectedClaim.interest_claimed)],
                ["Penalties", formatCurrency(selectedClaim.penalties_claimed)],
                ["Total Claim", formatCurrency(selectedClaim.claim_amount)],
                ["Status", selectedClaim.status.replace(/_/g, " ")],
                ["Approved Amount", formatCurrency(selectedClaim.approved_amount)],
                ["Payment Date", selectedClaim.payment_date ? new Date(selectedClaim.payment_date).toLocaleDateString() : "—"],
                ["Payment Ref.", selectedClaim.payment_reference || "—"],
                ["Review Notes", selectedClaim.review_notes || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                  <span className="text-muted-foreground">{uiText(label)}</span>
                  <span className="font-medium capitalize">{value || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{uiText("Authorize claim payment ·")} {selectedClaim?.claim_number}</DialogTitle><DialogDescription>{uiText("Payment, policy snapshot, claim totals and audit record commit atomically. Evidence and financial limits are enforced by the database.")}</DialogDescription></DialogHeader>{selectedClaim && <ClaimPaymentForm key={selectedClaim.id} claim={selectedClaim} onRecorded={async () => { setPaymentOpen(false); showMessage('success', 'Payment recorded with an immutable policy snapshot and audit receipt.'); try { await fetchClaims() } catch { showMessage('error', 'Payment recorded, but the list could not refresh. Refresh the page; do not submit another payment.') } }} />}</DialogContent></Dialog>

      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{uiText("Record recovery ·")} {selectedClaim?.claim_number}</DialogTitle><DialogDescription>{uiText("Database-calculated allocation with an immutable policy and evidence snapshot.")}</DialogDescription></DialogHeader>
          {selectedClaim && <RecoveryForm key={selectedClaim.id} claim={selectedClaim} onRecorded={async (receipt) => {
            setRecoveryOpen(false)
            showMessage('success', `Recovery recorded · Fund ${receipt.prsf_share} ${receipt.currency}, bank ${receipt.bank_share} ${receipt.currency}, costs ${receipt.documented_costs} ${receipt.currency} · policy ${receipt.policy_revision}.`)
            try { await fetchClaims() } catch { showMessage('error', 'Recovery recorded, but the list could not refresh. Refresh the page; do not submit another recovery.') }
          }} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
