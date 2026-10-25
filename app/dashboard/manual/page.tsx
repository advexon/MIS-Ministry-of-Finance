import type { Metadata } from 'next'
import { UserManual } from '@/components/dashboard/user-manual'

export const metadata: Metadata = {
  title: 'User Manual | Credit Guarantee Fund MIS',
  description: 'Practical guidance for bank officers, bank managers and Fund staff: loan applications, guarantee requests, reporting, claims and troubleshooting.',
}

export default function UserManualPage() {
  return <UserManual />
}
