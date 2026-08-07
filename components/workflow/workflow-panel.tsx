'use client'

/**
 * Action panel for the ФКГ issuance scheme (steps 1-4 implemented here).
 *
 * Every action posts to /api/loans/[id]/workflow, which re-validates the
 * transition server-side. The buttons shown here are a convenience, not the
 * security boundary — hiding a button never grants or denies a permission.
 */

import { useState } from 'react'
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

interface Props {
  loan: LoanApplication
  roleCode: string | null
  onDone?: () => void
}

type DialogKind = 'uko' | 'eligibility' | 'return' | null

export function WorkflowPanel({ loan, roleCode, onDone }: Props) {
  const router = useRouter()
  const status = loan.status as LoanStatus
  const step = STEP_BY_STATUS[status]

  const [dialog, setDialog] = useState<DialogKind>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const canAct = step ? canActOnStep(roleCode, step) : false
  const nextStatuses = getNextStatuses(status).filter((s) => s !== 'cancelled')

  async function post(to: LoanStatus, payload?: Record<string, unknown>, reason?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/loans/${loan.id}/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, payload, reason }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'The transition was refused.')
        return
      }
      setDialog(null)
      onDone?.()
      router.refresh()
    } catch {
      setError('Network error — the transition was not applied.')
    } finally {
      setBusy(false)
    }
  }

  /** Step 2: register, capturing the FX rate the USD gates depend on. */
  async function submitUko() {
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setError('Enter the TJS/USD rate. The 10,000 USD gate cannot be evaluated without it.')
      return
    }
    const usd = toUsd(amount, parsedRate)
    await post('eligibility_review', {
      uko_reference_no: ref || null,
      uko_registered_at: new Date().toISOString(),
      usd_rate: parsedRate,
      amount_usd: usd,
      fx_rate_date: new Date().toISOString().slice(0, 10),
      fx_rate_source: 'Manual entry at УКО registration',
      requires_assessment: usd == null ? null : usd > ASSESSMENT_THRESHOLD_USD,
    }, `Registered by УКО${ref ? ` as ${ref}` : ''}; rate ${parsedRate} TJS/USD`)
  }

  /** Step 3: bounce an incomplete package back to the bank. */
  async function submitReturn() {
    if (!missing.trim()) {
      setError('List what is missing so the bank knows what to supply.')
      return
    }
    await supabaseInsert('eligibility_checks', {
      loan_id: loan.id,
      docs_complete: false,
      missing_documents: missing,
      decision: 'returned_to_bank',
      checked_at: new Date().toISOString(),
    })
    await post('docs_incomplete', undefined, `Returned to bank: ${missing}`)
  }

  /** Step 4 / gate D: record the eligibility, ESMS and KYC screening. */
  async function submitEligibility() {
    const passed = elig.eligible && elig.esms && elig.kyc && elig.docs
    await supabaseInsert('eligibility_checks', {
      loan_id: loan.id,
      is_eligible: elig.eligible,
      esms_passed: elig.esms,
      kyc_passed: elig.kyc,
      sanctions_screened: elig.sanctions,
      docs_complete: elig.docs,
      findings: findings || null,
      decision: passed ? 'passed' : 'rejected',
      checked_at: new Date().toISOString(),
    })
    if (!passed) {
      await post('ineligible', undefined, findings || 'Failed the eligibility / ESMS / KYC gate')
      return
    }
    // Gate D routing: above the threshold an assessment note is mandatory.
    const target: LoanStatus = needsAssessment === false ? 'risk_review' : 'assessment'
    await post(target, undefined, findings || 'Eligibility, ESMS and KYC passed')
  }

  // Small helper so the screening record exists before the transition is checked.
  async function supabaseInsert(table: string, row: Record<string, unknown>) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from(table).insert(row)
  }

  // Legacy applications predate the scheme and sit in `under_review`, which is
  // not one of the 16 steps. They need an explicit way back onto the path.
  const isLegacy = status === 'under_review'
  const isStaff =
    roleCode != null &&
    ['super_admin', 'prsf_admin', 'prsf_analyst', 'uko_officer'].includes(roleCode)

  if (isLegacy) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Not yet on the ФКГ scheme</CardTitle>
          <CardDescription className="text-xs">
            This application was created before the guarantee-issuance scheme was implemented, so it
            has no recorded УКО registration, FX rate or eligibility screening.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {isStaff ? (
            <Button
              size="sm"
              className="self-start"
              disabled={busy}
              onClick={() => post('uko_registration', undefined, 'Moved onto the ФКГ scheme at step 2')}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Move onto the scheme at step 2
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              A УКО officer or PRSF staff member must place this application onto the scheme.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!step) {
    return null // Not on the issuance scheme (e.g. post-issuance lifecycle).
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">
              Step {step.step} · {step.titleEn}
            </CardTitle>
            <CardDescription className="text-xs">
              {step.titleRu} · Guideline {step.guidelineRef}
            </CardDescription>
          </div>
          <Badge variant="outline">{statusLabel(status)}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {/* FX and gate-D state, so the routing decision is never invisible. */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span>
            Amount:{' '}
            <span className="font-medium">
              {amount == null ? '—' : `${amount.toLocaleString('en-US')} TJS`}
            </span>
          </span>
          <span>
            USD equivalent:{' '}
            <span className="font-medium">
              {knownUsd == null ? 'not established' : `$${knownUsd.toFixed(2)}`}
            </span>
          </span>
          <span>
            Assessment (step 5):{' '}
            <span className="font-medium">
              {needsAssessment === null ? 'undetermined' : needsAssessment ? 'mandatory' : 'not required'}
            </span>
          </span>
        </div>

        {knownUsd == null && (
          <p className="flex items-start gap-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The TJS/USD rate has not been recorded, so the 10,000 USD routing gate cannot be
            evaluated yet.
          </p>
        )}

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {!canAct ? (
          <p className="text-xs text-muted-foreground">
            This step belongs to {step.actors.join(', ')}. Your role
            {roleCode ? ` (${roleCode})` : ''} cannot act on it.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {status === 'submitted' && (
              <Button size="sm" onClick={() => setDialog('uko')} disabled={busy}>
                Register request (step 2) <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {status === 'uko_registration' && (
              <>
                <Button size="sm" onClick={() => setDialog('uko')} disabled={busy}>
                  Accept and record FX <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDialog('return')} disabled={busy}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Return to bank (step 3)
                </Button>
              </>
            )}
            {status === 'docs_incomplete' && (
              <Button size="sm" onClick={() => post('uko_registration', undefined, 'Bank resubmitted the completed package')} disabled={busy}>
                Package resubmitted — re-register <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {status === 'eligibility_review' && (
              <Button size="sm" onClick={() => setDialog('eligibility')} disabled={busy}>
                Record eligibility / ESMS / KYC <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
            {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-muted-foreground" />}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Permitted next states: {nextStatuses.length ? nextStatuses.map((s) => statusLabel(s)).join(' · ') : 'none'}
        </p>
      </CardContent>

      {/* ── Step 2: УКО registration ── */}
      <Dialog open={dialog === 'uko'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register request — step 2</DialogTitle>
            <DialogDescription>
              The Guideline states its thresholds in USD while the loan is booked in TJS. The rate is
              stored on this application so the decision stays reproducible later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="uko-ref">УКО reference number</Label>
              <Input id="uko-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. УКО-2026-0142" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="uko-rate">TJS per 1 USD</Label>
              <Input
                id="uko-rate" type="number" step="0.0001" min="0"
                value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 10.9500"
              />
              <p className="text-xs text-muted-foreground">
                {previewUsd == null
                  ? 'Enter a rate to see the USD equivalent.'
                  : `${amount?.toLocaleString('en-US')} TJS = $${previewUsd.toFixed(2)} — assessment ${
                      previewUsd > ASSESSMENT_THRESHOLD_USD ? 'mandatory' : 'not required'
                    }.`}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitUko} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Step 3: return to bank ── */}
      <Dialog open={dialog === 'return'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return package to bank — step 3</DialogTitle>
            <DialogDescription>
              The application returns to the bank and re-enters at step 2 once completed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="missing">Missing documents</Label>
            <Textarea
              id="missing" value={missing} onChange={(e) => setMissing(e.target.value)}
              placeholder="List each missing or deficient document…" rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitReturn} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Return to bank
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Step 4 / gate D: eligibility, ESMS, KYC ── */}
      <Dialog open={dialog === 'eligibility'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eligibility, ESMS and KYC screening</DialogTitle>
            <DialogDescription>
              All four checks must pass. Anything unchecked marks the application ineligible and ends
              the process.
            </DialogDescription>
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
                <Label htmlFor={key} className="text-sm font-normal">{label}</Label>
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="findings">Findings</Label>
              <Textarea id="findings" value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} />
            </div>
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {needsAssessment === null
                ? 'The USD equivalent is unknown, so routing cannot be determined.'
                : needsAssessment
                  ? `Above $${ASSESSMENT_THRESHOLD_USD.toLocaleString('en-US')} — proceeds to the assessment note (step 5).`
                  : `At or below $${ASSESSMENT_THRESHOLD_USD.toLocaleString('en-US')} — skips step 5, straight to Credit Risk (step 6).`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitEligibility} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record screening
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
