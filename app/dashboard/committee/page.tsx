'use client'

/** Sitting composition and authorization are enforced in transactional RPCs, not UI controls. */
import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Gavel, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { MeetingCard } from '@/components/committee/meeting-card'
import type { CommitteeMeeting, CommitteeMember, TabledLoan } from '@/components/committee/types'
import { canServeAsSecretary } from '@/lib/employee-flags'
import { usePermissions } from '@/lib/contexts/permission-context'
import { one } from '@/lib/utils/supabase-relation'

async function loadCommitteeRegister() {
  const supabase = createClient()
  const [members, meetings, loans] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, email, role:roles(code, name_en)'),
    supabase.from('committee_meetings').select(`id, meeting_no, scheduled_at, held_at, required_quorum, chaired_by, secretary_id, protocol_no, protocol_date, protocol_notes, protocol_snapshot, status, due_at, escalated_at,
      seats:committee_meeting_members(id, member_id, is_chair, attended, signed_at),
      items:committee_agenda_items(id, loan_id, outcome, recommended_amount, recommended_coverage, conditions, decided_at,
      loan:loan_applications(id, loan_number, status, guarantee_amount, approved_amount, usd_rate, amount_usd), votes:committee_votes(id, member_id, vote, comment, voted_at))`).order('created_at', { ascending: false }),
    supabase.from('loan_applications').select('id, loan_number, status, guarantee_amount, approved_amount, usd_rate, amount_usd').in('status', ['kkg_scheduled', 'kkg_review', 'verification', 'rejected']).order('created_at'),
  ])
  const error = members.error ?? meetings.error ?? loans.error
  if (error) throw new Error(error.message)
  const normalized = (meetings.data ?? []).map((meeting) => ({ ...meeting, items: meeting.items.map((item) => ({ ...item, loan: one<TabledLoan>(item.loan) })) })) as CommitteeMeeting[]
  const openLoanIds = new Set(normalized.filter((meeting) => !['closed', 'protocol_issued', 'cancelled'].includes(meeting.status ?? '')).flatMap((meeting) => meeting.items.map((item) => item.loan_id)))
  return {
    members: (members.data ?? []).map((member) => ({ ...member, role: one<NonNullable<CommitteeMember['role']>>(member.role) })) as CommitteeMember[],
    meetings: normalized,
    awaiting: (loans.data ?? []).filter((loan) => !openLoanIds.has(loan.id)) as TabledLoan[],
  }
}

export default function CommitteePage() {
  const { profile, role, user } = usePermissions()
  const { toast } = useToast()
  const { data, error, isLoading, mutate } = useSWR(user?.id ? ['committee-register', user.id] : null, loadCommitteeRegister)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ meeting_no: '', loan_id: '' })
  const secretary = canServeAsSecretary(role?.code, profile ?? {})

  async function createMeeting() {
    setBusy(true)
    try {
      const { error } = await createClient().rpc('cgf_committee_action', { p_action: 'create', p_data: form })
      if (error) throw error
      setCreating(false)
      setForm({ meeting_no: '', loan_id: '' })
      await mutate()
      toast({ title: 'Sitting convened', description: 'The system assigned members and chair, and opened the application for voting.' })
    } catch (error) {
      toast({ title: 'Could not convene sitting', description: error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Request failed', variant: 'destructive' })
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2"><h1 className="flex items-center gap-2 text-xl font-semibold"><Gavel className="size-5" aria-hidden="true" />Committee sittings</h1><p className="max-w-3xl text-sm text-muted-foreground">System-selected operations members, unanimous decisions, all-member signatures and immutable protocols. Each reconsideration has a new sitting.</p></div>
        {secretary && <Button onClick={() => setCreating(true)} disabled={!data?.awaiting.length}>Convene sitting</Button>}
      </header>
      {error && <Alert variant="destructive"><AlertDescription>{error instanceof Error ? error.message : 'Could not load the committee register'}</AlertDescription></Alert>}
      {isLoading ? <Skeleton className="h-40" /> : !data?.meetings.length ? <Card><CardHeader><CardTitle>No sittings yet</CardTitle><CardDescription>The secretary can convene a sitting after Credit Risk review.</CardDescription></CardHeader><CardContent>Membership is selected by the system, not manually seated.</CardContent></Card> : data.meetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} allMembers={data.members} myId={user?.id ?? null} myRole={role?.code ?? null} secretaryAuthorized={secretary} onChanged={() => mutate()} />)}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent><DialogHeader><DialogTitle>Convene an application sitting</DialogTitle><DialogDescription>The system selects 2–3 flagged operations employees without product restrictions, adds the Director above the configured threshold and chooses the senior chair. Voting is due in one working day.</DialogDescription></DialogHeader>
          <fieldset className="flex flex-col gap-3" disabled={busy}><Label htmlFor="meeting-number">Meeting number</Label><Input id="meeting-number" maxLength={100} value={form.meeting_no} onChange={(event) => setForm((current) => ({ ...current, meeting_no: event.target.value }))} /><Label htmlFor="meeting-case">Application</Label><Select value={form.loan_id} onValueChange={(loan_id) => setForm((current) => ({ ...current, loan_id }))}><SelectTrigger id="meeting-case"><SelectValue placeholder="Choose an application" /></SelectTrigger><SelectContent><SelectGroup>{data?.awaiting.map((loan) => <SelectItem key={loan.id} value={loan.id}>{loan.loan_number ?? loan.id.slice(0, 8)} · {loan.status === 'rejected' ? 'reconsideration' : loan.status.replaceAll('_', ' ')}</SelectItem>)}</SelectGroup></SelectContent></Select></fieldset>
          <DialogFooter><Button variant="outline" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button><Button onClick={() => void createMeeting()} disabled={busy || !form.meeting_no.trim() || !form.loan_id}>{busy && <Loader2 data-icon="inline-start" className="animate-spin" />}Convene and select members</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
