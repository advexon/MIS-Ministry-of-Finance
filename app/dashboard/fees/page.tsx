"use client"

import { useState, useEffect, useCallback } from "react"
import { useI18n } from "@/lib/i18n/context"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  DollarSign, Receipt, TrendingUp, Download, Plus, MoreHorizontal,
  CheckCircle, RefreshCw, Loader2, AlertCircle, CheckCircle2, Printer, Calculator,
} from "lucide-react"
import type { Fee } from "@/lib/types/database"
import { one } from "@/lib/utils/supabase-relation"
import { toCSV, downloadCSV } from "@/lib/utils/export"
import { useFieldRequirements } from "@/lib/hooks/use-field-requirements"
import { RequiredMark, missingFieldsMessage } from "@/components/forms/required-mark"

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  invoiced: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
}

export default function FeesPage() {
  const { t } = useI18n()
  const supabase = createClient()

  interface LoanOption {
    id: string
    loan_number: string | null
    approved_amount: number | null
    currency: string
    guarantee_coverage: number | null
    bank_id: string | null
    borrower: { name: string } | null
  }

  const [fees, setFees] = useState<Fee[]>([])
  const [loans, setLoans] = useState<LoanOption[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // New fee dialog
  const [newOpen, setNewOpen] = useState(false)
  const [newLoanId, setNewLoanId] = useState("")
  const [newFeeType, setNewFeeType] = useState<"upfront" | "quarterly">("upfront")
  const [newBaseAmount, setNewBaseAmount] = useState("")
  const [newFeeRate, setNewFeeRate] = useState("0.5")
  const [newPeriodStart, setNewPeriodStart] = useState("")
  const [newPeriodEnd, setNewPeriodEnd] = useState("")

  // Mark paid dialog
  const [payOpen, setPayOpen] = useState(false)
  const [selectedFee, setSelectedFee] = useState<Fee | null>(null)
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [paymentRef, setPaymentRef] = useState("")

  // Invoice dialog
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0])

  // Reconciliation state
  const [reconcileOpen, setReconcileOpen] = useState(false)

  const showMessage = (type: "success" | "error", msg: string) => {
    if (type === "success") { setSuccessMsg(msg); setErrorMsg(null) }
    else { setErrorMsg(msg); setSuccessMsg(null) }
    setTimeout(() => { setSuccessMsg(null); setErrorMsg(null) }, 5000)
  }

  const fetchFees = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("fees")
      .select(`*, loan_application:loan_applications!loan_application_id(id,loan_number,currency,bank_id,bank:banks(name_en),borrower:borrowers(name))`)
      .order("created_at", { ascending: false })
    if (!error && data) setFees(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchFees()
    supabase
      .from("loan_applications")
      .select("id,loan_number,approved_amount,currency,guarantee_coverage,bank_id,borrower:borrowers(name)")
      .in("status", ["approved", "disbursed", "active"])
      .order("loan_number")
      .then(({ data }) => {
        // PostgREST returns embedded relations as arrays; flatten to one record.
        if (data) setLoans(data.map((l) => ({ ...l, borrower: one(l.borrower) })))
      })
  }, [fetchFees, supabase])

  const formatCurrency = (val: number | null | undefined, cur = "TJS") => {
    if (!val && val !== 0) return "—"
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: 0 }).format(val)
  }

  const getBorrowerName = (fee: Fee) => {
    const b = (fee as any).loan_application?.borrower
    if (!b) return "—"
    return b.name || "—"
  }

  // Auto-fill base amount from loan when selected
  const selectedLoan = loans.find((l) => l.id === newLoanId)
  const calculatedFee = newBaseAmount && newFeeRate ? parseFloat(newBaseAmount) * parseFloat(newFeeRate) / 100 : 0

  const totalCollected = fees.filter((f) => f.status === "paid").reduce((s, f) => s + f.fee_amount, 0)
  const totalPending = fees.filter((f) => f.status !== "paid").reduce((s, f) => s + f.fee_amount, 0)
  const totalInvoiced = fees.filter((f) => f.status === "invoiced").reduce((s, f) => s + f.fee_amount, 0)

  const filteredFees = activeTab === "all" ? fees : fees.filter((f) => f.fee_type === activeTab)

  // Mirrors the visible table columns and honours the active fee-type tab.
  // Raw numerics are exported unformatted so the file stays spreadsheet-ready.
  const exportCSV = () => {
    if (!filteredFees.length) { showMessage("error", "There are no fee records to export"); return }
    const headers = ["Loan", "Borrower", "Bank", "Type", "Period Start", "Period End", "Base Amount", "Rate (%)", "Fee Amount", "Currency", "Invoice No.", "Invoice Date", "Due Date", "Status", "Payment Date"]
    const rows = filteredFees.map((fee) => {
      const la = (fee as any).loan_application
      return [
        la?.loan_number ?? "",
        getBorrowerName(fee),
        la?.bank?.name_en ?? "",
        fee.fee_type,
        fee.period_start ?? "",
        fee.period_end ?? "",
        fee.base_amount ?? "",
        fee.fee_rate != null ? (fee.fee_rate * 100).toFixed(2) : "",
        fee.fee_amount ?? "",
        la?.currency ?? "",
        fee.invoice_number ?? "",
        fee.invoice_date ?? "",
        fee.due_date ?? "",
        fee.status,
        fee.payment_date ?? "",
      ]
    })
    downloadCSV(toCSV(headers, rows), `fees-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const createReq = useFieldRequirements("fee_create")
  const invoiceReq = useFieldRequirements("fee_invoice")
  const paymentReq = useFieldRequirements("fee_payment")

  const handleCreateFee = async () => {
    const missing = createReq.missingFields({
      loan_id: newLoanId,
      fee_type: newFeeType,
      ...(newFeeType === "quarterly" ? { period_start: newPeriodStart, period_end: newPeriodEnd } : {}),
      base_amount: newBaseAmount,
      fee_rate: newFeeRate,
    })
    if (missing.length) { showMessage("error", missingFieldsMessage(missing)); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const base = parseFloat(newBaseAmount)
    const rate = parseFloat(newFeeRate) / 100
    const amount = base * rate

    const { error } = await supabase.from("fees").insert({
      loan_application_id: newLoanId,
      loan_id: newLoanId,
      bank_id: selectedLoan?.bank_id || null,
      fee_type: newFeeType,
      base_amount: base,
      fee_rate: rate,
      fee_amount: amount,
      amount: amount,
      due_date: new Date().toISOString().split("T")[0],
      period_start: newPeriodStart || null,
      period_end: newPeriodEnd || null,
      status: "pending",
    })
    if (error) { showMessage("error", error.message); setSaving(false); return }
    await supabase.from("audit_trail").insert({ table_name: "fees", action: "INSERT", new_data: { loan_application_id: newLoanId, fee_type: newFeeType, fee_amount: amount }, changed_by: user?.id })
    showMessage("success", "Fee created successfully")
    setNewOpen(false)
    setNewLoanId(""); setNewBaseAmount(""); setNewFeeRate("0.5")
    fetchFees()
    setSaving(false)
  }

  const handleGenerateInvoice = async () => {
    if (!selectedFee) return
    const missing = invoiceReq.missingFields({ invoice_date: invoiceDate })
    if (missing.length) { showMessage("error", missingFieldsMessage(missing)); return }
    setSaving(true)
    const { error } = await supabase.from("fees").update({ status: "invoiced", invoice_date: invoiceDate }).eq("id", selectedFee.id)
    if (error) { showMessage("error", error.message); setSaving(false); return }
    showMessage("success", "Invoice generated successfully")
    setInvoiceOpen(false)
    fetchFees()
    setSaving(false)
  }

  const handleMarkPaid = async () => {
    if (!selectedFee) return
    const missing = paymentReq.missingFields({ payment_date: paymentDate, payment_reference: paymentRef })
    if (missing.length) { showMessage("error", missingFieldsMessage(missing)); return }
    setSaving(true)
    const { error } = await supabase.from("fees").update({ status: "paid", payment_date: paymentDate, payment_reference: paymentRef || null }).eq("id", selectedFee.id)
    if (error) { showMessage("error", error.message); setSaving(false); return }
    showMessage("success", "Fee marked as paid")
    setPayOpen(false)
    fetchFees()
    setSaving(false)
  }

  const printInvoice = (fee: Fee) => {
    const borrower = (fee as any).loan_application?.borrower
    const borrowerName = borrower?.name || "—"
    const bank = (fee as any).loan_application?.bank?.name_en || "—"
    const today = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
    const invoiceNum = fee.invoice_number || `INV-PENDING-${fee.id.substring(0, 8)}`
    const html = `<!DOCTYPE html><html><head><title>Fee Invoice ${invoiceNum}</title>
<style>body{font-family:Arial,sans-serif;font-size:12pt;margin:40px;color:#222}.header{text-align:center;margin-bottom:30px}.table{width:100%;border-collapse:collapse;margin:20px 0}.table td,.table th{border:1px solid #ccc;padding:8px 12px}.table th{background:#f0f0f0;font-weight:bold}.total-row{font-weight:bold;background:#f8f8f8}</style>
</head><body>
<div class="header"><h1>CREDIT GUARANTEE FUND - GUARANTEE FEE INVOICE</h1><h2>Credit Guarantee Fund – Ministry of Finance</h2></div>
<p><strong>Invoice No.:</strong> ${invoiceNum}<br><strong>Date:</strong> ${today}<br><strong>Loan Ref.:</strong> ${(fee as any).loan_application?.loan_number || "—"}</p>
<p><strong>To:</strong> ${bank}<br>Re: ${borrowerName}</p>
<table class="table">
<tr><th>Description</th><th>Base Amount</th><th>Rate</th><th>Fee Amount</th></tr>
<tr><td>${fee.fee_type === "upfront" ? "Upfront Guarantee Fee" : `Quarterly Guarantee Commission${fee.period_start ? ` (${new Date(fee.period_start).toLocaleDateString()} – ${fee.period_end ? new Date(fee.period_end).toLocaleDateString() : ""})` : ""}`}</td><td>${formatCurrency(fee.base_amount)}</td><td>${(fee.fee_rate * 100).toFixed(2)}%</td><td>${formatCurrency(fee.fee_amount)}</td></tr>
<tr class="total-row"><td colspan="3" style="text-align:right">Total Due:</td><td>${formatCurrency(fee.fee_amount)}</td></tr>
</table>
<p>Please remit payment to the PRSF Trust Fund Account within 30 days of this invoice date.</p>
<p style="margin-top:40px;font-size:10pt;color:#666">Generated: ${today}</p>
</body></html>`
    const win = window.open("", "_blank")
    if (win) { win.document.write(html); win.document.close(); win.print() }
  }

  // Auto-calculate quarterly fees for all active loans
  const handleAutoCalculateQuarterly = async () => {
    setSaving(true)
    const { data: activeLoans } = await supabase.from("loan_applications")
      .select("id,approved_amount,guarantee_coverage,bank_id")
      .in("status", ["active", "disbursed"])

    if (!activeLoans) { setSaving(false); return }

    const now = new Date()
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0)

    const { data: { user } } = await supabase.auth.getUser()
    let created = 0

    for (const loan of activeLoans) {
      const baseAmount = (loan.approved_amount || 0) * (loan.guarantee_coverage || 50) / 100
      const feeRate = 0.005 // 0.5% quarterly
      const feeAmount = baseAmount * feeRate

      const { data: existing } = await supabase.from("fees").select("id").eq("loan_application_id", loan.id).eq("fee_type", "quarterly").gte("period_start", quarterStart.toISOString().split("T")[0]).maybeSingle()
      if (!existing) {
        await supabase.from("fees").insert({
          loan_application_id: loan.id,
          loan_id: loan.id,
          bank_id: loan.bank_id || null,
          fee_type: "quarterly",
          base_amount: baseAmount,
          fee_rate: feeRate,
          fee_amount: feeAmount,
          amount: feeAmount,
          due_date: quarterEnd.toISOString().split("T")[0],
          period_start: quarterStart.toISOString().split("T")[0],
          period_end: quarterEnd.toISOString().split("T")[0],
          status: "pending",
        })
        created++
      }
    }

    showMessage("success", `Generated ${created} quarterly fee records`)
    fetchFees()
    setSaving(false)
    setReconcileOpen(false)
  }

  return (
    <div className="p-6 lg:p-8">
      {successMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{successMsg}</div>}
      {errorMsg && <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{errorMsg}</div>}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t.fees.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track guarantee fees and commission payments</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setReconcileOpen(true)} className="gap-2"><Calculator className="h-4 w-4" />Auto-Calculate Quarterly</Button>
          <Button onClick={() => setNewOpen(true)} className="gap-2"><Plus className="h-4 w-4" />New Fee Record</Button>
          <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" />Export</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-emerald-500/10 p-3"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
            <div><p className="text-sm text-muted-foreground">Total Collected</p><p className="text-2xl font-bold">{formatCurrency(totalCollected)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-blue-500/10 p-3"><Receipt className="h-5 w-5 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Invoiced (awaiting)</p><p className="text-2xl font-bold">{formatCurrency(totalInvoiced)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-5">
            <div className="rounded-full bg-primary/10 p-3"><TrendingUp className="h-5 w-5 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Pending Collection</p><p className="text-2xl font-bold">{formatCurrency(totalPending)}</p></div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="all">All ({fees.length})</TabsTrigger>
            <TabsTrigger value="upfront">Upfront ({fees.filter((f) => f.fee_type === "upfront").length})</TabsTrigger>
            <TabsTrigger value="quarterly">Quarterly ({fees.filter((f) => f.fee_type === "quarterly").length})</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="icon" onClick={fetchFees}><RefreshCw className="h-4 w-4" /></Button>
        </div>

        {["all", "upfront", "quarterly"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Loan</TableHead>
                        <TableHead className="font-semibold">Borrower</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">Period</TableHead>
                        <TableHead className="text-right font-semibold">Base</TableHead>
                        <TableHead className="text-right font-semibold">Rate</TableHead>
                        <TableHead className="text-right font-semibold">Fee Amount</TableHead>
                        <TableHead className="font-semibold">Invoice</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="text-right font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={10} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></TableCell></TableRow>
                      ) : filteredFees.length === 0 ? (
                        <TableRow><TableCell colSpan={10} className="py-12 text-center text-muted-foreground">No fee records found</TableCell></TableRow>
                      ) : (
                        filteredFees.map((fee) => (
                          <TableRow key={fee.id}>
                            <TableCell className="font-medium text-primary text-sm">{(fee as any).loan_application?.loan_number || "—"}</TableCell>
                            <TableCell className="text-sm">{getBorrowerName(fee)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">{fee.fee_type === "upfront" ? "Upfront" : "Quarterly"}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {fee.period_start && fee.period_end
                                ? `${new Date(fee.period_start).toLocaleDateString()} – ${new Date(fee.period_end).toLocaleDateString()}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(fee.base_amount)}</TableCell>
                            <TableCell className="text-right text-sm">{(fee.fee_rate * 100).toFixed(2)}%</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(fee.fee_amount)}</TableCell>
                            <TableCell className="text-sm">{fee.invoice_date ? new Date(fee.invoice_date).toLocaleDateString() : "—"}</TableCell>
                            <TableCell>
                              <Badge className={statusStyles[fee.status]} variant="secondary">
                                {fee.status.charAt(0).toUpperCase() + fee.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {fee.status === "pending" && (
                                    <DropdownMenuItem onClick={() => { setSelectedFee(fee); setInvoiceDate(new Date().toISOString().split("T")[0]); setInvoiceOpen(true) }}>
                                      <Receipt className="mr-2 h-4 w-4" />Generate Invoice
                                    </DropdownMenuItem>
                                  )}
                                  {fee.invoice_number && (
                                    <DropdownMenuItem onClick={() => printInvoice(fee)}>
                                      <Printer className="mr-2 h-4 w-4" />Print Invoice
                                    </DropdownMenuItem>
                                  )}
                                  {fee.status !== "paid" && (
                                    <DropdownMenuItem onClick={() => { setSelectedFee(fee); setPayOpen(true) }}>
                                      <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" />Mark as Paid
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
          </TabsContent>
        ))}
      </Tabs>

      {/* New Fee Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Fee Record</DialogTitle>
            <DialogDescription>Manually create an upfront or quarterly fee record</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Loan Application<RequiredMark show={createReq.isRequired("loan_id")} /></Label>
              <Select value={newLoanId} onValueChange={(v) => { setNewLoanId(v); const l = loans.find((x) => x.id === v); if (l) setNewBaseAmount(String(((l.approved_amount || 0) * (l.guarantee_coverage || 50) / 100).toFixed(0))) }}>
                <SelectTrigger><SelectValue placeholder="Select loan" /></SelectTrigger>
                <SelectContent>
                  {loans.map((l) => {
                    const b = l.borrower
                const name = b?.name || "—"
                return <SelectItem key={l.id} value={l.id}>{l.loan_number || l.id.slice(0, 8)} – {name}</SelectItem>
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fee Type<RequiredMark show={createReq.isRequired("fee_type")} /></Label>
              <Select value={newFeeType} onValueChange={(v) => setNewFeeType(v as "upfront" | "quarterly")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upfront">Upfront Fee (one-time)</SelectItem>
                  <SelectItem value="quarterly">Quarterly Commission</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newFeeType === "quarterly" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Period Start<RequiredMark show={createReq.isRequired("period_start")} /></Label>
                  <Input type="date" value={newPeriodStart} onChange={(e) => setNewPeriodStart(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Period End<RequiredMark show={createReq.isRequired("period_end")} /></Label>
                  <Input type="date" value={newPeriodEnd} onChange={(e) => setNewPeriodEnd(e.target.value)} />
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Base Amount (Guarantee Amount)<RequiredMark show={createReq.isRequired("base_amount")} /></Label>
                <Input type="number" value={newBaseAmount} onChange={(e) => setNewBaseAmount(e.target.value)} placeholder="Auto-filled from loan" />
              </div>
              <div className="space-y-2">
                <Label>Fee Rate (%)<RequiredMark show={createReq.isRequired("fee_rate")} /></Label>
                <Input type="number" step="0.1" value={newFeeRate} onChange={(e) => setNewFeeRate(e.target.value)} />
              </div>
            </div>
            {calculatedFee > 0 && (
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                Calculated fee: {formatCurrency(calculatedFee)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateFee} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Fee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>Issue a fee invoice for {selectedFee ? formatCurrency(selectedFee.fee_amount) : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Invoice Date<RequiredMark show={invoiceReq.isRequired("invoice_date")} /></Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerateInvoice} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Receipt className="mr-2 h-4 w-4" />Generate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Paid</DialogTitle>
            <DialogDescription>Confirm payment for {selectedFee ? formatCurrency(selectedFee.fee_amount) : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Payment Date<RequiredMark show={paymentReq.isRequired("payment_date")} /></Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment Reference<RequiredMark show={paymentReq.isRequired("payment_reference")} /></Label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Bank transfer / receipt number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkPaid} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="mr-2 h-4 w-4" />Confirm Payment</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Calculate Dialog */}
      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto-Calculate Quarterly Fees</DialogTitle>
            <DialogDescription>Automatically generate quarterly fee records for all active loans based on the current quarter</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
            <p className="font-medium">This will:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Find all active / disbursed loans</li>
              <li>Calculate 0.5% quarterly fee on guarantee amount</li>
              <li>Create fee records for the current quarter only</li>
              <li>Skip loans that already have a Q fee for this period</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileOpen(false)}>Cancel</Button>
            <Button onClick={handleAutoCalculateQuarterly} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Calculator className="mr-2 h-4 w-4" />Run Auto-Calculate</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
