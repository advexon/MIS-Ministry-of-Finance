'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { one } from '@/lib/utils/supabase-relation'
import { MeetingCard } from '@/components/committee/meeting-card'
import type { CommitteeMeeting, CommitteeMember, Seat, Vote } from '@/components/committee/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

interface ClaimOption { id: string; claim_number: string; loan_id: string; claim_amount: number; status: string }
interface ClaimSitting {
  id: string; claim_id: string; meeting_no: string; secretary_id: string; status: string
  original_amount_tjs: number; director_threshold_tjs: number; recommended_amount: number
  outcome: string | null; protocol_no: string | null; protocol_notes: string | null
  protocol_snapshot: Record<string, unknown> | null; created_at: string; closed_at: string | null
  seats: Seat[]; votes: Vote[]; claim: Pick<ClaimOption, 'id' | 'claim_number' | 'loan_id'> | null
}

async function loadClaimsRegister() {
  const client = createClient()
  const [sittings, claims] = await Promise.all([
    client.from('claim_committee_sittings').select(`id,claim_id,meeting_no,secretary_id,status,original_amount_tjs,director_threshold_tjs,recommended_amount,outcome,protocol_no,protocol_notes,protocol_snapshot,created_at,closed_at,
      seats:claim_committee_members(id,member_id,is_chair,attended,signed_at),votes:claim_committee_votes(id,member_id,vote,voted_at),claim:claims!claim_id(id,claim_number,loan_id)`).order('created_at', { ascending: false }),
    client.from('claims').select('id,claim_number,loan_id,claim_amount,status').in('status', ['pending', 'submitted', 'under_review', 'rejected']).order('created_at'),
  ])
  const error = sittings.error ?? claims.error
  if (error) throw new Error(error.message)
  const normalized = (sittings.data ?? []).map((sitting) => ({ ...sitting, claim: one(sitting.claim), votes: sitting.votes.map((vote) => ({ ...vote, comment: null })) })) as ClaimSitting[]
  const open = new Set(normalized.filter((sitting) => ['scheduled', 'signing'].includes(sitting.status)).map((sitting) => sitting.claim_id))
  return { sittings: normalized, awaiting: (claims.data ?? []).filter((claim) => !open.has(claim.id)) as ClaimOption[] }
}

function asMeeting(sitting: ClaimSitting): CommitteeMeeting {
  return {
    id: sitting.id, meeting_no: sitting.meeting_no, secretary_id: sitting.secretary_id, status: sitting.status,
    scheduled_at: sitting.created_at, held_at: sitting.closed_at, required_quorum: sitting.seats.length,
    chaired_by: sitting.seats.find((seat) => seat.is_chair)?.member_id ?? null,
    protocol_no: sitting.protocol_no, protocol_notes: sitting.protocol_notes, protocol_date: sitting.closed_at?.slice(0, 10) ?? null,
    protocol_snapshot: sitting.protocol_snapshot, due_at: null, escalated_at: null, seats: sitting.seats,
    items: sitting.claim ? [{ id: sitting.claim_id, loan_id: sitting.claim.loan_id, outcome: sitting.outcome, recommended_amount: sitting.recommended_amount, recommended_coverage: null, conditions: null, decided_at: sitting.closed_at, loan: null, votes: sitting.votes }] : [],
  }
}

