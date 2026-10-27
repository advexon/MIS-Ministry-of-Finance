'use client'

import { useId, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/context'
import { usePermissions } from '@/lib/contexts/permission-context'
import { createClient } from '@/lib/supabase/client'
import { BANK_DIRECTORY_COPY } from '@/lib/admin/bank-directory'
import { canAdministerProducts, confirmsProductSave, EMPTY_PRODUCT, PRODUCT_COPY, productValues, type ProductRecord } from '@/lib/admin/product-administration'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

interface Props {
  record?: ProductRecord
  available: boolean
  refreshing: boolean
  refresh: () => Promise<ProductRecord[]>
}

export function ProductEditor({ record, available, refreshing, refresh }: Props) {
  const { locale } = useI18n()
  const common = BANK_DIRECTORY_COPY[locale]
  const copy = PRODUCT_COPY[locale]
  const { profile, role } = usePermissions()
  const allowed = canAdministerProducts(profile, role)
  const { toast } = useToast()
  const prefix = useId()
  const inFlight = useRef(false)
  const requestId = useRef('')
  const [revision, setRevision] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_PRODUCT)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState<keyof typeof copy | null>(null)
  const stale = open && !!record && record.administration_revision !== revision
  const disabled = busy || refreshing || !available || !allowed

  const changeOpen = (next: boolean) => {
    if (inFlight.current || (next && (!available || refreshing || !allowed))) return
    if (next) {
      requestId.current = record?.id ?? crypto.randomUUID()
      setRevision(record?.administration_revision ?? null)
      setDraft(record ? { code: record.code, name_en: record.name_en, name_ru: record.name_ru ?? '', name_tj: record.name_tj ?? '', guarantee_coverage: record.guarantee_coverage === null ? '' : String(record.guarantee_coverage), is_active: record.is_active === true } : EMPTY_PRODUCT)
      setReason(''); setConfirmed(false); setDeleting(false); setUncertain(false); setError(null)
    }
    setOpen(next)
  }

  const reload = async () => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true)
    try {
      const rows = await refresh()
      const current = rows.find(item => item.id === requestId.current)
      if ((record && current?.administration_revision !== revision) || (!record && current)) {
        setUncertain(true); setError(record ? 'stale' : 'review')
      } else { setUncertain(false); setError(null) }
    } catch { setError('refreshFailedDraft') }
    finally { inFlight.current = false; setBusy(false) }
  }

  const submit = async () => {
    if (inFlight.current || refreshing || !allowed || !available || uncertain || stale || !confirmed) return
    const values = productValues(draft)
    if ((!deleting && !values) || reason.trim().length < 3 || reason.trim().length > 2000) { setError('invalid'); return }
    inFlight.current = true; setBusy(true); setError(null)
    try {
      const { data, error: rpcError } = await createClient().rpc('cgf_save_product', {
        p_id: requestId.current, p_values: deleting ? {} : values,
        p_expected_revision: revision, p_reason: reason.trim(), p_delete: deleting,
      })
      if (rpcError) {
        const key = rpcError.code === '40001' ? 'stale' : rpcError.code === '23503' ? 'linked' : rpcError.code === '23505' ? 'duplicate' : rpcError.code === '23514' || rpcError.code === '42501' ? 'failed' : 'review'
        setError(key); setUncertain(key === 'stale' || key === 'review'); return
      }
      if (!confirmsProductSave(data, requestId.current, revision, values, deleting)) {
        setError('review'); setUncertain(true); return
      }
      toast({ title: copy.saved }); setOpen(false)
      try { await refresh() }
      catch { toast({ title: copy.refreshFailed, variant: 'destructive' }) }
    } catch { setError('review'); setUncertain(true) }
    finally { inFlight.current = false; setBusy(false) }
  }

  if (!allowed) return null
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant={record ? 'outline' : 'default'} disabled={!available || refreshing}>{record ? copy.edit : copy.add}</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={event => { if (busy) event.preventDefault() }} onPointerDownOutside={event => { if (busy) event.preventDefault() }}>
      <DialogHeader><DialogTitle>{deleting ? common.remove : record ? copy.edit : copy.add}</DialogTitle><DialogDescription>{deleting ? copy.removeDescription : copy.description}</DialogDescription></DialogHeader>
      <FieldGroup>
        {deleting ? <p className="text-sm font-medium">{record?.code} — {record?.name_en}</p> : <>
          {(['code', 'name_en', 'name_ru', 'name_tj'] as const).map(field => <Field key={field} data-disabled={disabled}>
            <FieldLabel htmlFor={`${prefix}-${field}`}>{common[field]}{field === 'code' || field === 'name_en' ? ' *' : ''}</FieldLabel>
            <Input id={`${prefix}-${field}`} value={draft[field]} disabled={disabled} maxLength={field === 'code' ? 50 : 255} onChange={event => { setDraft(previous => ({ ...previous, [field]: event.target.value })); setConfirmed(false) }} />
          </Field>)}
          <Field data-disabled={disabled}><FieldLabel htmlFor={`${prefix}-coverage`}>{copy.coverage} *</FieldLabel><Input id={`${prefix}-coverage`} type="number" min="0.01" max="100" step="0.01" value={draft.guarantee_coverage} disabled={disabled} onChange={event => { setDraft(previous => ({ ...previous, guarantee_coverage: event.target.value })); setConfirmed(false) }} /></Field>
          <Field data-disabled={disabled}><div className="flex items-center gap-3"><Checkbox id={`${prefix}-active`} checked={draft.is_active} disabled={disabled} onCheckedChange={checked => { setDraft(previous => ({ ...previous, is_active: checked === true })); setConfirmed(false) }} /><FieldLabel htmlFor={`${prefix}-active`}>{common.active}</FieldLabel></div></Field>
          {record && <dl className="flex flex-col gap-2 text-sm text-muted-foreground"><div><dt>{copy.legacyUpfront}</dt><dd>{record.upfront_fee_rate ?? '—'}</dd></div><div><dt>{copy.legacyQuarterly}</dt><dd>{record.quarterly_fee_rate ?? '—'}</dd></div></dl>}
        </>}
        <Field data-disabled={disabled}><FieldLabel htmlFor={`${prefix}-reason`}>{common.reason} *</FieldLabel><Textarea id={`${prefix}-reason`} value={reason} maxLength={2000} disabled={disabled} onChange={event => { setReason(event.target.value); setConfirmed(false) }} /></Field>
        <Field data-disabled={disabled}><div className="flex items-start gap-3"><Checkbox id={`${prefix}-confirm`} checked={confirmed} disabled={disabled} onCheckedChange={value => setConfirmed(value === true)} /><FieldLabel htmlFor={`${prefix}-confirm`} className="leading-6">{common.confirm}</FieldLabel></div></Field>
        {(error || stale || !available) && <Alert variant="destructive" role="alert"><AlertDescription>{!available ? copy.loadFailed : stale ? copy.stale : error ? copy[error] : ''}</AlertDescription></Alert>}
      </FieldGroup>
      <DialogFooter className="flex-wrap gap-2">
        {record && <Button variant="outline" disabled={disabled} onClick={() => { setDeleting(value => !value); setConfirmed(false); setError(null) }}>{deleting ? common.back : common.remove}</Button>}
        <Button variant="outline" disabled={busy} onClick={() => void reload()}>{common.refresh}</Button>
        <Button variant="outline" disabled={busy} onClick={() => changeOpen(false)}>{common.cancel}</Button>
        <Button variant={deleting ? 'destructive' : 'default'} disabled={disabled || uncertain || stale || !confirmed} onClick={() => void submit()}>{busy ? common.saving : deleting ? common.remove : common.save}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
