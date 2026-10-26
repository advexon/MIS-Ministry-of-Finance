'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

/**
 * Artefact forms for the ФКГ scheme steps that produce a document or opinion:
 * 5 (assessment note), 6 (risk review), 9 (verification), 11 (formal
 * application), 12 (УКО reconciliation), 13 (compliance note) and 15
 * (Management decision).
 *
 * These are declared as data rather than written as seven separate components so
 * the field list, the target table and the permitted transitions for each step
 * sit together in one reviewable place. Steps 7/8/10 are the ККГ meeting and are
 * handled separately, because a meeting spans several applications at once.
 *
 * The artefact row is written first and the status transition second. The
 * transition is validated server-side by /api/loans/[id]/workflow, which checks
 * the artefact exists — so a form that writes a row but fails to transition
 * leaves a recoverable state, never a step that looks complete but is not.
 */

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { loadOperationalSettings } from '@/components/admin/operational-settings-controls'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/contexts/permission-context'
import { useAuthorityReason } from '@/components/admin/authority-reason-provider'
import { isSuperAdmin } from '@/lib/utils/roles'
import type { LoanApplication, LoanStatus } from '@/lib/types/database'
import { ASSESSMENT_SLA_DAYS, requiresRiskReview } from '@/lib/workflow/fkg-scheme'
import type { FormDef } from '@/lib/forms/field-requirements'
import { useFieldRequirements } from '@/lib/hooks/use-field-requirements'
import { RequiredMark } from '@/components/forms/required-mark'

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox'

interface FieldDef {
  name: string
  label: string
  type: FieldType
  options?: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
  rows?: number
}

interface Ctx {
  loan: LoanApplication
  userId: string | null
  values: Record<string, string | boolean>
}

interface TransitionDef {
  to: LoanStatus
  label: string
  variant?: 'default' | 'outline' | 'destructive'
}

interface StepFormConfig {
  step: number
  title: string
  description: string
  table: string
  fields: FieldDef[]
  buildRow: (ctx: Ctx) => Record<string, unknown>
  transitions: TransitionDef[]
  /** Chooses the transition from the entered values, overriding the buttons. */
  pickTransition?: (values: Record<string, string | boolean>, loan: LoanApplication) => LoanStatus | null
  /**
   * Guideline 7.2.1.1: the step whose actor must not be the same person as this
   * step's actor. Checked against the recorded actor before the form is usable.
   */
  sodAgainstStep?: { step: number; table: string; actorColumn: string; describe: string }
}

const num = (v: unknown) => {
  const n = Number.parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown) => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

