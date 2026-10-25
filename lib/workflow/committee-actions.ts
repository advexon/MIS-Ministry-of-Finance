import type { CommitteeMeeting } from '@/components/committee/types'

export function confirmCommitteeReceipt(receipt: unknown, expectedId?: string): string {
  if (typeof receipt !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt) || (expectedId && receipt !== expectedId)) {
    throw new Error('The action was not confirmed. Refresh the register before retrying; it may already have been saved.')
  }
  return receipt
}

export function committeeReadiness(meeting: CommitteeMeeting, isClaim = false) {
  const attended = meeting.seats.filter((seat) => seat.attended).length
  const signed = meeting.seats.filter((seat) => seat.signed_at).length
  const readyApplications = meeting.items.every((item) => isClaim || item.loan?.status === 'kkg_review')
  const unanimous = meeting.items.length > 0 && meeting.items.every((item) => {
    const votes = meeting.seats.map((seat) => item.votes.find((vote) => vote.member_id === seat.member_id)?.vote)
    return votes.length > 0 && votes.every((vote) => vote === 'for' || vote === 'against') && new Set(votes).size === 1
  })
  return {
    attended,
    signed,
    readyApplications,
    canPrepare: readyApplications && unanimous && attended === meeting.seats.length && meeting.seats.length >= (meeting.required_quorum ?? 1),
    allSigned: meeting.seats.length > 0 && signed === meeting.seats.length,
  }
}
