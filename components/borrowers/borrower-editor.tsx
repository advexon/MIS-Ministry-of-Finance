'use client'

import { useId, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { usePermissions } from '@/lib/contexts/permission-context'
import { createClient } from '@/lib/supabase/client'
import { usePageQuery } from '@/lib/hooks/use-page-query'
import { getLocalizedName } from '@/lib/utils/localized-name'
import { BANK_DIRECTORY_COPY } from '@/lib/admin/bank-directory'
import { BORROWER_COPY, BORROWER_FIELDS, BORROWER_IDENTITY_FIELDS, BORROWER_LEGAL_TYPES, borrowerDraft, borrowerValues, canAdministerBorrowers, confirmsBorrowerSave, type BorrowerDirectoryRecord, type BorrowerField } from '@/lib/admin/borrower-administration'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  record: BorrowerDirectoryRecord
  available: boolean
  refreshing: boolean
  refresh: () => Promise<{ borrowers: BorrowerDirectoryRecord[]; total: number }>
  onClose: () => void
}
interface SectorOption { id: string; name_en: string; name_ru: string | null; name_tj: string | null; is_active: boolean; is_prohibited: boolean }

export function BorrowerEditor({ record, available, refreshing, refresh, onClose }: Props) {
  const { locale } = useI18n()
  const copy = BORROWER_COPY[locale]
  const common = BANK_DIRECTORY_COPY[locale]
  const { profile, role } = usePermissions()
  const allowed = canAdministerBorrowers(profile, role)
  const { toast } = useToast()
  const prefix = useId()
  const [revision] = useState(record.administration_revision)
  const inFlight = useRef(false)
  const [draft, setDraft] = useState(() => borrowerDraft(record))
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<keyof typeof copy | null>(null)
  const loadSectors = async () => {
    const { data, error: queryError } = await createClient().from('sectors').select('id,name_en,name_ru,name_tj,is_active,is_prohibited').order('name_en')
    if (queryError) throw queryError
    return data as SectorOption[]
  }
  const { data: sectors, error: sectorError, isValidating: sectorsRefreshing, mutate: mutateSectors } = usePageQuery(allowed ? ['borrower-editor-sectors'] : null, loadSectors)
  const stale = revision !== record.administration_revision
  const linked = (record.applications?.[0]?.count ?? 0) > 0
  const unavailable = !available || Boolean(sectorError) || !sectors
  const disabled = busy || refreshing || sectorsRefreshing || unavailable || !allowed
  const changeField = (field: BorrowerField, value: string) => { setDraft(previous => ({ ...previous, [field]: value })); setConfirmed(false) }
  const close = () => { if (!inFlight.current) onClose() }

  const reload = async () => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true)
    try {
      const [rows] = await Promise.all([refresh(), mutateSectors(loadSectors(), { revalidate: false, throwOnError: true })])
      const current = rows.borrowers.find(item => item.id === record.id)
      if (!current || current.administration_revision !== revision) { setUncertain(true); setError('stale') }
      else { setUncertain(false); setError(null) }
    } catch { setUncertain(true); setError('unavailable') }
    finally { inFlight.current = false; setBusy(false) }
  }

  const submit = async () => {
    if (inFlight.current || disabled || uncertain || stale || !confirmed || (deleting && linked)) return
    const values = borrowerValues(draft, record)
    if ((!deleting && !values) || reason.trim().length < 3 || reason.trim().length > 2000) { setError('invalid'); return }
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const { data, error: rpcError } = await createClient().rpc('cgf_save_borrower', {
        p_id: record.id, p_values: deleting ? {} : values, p_expected_revision: revision, p_reason: reason.trim(), p_delete: deleting,
      })
      if (rpcError) {
        const key = rpcError.code === '40001' ? 'stale' : rpcError.code === '23503' ? 'linked' : rpcError.code === '23505' ? 'duplicate' : ['23514', '42501', '22007', '22008', '22P02'].includes(rpcError.code) ? 'failed' : 'review'
        setError(key); setUncertain(key === 'stale' || key === 'review'); return
      }
      if (!confirmsBorrowerSave(data, record.id, revision, values, deleting)) { setUncertain(true); setError('review'); return }
      toast({ title: copy.saved }); onClose()
      try { await refresh() }
      catch { toast({ title: copy.refreshFailed, variant: 'destructive' }) }
    } catch { setUncertain(true); setError('review') }
    finally { inFlight.current = false; setBusy(false) }
  }

  if (!allowed) return null
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => { if (busy) event.preventDefault() }}>
      <DialogHeader><DialogTitle>{deleting ? common.remove : copy.edit}</DialogTitle><DialogDescription>{deleting ? copy.removeDescription : copy.description}</DialogDescription></DialogHeader>
      <FieldGroup>
        {deleting ? <p className="text-sm font-medium">{record.name} — {record.tin_number || '—'}</p> : <>
          {linked && <p className="text-sm text-muted-foreground">{copy.linkedIdentity}</p>}
          <FieldGroup className="md:grid md:grid-cols-2">
          {(Object.keys(BORROWER_FIELDS) as BorrowerField[]).map(field => {
            const locked = disabled || (linked && BORROWER_IDENTITY_FIELDS.includes(field))
            const options = field === 'legal_type' ? BORROWER_LEGAL_TYPES.map(value => ({ value, label: copy[value] })) : field === 'legal_rep_gender' ? ['male', 'female'].map(value => ({ value, label: copy[value as 'male' | 'female'] })) : field === 'sector_id' ? (sectors ?? []).filter(sector => (sector.is_active && !sector.is_prohibited) || sector.id === record.sector_id).map(sector => ({ value: sector.id, label: getLocalizedName(sector, locale) })) : null
            const customValue = options && draft[field] && !options.some(option => option.value === draft[field])
            return <Field key={field} data-disabled={locked}>
              <FieldLabel htmlFor={`${prefix}-${field}`}>{copy[field]}{field === 'name' || field === 'legal_type' ? ' *' : ''}</FieldLabel>
              {options ? <Select value={draft[field] || '__none'} disabled={locked} onValueChange={value => changeField(field, value === '__none' ? '' : value)}>
                <SelectTrigger id={`${prefix}-${field}`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {field !== 'legal_type' && <SelectItem value="__none">{copy.none}</SelectItem>}
                  {customValue && <SelectItem value={draft[field]}>{draft[field]}</SelectItem>}
                  {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select> : <Input id={`${prefix}-${field}`} value={draft[field]} disabled={locked} maxLength={BORROWER_FIELDS[field]} type={field === 'legal_rep_birthdate' ? 'date' : field === 'workforce_count' ? 'number' : field === 'email' ? 'email' : 'text'} min={field === 'workforce_count' ? 0 : undefined} step={field === 'workforce_count' ? 1 : undefined} onChange={event => changeField(field, event.target.value)} />}
            </Field>
          })}
          </FieldGroup>
        </>}
        <Field data-disabled={disabled}><FieldLabel htmlFor={`${prefix}-reason`}>{common.reason} *</FieldLabel><Textarea id={`${prefix}-reason`} value={reason} maxLength={2000} disabled={disabled} onChange={event => { setReason(event.target.value); setConfirmed(false) }} /></Field>
        <Field data-disabled={disabled}><div className="flex items-start gap-3"><Checkbox id={`${prefix}-confirmed`} checked={confirmed} disabled={disabled} onCheckedChange={checked => setConfirmed(checked === true)} /><FieldLabel htmlFor={`${prefix}-confirmed`} className="leading-6">{common.confirm}</FieldLabel></div></Field>
        {(error || stale || unavailable) && <Alert variant="destructive"><AlertDescription>{unavailable ? copy.unavailable : stale ? copy.stale : error ? copy[error] : ''}</AlertDescription></Alert>}
      </FieldGroup>
      <DialogFooter className="flex-wrap gap-2">
        {!linked && <Button variant="outline" disabled={disabled} onClick={() => { setDeleting(value => !value); setConfirmed(false); setError(null) }}>{deleting ? common.back : common.remove}</Button>}
        <Button variant="outline" disabled={busy || refreshing || sectorsRefreshing} onClick={() => void reload()}>{common.refresh}</Button>
        <Button variant="outline" disabled={busy} onClick={close}>{common.cancel}</Button>
        <Button variant={deleting ? 'destructive' : 'default'} disabled={disabled || uncertain || stale || !confirmed} onClick={() => void submit()}>{busy ? common.saving : deleting ? common.remove : common.save}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
