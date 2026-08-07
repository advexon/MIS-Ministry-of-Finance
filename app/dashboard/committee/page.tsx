'use client'

/**
 * ККГ (Credit Guarantee Committee) sittings — scheme steps 7, 8 and 10.
 *
 * These three steps are a multi-party sitting rather than one officer filling in
 * a form, which is why they live here instead of in the per-loan action panel:
 *   step 7  — the secretary convenes a meeting, seats members and fixes quorum
 *   step 8  — seated members vote on each tabled application
 *   step 10 — the secretary issues the protocol, releasing the application onward
 *
 * Quorum and majority are re-evaluated server-side by
 * /api/loans/[id]/workflow before the protocol transition is allowed, so nothing
 * here is the security boundary — the tallies shown are an honest preview of a
 * decision the server makes again on its own.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Gavel, Loader2, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { requiredQuorum, toUsd } from '@/lib/workflow/fkg-scheme'
import { MeetingCard } from '@/components/committee/meeting-card'
import type { CommitteeMeeting, CommitteeMember, TabledLoan } from '@/components/committee/types'

export default function CommitteePage() {
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [meetings, setMeetings] = useState<CommitteeMeeting[]>([])
  const [awaiting, setAwaiting] = useState<TabledLoan[]>([])
  const [members, setMembers] = useState<CommitteeMember[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ meeting_no: '', scheduled_at: '', quorum: '5' })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id ?? null
    setMyId(uid)

    if (uid) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role:roles(code)')
        .eq('id', uid)
        .maybeSingle()
      const r = profile?.role as { code?: string } | null
      setMyRole(r?.code ?? null)
    }

    // Everyone eligible to sit on the committee, so the secretary can seat them.
    const { data: memberRows, error: memberErr } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role:roles(code, name_en)')
      .eq('is_active', true)

    // Surface this instead of swallowing it. An empty member list and a failed
    // query look identical in the UI ("No members seated yet"), which would
    // leave a secretary unable to seat anyone with no idea why.
    if (memberErr) setError(`Could not load eligible members: ${memberErr.message}`)

    setMembers(
      ((memberRows ?? []) as unknown as CommitteeMember[]).filter((m) => {
        const code = (m.role as { code?: string } | null)?.code ?? ''
        return code.startsWith('kkg_') || code.startsWith('prsf_') || code === 'super_admin'
      }),
    )

    const { data: meetingRows } = await supabase
      .from('committee_meetings')
      .select(
        `id, meeting_no, scheduled_at, held_at, required_quorum, chaired_by, secretary_id,
         protocol_no, protocol_date, protocol_notes, status,
         seats:committee_meeting_members(id, member_id, is_chair, attended),
         items:committee_agenda_items(
           id, loan_id, outcome, recommended_amount, recommended_coverage, conditions, decided_at,
           loan:loan_applications(id, application_number, loan_number, status, guarantee_amount, approved_amount, usd_rate, amount_usd),
           votes:committee_votes(id, member_id, vote, comment, voted_at)
         )`,
      )
      .order('scheduled_at', { ascending: false })

    setMeetings((meetingRows ?? []) as unknown as CommitteeMeeting[])

    // Applications that have cleared Credit Risk and are waiting to be tabled.
    const { data: loanRows } = await supabase
      .from('loan_applications')
      .select('id, application_number, loan_number, status, guarantee_amount, approved_amount, usd_rate, amount_usd')
      .in('status', ['kkg_scheduled'])
      .order('created_at', { ascending: true })

    setAwaiting((loanRows ?? []) as unknown as TabledLoan[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  const isSecretary = myRole === 'kkg_secretary' || myRole === 'super_admin' || myRole === 'prsf_admin'

  async function createMeeting() {
    if (!form.meeting_no.trim() || !form.scheduled_at) {
      toast({
        title: 'Missing details',
        description: 'A meeting number and a scheduled date are both required.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    const { error } = await supabase.from('committee_meetings').insert({
      meeting_no: form.meeting_no.trim(),
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      required_quorum: Number.parseInt(form.quorum, 10) || 5,
      secretary_id: myId,
      status: 'scheduled',
    })
    setBusy(false)

    if (error) {
      toast({ title: 'Could not create the meeting', description: error.message, variant: 'destructive' })
      return
    }
    setCreating(false)
    setForm({ meeting_no: '', scheduled_at: '', quorum: '5' })
    toast({ title: 'Meeting convened', description: 'Seat members and table applications next.' })
    await load()
  }

  // The strictest quorum any waiting application would demand, so the default
  // the secretary is offered is never lower than the scheme requires.
  const suggestedQuorum = awaiting.length
    ? Math.max(
        ...awaiting.map((l) =>
          requiredQuorum(l.amount_usd ?? toUsd(l.guarantee_amount ?? l.approved_amount, l.usd_rate)),
        ),
      )
    : 5

  return (
    <div className="p-4 lg:p-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Gavel className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            ККГ Meetings
          </h1>
          <p className="text-sm text-muted-foreground">
            Steps 7, 8 and 10 of the guarantee-issuance scheme — convening, voting and the protocol.
          </p>
        </div>
        {isSecretary && (
          <Button
            size="sm"
            onClick={() => {
              setForm((f) => ({ ...f, quorum: String(suggestedQuorum) }))
              setCreating(true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Convene meeting
          </Button>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {!isSecretary && myRole !== 'kkg_member' && (
        <p className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          You are not seated on the committee, so this page is read-only for you.
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {awaiting.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Awaiting a sitting ({awaiting.length})</CardTitle>
                <CardDescription className="text-xs">
                  Cleared Credit Risk (step 6) and waiting to be tabled. Each carries its own quorum
                  requirement, shown below.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {awaiting.map((l) => {
                  const usd = l.amount_usd ?? toUsd(l.guarantee_amount ?? l.approved_amount, l.usd_rate)
                  return (
                    <Badge key={l.id} variant="outline" className="font-normal">
                      {l.application_number ?? l.loan_number ?? l.id.slice(0, 8)} · quorum{' '}
                      {requiredQuorum(usd)}
                      {usd == null && ' (FX unknown)'}
                    </Badge>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {meetings.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No ККГ meetings have been convened yet.
              </CardContent>
            </Card>
          ) : (
            meetings.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                allMembers={members}
                awaiting={awaiting}
                myId={myId}
                myRole={myRole}
                onChanged={load}
              />
            ))
          )}
        </div>
      )}

      {/* ── Step 7: convene ── */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convene a ККГ meeting — step 7</DialogTitle>
            <DialogDescription>
              Quorum is fixed when the meeting is convened, not when it votes, so the threshold cannot
              be lowered after the votes are known.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-no">Meeting number</Label>
              <Input
                id="meeting-no"
                value={form.meeting_no}
                onChange={(e) => setForm((f) => ({ ...f, meeting_no: e.target.value }))}
                placeholder="e.g. ККГ-2026-07"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-when">Scheduled for</Label>
              <Input
                id="meeting-when"
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-quorum">Required quorum</Label>
              <Input
                id="meeting-quorum"
                type="number"
                min={1}
                value={form.quorum}
                onChange={(e) => setForm((f) => ({ ...f, quorum: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {awaiting.length
                  ? `The applications waiting to be tabled require at least ${suggestedQuorum}.`
                  : 'No applications are waiting; 5 is the stricter default.'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={createMeeting} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Convene
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