export const STEP_FORMS: Partial<Record<LoanStatus, StepFormConfig>> = {
  // ── Step 5 · assessment note (оценочная записка), 1-day SLA ──
  assessment: {
    step: 5,
    title: 'Assessment note — step 5',
    description:
      'Every application needs an analyst conclusion. Large guarantees or elevated/high risk go to Credit Risk; smaller low/moderate-risk cases go to committee.',
    table: 'assessment_notes',
    fields: [
      { name: 'summary', label: 'Summary', type: 'textarea', required: true, rows: 3 },
      { name: 'risk_rating', label: 'Analyst risk rating', type: 'select', required: true, options: [
        { value: 'low', label: 'Low' }, { value: 'moderate', label: 'Moderate' },
        { value: 'elevated', label: 'Elevated' }, { value: 'high', label: 'High' },
      ] },
      { name: 'borrower_background', label: 'Borrower background', type: 'textarea', rows: 3 },
      { name: 'financial_analysis', label: 'Financial analysis', type: 'textarea', required: true, rows: 4 },
      { name: 'collateral_analysis', label: 'Collateral analysis', type: 'textarea', rows: 3 },
      { name: 'proposed_amount', label: 'Proposed guarantee amount (TJS)', type: 'number' },
      { name: 'proposed_coverage', label: 'Proposed coverage (%)', type: 'number' },
      {
        name: 'recommendation', label: 'Recommendation', type: 'select', required: true,
        options: [
          { value: 'recommend', label: 'Recommend' },
          { value: 'recommend_with_conditions', label: 'Recommend with conditions' },
          { value: 'not_recommend', label: 'Do not recommend' },
        ],
      },
      { name: 'conditions', label: 'Conditions', type: 'textarea', rows: 2 },
    ],
    buildRow: ({ loan, userId, values }) => {
      const started = new Date()
      const due = new Date(started.getTime() + ASSESSMENT_SLA_DAYS * 86_400_000)
      return {
        loan_id: loan.id,
        summary: str(values.summary),
        risk_rating: str(values.risk_rating),
        borrower_background: str(values.borrower_background),
        financial_analysis: str(values.financial_analysis),
        collateral_analysis: str(values.collateral_analysis),
        proposed_amount: num(values.proposed_amount),
        proposed_coverage: num(values.proposed_coverage),
        recommendation: str(values.recommendation),
        conditions: str(values.conditions),
        started_at: started.toISOString(),
        due_at: due.toISOString(),
        submitted_at: new Date().toISOString(),
        prepared_by: userId,
        status: 'submitted',
      }
    },
    pickTransition: (values, loan) => requiresRiskReview(loan.amount_usd, str(values.risk_rating)) ? 'risk_review' : 'kkg_scheduled',
    transitions: [{ to: 'risk_review', label: 'Submit assessment and route application' }],
  },

  // ── Step 6 · Credit Risk Department analysis ──
  risk_review: {
    step: 6,
    title: 'Credit Risk Department analysis — step 6',
    description: 'The Credit Risk Department opinion required before the application is tabled at ККГ.',
    table: 'risk_reviews',
    fields: [
      {
        name: 'risk_rating', label: 'Risk rating', type: 'select', required: true,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'elevated', label: 'Elevated' },
          { value: 'high', label: 'High' },
        ],
      },
      { name: 'risk_score', label: 'Risk score', type: 'number' },
      { name: 'sector_risk', label: 'Sector risk', type: 'textarea', rows: 3 },
      { name: 'repayment_capacity', label: 'Repayment capacity', type: 'textarea', required: true, rows: 3 },
      { name: 'mitigating_measures', label: 'Mitigating measures', type: 'textarea', rows: 3 },
      {
        name: 'opinion', label: 'Opinion', type: 'select', required: true,
        options: [
          { value: 'support', label: 'Support' },
          { value: 'support_with_conditions', label: 'Support with conditions' },
          { value: 'object', label: 'Object' },
        ],
      },
      { name: 'conditions', label: 'Conditions', type: 'textarea', rows: 2 },
    ],
    buildRow: ({ loan, userId, values }) => ({
      loan_id: loan.id,
      risk_rating: str(values.risk_rating),
      risk_score: num(values.risk_score),
      sector_risk: str(values.sector_risk),
      repayment_capacity: str(values.repayment_capacity),
      mitigating_measures: str(values.mitigating_measures),
      opinion: str(values.opinion),
      conditions: str(values.conditions),
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      status: 'submitted',
    }),
    transitions: [{ to: 'kkg_scheduled', label: 'Send to ККГ (step 7)' }],
  },

  // ── Step 9 · verification and borrower visit ──
  verification: {
    step: 9,
    title: 'Verification and borrower visit — step 9',
    description: 'Confirms the application against the borrower on site before the ККГ protocol is issued.',
    table: 'verifications',
    // The officer who wrote the assessment note cannot verify the same case.
    sodAgainstStep: {
      step: 5,
      table: 'assessment_notes',
      actorColumn: 'prepared_by',
      describe: 'prepared the assessment note for this application',
    },
    fields: [
      { name: 'visit_date', label: 'Visit date', type: 'date', required: true },
      { name: 'visit_location', label: 'Visit location', type: 'text' },
      { name: 'findings', label: 'Findings', type: 'textarea', required: true, rows: 4 },
      { name: 'discrepancies', label: 'Discrepancies', type: 'textarea', rows: 3 },
      {
        name: 'outcome', label: 'Outcome', type: 'select', required: true,
        options: [
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'discrepancies_found', label: 'Discrepancies found' },
          { value: 'not_confirmed', label: 'Not confirmed' },
        ],
      },
    ],
    buildRow: ({ loan, userId, values }) => ({
      loan_id: loan.id,
      assigned_to: userId,
      visit_date: str(values.visit_date),
      visit_location: str(values.visit_location),
      findings: str(values.findings),
      discrepancies: str(values.discrepancies),
      outcome: str(values.outcome),
      completed_at: new Date().toISOString(),
      status: 'completed',
    }),
    transitions: [
      { to: 'kkg_review', label: 'Return to ККГ (step 8)' },
    ],
  },

  // ── Step 11 · formal application, Appendix 1.1 ──
  formal_application: {
    step: 11,
    title: 'Formal application — step 11',
    description: 'Appendix 1.1 of the Guideline, signed by the bank.',
    table: 'formal_applications',
    fields: [
      { name: 'requested_amount', label: 'Requested guarantee amount (TJS)', type: 'number', required: true },
      { name: 'requested_coverage', label: 'Requested coverage (%)', type: 'number' },
      { name: 'signed_by', label: 'Signed by', type: 'text', required: true },
      { name: 'signed_date', label: 'Signed date', type: 'date', required: true },
    ],
    buildRow: ({ loan, userId, values }) => ({
      loan_id: loan.id,
      appendix_ref: '1.1',
      requested_amount: num(values.requested_amount),
      requested_coverage: num(values.requested_coverage),
      signed_by: str(values.signed_by),
      signed_date: str(values.signed_date),
      submitted_by: userId,
    }),
    transitions: [{ to: 'uko_reconciliation', label: 'Send to УКО reconciliation (step 12)' }],
  },

  // ── Step 12 · reconcile the УКО decision with the ККГ recommendation ──
  uko_reconciliation: {
    step: 12,
    title: 'УКО reconciliation — step 12',
    description:
      'Compares the УКО committee decision with the ККГ recommendation. Any disagreement must be recorded and resolved, not overwritten.',
    table: 'uko_reconciliations',
    fields: [
      {
        name: 'uko_decision', label: 'УКО decision', type: 'select', required: true,
        options: [
          { value: 'approve', label: 'Approve' },
          { value: 'reject', label: 'Reject' },
          { value: 'defer', label: 'Defer' },
        ],
      },
      {
        name: 'kkg_recommendation', label: 'ККГ recommendation', type: 'select', required: true,
        options: [
          { value: 'recommend_approve', label: 'Recommend approve' },
          { value: 'recommend_reject', label: 'Recommend reject' },
          { value: 'deferred', label: 'Deferred' },
        ],
      },
      { name: 'discrepancy_notes', label: 'Discrepancy notes', type: 'textarea', rows: 3 },
      { name: 'resolution', label: 'Resolution', type: 'textarea', rows: 3 },
    ],
    buildRow: ({ loan, userId, values }) => {
      const uko = String(values.uko_decision ?? '')
      const kkg = String(values.kkg_recommendation ?? '')
      // Consistency is derived, never typed in, so it cannot be misreported.
      const consistent =
        (uko === 'approve' && kkg === 'recommend_approve') ||
        (uko === 'reject' && kkg === 'recommend_reject') ||
        (uko === 'defer' && kkg === 'deferred')
      return {
        loan_id: loan.id,
        uko_decision: uko || null,
        kkg_recommendation: kkg || null,
        is_consistent: consistent,
        discrepancy_notes: str(values.discrepancy_notes),
        resolution: str(values.resolution),
        reconciled_by: userId,
        reconciled_at: new Date().toISOString(),
      }
    },
    transitions: [
      { to: 'compliance_check', label: 'Proceed to compliance (step 13)' },
      { to: 'kkg_review', label: 'Send back to ККГ', variant: 'outline' },
    ],
  },

  // ── Step 13 · compliance-check note ──
  compliance_check: {
    step: 13,
    title: 'Compliance check — step 13',
    description: 'The compliance note required before the Management decision.',
    table: 'compliance_checks',
    fields: [
      { name: 'conditions_met', label: 'ККГ conditions met', type: 'checkbox' },
      { name: 'documents_verified', label: 'Documents verified', type: 'checkbox' },
      { name: 'aml_cleared', label: 'AML screening cleared', type: 'checkbox' },
      { name: 'findings', label: 'Findings', type: 'textarea', rows: 3 },
      {
        name: 'outcome', label: 'Outcome', type: 'select', required: true,
        options: [
          { value: 'cleared', label: 'Cleared' },
          { value: 'cleared_with_conditions', label: 'Cleared with conditions' },
          { value: 'not_cleared', label: 'Not cleared' },
        ],
      },
    ],
    buildRow: ({ loan, userId, values }) => ({
      loan_id: loan.id,
      conditions_met: values.conditions_met === true,
      documents_verified: values.documents_verified === true,
      aml_cleared: values.aml_cleared === true,
      findings: str(values.findings),
      outcome: str(values.outcome),
      checked_by: userId,
      checked_at: new Date().toISOString(),
      status: 'submitted',
    }),
    // "Not cleared" cannot proceed; the server also refuses this transition.
    pickTransition: (v) => (v.outcome === 'not_cleared' ? 'rejected' : 'deputy_review'),
    transitions: [{ to: 'deputy_review', label: 'Submit for Deputy Director confirmation' }],
  },

  // ── Step 15 · ФКГ Management final decision ──
  management_review: {
    step: 15,
    title: 'ФКГ Management decision — step 15',
    description: 'The final decision. Once recorded it is immutable; a correction requires a new decision.',
    table: 'management_decisions',
    fields: [
      {
        name: 'decision', label: 'Decision', type: 'select', required: true,
        options: [
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'deferred', label: 'Deferred' },
        ],
      },
      { name: 'approved_amount', label: 'Approved guarantee amount (TJS)', type: 'number' },
      { name: 'approved_coverage', label: 'Approved coverage (%)', type: 'number' },
      { name: 'conditions', label: 'Conditions', type: 'textarea', rows: 2 },
      { name: 'rationale', label: 'Rationale', type: 'textarea', required: true, rows: 3 },
    ],
    buildRow: ({ loan, userId, values }) => ({
      loan_id: loan.id,
      decision: str(values.decision),
      approved_amount: num(values.approved_amount),
      approved_coverage: num(values.approved_coverage),
      conditions: str(values.conditions),
      rationale: str(values.rationale),
      decided_by: userId,
      decided_at: new Date().toISOString(),
    }),
    pickTransition: (v) => (v.decision === 'approved' ? 'approved' : v.decision === 'rejected' ? 'rejected' : null),
    transitions: [{ to: 'approved', label: 'Record decision' }],
  },
}

