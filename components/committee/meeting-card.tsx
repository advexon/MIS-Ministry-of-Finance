'use client'

/** Committee writes are serialized and authorized by cgf_committee_action. */
import { useRef, useState } from 'react'
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
import { useAuthorityReason } from '@/components/admin/authority-reason-provider'
import { tallyVotes } from '@/lib/workflow/fkg-scheme'
import { committeeReadiness, confirmCommitteeReceipt } from '@/lib/workflow/committee-actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  const requestAuthorityReason = useAuthorityReason()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [protocolOpen, setProtocolOpen] = useState(false)
  const [protocol, setProtocol] = useState({ no: '', notes: '' })
  const [acknowledged, setAcknowledged] = useState(false)
  const [clarificationLoan, setClarificationLoan] = useState<string | null>(null)
  const [clarificationReason, setClarificationReason] = useState('')
  const finalized = ['closed', 'protocol_issued', 'cancelled'].includes(meeting.status ?? '')
  const signing = meeting.status === 'signing'
  const secretary = myRole === 'super_admin' || (secretaryAuthorized && meeting.secretary_id === myId)
  const mySeat = meeting.seats.find((seat) => seat.member_id === myId)
  const readOnly = !myRole || ['prsf_admin', 'auditor', 'bank_admin', 'bank_officer'].includes(myRole)
  const readiness = committeeReadiness(meeting, !!claimContext)
  const allSigned = readiness.allSigned

  async function act(action: string, data: Record<string, unknown> = {}) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const authorityReason = await requestAuthorityReason()
      if (authorityReason) data = { ...data, authority_reason: authorityReason }
      if (onAction) {
        await onAction(action, data)
      } else {
        const { data: receipt, error } = await createClient().rpc('cgf_committee_action', { p_action: action, p_meeting: meeting.id, p_data: data })
        if (error) throw error
        confirmCommitteeReceipt(receipt, meeting.id)
      }
      setProtocolOpen(false)
      setCancelOpen(false)
      setAcknowledged(false)
      await Promise.resolve().then(onChanged).catch(() => { toast({ title: 'Action saved; refresh needed', description: 'The register could not reload. Refresh before another action.' }) })
      toast({ title: action === 'issue' ? 'Signed protocol issued' : 'Committee record updated' })
    } catch (error) {
      toast({ title: 'Action refused', description: error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not save this action.', variant: 'destructive' })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function assumeSeat(memberId: string) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const reason = await requestAuthorityReason()
      const { error } = await createClient().rpc('cgf_assume_committee_seat', { p_claim: !!claimContext, p_sitting: meeting.id, p_member: memberId, p_reason: reason })
      if (error) throw new Error(error.message)
      await Promise.resolve().then(onChanged).catch(() => { toast({ title: 'Action saved; refresh the register before retrying' }) })
      toast({ title: 'Your individual seat was recorded', description: 'You can cast only your own vote and signature. All other required members must still vote and sign.' })
    } catch (error) { toast({ title: 'Seat substitution refused', description: error instanceof Error ? error.message : 'Request failed', variant: 'destructive' }) }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function requestVerification(loanId: string) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const authorityReason = await requestAuthorityReason()
      const response = await fetch(`/api/loans/${loanId}/workflow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'verification', reason: authorityReason ?? 'Committee requested verification before deciding' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Verification request refused')
      if (result.ok !== true || result.from !== 'kkg_review' || result.to !== 'verification') throw new Error('Verification was not confirmed. Refresh the application before retrying.')
      await Promise.resolve().then(onChanged).catch(() => { toast({ title: 'Action saved; refresh the register before retrying' }) })
    } catch (error) {
      toast({ title: 'Action refused', description: error instanceof Error ? error.message : 'Request failed', variant: 'destructive' })
    } finally { inFlight.current = false; setBusy(false) }
  }

  async function requestClarification() {
    if (inFlight.current || !clarificationLoan || clarificationReason.trim().length < 3) return
    inFlight.current = true
    setBusy(true)
    try {
      const { data: receipt, error } = await createClient().rpc('cgf_request_clarification', { p_loan: clarificationLoan, p_reason: clarificationReason.trim() })
      if (error) throw new Error(error.message)
      confirmCommitteeReceipt(receipt, meeting.id)
      setClarificationLoan(null)
      setClarificationReason('')
      await Promise.resolve().then(onChanged).catch(() => { toast({ title: 'Action saved; refresh the register before retrying' }) })
      toast({ title: 'Clarification requested', description: 'The bank was notified. Prior votes are preserved; the clarified file requires a new sitting.' })
    } catch (error) {
      toast({ title: 'Action refused', description: error instanceof Error ? error.message : 'Request failed', variant: 'destructive' })
    } finally { inFlight.current = false; setBusy(false) }
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
        <p className="text-sm text-muted-foreground">Attendance {readiness.attended}/{meeting.seats.length} · Signatures {readiness.signed}/{meeting.seats.length}{meeting.scheduled_at ? ` · Convened ${new Date(meeting.scheduled_at).toLocaleString()}` : ''}</p>
        {!finalized && (!meeting.items.length || !meeting.seats.length) && <Alert><AlertDescription>This legacy sitting has no agenda or assigned membership and cannot produce a decision. Cancel it and convene a new system-selected sitting for an eligible application; historical records will be preserved.</AlertDescription></Alert>}
        {!finalized && !signing && !readiness.readyApplications && <Alert><AlertDescription>Voting and protocol preparation are paused. Complete verification and return the application to committee review first. Prior votes are cleared when verification is requested.</AlertDescription></Alert>}
        {!finalized && !signing && readiness.readyApplications && !readiness.canPrepare && <p className="text-sm text-muted-foreground">Before preparing a protocol, record every member as present and collect unanimous For or Against votes on every item. Abstentions do not approve or reject an application.</p>}
        {claimContext && <p className="text-sm text-muted-foreground">Claim {claimContext.claimNumber} · Proposed approval {claimContext.recommendedAmount.toLocaleString()} TJS · Original loan {claimContext.originalAmount.toLocaleString()} TJS · Director threshold {claimContext.directorThreshold.toLocaleString()} TJS. Approval does not record a payment.</p>}
        <section aria-label="Assigned committee members" className="flex flex-col gap-3">
          {meeting.seats.map((seat) => (
            <div key={seat.id} className="flex flex-wrap items-center gap-3">
              <Checkbox id={`attendance-${seat.id}`} checked={seat.attended === true} disabled={!secretary || finalized || signing || busy} onCheckedChange={(value) => void act('attendance', { member_id: seat.member_id, attended: value === true })} />
              <Label htmlFor={`attendance-${seat.id}`}>{memberName(allMembers.find((member) => member.id === seat.member_id))}{seat.member_id === myId ? ' (you)' : ''}</Label>
              {myRole === 'super_admin' && !mySeat && meeting.status === 'scheduled' && meeting.items.every((item) => !item.votes.length) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void assumeSeat(seat.member_id)}>Take this seat as myself</Button>}
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
                {!readOnly && mySeat?.attended && readiness.readyApplications && !finalized && !signing && !item.decided_at && (
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
        {secretary && !finalized && !signing && <><Button disabled={busy || !readiness.canPrepare} onClick={() => setProtocolOpen(true)}>Prepare protocol for all-member signatures</Button><Button variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel sitting</Button></>}
        {secretary && signing && <Button disabled={busy || !allSigned} onClick={() => void act('issue')}>Issue signed protocol</Button>}
        {busy && <Loader2 className="size-4 animate-spin" aria-label="Saving committee action" />}
      </CardFooter>
      <Dialog open={cancelOpen} onOpenChange={(open) => { if (!busy) setCancelOpen(open) }}>
        <DialogContent><DialogHeader><DialogTitle>Cancel this sitting?</DialogTitle><DialogDescription>Existing votes remain in the immutable record. No decision will be issued. The application or claim can be considered again only in a new sitting.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCancelOpen(false)}>Keep sitting</Button><Button variant="destructive" disabled={busy} onClick={() => void act('cancel')}>Confirm cancellation</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={clarificationLoan !== null} onOpenChange={(open) => { if (!open) setClarificationLoan(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Request additional information from the bank</DialogTitle><DialogDescription>The current sitting is closed without a decision. Existing votes remain recorded. After the bank responds, the analyst reviews the file and a new sitting is convened.</DialogDescription></DialogHeader><fieldset disabled={busy} className="flex flex-col gap-3"><Label htmlFor={`clarification-${meeting.id}`}>Documents or clarification required</Label><Textarea id={`clarification-${meeting.id}`} maxLength={4000} rows={4} value={clarificationReason} onChange={(event) => setClarificationReason(event.target.value)} /></fieldset><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setClarificationLoan(null)}>Cancel</Button><Button disabled={busy || clarificationReason.trim().length < 3} onClick={() => void requestClarification()}>Notify bank and return file</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={protocolOpen} onOpenChange={setProtocolOpen}>
        <DialogContent><DialogHeader><DialogTitle>Prepare committee protocol</DialogTitle><DialogDescription>Every assigned member must have voted unanimously. Preparing freezes the text and votes; all members must then sign before issuance.</DialogDescription></DialogHeader>
          <fieldset className="flex flex-col gap-3" disabled={busy}><Label htmlFor={`protocol-no-${meeting.id}`}>Protocol number</Label><Input id={`protocol-no-${meeting.id}`} maxLength={100} value={protocol.no} onChange={(event) => setProtocol((current) => ({ ...current, no: event.target.value }))} /><Label htmlFor={`protocol-notes-${meeting.id}`}>Protocol notes</Label><Textarea id={`protocol-notes-${meeting.id}`} maxLength={4000} value={protocol.notes} onChange={(event) => setProtocol((current) => ({ ...current, notes: event.target.value }))} /></fieldset>
          <DialogFooter><Button variant="outline" onClick={() => setProtocolOpen(false)} disabled={busy}>Cancel</Button><Button disabled={busy || !readiness.canPrepare || !protocol.no.trim()} onClick={() => void act('prepare', { protocol_no: protocol.no, notes: protocol.notes })}>Freeze protocol for signatures</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
