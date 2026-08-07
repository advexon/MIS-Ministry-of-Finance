'use client'

/**
 * One ККГ sitting: seating and quorum (step 7), voting (step 8) and the
 * protocol (step 10).
 *
 * The tallies rendered here mirror the engine, but the server re-evaluates
 * quorum and majority in /api/loans/[id]/workflow before it will allow the
 * protocol transition. A tampered client can therefore show a false "carried"
 * but cannot obtain a protocol the votes do not support.
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, Check, Loader2, ThumbsDown, ThumbsUp, MinusCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

import {
  evaluateCommitteeOutcome, requiredQuorum, tallyVotes, toUsd,
} from '@/lib/workflow/fkg-scheme'
import type { LoanStatus } from '@/lib/types/database'
import {
  memberName, type AgendaItem, type CommitteeMeeting, type CommitteeMember, type VoteValue,
} from '@/components/committee/types'

interface Props {
  meeting: CommitteeMeeting
  allMembers: CommitteeMember[]
  awaiting: { id: string; loan_number: string | null }[]
  myId: string | null
  myRole: string | null
  onChanged: () => void | Promise<void>
}

export function MeetingCard({ meeting, allMembers, awaiting, myId, myRole, onChanged }: Props) {
  const supabase = createClient()
  const { toast } = useToast()

  const [busy, setBusy] = useState(false)
  const [seating, setSeating] = useState(false)
  const [tabling, setTabling] = useState(false)
  const [protocolOpen, setProtocolOpen] = useState(false)
  const [tableLoanId, setTableLoanId] = useState('')
  const [protocol, setProtocol] = useState({ no: meeting.protocol_no ?? '', notes: meeting.protocol_notes ?? '' })

  const isSecretary =
    myRole === 'kkg_secretary' || myRole === 'super_admin' || myRole === 'prsf_admin' ||
    (myId != null && meeting.secretary_id === myId)
  const mySeat = meeting.seats.find((s) => s.member_id === myId)
  const closed = meeting.status === 'closed'

  // Supabase query builders are thenable but are not real Promises, so this
  // accepts PromiseLike rather than Promise.
  async function run(
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    ok: string,
  ) {
    setBusy(true)
    try {
      const res = await fn()
      const err = res?.error ?? null
      if (err) {
        toast({ title: 'Rejected', description: err.message, variant: 'destructive' })
        return false
      }
      toast({ title: ok })
      await onChanged()
      return true
    } finally {
      setBusy(false)
    }
  }

  /** Moves a loan's status through the validated workflow route. */
  async function transition(loanId: string, to: LoanStatus, reason?: string) {
    const res = await fetch(`/api/loans/${loanId}/workflow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, reason }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({
        title: 'The transition was refused',
        description: json.error ?? 'The server rejected this change.',
        variant: 'destructive',
      })
      return false
    }
    return true
  }

  // ── Step 7: seat a member ──
  async function seat(memberId: string) {
    await run(
      () => supabase.from('committee_meeting_members').insert({
        meeting_id: meeting.id, member_id: memberId, attended: false, is_chair: false,
      }),
      'Member seated',
    )
  }

  async function unseat(seatId: string) {
    await run(() => supabase.from('committee_meeting_members').delete().eq('id', seatId), 'Seat removed')
  }

  async function setAttended(seatId: string, attended: boolean) {
    await run(
      () => supabase.from('committee_meeting_members').update({ attended }).eq('id', seatId),
      attended ? 'Marked present' : 'Marked absent',
    )
  }

  // ── Step 7 → 8: table an application ──
  async function tableLoan() {
    if (!tableLoanId) return
    setBusy(true)
    const { error } = await supabase.from('committee_agenda_items').insert({
      meeting_id: meeting.id, loan_id: tableLoanId,
    })
    if (error) {
      setBusy(false)
      toast({ title: 'Could not table the application', description: error.message, variant: 'destructive' })
      return
    }
    // Only now does the loan enter the sitting.
    const moved = await transition(tableLoanId, 'kkg_review', `Tabled at ${meeting.meeting_no ?? 'ККГ meeting'}`)
    setBusy(false)
    if (moved) {
      setTabling(false)
      setTableLoanId('')
      await onChanged()
    }
  }

  // ── Step 8: vote ──
  async function castVote(item: AgendaItem, vote: VoteValue) {
    if (!myId) return
    const existing = item.votes.find((v) => v.member_id === myId)
    await run(
      () =>
        existing
          ? supabase.from('committee_votes').update({ vote, voted_at: new Date().toISOString() }).eq('id', existing.id)
          : supabase.from('committee_votes').insert({
              agenda_item_id: item.id, member_id: myId, vote, voted_at: new Date().toISOString(),
            }),
      existing ? 'Vote changed' : 'Vote recorded',
    )
  }

  /** Step 8 → 9: the committee wants a site verification before deciding. */
  async function sendToVerification(item: AgendaItem) {
    if (!item.loan) return
    const ok = await transition(item.loan.id, 'verification', 'ККГ requested a site verification')
    if (ok) await onChanged()
  }

  /** Step 8 → 10 (reject): the committee declines the application outright. */
  async function rejectItem(item: AgendaItem) {
    if (!item.loan) return
    await supabase.from('committee_agenda_items').update({ outcome: 'rejected', decided_at: new Date().toISOString() }).eq('id', item.id)
    const ok = await transition(item.loan.id, 'rejected', 'Declined by ККГ')
    if (ok) await onChanged()
  }

  // ── Step 10: issue the protocol ──
  async function issueProtocol() {
    if (!protocol.no.trim()) {
      toast({ title: 'A protocol number is required', variant: 'destructive' })
      return
    }
    setBusy(true)

    await supabase
      .from('committee_meetings')
      .update({
        protocol_no: protocol.no.trim(),
        protocol_notes: protocol.notes || null,
        protocol_date: new Date().toISOString().slice(0, 10),
        held_at: meeting.held_at ?? new Date().toISOString(),
        status: 'closed',
      })
      .eq('id', meeting.id)

    // Each carried item advances. The server re-checks quorum for every one, so
    // an item whose votes do not support it stays put and is reported below.
    const failures: string[] = []
    for (const item of meeting.items) {
      if (!item.loan) continue
      const outcome = outcomeFor(item)
      if (!outcome.carried) continue

      await supabase
        .from('committee_agenda_items')
        .update({ outcome: 'recommended', decided_at: new Date().toISOString() })
        .eq('id', item.id)

      const res = await fetch(`/api/loans/${item.loan.id}/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'kkg_protocol',
          reason: `ККГ protocol ${protocol.no.trim()}`,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        failures.push(`${label(item)}: ${j.error ?? 'refused'}`)
      }
    }

    setBusy(false)
    setProtocolOpen(false)

    if (failures.length) {
      toast({
        title: 'Protocol saved, but some items did not advance',
        description: failures.join(' · '),
        variant: 'destructive',
      })
    } else {
      toast({ title: 'Protocol issued', description: 'Carried applications have moved to step 11.' })
    }
    await onChanged()
  }

  /** Quorum is what the meeting fixed; the loan's own requirement is the floor. */
  function outcomeFor(item: AgendaItem) {
    const usd =
      item.loan?.amount_usd ??
      toUsd(item.loan?.guarantee_amount ?? item.loan?.approved_amount ?? null, item.loan?.usd_rate ?? null)
    const quorum = meeting.required_quorum ?? requiredQuorum(usd)
    return { ...evaluateCommitteeOutcome(tallyVotes(item.votes), quorum), quorum }
  }

  const label = (item: AgendaItem) =>
    item.loan?.loan_number ?? item.loan_id.slice(0, 8)

  const present = meeting.seats.filter((s) => s.attended).length
  const quorumShort = (meeting.required_quorum ?? 5) - present
  const seatedIds = new Set(meeting.seats.map((s) => s.member_id))
  const unseated = allMembers.filter((m) => !seatedIds.has(m.id))

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{meeting.meeting_no ?? 'Untitled meeting'}</CardTitle>
            <CardDescription className="text-xs">
              {meeting.scheduled_at
                ? new Date(meeting.scheduled_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                : 'No date set'}
              {' · '}
              {present} present of {meeting.seats.length} seated · quorum {meeting.required_quorum ?? 5}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {meeting.protocol_no && <Badge variant="outline">Protocol {meeting.protocol_no}</Badge>}
            <Badge variant={closed ? 'secondary' : 'default'}>{meeting.status ?? 'scheduled'}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {quorumShort > 0 && !closed && (
          <p className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {quorumShort} more member{quorumShort === 1 ? '' : 's'} must be marked present before any
            recommendation can carry.
          </p>
        )}

        {/* ── Seating (step 7) ── */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Members
            </h3>
            {isSecretary && !closed && unseated.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setSeating(true)} disabled={busy}>
                Seat members
              </Button>
            )}
          </div>
          {meeting.seats.length === 0 ? (
            <p className="text-xs text-muted-foreground">No members seated yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {meeting.seats.map((s) => {
                const m = allMembers.find((x) => x.id === s.member_id)
                return (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`att-${s.id}`}
                      checked={!!s.attended}
                      disabled={!isSecretary || closed || busy}
                      onCheckedChange={(v) => setAttended(s.id, v === true)}
                    />
                    <Label htmlFor={`att-${s.id}`} className="font-normal">
                      {memberName(m)}
                      {s.member_id === myId && ' (you)'}
                    </Label>
                    {s.is_chair && <Badge variant="outline" className="text-[10px]">Chair</Badge>}
                    {isSecretary && !closed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-xs text-muted-foreground"
                        onClick={() => unseat(s.id)}
                        disabled={busy}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Agenda and voting (step 8) ── */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agenda
            </h3>
            {isSecretary && !closed && awaiting.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setTabling(true)} disabled={busy}>
                Table an application
              </Button>
            )}
          </div>

          {meeting.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing tabled yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {meeting.items.map((item) => {
                const o = outcomeFor(item)
                const myVote = item.votes.find((v) => v.member_id === myId)?.vote
                const canVote = !!mySeat?.attended && !closed && !item.decided_at

                return (
                  <li key={item.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{label(item)}</span>
                      <div className="flex items-center gap-2">
                        {item.outcome && <Badge variant="outline">{item.outcome}</Badge>}
                        <Badge variant={o.carried ? 'default' : 'secondary'} className="text-[10px]">
                          {o.carried ? 'Carried' : o.quorumMet ? 'Not carried' : 'No quorum'}
                        </Badge>
                      </div>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">{o.reason}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      <span>For {tallyVotes(item.votes).for}</span>
                      <span>Against {tallyVotes(item.votes).against}</span>
                      <span>Abstain {tallyVotes(item.votes).abstain}</span>
                    </div>

                    {canVote && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {([
                          ['for', 'For', ThumbsUp],
                          ['against', 'Against', ThumbsDown],
                          ['abstain', 'Abstain', MinusCircle],
                        ] as const).map(([v, text, Icon]) => (
                          <Button
                            key={v}
                            size="sm"
                            variant={myVote === v ? 'default' : 'outline'}
                            onClick={() => castVote(item, v)}
                            disabled={busy}
                          >
                            <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {text}
                            {myVote === v && <Check className="ml-1 h-3 w-3" aria-hidden="true" />}
                          </Button>
                        ))}
                      </div>
                    )}

                    {!canVote && !closed && !mySeat?.attended && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Only members marked present may vote.
                      </p>
                    )}

                    {isSecretary && !closed && !item.decided_at && (
                      <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
                        <Button size="sm" variant="outline" onClick={() => sendToVerification(item)} disabled={busy}>
                          Request verification (step 9)
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => rejectItem(item)} disabled={busy}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Protocol (step 10) ── */}
        {isSecretary && !closed && meeting.items.length > 0 && (
          <Button size="sm" className="self-start" onClick={() => setProtocolOpen(true)} disabled={busy}>
            Issue protocol (step 10)
          </Button>
        )}
        {meeting.protocol_notes && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {meeting.protocol_notes}
          </p>
        )}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </CardContent>

      {/* Seat members */}
      <Dialog open={seating} onOpenChange={setSeating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seat committee members</DialogTitle>
            <DialogDescription>
              Seating records who may vote. Attendance is marked separately, because quorum counts who
              actually sat, not who was invited.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {unseated.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {memberName(m)}{' '}
                  <span className="text-xs text-muted-foreground">
                    {(m.role as { name_en?: string } | null)?.name_en ?? ''}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => seat(m.id)} disabled={busy}>
                  Seat
                </Button>
              </li>
            ))}
            {unseated.length === 0 && (
              <li className="text-xs text-muted-foreground">Everyone eligible is already seated.</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Table an application */}
      <Dialog open={tabling} onOpenChange={setTabling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Table an application</DialogTitle>
            <DialogDescription>
              Only applications that have cleared Credit Risk (step 6) can be tabled.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="table-loan">Application</Label>
            <Select value={tableLoanId} onValueChange={setTableLoanId}>
              <SelectTrigger id="table-loan">
                <SelectValue placeholder="Select an application" />
              </SelectTrigger>
              <SelectContent>
                {awaiting.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.loan_number ?? l.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTabling(false)} disabled={busy}>Cancel</Button>
            <Button onClick={tableLoan} disabled={busy || !tableLoanId}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue protocol */}
      <Dialog open={protocolOpen} onOpenChange={setProtocolOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue the ККГ protocol — step 10</DialogTitle>
            <DialogDescription>
              Only items that carried will advance. Anything without quorum or a majority stays on the
              agenda, and the server checks this again for each one.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="protocol-no">Protocol number</Label>
              <Input
                id="protocol-no"
                value={protocol.no}
                onChange={(e) => setProtocol((p) => ({ ...p, no: e.target.value }))}
                placeholder="e.g. ККГ-П-2026-07"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="protocol-notes">Protocol notes</Label>
              <Textarea
                id="protocol-notes"
                rows={3}
                value={protocol.notes}
                onChange={(e) => setProtocol((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <ul className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
              {meeting.items.map((item) => {
                const o = outcomeFor(item)
                return (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span>{label(item)}</span>
                    <span className={o.carried ? 'text-emerald-700' : 'text-muted-foreground'}>
                      {o.carried ? 'will advance' : 'stays'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProtocolOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={issueProtocol} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Issue protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
