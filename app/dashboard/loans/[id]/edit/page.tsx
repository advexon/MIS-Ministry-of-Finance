import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ApplicationForm } from '@/components/workflow/application-form'
import type { LoanApplication } from '@/lib/types/database'
import { Button } from '@/components/ui/button'

export default async function EditApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.from('loan_applications').select('*,borrower:borrowers(*)').eq('id', id).maybeSingle()
  if (error || !data) return <main className="flex flex-col items-start gap-4 p-6"><h1 className="text-xl font-semibold">Application could not be loaded</h1><p>It may be unavailable or outside your access. Return to the register and retry.</p><Button asChild variant="outline"><Link href="/dashboard/loans">Back to applications</Link></Button></main>
  return <ApplicationForm key={id} initialLoan={data as LoanApplication} />
}