/**
 * Requirement definitions for the step forms, derived from STEP_FORMS so the
 * admin "Required fields" page lists them and the `required` flags above stay
 * the defaults. Checkboxes are excluded: they are attestations, not inputs.
 */
export function stepFormDef(config: StepFormConfig): FormDef {
  return {
    id: `workflow_step_${config.step}`,
    name: config.title,
    group: 'Workflow steps',
    fields: config.fields
      .filter((field) => field.type !== 'checkbox')
      .map((field) => ({ key: field.name, label: field.label, defaultRequired: !!field.required })),
  }
}

export const STEP_FORM_DEFS: FormDef[] = Object.values(STEP_FORMS)
  .filter((config): config is StepFormConfig => !!config)
  .sort((a, b) => a.step - b.step)
  .map(stepFormDef)

interface Props {
  loan: LoanApplication
  config: StepFormConfig
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

export function StepArtifactForm({ loan, config, open, onOpenChange, onDone }: Props) {
  const uiText = useUiTranslation()

  const router = useRouter()
  const { role } = usePermissions()
  const requestAuthorityReason = useAuthorityReason()
  const { data: operationalSettings, error: settingsError } = useSWR(open && config.step === 5 ? 'assessment-routing-settings' : null, loadOperationalSettings)
  const supabase = useMemo(() => createClient(), [])

  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sodBlock, setSodBlock] = useState<string | null>(null)
  const [checkedSod, setCheckedSod] = useState(false)

