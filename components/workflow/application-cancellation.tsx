'use client'

import { useRef, useState } from 'react'
import { usePermissions } from '@/lib/contexts/permission-context'
import { useAuthorityReason } from '@/components/admin/authority-reason-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { canActOnStep, getNextStatuses, STEP_BY_STATUS } from '@/lib/workflow/fkg-scheme'
import type { LoanApplication } from '@/lib/types/database'

export function ApplicationCancellation({ loan, onDone }: { loan: LoanApplication; onDone: () => Promise<void> }) {
  const { role, profile } = usePermissions()
  const requestAuthorityReason = useAuthorityReason()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const code = role?.code ?? ''
  const step = STEP_BY_STATUS[loan.status]
  const bankCanAct = ['bank_admin', 'bank_officer'].includes(code) && profile?.bank_id === loan.bank_id
  const assigned = code !== 'prsf_analyst' || !loan.assigned_analyst_id || loan.assigned_analyst_id === profile?.id || loan.status === 'verification'
  const allowed = getNextStatuses(loan.status).includes('cancelled') && (code === 'super_admin' || (['draft','docs_incomplete'].includes(loan.status) ? bankCanAct : loan.status === 'under_review' ? code === 'prsf_analyst' && assigned : Boolean(step && canActOnStep(code, step, profile ?? {}) && assigned)))
  if (!allowed) return null
  async function cancel() {
    if (inFlight.current || reason.trim().length < 3) return
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const authorityReason = await requestAuthorityReason()
      const response = await fetch(`/api/loans/${loan.id}/workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: loan.status, to: 'cancelled', reason: authorityReason ? `${authorityReason}\n${reason.trim()}` : reason.trim() }) })
      const receipt = await response.json()
      if (!response.ok) { setError(receipt.error ?? 'Cancellation was refused.'); return }
      if (receipt?.ok !== true || receipt?.from !== loan.status || receipt?.to !== 'cancelled') throw new Error('Cancellation receipt was not confirmed')
      setOpen(false)
      try { await onDone() } catch { setError('Cancellation was saved, but refresh failed. Reload the application.') }
    } catch { setError('Cancellation could not be confirmed. Reload to check its state before retrying.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <><Button variant="outline" onClick={() => { setError(null); setOpen(true) }}>Cancel application</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Dialog open={open} onOpenChange={value => { if (!inFlight.current) setOpen(value) }}><DialogContent><DialogHeader><DialogTitle>Cancel this application?</DialogTitle><DialogDescription>This ends the current application. Existing documents, decisions and audit history are retained.</DialogDescription></DialogHeader><div className="flex flex-col gap-2"><Label htmlFor="application-cancellation-reason">Cancellation reason</Label><Textarea id="application-cancellation-reason" value={reason} maxLength={1500} onChange={event => setReason(event.target.value)} disabled={busy} /></div><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep application</Button><Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void cancel()}>{busy ? 'Cancelling…' : 'Confirm cancellation'}</Button></DialogFooter></DialogContent></Dialog></>
}
