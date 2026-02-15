'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Save, Send, Plus, Trash2, Upload, Download, FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/client'
import { createClient } from '@/lib/supabase/client'
import { parseExcelFile, generateExcelTemplate } from '@/lib/utils/excel-parser'
import { useToast } from '@/hooks/use-toast'

export default function NewGuaranteeReportPage() {
  const router = useRouter()
  const { t } = useI18n()
  const supabase = createClient()
  const { toast } = useToast()
  
  const [reportType, setReportType] = useState<'blank_guarantee' | 'disbursements'>('disbursements')
  const [reportMonth, setReportMonth] = useState('')
  const [bankId, setBankId] = useState('')
  const [loans, setLoans] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const addLoan = () => {
    setLoans([...loans, {
      id: crypto.randomUUID(),
      loan_request_number: '',
      customer_name: '',
      approved_amount: '',
      disbursed_amount: '',
      outstanding_principal: '',
      interest_rate: '',
      loan_term_months: '',
      disbursement_date: '',
      maturity_date: '',
    }])
  }

  const removeLoan = (id: string) => {
    setLoans(loans.filter(l => l.id !== id))
  }

  const updateLoan = (id: string, field: string, value: any) => {
    setLoans(loans.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const addPayment = () => {
    setPayments([...payments, {
      id: crypto.randomUUID(),
      loan_number: '',
      installment_number: '',
      payment_date: '',
      principal_amount: '',
      interest_amount: '',
      total_amount: '',
      remaining_balance: '',
    }])
  }

  const removePayment = (id: string) => {
    setPayments(payments.filter(p => p.id !== id))
  }

  const updatePayment = (id: string, field: string, value: any) => {
    setPayments(payments.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const { loans: parsedLoans, payments: parsedPayments, errors } = await parseExcelFile(file)

      if (errors.length > 0) {
        toast({
          title: 'Import Warnings',
          description: `Imported ${parsedLoans.length} loans and ${parsedPayments.length} payments with ${errors.length} warnings`,
          variant: 'default',
        })
        console.log('[v0] Import warnings:', errors)
      } else {
        toast({
          title: 'Import Successful',
          description: `Imported ${parsedLoans.length} loans and ${parsedPayments.length} payments`,
        })
      }

      // Add imported loans with unique IDs
      const loansWithIds = parsedLoans.map(loan => ({ ...loan, id: crypto.randomUUID() }))
      setLoans(prev => [...prev, ...loansWithIds])

      // Add imported payments with unique IDs
      const paymentsWithIds = parsedPayments.map(payment => ({ ...payment, id: crypto.randomUUID() }))
      setPayments(prev => [...prev, ...paymentsWithIds])
    } catch (error) {
      console.error('[v0] Error uploading file:', error)
      toast({
        title: 'Upload Failed',
        description: 'Failed to parse Excel file. Please check the file format.',
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
      event.target.value = '' // Reset input
    }
  }

  const handleDownloadTemplate = () => {
    generateExcelTemplate(reportType)
    toast({
      title: 'Template Downloaded',
      description: 'Excel template has been downloaded',
    })
  }

  const handleSubmit = async (status: 'draft' | 'submitted') => {
    setLoading(true)
    try {
      // Create report
      const { data: report, error: reportError } = await supabase
        .from('guarantee_reports')
        .insert({
          bank_id: bankId,
          report_month: reportMonth,
          report_type: 'monthly',
          status,
          submission_date: status === 'submitted' ? new Date().toISOString() : null,
          total_loans: loans.length,
          total_outstanding_principal: loans.reduce((sum, l) => sum + (parseFloat(l.outstanding_principal) || 0), 0),
        })
        .select()
        .single()

      if (reportError) throw reportError

      // Insert loans
      if (loans.length > 0) {
        const { error: loansError } = await supabase
          .from('guarantee_report_loans')
          .insert(loans.map(l => ({ ...l, report_id: report.id })))

        if (loansError) throw loansError
      }

      // Insert payments
      if (payments.length > 0) {
        const { error: paymentsError } = await supabase
          .from('guarantee_report_payments')
          .insert(payments.map(p => ({ ...p, report_id: report.id })))

        if (paymentsError) throw paymentsError
      }

      router.push('/dashboard/guarantee-reports')
    } catch (error) {
      console.error('Error creating report:', error)
      alert('Failed to create report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/guarantee-reports">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t.guaranteeReports.newReport}</h1>
            <p className="text-sm text-muted-foreground">{t.guaranteeReports.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {t.common.saveAsDraft}
          </Button>
          <Button onClick={() => handleSubmit('submitted')} disabled={loading}>
            <Send className="mr-2 h-4 w-4" />
            {t.guaranteeReports.submitReport}
          </Button>
        </div>
      </div>

      {/* Report Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t.guaranteeReports.reportType}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <input
                type="file"
                id="file-upload"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={uploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? 'Uploading...' : 'Import Excel'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>{t.guaranteeReports.reportType}</Label>
              <Select value={reportType} onValueChange={(v: any) => setReportType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disbursements">{t.guaranteeReports.disbursementsReport}</SelectItem>
                  <SelectItem value="blank_guarantee">{t.guaranteeReports.blankGuaranteeReport}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t.guaranteeReports.reportMonth}</Label>
              <Input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t.guaranteeReports.bank}</Label>
              <Input placeholder="Bank ID" value={bankId} onChange={(e) => setBankId(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="loans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="loans">{t.guaranteeReports.loansList}</TabsTrigger>
          <TabsTrigger value="payments">{t.guaranteeReports.paymentSchedule}</TabsTrigger>
        </TabsList>

        {/* Loans Tab */}
        <TabsContent value="loans" className="space-y-4">
          <div className="flex justify-between">
            <p className="text-sm text-muted-foreground">{loans.length} {t.guaranteeReports.totalLoans}</p>
            <Button onClick={addLoan} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t.guaranteeReports.addLoan}
            </Button>
          </div>
          <div className="space-y-4">
            {loans.map((loan, index) => (
              <Card key={loan.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Loan {index + 1}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => removeLoan(loan.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>{t.guaranteeReports.loanNumber}</Label>
                      <Input value={loan.loan_request_number} onChange={(e) => updateLoan(loan.id, 'loan_request_number', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.guaranteeReports.customerName}</Label>
                      <Input value={loan.customer_name} onChange={(e) => updateLoan(loan.id, 'customer_name', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.guaranteeReports.approvedAmount}</Label>
                      <Input type="number" value={loan.approved_amount} onChange={(e) => updateLoan(loan.id, 'approved_amount', e.target.value)} />
                    </div>
                    {reportType === 'disbursements' && (
                      <>
                        <div className="space-y-2">
                          <Label>{t.guaranteeReports.branchName}</Label>
                          <Input value={loan.branch_name || ''} onChange={(e) => updateLoan(loan.id, 'branch_name', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t.guaranteeReports.productCode}</Label>
                          <Input value={loan.product_code || ''} onChange={(e) => updateLoan(loan.id, 'product_code', e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>{t.guaranteeReports.effectiveInterestRate}</Label>
                          <Input type="number" step="0.01" value={loan.effective_interest_rate || ''} onChange={(e) => updateLoan(loan.id, 'effective_interest_rate', e.target.value)} />
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-between">
            <p className="text-sm text-muted-foreground">{payments.length} payments</p>
            <Button onClick={addPayment} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t.guaranteeReports.addPayment}
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-xs font-medium">{t.guaranteeReports.loanNumber}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium">{t.guaranteeReports.installmentNo}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium">{t.guaranteeReports.paymentDate}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium">{t.guaranteeReports.principalAmount}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium">{t.guaranteeReports.interestAmount}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium">{t.guaranteeReports.totalAmount}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium">{t.guaranteeReports.remainingBalance}</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b">
                        <td className="px-4 py-2">
                          <Input className="h-8" value={payment.loan_number} onChange={(e) => updatePayment(payment.id, 'loan_number', e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8" type="number" value={payment.installment_number} onChange={(e) => updatePayment(payment.id, 'installment_number', e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8" type="date" value={payment.payment_date} onChange={(e) => updatePayment(payment.id, 'payment_date', e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8" type="number" value={payment.principal_amount} onChange={(e) => updatePayment(payment.id, 'principal_amount', e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8" type="number" value={payment.interest_amount} onChange={(e) => updatePayment(payment.id, 'interest_amount', e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8" type="number" value={payment.total_amount} onChange={(e) => updatePayment(payment.id, 'total_amount', e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          <Input className="h-8" type="number" value={payment.remaining_balance} onChange={(e) => updatePayment(payment.id, 'remaining_balance', e.target.value)} />
                        </td>
                        <td className="px-4 py-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePayment(payment.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