  const set = (name: string, v: string | boolean) => setValues((p) => ({ ...p, [name]: v }))

  /**
   * Segregation of duties check. Run when the dialog opens so the user is told
   * before filling the form in, rather than after.
   */
  async function runSodCheck() {
    if (isSuperAdmin(role) || checkedSod || !config.sodAgainstStep) {
      setCheckedSod(true)
      return
    }
    const { sodAgainstStep: sod } = config
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id ?? null
    if (!uid) {
      setCheckedSod(true)
      return
    }
    const { data } = await supabase
      .from(sod.table)
      .select(sod.actorColumn)
      .eq('loan_id', loan.id)
      .limit(1)
      .maybeSingle()

    const priorActor = (data as Record<string, string | null> | null)?.[sod.actorColumn] ?? null
    if (priorActor && priorActor === uid) {
      setSodBlock(
        `Segregation of duties (Guideline 7.2.1.1): you ${sod.describe}, so you cannot also ` +
          `perform step ${config.step} for it. Another officer must complete this step.`,
      )
    }
    setCheckedSod(true)
  }

  const formDef = useMemo(() => stepFormDef(config), [config])
  const requirements = useFieldRequirements(formDef)

  const fieldRequired = (f: FieldDef) =>
    f.type === 'checkbox' ? !!f.required : requirements.isRequired(f.name)

