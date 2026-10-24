export function notificationAge(iso: string, now: number | null): string {
  if (now === null) return '…'
  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown time'
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function isExpiringSoon(expiresAt: string, now: number): boolean {
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000)
  return daysLeft <= 7
}

export function delegationStatus(endsAt: string, revokedAt: string | null, now: number | null): string {
  if (revokedAt) return 'revoked'
  if (now === null) return 'checking status'
  return new Date(endsAt).getTime() <= now ? 'expired' : 'scheduled / active'
}
