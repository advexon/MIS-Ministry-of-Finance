'use client'

import { useId, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { usePermissions } from '@/lib/contexts/permission-context'
import { createClient } from '@/lib/supabase/client'
import { BANK_DIRECTORY_COPY, canAdministerBankDirectory, type BankDirectoryRecord } from '@/lib/admin/bank-directory'
import { useFieldRequirements } from '@/lib/hooks/use-field-requirements'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface Props {
  record?: BankDirectoryRecord
  bankId?: string
  onSaved: (record: BankDirectoryRecord | null) => void | Promise<unknown>
}

const initialFields = { code: '', name_en: '', name_ru: '', name_tj: '', city: '', district: '', is_active: true }

export function BankDirectoryEditor({ record, bankId, onSaved }: Props) {
  const { locale } = useI18n()
  const copy = BANK_DIRECTORY_COPY[locale]
  const { profile, role } = usePermissions()
  const { missingFields, isRequired } = useFieldRequirements('bank')
  const { toast } = useToast()
  const prefix = useId()
  const inFlight = useRef(false)
  const requestId = useRef('')
  const revision = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initialFields)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (!canAdministerBankDirectory(profile, role)) return null

  const title = bankId ? record ? copy.editBranch : copy.addBranch : record ? copy.editBank : copy.addBank
  const textFields = bankId ? ['code', 'name_en', 'name_ru', 'name_tj', 'city', 'district'] as const : ['code', 'name_en', 'name_ru', 'name_tj'] as const
  const changeOpen = (next: boolean) => {
    if (inFlight.current) return
    if (next) {
      requestId.current = record?.id ?? crypto.randomUUID()
      revision.current = record?.administration_revision ?? null
      setDraft(record ? { code: record.code, name_en: record.name_en, name_ru: record.name_ru ?? '', name_tj: record.name_tj ?? '', city: record.city ?? '', district: record.district ?? '', is_active: record.is_active === true } : initialFields)
      setReason(''); setConfirmed(false); setDeleting(false); setError('')
    }
    setOpen(next)
  }
  const submit = async () => {
    if (inFlight.current || !confirmed) return
    if (reason.trim().length < 3 || reason.trim().length > 2000 || (!deleting && (!draft.code.trim() || !draft.name_en.trim() || (!bankId && missingFields(draft).length)))) {
      setError(copy.invalid); return
    }
    inFlight.current = true; setSaving(true); setError('')
    const values = { code: draft.code.trim(), name_en: draft.name_en.trim(), name_ru: draft.name_ru.trim() || null, name_tj: draft.name_tj.trim() || null, is_active: draft.is_active, ...(bankId ? { city: draft.city.trim() || null, district: draft.district.trim() || null } : {}) }
    let savedRecord: BankDirectoryRecord | null = null
    try {
      const { data, error: rpcError } = await createClient().rpc('cgf_save_bank_directory', {
        p_resource: bankId ? 'bank_branches' : 'banks', p_id: requestId.current, p_bank_id: bankId ?? null,
        p_values: deleting ? {} : values, p_expected_revision: revision.current, p_reason: reason.trim(), p_delete: deleting,
      })
      if (rpcError) throw rpcError
      if (data?.id !== requestId.current || data?.deleted !== deleting || (!deleting && (data?.record?.id !== requestId.current || data?.record?.administration_revision !== (revision.current === null ? 0 : revision.current + 1) || (bankId && data.record.bank_id !== bankId)))) throw new Error(copy.unconfirmed)
      savedRecord = deleting ? null : data.record
    } catch (cause) {
      const failure = cause as { code?: string; message?: string }
      setError(failure.code === '40001' ? copy.stale : failure.code === '23503' ? copy.deleteDescription : failure.message ?? copy.failed)
      inFlight.current = false; setSaving(false); return
    }
    toast({ title: copy.saved })
    setOpen(false)
    try { await onSaved(savedRecord) }
    catch { toast({ title: copy.refreshFailed, variant: 'destructive' }) }
    finally { inFlight.current = false; setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant={record ? 'outline' : 'default'}>{title}</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={event => { if (saving) event.preventDefault() }} onPointerDownOutside={event => { if (saving) event.preventDefault() }}>
      <DialogHeader><DialogTitle>{deleting ? copy.remove : title}</DialogTitle><DialogDescription>{deleting ? copy.deleteDescription : copy.description}</DialogDescription></DialogHeader>
      <FieldGroup>
        {deleting ? <p className="text-sm font-medium">{record?.code} — {record?.name_en}</p> : <>
          {textFields.map(field => <Field key={field} data-disabled={saving}>
            <FieldLabel htmlFor={`${prefix}-${field}`}>{copy[field]}{field === 'code' || field === 'name_en' || (!bankId && isRequired(field)) ? ' *' : ''}</FieldLabel>
            <Input id={`${prefix}-${field}`} value={draft[field]} disabled={saving} maxLength={field === 'code' ? 50 : field === 'city' || field === 'district' ? 100 : 255} onChange={event => { setDraft(previous => ({ ...previous, [field]: event.target.value })); setConfirmed(false) }} />
          </Field>)}
          <Field data-disabled={saving}><div className="flex items-center gap-3"><Checkbox id={`${prefix}-active`} checked={draft.is_active} disabled={saving} onCheckedChange={checked => { setDraft(previous => ({ ...previous, is_active: checked === true })); setConfirmed(false) }} /><FieldLabel htmlFor={`${prefix}-active`}>{copy.active}</FieldLabel></div></Field>
        </>}
        <Field data-disabled={saving}><FieldLabel htmlFor={`${prefix}-reason`}>{copy.reason} *</FieldLabel><Textarea id={`${prefix}-reason`} maxLength={2000} value={reason} disabled={saving} onChange={event => { setReason(event.target.value); setConfirmed(false) }} /></Field>
        <Field data-disabled={saving}><div className="flex items-start gap-3"><Checkbox id={`${prefix}-confirm`} checked={confirmed} disabled={saving} onCheckedChange={value => setConfirmed(value === true)} /><FieldLabel htmlFor={`${prefix}-confirm`} className="leading-6">{copy.confirm}</FieldLabel></div></Field>
        {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
      </FieldGroup>
      <DialogFooter className="flex-wrap gap-2">
        {record && <Button variant="outline" disabled={saving} onClick={() => { setDeleting(value => !value); setConfirmed(false); setError('') }}>{deleting ? copy.back : copy.remove}</Button>}
        <Button variant="outline" disabled={saving} onClick={() => changeOpen(false)}>{copy.cancel}</Button>
        <Button variant={deleting ? 'destructive' : 'default'} disabled={saving || !confirmed || reason.trim().length < 3} onClick={submit}>{saving ? copy.saving : deleting ? copy.remove : copy.save}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