  function missingRequired(): string | null {
    for (const f of config.fields) {
      if (!fieldRequired(f)) continue
      const v = values[f.name]
      if (v == null || (typeof v === 'string' && v.trim() === '') || v === false) return `"${f.label}" is required.`
    }
    return null
  }

  async function submit(explicitTo?: LoanStatus) {
    if (config.step === 5 && (!operationalSettings || settingsError)) { setError('Wait for the current risk-review rules to load before submitting.'); return }
    const missing = missingRequired()
    if (missing) {
      setError(missing)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id ?? null

      // 1. Write the artefact.
      const authorityReason = await requestAuthorityReason()
      const row = { ...config.buildRow({ loan, userId, values }), ...(authorityReason ? { authority_reason: authorityReason } : {}) }
      const { error: insertError } = await supabase.from(config.table).insert(row)
      if (insertError) {
        setError(`Could not save the record: ${insertError.message}`)
        return
      }

      // 2. Transition, validated server-side.
      const to = config.step === 5
        ? requiresRiskReview(loan.amount_usd, str(values.risk_rating), Number(operationalSettings?.risk_review_threshold_usd ?? 10000)) ? 'risk_review' : 'kkg_scheduled'
        : config.pickTransition ? config.pickTransition(values, loan) : explicitTo ?? config.transitions[0]?.to
      if (!to) {
        onOpenChange(false)
        setValues({})
        onDone?.()
        router.refresh()
        return
      }
      const res = await fetch(`/api/loans/${loan.id}/workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, reason: authorityReason ?? `Step ${config.step} completed` }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(
          `${json.error ?? 'The transition was refused.'} The record was saved, so it can be retried.`,
        )
        return
      }
      onOpenChange(false)
      setValues({})
      onDone?.()
      router.refresh()
    } catch {
      setError('Network error — the step was not completed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) void runSodCheck()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{uiText(config.title)}</DialogTitle>
          <DialogDescription>{uiText(config.description)}</DialogDescription>
        </DialogHeader>

        {sodBlock ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{sodBlock}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {config.fields.map((f) => (
              <div key={f.name} className="flex flex-col gap-1.5">
                {f.type === 'checkbox' ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={f.name}
                      checked={values[f.name] === true}
                      onCheckedChange={(v) => set(f.name, v === true)}
                    />
                    <Label htmlFor={f.name} className="text-sm font-normal">
                      {uiText(f.label)}
                    </Label>
                  </div>
                ) : (
                  <>
                    <Label htmlFor={f.name}>
                      {uiText(f.label)}
                      <RequiredMark show={fieldRequired(f)} />
                    </Label>
                    {f.type === 'textarea' ? (
                      <Textarea
                        id={f.name}
                        rows={f.rows ?? 3}
                        value={String(values[f.name] ?? '')}
                        onChange={(e) => set(f.name, e.target.value)}
                        placeholder={f.placeholder}
                      />
                    ) : f.type === 'select' ? (
                      <Select
                        value={String(values[f.name] ?? '')}
                        onValueChange={(v) => set(f.name, v)}
                      >
                        <SelectTrigger id={f.name}>
                          <SelectValue placeholder={uiText("Select…")} />
                        </SelectTrigger>
                        <SelectContent><SelectGroup>
                          {f.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {uiText(o.label)}
                            </SelectItem>
                          ))}
                        </SelectGroup></SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={f.name}
                        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                        step={f.type === 'number' ? 'any' : undefined}
                        value={String(values[f.name] ?? '')}
                        onChange={(e) => set(f.name, e.target.value)}
                        placeholder={f.placeholder}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {uiText(error)}
          </p>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{uiText("Cancel")}</Button>
          {!sodBlock &&
            config.transitions.map((t) => (
              <Button
                key={t.to}
                variant={t.variant ?? 'default'}
                onClick={() => submit(config.pickTransition ? undefined : t.to)}
                disabled={busy}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {uiText(t.label)}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
