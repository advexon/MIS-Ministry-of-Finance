'use client'

import { useRef, useState } from 'react'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { buildGuaranteeReportRows } from '@/lib/utils/guarantee-report-input'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Save, Send, Plus, Trash2, Upload, Download } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/context'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useFieldRequirements } from '@/lib/hooks/use-field-requirements'
import { RequiredMark, missingFieldsMessage } from '@/components/forms/required-mark'

interface Bank { id: string; name_en: string }

interface LoanRow {
  _key: string
  loan_request_number: string
  customer_name: string
  customer_code: string
  tin_number: string
  sector: string
  currency: string
  approved_amount: string
  disbursed_amount: string
  outstanding_principal: string
  interest_rate: string
  loan_term_months: string
  disbursement_date: string
  maturity_date: string
  guarantee_coverage: string
  guarantee_amount: string
  loan_status: string
  days_overdue: string
}

interface PaymentRow {
  _key: string
  loan_number: string
  installment_number: string
  payment_date: string
  principal_amount: string
  interest_amount: string
  total_amount: string
  remaining_balance: string
}

const emptyLoan = (): LoanRow => ({
  _key: crypto.randomUUID(),
  loan_request_number: '',
  customer_name: '',
  customer_code: '',
  tin_number: '',
  sector: '',
  currency: 'TJS',
  approved_amount: '',
  disbursed_amount: '',
  outstanding_principal: '',
  interest_rate: '',
  loan_term_months: '',
  disbursement_date: '',
  maturity_date: '',
  guarantee_coverage: '50',
  guarantee_amount: '',
  loan_status: 'active',
  days_overdue: '0',
})

const emptyPayment = (): PaymentRow => ({
  _key: crypto.randomUUID(),
  loan_number: '',
  installment_number: '',
  payment_date: '',
  principal_amount: '',
  interest_amount: '',
  total_amount: '',
  remaining_balance: '',
})

