"use client"

import { useState, useEffect, useCallback } from "react"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Plus, Search, Filter, MoreHorizontal, Eye, CheckCircle, XCircle,
  AlertTriangle, DollarSign, Clock, Loader2, RefreshCw, CheckCircle2, AlertCircle,
} from "lucide-react"
import type { Claim } from "@/lib/types/database"
import { one } from "@/lib/utils/supabase-relation"

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  paid: "bg-indigo-100 text-indigo-800",
  rejected: "bg-red-100 text-red-800",
}

export default function ClaimsPage() {
  const { t } = useI18n()
  const supabase = createClient()

  interface LoanOption {
    id: string
    loan_number: string | null
    approved_amount: number | null
    currency: string
    bank_id: string | null
    borrower: { name: string } | null
  }

  const [claims, setClaims] = useState<Claim[]>([])
  const [loans, setLoans] = useState<LoanOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Dialogs
  const [viewOpen, setViewOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null)
  const [saving, setSaving] = useState(false)

  // New claim form
  const [newLoanId, setNewLoanId] = useState("")
  const [newClaimDate, setNewClaimDate] = useState(new Date().toISOString().split("T")[0])
  const [newPrincipal, setNewPrincipal] = useState("")
  const [newInterest, setNewInterest] = useState("")
  const [newPenalties, setNewPenalties] = useState("0")

  // Review form
  const [reviewNotes, setReviewNotes] = useState("")
  const [reviewApprovedAmount, setReviewApprovedAmount] = useState("")
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve")
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentRef, setPaymentRef] = useState("")

  // Recovery form
  const [recoveryDate, setRecoveryDate] = useState(new Date().toISOString().split("T")[0])
  const [recoveryTotal, setRecoveryTotal] = useState("")
  const [recoveryPrsfShare, setRecoveryPrsfShare] = useState("")
  const [recoveryNotes, setRecoveryNotes] = useState("")

  const showMessage = (type: "success" | "error", msg: string) => {
    if (type === "success") { setSuccessMsg(msg); setErrorMsg(null) }
    else { setErrorMsg(msg); setSuccessMsg(null) }
    setTimeout(() => { setSuccessMsg(null); setErrorMsg(null) }, 5000)
  }

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from("claims")
      .select(`*, loan_application:loan_applications!loan_application_id(id,loan_number,currency,bank:banks(name_en),borrower:borrowers(name))`)
      .order("created_at", { ascending: false })

    if (statusFilter !== "all") query = query.eq("status", statusFilter)
    if (search) query = query.ilike("claim_number", `%${search}%`)

    const { data, error } = await query
    if (error) console.error('Error fetching claims:', error)
    if (data) setClaims(data as Claim[])
    setLoading(false)
  }, [statusFilter, search, supabase])

  useEffect(() => {
    supabase
      .from("loan_applications")
      .select("id,loan_number,approved_amount,currency,bank_id,borrower:borrowers(name)")
      .in("status", ["active", "defaulted", "claim_pending"])
      .order("loan_number")
      .then(({ data }) => {
        // PostgREST returns embedded relations as arrays; flatten to one record.
        if (data) setLoans(data.map((l) => ({ ...l, borrower: one(l.borrower) })))
      })
  }, [supabase])

  useEffect(() => { fetchClaims() }, [fetchClaims])

  const formatCurrency = (val: number | null | undefined, cur = "TJS") => {
    if (!val && val !== 0) return "—"
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 0 }).format(val)
  }

  const getBorrowerName = (claim: Claim) => {
    const b = (claim as any).loan_application?.borrower
    return b?.name || "—"
  }

  const totalPending = claims.filter((c) => c.status === "pending" || c.status === "under_review").length
  const totalClaimed = claims.reduce((s, c) => s + (c.claim_amount || 0), 0)
  const totalApproved = claims.filter((c) => c.approved_amount).reduce((s, c) => s + (c.approved_amount || 0), 0)

  const handleSubmitNewClaim = async () => {
    if (!newLoanId || !newClaimDate || !newPrincipal) {
      showMessage("error", "Please fill in all required fields"); return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const principal = parseFloat(newPrincipal) || 0
    const interest = parseFloat(newInterest) || 0
    const penalties = parseFloat(newPenalties) || 0
    const total = principal + interest + penalties

    const selectedLoanForClaim = loans.find((l) => l.id === newLoanId)
    // claims.bank_id is NOT NULL, so a missing bank must be reported clearly
    // instead of sending null and surfacing a raw constraint violation.
    const claimBankId = (selectedLoanForClaim as any)?.bank_id
    if (!claimBankId) {
      showMessage("error", "The selected loan has no partner bank assigned, so a claim cannot be filed.")
      setSaving(false); return
    }
    // claim_number is generated by the trg_set_claim_number BEFORE INSERT trigger.
    const { error } = await supabase.from("claims").insert({
      loan_application_id: newLoanId,
      loan_id: newLoanId,
      bank_id: claimBankId,
      claim_date: newClaimDate,
      claim_amount: total,
      principal_claimed: principal,
      interest_claimed: interest,
      penalties_claimed: penalties,
      status: "pending",
    })
    if (error) { showMessage("error", error.message); setSaving(false); return }

    // Update loan status to claim_pending
    await supabase.from("loan_applications").update({ status: "claim_pending" }).eq("id", newLoanId)
    await supabase.from("audit_trail").insert({ table_name: "claims", action: "INSERT", new_data: { loan_application_id: newLoanId, claim_amount: total }, changed_by: user?.id })

    showMessage("success", "Claim submitted successfully")
    setNewOpen(false)
    setNewLoanId(""); setNewClaimDate(new Date().toISOString().split("T")[0])
    setNewPrincipal(""); setNewInterest(""); setNewPenalties("0")
    fetchClaims()
    setSaving(false)
  }

  const handleReview = async () => {
    if (!selectedClaim) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    const updates: Record<string, unknown> = {
      status: reviewAction === "approve" ? (paymentDate ? "paid" : "approved") : "rejected",
      review_notes: reviewNotes,
      reviewed_by: user?.id,
      review_date: new Date().toISOString().split("T")[0],
    }
    if (reviewAction === "approve") {
      updates.approved_amount = parseFloat(reviewApprovedAmount) || selectedClaim.claim_amount
      if (paymentDate) {
        updates.payment_date = paymentDate
        updates.payment_reference = paymentRef
      }
    }

    const { error } = await supabase.from("claims").update(updates).eq("id", selectedClaim.id)
    if (error) { showMessage("error", error.message); setSaving(false); return }

    if (reviewAction === "approve") {
      const loanStatus = updates.status === "paid" ? "claim_paid" : "claim_pending"
      await supabase.from("loan_applications").update({ status: loanStatus }).eq("id", selectedClaim.loan_application_id)
    }
    await supabase.from("audit_trail").insert({ table_name: "claims", record_id: selectedClaim.id, action: "UPDATE", old_data: { status: selectedClaim.status }, new_data: updates, changed_by: user?.id })

    showMessage("success", `Claim ${reviewAction === "approve" ? "approved" : "rejected"} successfully`)
    setReviewOpen(false)
    fetchClaims()
    setSaving(false)
  }

  const handleRecovery = async () => {
    if (!selectedClaim || !recoveryTotal) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const total = parseFloat(recoveryTotal) || 0
    const prsfShare = parseFloat(recoveryPrsfShare) || total * (selectedClaim.approved_amount || 0) / (selectedClaim.claim_amount || 1)
    // recoveries.loan_id and recoveries.recovery_amount are both NOT NULL.
    // Sending only loan_application_id/total_recovered made every insert fail.
    const recoveryLoanId = (selectedClaim as any).loan_id || selectedClaim.loan_application_id
    if (!recoveryLoanId) {
      showMessage("error", "This claim has no linked loan, so a recovery cannot be recorded.")
      setSaving(false); return
    }
    const { error } = await supabase.from("recoveries").insert({
      claim_id: selectedClaim.id,
      loan_id: recoveryLoanId,
      loan_application_id: selectedClaim.loan_application_id,
      recovery_date: recoveryDate,
      recovery_amount: total,
      total_recovered: total,
      prsf_share: prsfShare,
      bank_share: total - prsfShare,
      notes: recoveryNotes,
      reported_by: user?.id,
      recorded_by: user?.id,
    })
    if (error) { showMessage("error", error.message); setSaving(false); return }
    showMessage("success", "Recovery recorded successfully")
    setRecoveryOpen(false)
    setSaving(false)
  }

  return (
    <div className="p-6 lg:p-8">
      {successMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{successMsg}</div>}
      {errorMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{errorMsg}</div>}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.claims.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage guarantee claim requests from partner banks</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="gap-2"><Plus className="h-4 w-4" />New Claim</Button>
      </div>

      {/* Summary */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-amber-500/10 p-3"><Clock className="h-5 w-5 text-amber-500" /></div>
            <div><p className="text-sm text-muted-foreground">Pending Review</p><p className="text-2xl font-bold">{totalPending}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-red-500/10 p-3"><AlertTriangle className="h-5 w-5 text-red-500" /></div>
            <div><p className="text-sm text-muted-foreground">Total Claimed</p><p className="text-2xl font-bold">{formatCurrency(totalClaimed)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-emerald-500/10 p-3"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
            <div><p className="text-sm text-muted-foreground">Total Approved</p><p className="text-2xl font-bold">{formatCurrency(totalApproved)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by claim number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
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
                  <TableHead className="font-semibold">Claim #</TableHead>
                  <TableHead className="font-semibold">Loan</TableHead>
                  <TableHead className="font-semibold">Borrower</TableHead>
                  <TableHead className="font-semibold">Bank</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="text-right font-semibold">Principal</TableHead>
                  <TableHead className="text-right font-semibold">Interest</TableHead>
                  <TableHead className="text-right font-semibold">Total</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></TableCell></TableRow>
                ) : claims.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground">No claims found</TableCell></TableRow>
                ) : (
                  claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium text-primary">{claim.claim_number}</TableCell>
                      <TableCell className="text-sm">{(claim as any).loan_application?.loan_number || "—"}</TableCell>
                      <TableCell className="text-sm">{getBorrowerName(claim)}</TableCell>
                      <TableCell className="text-sm">{(claim as any).loan_application?.bank?.name_en || "—"}</TableCell>
                      <TableCell className="text-sm">{new Date(claim.claim_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(claim.principal_claimed)}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(claim.interest_claimed)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(claim.claim_amount)}</TableCell>
                      <TableCell>
                        <Badge className={statusStyles[claim.status]} variant="secondary">
                          {claim.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedClaim(claim); setViewOpen(true) }}>
                              <Eye className="mr-2 h-4 w-4" />View Details
                            </DropdownMenuItem>
                            {(claim.status === "pending" || claim.status === "under_review") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => { setSelectedClaim(claim); setReviewApprovedAmount(String(claim.claim_amount)); setReviewAction("approve"); setReviewOpen(true) }}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" />Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setSelectedClaim(claim); setReviewAction("reject"); setReviewOpen(true) }}>
                                  <XCircle className="mr-2 h-4 w-4 text-destructive" />Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {claim.status === "paid" && (
                              <DropdownMenuItem onClick={() => { setSelectedClaim(claim); setRecoveryOpen(true) }}>
                                <DollarSign className="mr-2 h-4 w-4" />Record Recovery
                              </DropdownMenuItem>
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
            <DialogTitle>Submit New Claim</DialogTitle>
            <DialogDescription>Submit a guarantee claim for a defaulted or overdue loan</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Loan Application *</Label>
              <Select value={newLoanId} onValueChange={setNewLoanId}>
                <SelectTrigger><SelectValue placeholder="Select loan" /></SelectTrigger>
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
              <Label>Claim Date *</Label>
              <Input type="date" value={newClaimDate} onChange={(e) => setNewClaimDate(e.target.value)} />
            </div>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Principal Claimed *</Label>
                <Input type="number" value={newPrincipal} onChange={(e) => setNewPrincipal(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Interest Claimed</Label>
                <Input type="number" value={newInterest} onChange={(e) => setNewInterest(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Penalties</Label>
                <Input type="number" value={newPenalties} onChange={(e) => setNewPenalties(e.target.value)} placeholder="0" />
              </div>
            </div>
            {newPrincipal && (
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                Total claim: {formatCurrency((parseFloat(newPrincipal) || 0) + (parseFloat(newInterest) || 0) + (parseFloat(newPenalties) || 0))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitNewClaim} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Claim Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedClaim?.claim_number}</DialogTitle>
            <DialogDescription>Claim details</DialogDescription>
          </DialogHeader>
          {selectedClaim && (
            <div className="space-y-3 text-sm">
              {[
                ["Loan", (selectedClaim as any).loan_application?.loan_number],
                ["Borrower", getBorrowerName(selectedClaim)],
                ["Claim Date", new Date(selectedClaim.claim_date).toLocaleDateString()],
                ["Principal Claimed", formatCurrency(selectedClaim.principal_claimed)],
                ["Interest Claimed", formatCurrency(selectedClaim.interest_claimed)],
                ["Penalties", formatCurrency((selectedClaim as any).penalties_claimed)],
                ["Total Claim", formatCurrency(selectedClaim.claim_amount)],
                ["Status", selectedClaim.status.replace(/_/g, " ")],
                ["Approved Amount", formatCurrency(selectedClaim.approved_amount)],
                ["Payment Date", selectedClaim.payment_date ? new Date(selectedClaim.payment_date).toLocaleDateString() : "—"],
                ["Payment Ref.", selectedClaim.payment_reference || "—"],
                ["Review Notes", selectedClaim.review_notes || "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b pb-2 last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium capitalize">{value || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? "Approve Claim" : "Reject Claim"}</DialogTitle>
            <DialogDescription>{selectedClaim?.claim_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reviewAction === "approve" && (
              <>
                <div className="space-y-2">
                  <Label>Approved Amount *</Label>
                  <Input type="number" value={reviewApprovedAmount} onChange={(e) => setReviewApprovedAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Payment Date (leave blank to mark as Approved only)</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
                {paymentDate && (
                  <div className="space-y-2">
                    <Label>Payment Reference</Label>
                    <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Bank transfer reference" />
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label>Review Notes *</Label>
              <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Justification for this decision..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            {reviewAction === "approve" ? (
              <Button onClick={handleReview} disabled={saving || !reviewNotes} className="bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="mr-2 h-4 w-4" />Approve</>}
              </Button>
            ) : (
              <Button onClick={handleReview} disabled={saving || !reviewNotes} variant="destructive">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="mr-2 h-4 w-4" />Reject</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recovery Dialog */}
      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Recovery</DialogTitle>
            <DialogDescription>Post-claim repayment recovered from borrower</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recovery Date *</Label>
              <Input type="date" value={recoveryDate} onChange={(e) => setRecoveryDate(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Total Recovered *</Label>
                <Input type="number" value={recoveryTotal} onChange={(e) => setRecoveryTotal(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>PRSF Share</Label>
                <Input type="number" value={recoveryPrsfShare} onChange={(e) => setRecoveryPrsfShare(e.target.value)} placeholder="Auto-calculated" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={recoveryNotes} onChange={(e) => setRecoveryNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryOpen(false)}>Cancel</Button>
            <Button onClick={handleRecovery} disabled={saving || !recoveryTotal}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record Recovery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
