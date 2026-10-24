'use client'

/** Committee writes are serialized and authorized by cgf_committee_action. */
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { tallyVotes } from '@/lib/workflow/fkg-scheme'
import { memberName, type CommitteeMeeting, type CommitteeMember } from '@/components/committee/types'

interface Props {
  meeting: CommitteeMeeting
  allMembers: CommitteeMember[]
  myId: string | null
  myRole: string | null
  secretaryAuthorized: boolean
  onChanged: () => void | Promise<unknown>
  onAction?: (action: string, data: Record<string, unknown>) => Promise<void>
  claimContext?: { claimNumber: string; recommendedAmount: number; originalAmount: number; directorThreshold: number }
}

export function MeetingCard({ meeting, allMembers, myId, myRole, secretaryAuthorized, onChanged, onAction, claimContext }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [protocolOpen, setProtocolOpen] = useState(false)
  const [protocol, setProtocol] = useState({ no: '', notes: '' })
  const [acknowledged, setAcknowledged] = useState(false)
  const [clarificationLoan, setClarificationLoan] = useState<string | null>(null)
  const [clarificationReason, setClarificationReason] = useState('')
  const finalized = ['closed', 'protocol_issued', 'cancelled'].includes(meeting.status ?? '')
  const signing = meeting.status === 'signing'
  const secretary = secretaryAuthorized && meeting.secretary_id === myId
  const mySeat = meeting.seats.find((seat) => seat.member_id === myId)
  const readOnly = !myRole || ['super_admin', 'prsf_admin', 'auditor', 'bank_admin', 'bank_officer'].includes(myRole)
  const allSigned = meeting.seats.length > 0 && meeting.seats.every((seat) => seat.signed_at)

  async function act(action: string, data: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      if (onAction) {
        await onAction(action, data)
      } else {
        const { error } = await createClient().rpc('cgf_committee_action', { p_action: action, p_meeting: meeting.id, p_data: data })
        if (error) throw error
      }
      setProtocolOpen(false)
      setAcknowledged(false)
      await onChanged()
      toast({ title: action === 'issue' ? 'Signed protocol issued' : 'Committee record updated' })
    } catch (error) {
      toast({ title: 'Action refused', description: error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not save this action.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function requestVerification(loanId: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/loans/${loanId}/workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'verification', reason: 'Committee requested verification before deciding' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Verification request refused')
      await onChanged()
    } catch (error) {
      toast({ title: 'Action refused', description: error instanceof Error ? error.message : 'Request failed', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  async function requestClarification() {
    if (!clarificationLoan || clarificationReason.trim().length < 3) return
    setBusy(true)
    try {
      const { error } = await createClient().rpc('cgf_request_clarification', { p_loan: clarificationLoan, p_reason: clarificationReason.trim() })
      if (error) throw new Error(error.message)
      setClarificationLoan(null)
      setClarificationReason('')
      await onChanged()
      toast({ title: 'Clarification requested', description: 'The bank was notified. Prior votes are preserved; the clarified file requires a new sitting.' })
    } catch (error) {
      toast({ title: 'Action refused', description: error instanceof Error ? error.message : 'Request failed', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{meeting.meeting_no ?? 'Committee sitting'}</CardTitle>
            <CardDescription>All {meeting.seats.length} assigned members must agree and sign. Chair selected by seniority.</CardDescription>
          </div>
          <Badge variant={finalized ? 'secondary' : 'outline'}>{meeting.status}</Badge>
        </div>
        {meeting.due_at && <p className="text-sm text-muted-foreground">Voting deadline: {new Date(meeting.due_at).toLocaleString()}{meeting.escalated_at ? ' · Director notified' : ''}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {claimContext && <p className="text-sm text-muted-foreground">Claim {claimContext.claimNumber} · Proposed approval {claimContext.recommendedAmount.toLocaleString()} TJS · Original loan {claimContext.originalAmount.toLocaleString()} TJS · Director threshold {claimContext.directorThreshold.toLocaleString()} TJS. Approval does not record a payment.</p>}
        <section aria-label="Assigned committee members" className="flex flex-col gap-3">
          {meeting.seats.map((seat) => (
            <div key={seat.id} className="flex flex-wrap items-center gap-3">
              <Checkbox id={`attendance-${seat.id}`} checked={seat.attended === true} disabled={!secretary || finalized || signing || busy} onCheckedChange={(value) => void act('attendance', { member_id: seat.member_id, attended: value === true })} />
              <Label htmlFor={`attendance-${seat.id}`}>{memberName(allMembers.find((member) => member.id === seat.member_id))}{seat.member_id === myId ? ' (you)' : ''}</Label>
              {seat.is_chair && <Badge variant="outline">Chair</Badge>}
              {seat.signed_at && <Badge variant="secondary">Signed {new Date(seat.signed_at).toLocaleString()}</Badge>}
            </div>
          ))}
        </section>
        <section aria-label="Agenda" className="flex flex-col gap-4">
          {meeting.items.map((item) => {
            const tally = tallyVotes(item.votes)
            const myVote = item.votes.find((vote) => vote.member_id === myId)?.vote
            const unanimous = tally.total === meeting.seats.length && meeting.seats.length > 0 && (tally.for === meeting.seats.length || tally.against === meeting.seats.length)
            return (
              <article key={item.id} className="flex flex-col gap-3 rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link className="font-medium underline underline-offset-4" href={`/dashboard/loans/${item.loan_id}`}>{item.loan?.loan_number ?? item.loan_id.slice(0, 8)}</Link>
                  <Badge variant="outline">{item.outcome ?? (unanimous ? 'Unanimous' : 'Awaiting unanimous decision')}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">For {tally.for} · Against {tally.against} · Abstain {tally.abstain} · {tally.total}/{meeting.seats.length} votes</p>
                {!readOnly && mySeat?.attended && !finalized && !signing && !item.decided_at && (
                  <div className="flex flex-wrap gap-2">
                    {(['for', 'against', 'abstain'] as const).map((vote) => <Button key={vote} size="sm" variant={myVote === vote ? 'default' : 'outline'} disabled={busy} onClick={() => void act('vote', { item_id: item.id, vote })}>{vote === 'for' ? 'For' : vote === 'against' ? 'Against' : 'Abstain'}</Button>)}
                  </div>
                )}
                {secretary && !finalized && !signing && item.loan?.status === 'kkg_review' && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => void requestVerification(item.loan_id)}>Request verification</Button>{!claimContext && <Button variant="outline" size="sm" disabled={busy} onClick={() => setClarificationLoan(item.loan_id)}>Request bank clarification</Button>}</div>}
              </article>
            )
          })}
        </section>
        {meeting.protocol_no && <p className="text-sm">Protocol {meeting.protocol_no} · {meeting.protocol_date}<br />{meeting.protocol_notes}</p>}
        {meeting.protocol_snapshot && (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Review frozen protocol and recorded votes</summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">{JSON.stringify(meeting.protocol_snapshot, null, 2)}</pre>
          </details>
        )}
        {signing && mySeat && !mySeat.signed_at && !readOnly && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3"><Checkbox id={`sign-${meeting.id}`} checked={acknowledged} onCheckedChange={(value) => setAcknowledged(value === true)} /><Label htmlFor={`sign-${meeting.id}`}>I have reviewed and agree to sign this frozen protocol.</Label></div>
            <Button className="self-start" disabled={busy || !acknowledged} onClick={() => void act('sign')}>Sign protocol</Button>
          </div>
        )}
        {finalized && <p className="text-sm text-muted-foreground">This sitting is immutable. Reconsideration requires a new sitting.</p>}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        {secretary && !finalized && !signing && <><Button disabled={busy || !meeting.items.length} onClick={() => setProtocolOpen(true)}>Prepare protocol for all-member signatures</Button><Button variant="outline" disabled={busy} onClick={() => void act('cancel')}>Cancel sitting</Button></>}
        {secretary && signing && <Button disabled={busy || !allSigned} onClick={() => void act('issue')}>Issue signed protocol</Button>}
        {busy && <Loader2 className="size-4 animate-spin" aria-label="Saving committee action" />}
      </CardFooter>
      <Dialog open={clarificationLoan !== null} onOpenChange={(open) => { if (!open) setClarificationLoan(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Request additional information from the bank</DialogTitle><DialogDescription>The current sitting is closed without a decision. Existing votes remain recorded. After the bank responds, the analyst reviews the file and a new sitting is convened.</DialogDescription></DialogHeader><fieldset disabled={busy} className="flex flex-col gap-3"><Label htmlFor={`clarification-${meeting.id}`}>Documents or clarification required</Label><Textarea id={`clarification-${meeting.id}`} maxLength={4000} rows={4} value={clarificationReason} onChange={(event) => setClarificationReason(event.target.value)} /></fieldset><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setClarificationLoan(null)}>Cancel</Button><Button disabled={busy || clarificationReason.trim().length < 3} onClick={() => void requestClarification()}>Notify bank and return file</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={protocolOpen} onOpenChange={setProtocolOpen}>
        <DialogContent><DialogHeader><DialogTitle>Prepare committee protocol</DialogTitle><DialogDescription>Every assigned member must have voted unanimously. Preparing freezes the text and votes; all members must then sign before issuance.</DialogDescription></DialogHeader>
          <fieldset className="flex flex-col gap-3" disabled={busy}><Label htmlFor={`protocol-no-${meeting.id}`}>Protocol number</Label><Input id={`protocol-no-${meeting.id}`} maxLength={100} value={protocol.no} onChange={(event) => setProtocol((current) => ({ ...current, no: event.target.value }))} /><Label htmlFor={`protocol-notes-${meeting.id}`}>Protocol notes</Label><Textarea id={`protocol-notes-${meeting.id}`} value={protocol.notes} onChange={(event) => setProtocol((current) => ({ ...current, notes: event.target.value }))} /></fieldset>
          <DialogFooter><Button variant="outline" onClick={() => setProtocolOpen(false)} disabled={busy}>Cancel</Button><Button disabled={busy || !protocol.no.trim()} onClick={() => void act('prepare', { protocol_no: protocol.no, notes: protocol.notes })}>Freeze protocol for signatures</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
