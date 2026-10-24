'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/contexts/permission-context'
import type { LoanApplication } from '@/lib/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

async function loadSignatureState([, loanId]: [string, string]) {
  const supabase = createClient()
  const [current, authority] = await Promise.all([
    supabase.rpc('cgf_deputy_confirmation_current', { p_loan: loanId }),
    supabase.rpc('cgf_has_signing_authority'),
  ])
  if (current.error || authority.error) throw new Error('Could not verify signing authority')
  return { current: current.data === true, authorized: authority.data === true }
}

export function SignatureReviewPanel({ loan, onDone }: { loan: LoanApplication; onDone: () => void | Promise<void> }) {
  const { role } = usePermissions()
  const router = useRouter()
  const visible = ['deputy_director', 'fkg_management', 'prsf_analyst', 'credit_risk_officer', 'compliance_officer'].includes(role?.code ?? '') && ['deputy_review', 'management_review', 'approved'].includes(loan.status)
  const { data, error: loadError, mutate } = useSWR(visible ? ['loan-signature-state', loan.id] : null, loadSignatureState)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!visible) return null

  async function act(confirm: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (confirm) {
        const { error } = await createClient().rpc('cgf_confirm_deputy', { p_loan: loan.id, p_notes: notes })
        if (error) throw new Error(error.message)
      } else {
        const response = await fetch(`/api/loans/${loan.id}/generate-guarantee`, { method: 'POST' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Signature refused')
      }
      setNotes('')
      await mutate()
      await onDone()
      router.refresh()
    } catch (error) { setError(error instanceof Error ? error.message : 'The action could not be saved') }
    finally { setBusy(false) }
  }

  return <Card><CardHeader><CardTitle>Deputy review and guarantee signature</CardTitle><CardDescription>The deputy confirms the exact terms, signed committee approval and compliance note. The Director or an authorized temporary delegate then signs. These must be different people.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {(error || loadError) && <Alert variant="destructive"><AlertDescription>{error ?? 'Could not verify the signature state'}</AlertDescription></Alert>}
    <p className="text-sm">Deputy confirmation: {data ? data.current ? 'current and recorded' : 'required or terms changed' : 'checking'}</p>
    {role?.code === 'deputy_director' && <fieldset className="flex flex-col gap-3" disabled={busy}><Label htmlFor="deputy-review-notes">Review and confirmation notes</Label><Textarea id="deputy-review-notes" maxLength={10000} value={notes} onChange={(event) => setNotes(event.target.value)} /><Button className="self-start" disabled={busy || notes.trim().length < 3} onClick={() => void act(true)}>Confirm reviewed file</Button></fieldset>}
    {data?.authorized && loan.status === 'approved' && <Button className="self-start" disabled={busy || !data.current} onClick={() => void act(false)}>Sign and issue guarantee</Button>}
  </CardContent></Card>
}
