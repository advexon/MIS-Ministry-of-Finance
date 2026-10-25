import type { LoanApplication } from '@/lib/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ApplicationSnapshot({ loan }: { loan: LoanApplication }) {
  const snapshot = loan.intake_data
  if (!snapshot || Object.keys(snapshot).length === 0) return null
  return <Card><CardHeader><CardTitle>Saved application details</CardTitle><CardDescription>Application-specific borrower, financial and collateral evidence. Shared borrower-directory details are not overwritten. Revision {loan.intake_revision ?? 0}.</CardDescription></CardHeader><CardContent><details><summary className="cursor-pointer text-sm font-medium">View all submitted fields</summary><dl className="grid gap-4 py-4 sm:grid-cols-2">{Object.entries(snapshot).map(([key, value]) => <div key={key} className="flex min-w-0 flex-col gap-1"><dt className="text-sm text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</dt><dd className="break-words whitespace-pre-wrap text-sm">{Array.isArray(value) ? value.map(item => [item.name, item.id_number, item.relationship].filter(Boolean).join(' · ')).filter(Boolean).join('\n') || '—' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : value || '—'}</dd></div>)}</dl></details></CardContent></Card>
}