export function ClaimsCommitteeRegister({ members, myId, myRole, secretary }: { members: CommitteeMember[]; myId: string | null; myRole: string | null; secretary: boolean }) {
  const { toast } = useToast()
  const { data, error, isLoading, mutate } = useSWR(myId ? ['claims-committee-register', myId] : null, loadClaimsRegister)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ meeting_no: '', claim_id: '', recommended_amount: '' })
  const amount = Number(form.recommended_amount)

  async function act(action: string, sittingId: string | null, input: Record<string, unknown>) {
    const { error } = await createClient().rpc('cgf_claim_committee_action', { p_action: action, p_sitting: sittingId, p_data: input })
    if (error) throw error
  }

  async function createSitting() {
    setBusy(true)
    try {
      await act('create', null, { ...form, recommended_amount: amount })
      setCreating(false)
      setForm({ meeting_no: '', claim_id: '', recommended_amount: '' })
      await mutate()
      toast({ title: 'Claims sitting convened', description: 'Risk, Compliance and Analyst members were selected using claims membership flags.' })
    } catch (error) {
      toast({ title: 'Could not convene claims sitting', description: error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Request failed', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <section id="claims-committee" aria-labelledby="claims-committee-heading" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2"><h2 id="claims-committee-heading" className="text-xl font-semibold">Claims committee</h2><p className="max-w-3xl text-sm text-muted-foreground">Separate Risk, Compliance and Analyst membership. The original issued loan amount determines Director participation; every member must agree and sign. Legacy or non-TJS guarantees without reconciled original evidence cannot be decided here.</p></div>
        {secretary && <Button onClick={() => setCreating(true)} disabled={!data?.awaiting.length}>Convene claims sitting</Button>}
      </header>
      {error && <Alert variant="destructive"><AlertDescription>{error instanceof Error ? error.message : 'Could not load claims sittings'}</AlertDescription></Alert>}
      {isLoading ? <Skeleton className="h-32" /> : !data?.sittings.length ? <Card><CardHeader><CardTitle>No claims sittings</CardTitle><CardDescription>Claim approval requires a unanimous signed protocol, not an individual approval or payment entry.</CardDescription></CardHeader></Card> : data.sittings.map((sitting) => <MeetingCard key={sitting.id} meeting={asMeeting(sitting)} allMembers={members} myId={myId} myRole={myRole} secretaryAuthorized={secretary} onChanged={() => mutate()} onAction={(action, input) => act(action, sitting.id, input)} claimContext={{ claimNumber: sitting.claim?.claim_number ?? sitting.claim_id, recommendedAmount: sitting.recommended_amount, originalAmount: sitting.original_amount_tjs, directorThreshold: sitting.director_threshold_tjs }} />)}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent><DialogHeader><DialogTitle>Convene claims sitting</DialogTitle><DialogDescription>The proposed amount is frozen before voting. Approval never marks a claim paid. Membership requires one active flagged employee from each of Risk, Compliance and Credit Analysis.</DialogDescription></DialogHeader>
          <fieldset className="flex flex-col gap-3" disabled={busy}>
            <Label htmlFor="claim-meeting-number">Meeting number</Label><Input id="claim-meeting-number" maxLength={100} value={form.meeting_no} onChange={(event) => setForm((current) => ({ ...current, meeting_no: event.target.value }))} />
            <Label htmlFor="claim-meeting-case">Claim</Label><Select value={form.claim_id} onValueChange={(claim_id) => setForm((current) => ({ ...current, claim_id, recommended_amount: String(data?.awaiting.find((claim) => claim.id === claim_id)?.claim_amount ?? '') }))}><SelectTrigger id="claim-meeting-case"><SelectValue placeholder="Choose a claim" /></SelectTrigger><SelectContent><SelectGroup>{data?.awaiting.map((claim) => <SelectItem key={claim.id} value={claim.id}>{claim.claim_number} · {claim.status.replaceAll('_', ' ')}</SelectItem>)}</SelectGroup></SelectContent></Select>
            <Label htmlFor="claim-proposed-amount">Proposed approved amount (TJS)</Label><Input id="claim-proposed-amount" type="number" min="0.01" step="0.01" value={form.recommended_amount} onChange={(event) => setForm((current) => ({ ...current, recommended_amount: event.target.value }))} />
          </fieldset>
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy || !form.meeting_no.trim() || !form.claim_id || !Number.isFinite(amount) || amount <= 0} onClick={() => void createSitting()}>{busy ? 'Convening…' : 'Convene and select members'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