export default function NewGuaranteeReportPage() {
  const router = useRouter()
  const { t } = useI18n()
  const supabase = createClient()
  const { toast } = useToast()

  const [bankId, setBankId] = useState('')
  const [reportMonth, setReportMonth] = useState('')
  const [reportType, setReportType] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const reportId = useRef<string | null>(null)
  const saveInFlight = useRef(false)
  const [loans, setLoans] = useState<LoanRow[]>([emptyLoan()])
  const [payments, setPayments] = useState<PaymentRow[]>([emptyPayment()])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const { data: banks = [] } = usePageQuery<Bank[]>(['report-bank-options'], async () => {
    const { data, error } = await supabase.from('banks').select('id, name_en').order('name_en')
    if (error) throw error
    return data ?? []
  })

  const setLoanField = (key: string, field: keyof LoanRow, value: string) => {
    setLoans(prev => prev.map(l => {
      if (l._key !== key) return l
      const updated = { ...l, [field]: value }
      if (field === 'outstanding_principal' || field === 'guarantee_coverage') {
        const principal = parseFloat(field === 'outstanding_principal' ? value : l.outstanding_principal) || 0
        const coverage = parseFloat(field === 'guarantee_coverage' ? value : l.guarantee_coverage) || 0
        updated.guarantee_amount = ((principal * coverage) / 100).toFixed(2)
      }
      return updated
    }))
  }

  const setPaymentField = (key: string, field: keyof PaymentRow, value: string) => {
    setPayments(prev => prev.map(p => {
      if (p._key !== key) return p
      const updated = { ...p, [field]: value }
      if (field === 'principal_amount' || field === 'interest_amount') {
        const principal = parseFloat(field === 'principal_amount' ? value : p.principal_amount) || 0
        const interest = parseFloat(field === 'interest_amount' ? value : p.interest_amount) || 0
        updated.total_amount = (principal + interest).toFixed(2)
      }
      return updated
    }))
  }

  const reportReq = useFieldRequirements('guarantee_report')

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const loansData = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 })
      if (loansData.length > 1) {
        setLoans(loansData.slice(1).map(row => ({
          ...emptyLoan(),
          _key: crypto.randomUUID(),
          loan_request_number: String(row[0] ?? ''),
          customer_name: String(row[1] ?? ''),
          customer_code: String(row[2] ?? ''),
          tin_number: String(row[3] ?? ''),
          sector: String(row[4] ?? ''),
          currency: String(row[5] ?? 'TJS'),
          approved_amount: String(row[6] ?? ''),
          disbursed_amount: String(row[7] ?? ''),
          outstanding_principal: String(row[8] ?? ''),
          interest_rate: String(row[9] ?? ''),
          loan_term_months: String(row[10] ?? ''),
          disbursement_date: String(row[11] ?? ''),
          maturity_date: String(row[12] ?? ''),
          guarantee_coverage: String(row[13] ?? '50'),
          guarantee_amount: String(row[14] ?? ''),
          loan_status: String(row[15] ?? 'active'),
          days_overdue: String(row[16] ?? '0'),
        })))
      }
      if (wb.SheetNames.length > 1) {
        const paymentsData = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[1]], { header: 1 })
        if (paymentsData.length > 1) {
          setPayments(paymentsData.slice(1).map(row => ({
            ...emptyPayment(),
            _key: crypto.randomUUID(),
            loan_number: String(row[0] ?? ''),
            installment_number: String(row[1] ?? ''),
            payment_date: String(row[2] ?? ''),
            principal_amount: String(row[3] ?? ''),
            interest_amount: String(row[4] ?? ''),
            total_amount: String(row[5] ?? ''),
            remaining_balance: String(row[6] ?? ''),
          })))
        }
      }
      toast({ title: 'Import successful' })
    } catch {
      toast({ title: 'Import failed', variant: 'destructive' })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[
      'Loan Number', 'Customer Name', 'Customer Code', 'TIN', 'Sector', 'Currency',
      'Approved Amount', 'Disbursed Amount', 'Outstanding Principal', 'Interest Rate (%)',
      'Term (months)', 'Disbursement Date', 'Maturity Date', 'Guarantee Coverage (%)',
      'Guarantee Amount', 'Loan Status', 'Days Overdue',
    ]]), 'Loans')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[
      'Loan Number', 'Installment No.', 'Payment Date', 'Principal', 'Interest', 'Total', 'Remaining Balance',
    ]]), 'Payments')
    XLSX.writeFile(wb, `guarantee-report-template.xlsx`)
    toast({ title: 'Template downloaded' })
  }

  const handleSave = async (submitNow = false) => {
    const missing = reportReq.missingFields({ bank_id: bankId, report_month: reportMonth, report_type: reportType })
    if (missing.length) {
      toast({ title: 'Missing fields', description: missingFieldsMessage(missing), variant: 'destructive' })
      return
    }
    if (saveInFlight.current) return
    saveInFlight.current = true
    setSaving(true)
    try {
      if (!bankId || !/^\d{4}-\d{2}$/.test(reportMonth)) throw new Error('A bank and valid report month are required')
      const rows = buildGuaranteeReportRows(loans, payments)
      reportId.current ??= crypto.randomUUID()
      const { data, error } = await supabase.rpc('cgf_create_guarantee_report', {
        p_id: reportId.current,
        p_bank: bankId,
        p_month: `${reportMonth}-01`,
        p_type: reportType,
        p_loans: rows.loans,
        p_payments: rows.payments,
        p_submit: submitNow,
      })
      if (error || data !== reportId.current) throw new Error('Report save was not confirmed')
      toast({ title: submitNow ? 'Report submitted' : 'Draft saved' })
      router.push(`/dashboard/guarantee-reports/${data}`)
    } catch {
      toast({ title: 'Save failed', description: 'No save was confirmed. Check the report list before retrying if the connection was interrupted.', variant: 'destructive' })
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  const totalOutstanding = loans.reduce((s, l) => s + (parseFloat(l.outstanding_principal) || 0), 0)
  const totalGuarantee = loans.reduce((s, l) => s + (parseFloat(l.guarantee_amount) || 0), 0)
  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TJS', minimumFractionDigits: 0 }).format(v)

  return (
    <div className="p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" asChild>
          <Link href="/dashboard/guarantee-reports"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t.guaranteeReports.newReport}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Fill in the report details and loan data</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={downloadTemplate}>
            <Download className="h-3.5 w-3.5" />
            Template
          </Button>
          <input id="xl-upload" type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => document.getElementById('xl-upload')?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Importing...' : 'Import Excel'}
          </Button>
          <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            Save Draft
          </Button>
          <Button size="sm" className="gap-2" onClick={() => handleSave(true)} disabled={saving}>
            <Send className="h-3.5 w-3.5" />
            {t.guaranteeReports.submitReport}
          </Button>
        </div>
      </div>

      {/* Report Meta */}
      <Card className="mb-6 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">Report Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">{t.guaranteeReports.bank}<RequiredMark show={reportReq.isRequired('bank_id')} /></Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select bank..." /></SelectTrigger>
                <SelectContent>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">{t.guaranteeReports.reportMonth}<RequiredMark show={reportReq.isRequired('report_month')} /></Label>
              <Input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium">{t.guaranteeReports.reportType}<RequiredMark show={reportReq.isRequired('report_type')} /></Label>
              <Select value={reportType} onValueChange={v => setReportType(v as typeof reportType)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t.guaranteeReports.monthly}</SelectItem>
                  <SelectItem value="quarterly">{t.guaranteeReports.quarterly}</SelectItem>
                  <SelectItem value="annual">{t.guaranteeReports.annual}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Tabs */}
      <Tabs defaultValue="loans">
        <TabsList className="mb-4 h-9">
          <TabsTrigger value="loans" className="text-xs">
            {t.guaranteeReports.loansList}
            <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{loans.length}</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="text-xs">
            {t.guaranteeReports.paymentSchedule}
            <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{payments.length}</span>
          </TabsTrigger>
        </TabsList>

        {/* Loans */}
        <TabsContent value="loans">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {['Loan #', 'Customer', 'TIN', 'Sector', 'CCY', 'Approved', 'Outstanding', 'Rate %', 'Disbursed', 'Maturity', 'Coverage %', 'Guarantee Amt', 'Status', ''].map(h => (
                        <TableHead key={h} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map(loan => (
                      <TableRow key={loan._key} className="hover:bg-secondary/30">
                        <TableCell className="p-1"><Input value={loan.loan_request_number} onChange={e => setLoanField(loan._key, 'loan_request_number', e.target.value)} className="h-7 w-28 text-xs" placeholder="LA-2026-001" /></TableCell>
                        <TableCell className="p-1"><Input value={loan.customer_name} onChange={e => setLoanField(loan._key, 'customer_name', e.target.value)} className="h-7 w-32 text-xs" placeholder="Full name" /></TableCell>
                        <TableCell className="p-1"><Input value={loan.tin_number} onChange={e => setLoanField(loan._key, 'tin_number', e.target.value)} className="h-7 w-24 text-xs" placeholder="TIN" /></TableCell>
                        <TableCell className="p-1"><Input value={loan.sector} onChange={e => setLoanField(loan._key, 'sector', e.target.value)} className="h-7 w-24 text-xs" placeholder="Agriculture" /></TableCell>
                        <TableCell className="p-1">
                          <Select value={loan.currency} onValueChange={v => setLoanField(loan._key, 'currency', v)}>
                            <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TJS">TJS</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1"><Input type="number" value={loan.approved_amount} onChange={e => setLoanField(loan._key, 'approved_amount', e.target.value)} className="h-7 w-24 text-xs" placeholder="0" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={loan.outstanding_principal} onChange={e => setLoanField(loan._key, 'outstanding_principal', e.target.value)} className="h-7 w-24 text-xs" placeholder="0" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={loan.interest_rate} onChange={e => setLoanField(loan._key, 'interest_rate', e.target.value)} className="h-7 w-16 text-xs" placeholder="18" /></TableCell>
                        <TableCell className="p-1"><Input type="date" value={loan.disbursement_date} onChange={e => setLoanField(loan._key, 'disbursement_date', e.target.value)} className="h-7 w-32 text-xs" /></TableCell>
                        <TableCell className="p-1"><Input type="date" value={loan.maturity_date} onChange={e => setLoanField(loan._key, 'maturity_date', e.target.value)} className="h-7 w-32 text-xs" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={loan.guarantee_coverage} onChange={e => setLoanField(loan._key, 'guarantee_coverage', e.target.value)} className="h-7 w-16 text-xs" placeholder="50" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={loan.guarantee_amount} readOnly tabIndex={-1} className="h-7 w-24 bg-secondary/50 text-xs" /></TableCell>
                        <TableCell className="p-1">
                          <Select value={loan.loan_status} onValueChange={v => setLoanField(loan._key, 'loan_status', v)}>
                            <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="overdue">Overdue</SelectItem>
                              <SelectItem value="closed">Closed</SelectItem>
                              <SelectItem value="written_off">Written Off</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setLoans(p => p.filter(l => l._key !== loan._key))} disabled={loans.length === 1}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t px-4 py-3">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent text-xs" onClick={() => setLoans(p => [...p, emptyLoan()])}>
                  <Plus className="h-3.5 w-3.5" />{t.guaranteeReports.addLoan}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments */}
        <TabsContent value="payments">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {['Loan #', 'Installment', 'Payment Date', 'Principal', 'Interest', 'Total', 'Remaining', ''].map(h => (
                        <TableHead key={h} className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map(pay => (
                      <TableRow key={pay._key} className="hover:bg-secondary/30">
                        <TableCell className="p-1"><Input value={pay.loan_number} onChange={e => setPaymentField(pay._key, 'loan_number', e.target.value)} className="h-7 w-28 text-xs" placeholder="LA-2026-001" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={pay.installment_number} onChange={e => setPaymentField(pay._key, 'installment_number', e.target.value)} className="h-7 w-16 text-xs" placeholder="1" /></TableCell>
                        <TableCell className="p-1"><Input type="date" value={pay.payment_date} onChange={e => setPaymentField(pay._key, 'payment_date', e.target.value)} className="h-7 w-32 text-xs" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={pay.principal_amount} onChange={e => setPaymentField(pay._key, 'principal_amount', e.target.value)} className="h-7 w-24 text-xs" placeholder="0" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={pay.interest_amount} onChange={e => setPaymentField(pay._key, 'interest_amount', e.target.value)} className="h-7 w-24 text-xs" placeholder="0" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={pay.total_amount} readOnly tabIndex={-1} className="h-7 w-24 bg-secondary/50 text-xs" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={pay.remaining_balance} onChange={e => setPaymentField(pay._key, 'remaining_balance', e.target.value)} className="h-7 w-24 text-xs" placeholder="0" /></TableCell>
                        <TableCell className="p-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setPayments(p => p.filter(x => x._key !== pay._key))} disabled={payments.length === 1}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t px-4 py-3">
                <Button variant="outline" size="sm" className="gap-2 bg-transparent text-xs" onClick={() => setPayments(p => [...p, emptyPayment()])}>
                  <Plus className="h-3.5 w-3.5" />{t.guaranteeReports.addPayment}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Summary bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-secondary/30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-6 text-xs">
          <span className="text-muted-foreground">Loans: <span className="font-semibold text-foreground">{loans.filter(l => l.customer_name).length}</span></span>
          <span className="text-muted-foreground">Outstanding: <span className="font-semibold text-foreground">{fmt(totalOutstanding)}</span></span>
          <span className="text-muted-foreground">Guarantee: <span className="font-semibold text-foreground">{fmt(totalGuarantee)}</span></span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 bg-transparent text-xs" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-3.5 w-3.5" />Save Draft
          </Button>
          <Button size="sm" className="gap-2 text-xs" onClick={() => handleSave(true)} disabled={saving}>
            <Send className="h-3.5 w-3.5" />{t.guaranteeReports.submitReport}
          </Button>
        </div>
      </div>
    </div>
  )
}
