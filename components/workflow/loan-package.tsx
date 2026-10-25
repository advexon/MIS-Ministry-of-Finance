'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/contexts/permission-context'
import type { LoanApplication } from '@/lib/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function LoanPackage({ loan, onChanged }: { loan: LoanApplication; onChanged: () => void }) {
  const { user, role } = usePermissions()
  const [response, setResponse] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data, error: loadError, mutate } = useSWR(['loan-package', loan.id, loan.status, user?.id], async () => {
    const supabase = createClient()
    const [files, history, assignee] = await Promise.all([
      supabase.from('loan_documents').select('id,file_name,file_path,created_at').eq('loan_id', loan.id).order('created_at', { ascending: false }),
      supabase.from('loan_application_history').select('id,notes,new_status,created_at').eq('loan_id', loan.id).order('created_at', { ascending: false }).limit(15),
      loan.assigned_analyst_id ? supabase.from('profiles').select('first_name,last_name').eq('id', loan.assigned_analyst_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    if (files.error || history.error || assignee.error) throw new Error('Could not load application evidence')
    return { files: files.data ?? [], history: history.data ?? [], assignee: assignee.data }
  })
  const canRespond = ['bank_admin', 'bank_officer'].includes(role?.code ?? '') && ['draft', 'docs_incomplete'].includes(loan.status)

  async function upload(file: File, input: HTMLInputElement) {
    if (!user?.id || !canRespond) return
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Choose a PDF, JPG or PNG up to 10 MB.'); input.value = ''; return }
    setBusy(true); setError(null)
    const supabase = createClient()
    const extension = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg'
    const path = `${loan.id}/${crypto.randomUUID()}.${extension}`
    try {
      const { error: uploadError } = await supabase.storage.from('loan-documents').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) throw new Error('The document could not be uploaded.')
      const { error: recordError } = await supabase.from('loan_documents').insert({ loan_id: loan.id, document_type: 'supporting_document', file_name: file.name, file_path: path, file_size: file.size, uploaded_by: user.id })
      if (recordError) {
        await supabase.storage.from('loan-documents').remove([path])
        throw new Error('The attachment record could not be saved. Retry the upload.')
      }
      await mutate()
    } catch (error) { setError(error instanceof Error ? error.message : 'Upload failed') }
    finally { setBusy(false); input.value = '' }
  }

  async function saveResponse() {
    setBusy(true); setError(null)
    try {
      const { error } = await createClient().from('loan_applications').update({ notes: response.trim() }).eq('id', loan.id).eq('status', loan.status).select('id').single()
      if (error) throw new Error('The response was not saved. Refresh if the application changed.')
      setResponse(''); onChanged()
    } catch (error) { setError(error instanceof Error ? error.message : 'Response failed') }
    finally { setBusy(false) }
  }

  async function openFile(path: string) {
    setError(null)
    const { data, error } = await createClient().storage.from('loan-documents').createSignedUrl(path, 60)
    if (error || !data) { setError('Document could not be opened.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const request = data?.history.find((entry) => entry.new_status === 'docs_incomplete')
  return <Card><CardHeader><CardTitle>Application package and bank response</CardTitle><CardDescription>{data?.assignee ? `Assigned analyst: ${[data.assignee.first_name, data.assignee.last_name].filter(Boolean).join(' ')}` : 'The operations analyst is assigned automatically after bank submission.'}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
    {(error || loadError) && <p role="alert" className="text-sm text-destructive">{error ?? 'Could not load application evidence.'}</p>}
    {loan.status === 'docs_incomplete' && request?.notes && <section aria-label="Requested clarification" className="flex flex-col gap-1"><h3 className="text-sm font-medium">Requested by MIS</h3><p className="whitespace-pre-wrap text-sm">{request.notes}</p></section>}
    {loan.notes && <p className="whitespace-pre-wrap text-sm">Bank notes: {loan.notes}</p>}
    <ul className="flex flex-col gap-2">{data?.files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3"><span className="break-all text-sm">{file.file_name}</span><Button size="sm" variant="outline" onClick={() => void openFile(file.file_path)}>Open document</Button></li>)}</ul>
    {data?.files.length === 0 && <p className="text-sm text-muted-foreground">No documents attached yet.</p>}
    {canRespond && <fieldset disabled={busy} className="flex flex-col gap-3"><Label htmlFor={`package-upload-${loan.id}`}>Attach documents (PDF, JPG, PNG; up to 10 MB each)</Label><Input id={`package-upload-${loan.id}`} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void upload(file, event.currentTarget) }} /><Label htmlFor={`bank-response-${loan.id}`}>Bank explanation or clarification</Label><Textarea id={`bank-response-${loan.id}`} rows={3} maxLength={4000} value={response} onChange={(event) => setResponse(event.target.value)} /><Button className="self-start" variant="outline" disabled={busy || !response.trim()} onClick={() => void saveResponse()}>Save bank response</Button><p className="text-sm text-muted-foreground">Save the response and attachments, then use the workflow action to submit the package.</p></fieldset>}
    <details><summary className="cursor-pointer text-sm font-medium">Recent workflow history</summary><ol className="flex flex-col gap-3 py-3">{data?.history.map((entry) => <li key={entry.id} className="text-sm"><span className="font-medium">{entry.new_status?.replaceAll('_', ' ')}</span><p className="whitespace-pre-wrap text-muted-foreground">{entry.notes}</p><time className="text-muted-foreground" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></li>)}</ol></details>
  </CardContent></Card>
}
