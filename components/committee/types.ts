/** Shared shapes for the ККГ committee UI (scheme steps 7, 8 and 10). */

export interface TabledLoan {
  id: string
  application_number: string | null
  loan_number: string | null
  status: string
  guarantee_amount: number | null
  approved_amount: number | null
  usd_rate: number | null
  amount_usd: number | null
}

export interface CommitteeMember {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  role: { code?: string; name_en?: string } | null
}

export interface Seat {
  id: string
  member_id: string
  is_chair: boolean | null
  attended: boolean | null
}

export type VoteValue = 'for' | 'against' | 'abstain'

export interface Vote {
  id: string
  member_id: string
  vote: VoteValue
  comment: string | null
  voted_at: string | null
}

export interface AgendaItem {
  id: string
  loan_id: string
  outcome: string | null
  recommended_amount: number | null
  recommended_coverage: number | null
  conditions: string | null
  decided_at: string | null
  loan: TabledLoan | null
  votes: Vote[]
}

export interface CommitteeMeeting {
  id: string
  meeting_no: string | null
  scheduled_at: string | null
  held_at: string | null
  required_quorum: number | null
  chaired_by: string | null
  secretary_id: string | null
  protocol_no: string | null
  protocol_date: string | null
  protocol_notes: string | null
  status: string | null
  seats: Seat[]
  items: AgendaItem[]
}

export function memberName(m: CommitteeMember | undefined): string {
  if (!m) return 'Unknown member'
  const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim()
  return name || m.email || m.id.slice(0, 8)
}
