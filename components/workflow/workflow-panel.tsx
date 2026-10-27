'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

/**
 * Action panel for the ФКГ issuance scheme (steps 1-4 implemented here).
 *
 * Every action posts to /api/loans/[id]/workflow, which re-validates the
 * transition server-side. The buttons shown here are a convenience, not the
 * security boundary — hiding a button never grants or denies a permission.
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Loader2, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

import type { LoanApplication, LoanStatus } from '@/lib/types/database'
import {
  STEP_BY_STATUS, canActOnStep, getNextStatuses, requiresAssessment, toUsd,
  ASSESSMENT_THRESHOLD_USD, statusLabel,
} from '@/lib/workflow/fkg-scheme'
import { STEP_FORMS, StepArtifactForm } from '@/components/workflow/step-forms'
import { usePermissions } from '@/lib/contexts/permission-context'
import { useAuthorityReason } from '@/components/admin/authority-reason-provider'

interface Props {
  loan: LoanApplication
  roleCode: string | null
  onDone?: () => void | Promise<void>
}

type DialogKind = 'uko' | 'eligibility' | 'return' | null

export function WorkflowPanel({ loan, roleCode, onDone }: Props) {
  const uiText = useUiTranslation()

  const router = useRouter()
  const { profile } = usePermissions()
  const requestAuthorityReason = useAuthorityReason()
  const status = loan.status as LoanStatus
  const step = STEP_BY_STATUS[status]

  const [dialog, setDialog] = useState<DialogKind>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  // Steps 5, 6, 9, 11, 12, 13 and 15 each record an artefact before moving on.
  // They share one declarative renderer so the field and transition rules live
  // in a single reviewable table rather than seven near-identical forms.
  const [artifactOpen, setArtifactOpen] = useState(false)
  const artifactForm = STEP_FORMS[status]

  // Step 2 fields
  const [ref, setRef] = useState('')
  const [rate, setRate] = useState('')
  // Step 4 fields
  const [elig, setElig] = useState({ eligible: false, esms: false, kyc: false, sanctions: false, docs: false })
  const [findings, setFindings] = useState('')
  // Step 3 fields
  const [missing, setMissing] = useState('')

  // The Guideline's threshold applies to the guarantee, so the guarantee amount
  // is the basis; the approved loan amount is only a fallback.
  const amount = loan.guarantee_amount ?? loan.approved_amount ?? null
  const parsedRate = Number.parseFloat(rate)
  const previewUsd = Number.isFinite(parsedRate) && parsedRate > 0 ? toUsd(amount, parsedRate) : null
  const knownUsd = loan.amount_usd ?? toUsd(amount, loan.usd_rate)
  const needsAssessment = requiresAssessment(knownUsd)

  const isAssigned = !loan.assigned_analyst_id || loan.assigned_analyst_id === profile?.id || roleCode !== 'prsf_analyst' || status === 'verification'
  const canAct = (step ? canActOnStep(roleCode, step, profile ?? {}) : false) && isAssigned
  const nextStatuses = getNextStatuses(status).filter((s) => s !== 'cancelled')

  async function post(to: LoanStatus, payload?: Record<string, unknown>, reason?: string, screening?: typeof elig) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const authorityReason = await requestAuthorityReason()
      const res = await fetch(`/api/loans/${loan.id}/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: status, to, payload, reason: authorityReason && reason ? `${authorityReason}\n${reason}` : authorityReason ?? reason, screening }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'The transition was refused.')
        return
      }
      if (json?.ok !== true || json?.from !== status || ![to, 'rejected'].includes(json?.to)) throw new Error('Unconfirmed workflow receipt')
      setDialog(null)
      try { await onDone?.(); router.refresh() } catch { setError('The workflow action was saved, but refresh failed. Reload before continuing.') }
    } catch {
      setError('The workflow result could not be confirmed. Refresh to check the saved state before retrying.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  /** Step 2: register, capturing the FX rate the USD gates depend on. */
  async function submitUko() {
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError('Enter the TJS/USD rate. The 10,000 USD gate cannot be evaluated without it.')
      return
    }
    await post('eligibility_review', {
      uko_reference_no: ref || null,
      usd_rate: parsedRate,
    }, `Registered by УКО${ref ? ` as ${ref}` : ''}; rate ${parsedRate} TJS/USD`)
  }

  /** Step 3: bounce an incomplete package back to the bank. */
  async function submitReturn() {
    if (!missing.trim()) {
      setError('List what is missing so the bank knows what to supply.')
      return
    }
    await post('docs_incomplete', undefined, `Returned to bank: ${missing}`, { ...elig, docs: false })
  }

  /** Step 4 / gate D: record the eligibility, ESMS and KYC screening. */
  async function submitEligibility() {
    if (!elig.docs) {
      if (!findings.trim()) { setError('List the missing documents or clarification needed.'); return }
      await post('docs_incomplete', undefined, findings, elig)
      return
    }
    const passed = elig.eligible && elig.esms && elig.kyc && elig.sanctions
    if (!passed && !findings.trim()) { setError('Explain the failed screening checks.'); return }
    await post(passed ? 'assessment' : 'ineligible', undefined, findings || 'All eligibility, ESMS, KYC and sanctions checks passed', elig)
  }

  // Legacy applications predate the scheme and sit in `under_review`, which is
  // not one of the 16 steps. They need an explicit way back onto the path.
  const isLegacy = status === 'under_review'
  const isStaff =
    roleCode != null &&
    ['prsf_analyst', 'super_admin'].includes(roleCode)

  if (isLegacy) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{uiText("Not yet on the ФКГ scheme")}</CardTitle>
          <CardDescription className="text-xs">{uiText("This application was created before the guarantee-issuance scheme was implemented, so it has no recorded УКО registration, FX rate or eligibility screening.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {uiText(error)}
            </p>
          )}
          {isStaff ? (
            <Button
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() => post('uko_registration', undefined, 'Moved onto the ФКГ scheme at step 2')}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{uiText("Move onto the scheme at step 2")}</Button>
          ) : (
            <p className="text-xs text-muted-foreground">{uiText("A УКО officer or PRSF staff member must place this application onto the scheme.")}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (status === 'draft') {
    return <Card><CardHeader><CardTitle>{uiText("Bank manager review")}</CardTitle><CardDescription>{uiText("The officer prepares the file; the bank manager checks it before submission. MIS then screens stop factors and assigns an operations analyst.")}</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{error && <p role="alert" className="text-sm text-destructive">{uiText(error)}</p>}{['super_admin', 'bank_admin', 'bank_officer'].includes(roleCode ?? '') ? <Button className="self-start" disabled={busy} onClick={() => void post('submitted', undefined, 'Bank reviewed and submitted the application')}>{busy ? uiText("Submitting…") : roleCode === 'bank_admin' ? uiText("Approve and submit to MIS") : uiText("Submit (manager approval required unless enabled by administrator)")}</Button> : <p className="text-sm text-muted-foreground">{uiText("Awaiting the originating bank manager.")}</p>}</CardContent></Card>
  }
  if (!step) {
    return loan.stop_factor_reason ? <Card><CardHeader><CardTitle>{uiText("Automatic stop-factor refusal")}</CardTitle><CardDescription>{loan.stop_factor_reason}</CardDescription></CardHeader></Card> : null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{uiText("Step ")}{step.step} · {uiText(step.titleEn)}
            </CardTitle>
            <CardDescription className="text-xs">
              {uiText("Guideline")} {step.guidelineRef}
            </CardDescription>
          </div>
          <Badge variant="outline">{uiText(statusLabel(status))}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* FX and gate-D state, so the routing decision is never invisible. */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span>{uiText("Amount:")}{' '}
            <span className="font-medium">
              {amount == null ? '—' : uiText("{0} TJS", amount.toLocaleString('en-US'))}
            </span>
          </span>
          <span>{uiText("USD equivalent:")}{' '}
            <span className="font-medium">
              {knownUsd == null ? uiText("not established") : `$${knownUsd.toFixed(2)}`}
            </span>
          </span>
          <span>{uiText("Assessment (step 5):")}{' '}
            <span className="font-medium">
              {needsAssessment === null ? uiText("undetermined") : needsAssessment ? uiText("mandatory") : uiText("not required")}
            </span>
          </span>
        </div>

        {knownUsd == null && (
          <p className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{uiText("The TJS/USD rate has not been recorded, so the 10,000 USD routing gate cannot be evaluated yet.")}</p>
        )}

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {uiText(error)}
          </p>
        )}

        {!canAct ? (
          <p className="text-xs text-muted-foreground">
            {!isAssigned ? uiText("This application belongs to another assigned analyst.") : ''}{uiText("This step belongs to")} {step.actors.map((actor) => uiText(actor)).join(', ')}{uiText(". Your role")}{roleCode ? ` (${roleCode})` : ''}{uiText(" cannot act on it.")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {status === 'submitted' && (
              <Button size="sm" onClick={() => void post('uko_registration', undefined, 'Assigned analyst started registration')} disabled={busy}>{uiText("Register request (step 2) ")}<ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {status === 'uko_registration' && (
              <>
                <Button size="sm" onClick={() => setDialog('uko')} disabled={busy}>{uiText("Accept and record FX ")}<ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDialog('return')} disabled={busy}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />{uiText(" Return to bank (step 3)")}</Button>
              </>
            )}
            {status === 'docs_incomplete' && (
              <Button size="sm" onClick={() => post(loan.clarification_return_status === 'assessment' ? 'assessment' : 'uko_registration', undefined, 'Bank resubmitted documents and clarification')} disabled={busy}>{uiText("Package resubmitted — re-register ")}<ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {status === 'eligibility_review' && (
              <Button size="sm" onClick={() => setDialog('eligibility')} disabled={busy}>{uiText("Record eligibility / ESMS / KYC ")}<ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {artifactForm && (
              <Button size="sm" onClick={() => setArtifactOpen(true)} disabled={busy}>
                {uiText(artifactForm.title)} <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {status === 'kkg_protocol' && <Button size="sm" disabled={busy} onClick={() => void post('formal_application', undefined, 'Signed protocol released for the formal application')}>{uiText("Proceed to formal application (step 11)")}</Button>}
            {status === 'assessment' && <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog('return')}>{uiText("Request documents from bank")}</Button>}
            {/* Steps 7, 8 and 10 are a multi-party committee sitting rather than a
                single officer's form, so they are handled on the ККГ meeting page. */}
            {(status === 'kkg_scheduled' || status === 'kkg_review' || status === 'kkg_protocol') && (
              <Button size="sm" variant="outline" asChild>
                <a href="/dashboard/committee">{uiText("Open ККГ meetings (steps 7-10)")}</a>
              </Button>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">{uiText("Permitted next states: ")}{nextStatuses.length ? nextStatuses.map((s) => uiText(statusLabel(s))).join(' · ') : uiText("none")}
        </p>
      </CardContent>

      {/* ── Step 2: УКО registration ── */}
      <Dialog open={dialog === 'uko'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText("Register request — step 2")}</DialogTitle>
            <DialogDescription>{uiText("The Guideline states its thresholds in USD while the loan is booked in TJS. The rate is stored on this application so the decision stays reproducible later.")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="uko-ref">{uiText("УКО reference number")}</Label>
              <Input id="uko-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={uiText("e.g. УКО-2026-0142")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="uko-rate">{uiText("TJS per 1 USD")}</Label>
              <Input
                id="uko-rate" type="number" step="0.0001" min="0"
                value={rate} onChange={(e) => setRate(e.target.value)} placeholder={uiText("e.g. 10.9500")}
              />
              <p className="text-xs text-muted-foreground">
                {previewUsd == null
                  ? uiText("Enter a rate to see the USD equivalent.")
                  : uiText("{0} TJS = ${1} — assessment {2}.", amount?.toLocaleString('en-US'), previewUsd.toFixed(2), uiText(requiresAssessment(previewUsd) ? 'mandatory' : 'not required'))}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>{uiText("Cancel")}</Button>
            <Button onClick={submitUko} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{uiText(" Register")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Step 3: return to bank ── */}
      <Dialog open={dialog === 'return'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText("Return package to bank — step 3")}</DialogTitle>
            <DialogDescription>{uiText("The application returns to the bank and re-enters at step 2 once completed.")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="missing">{uiText("Missing documents")}</Label>
            <Textarea
              id="missing" value={missing} onChange={(e) => setMissing(e.target.value)}
              placeholder={uiText("List each missing or deficient document…")} rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>{uiText("Cancel")}</Button>
            <Button onClick={submitReturn} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{uiText(" Return to bank")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Step 4 / gate D: eligibility, ESMS, KYC ── */}
      <Dialog open={dialog === 'eligibility'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiText("Eligibility, ESMS and KYC screening")}</DialogTitle>
            <DialogDescription>{uiText("Missing documents return the case to the bank. With a complete package, eligibility, ESMS, KYC and sanctions checks must all pass before analyst assessment.")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {([
              ['eligible', 'Borrower and loan meet eligibility criteria'],
              ['esms', 'СЭСР (ESMS) screening passed'],
              ['kyc', 'KYC verification passed'],
              ['docs', 'Document package complete'],
              ['sanctions', 'Sanctions screening performed'],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={elig[key]}
                  onCheckedChange={(v) => setElig((p) => ({ ...p, [key]: v === true }))}
                />
                <Label htmlFor={key} className="text-sm font-normal">{uiText(label)}</Label>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="findings">{uiText("Findings")}</Label>
              <Textarea id="findings" value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} />
            </div>
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{uiText("Every application proceeds to analyst assessment. Credit Risk review follows for guarantees at or above $")}{ASSESSMENT_THRESHOLD_USD.toLocaleString('en-US')}{uiText(" or elevated/high risk.")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>{uiText("Cancel")}</Button>
            <Button onClick={submitEligibility} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{uiText(" Record screening")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Steps 5, 6, 9, 11, 12, 13, 15: artefact-recording forms ── */}
      {artifactForm && (
        <StepArtifactForm
          loan={loan}
          config={artifactForm}
          open={artifactOpen}
          onOpenChange={setArtifactOpen}
          onDone={() => {
            setArtifactOpen(false)
            onDone?.()
            router.refresh()
          }}
        />
      )}
    </Card>
  )
}
