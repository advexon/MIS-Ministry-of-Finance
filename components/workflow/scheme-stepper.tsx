'use client'

import { useUiTranslation } from '@/lib/i18n/ui-text'

/**
 * Progress across the ФКГ issuance scheme, driven entirely by
 * lib/workflow/fkg-scheme so the diagram and the engine cannot disagree.
 *
 * Grouped by swimlane rather than rendered as 15 equal circles: the lane is the
 * part a user needs at a glance ("who holds this now"), and 15 circles in a row
 * is unreadable at any realistic width.
 */

import { Check, CircleDot, RotateCcw, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { LoanStatus } from '@/lib/types/database'
import { SCHEME_STEPS, STEP_BY_STATUS, type Lane } from '@/lib/workflow/fkg-scheme'

const LANE_LABELS: Record<Lane, string> = {
  bank: 'Bank',
  'уко': 'УКО',
  operations: 'Operations',
  credit_risk: 'Credit Risk',
  kkg: 'ККГ',
  management: 'Management',
}

const LANE_ORDER: Lane[] = ['bank', 'уко', 'operations', 'credit_risk', 'kkg', 'management']

/** Statuses that sit outside the forward path. */
const REWORK_STATUSES: LoanStatus[] = ['docs_incomplete']
const FAILED_STATUSES: LoanStatus[] = ['ineligible', 'rejected', 'cancelled']

export function SchemeStepper({ status }: { status: LoanStatus }) {
  const uiText = useUiTranslation()

  const isRework = REWORK_STATUSES.includes(status)
  const isFailed = FAILED_STATUSES.includes(status)

  // Post-issuance lifecycle states are all downstream of step 16.
  const POST_ISSUANCE: LoanStatus[] = [
    'guarantee_issued', 'disbursed', 'active', 'settled', 'rescheduled',
    'defaulted', 'claim_pending', 'claim_rejected', 'claim_paid', 'closed',
  ]

  const currentStepNo = POST_ISSUANCE.includes(status)
    ? 16
    : (STEP_BY_STATUS[status]?.step ?? (status === 'draft' ? 0 : null))

  const lanes = LANE_ORDER.map((lane) => ({
    lane,
    steps: SCHEME_STEPS.filter((s) => s.lane === lane),
  })).filter((l) => l.steps.length > 0)

  return (
    <div className="flex flex-col gap-3">
      {(isRework || isFailed) && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
            isRework
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-destructive/30 bg-destructive/10 text-destructive',
          )}
        >
          {isRework ? <RotateCcw className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
          <span className="font-medium">
            {status === 'docs_incomplete'
              ? uiText("Step 3 — package returned to the bank for completion")
              : status === 'ineligible'
                ? uiText("Failed the eligibility / ESMS / KYC gate")
                : status === 'rejected'
                  ? uiText("Application rejected")
                  : uiText("Application cancelled")}
          </span>
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch gap-2">
          {lanes.map(({ lane, steps }) => (
            <div key={lane} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5">
              <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {LANE_LABELS[lane]}
              </span>
              <div className="flex items-start gap-1.5">
                {steps.map((s) => {
                  const done = currentStepNo != null && currentStepNo > s.step
                  const current = currentStepNo === s.step
                  return (
                    <div
                      key={s.step}
                      className="flex w-[74px] flex-col items-center gap-1"
                      title={`Step ${s.step} · ${s.titleEn} (Guideline ${s.guidelineRef})`}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                          done && 'border-primary bg-primary text-primary-foreground',
                          current &&
                            !isFailed &&
                            'border-primary bg-primary text-primary-foreground ring-4 ring-primary/20',
                          current && isFailed && 'border-destructive bg-destructive text-destructive-foreground',
                          !done && !current && 'border-border bg-background text-muted-foreground',
                        )}
                      >
                        {done ? (
                          <Check className="h-4 w-4" />
                        ) : current ? (
                          <CircleDot className="h-4 w-4" />
                        ) : (
                          s.step
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-center text-[9px] font-medium leading-tight',
                          done || current ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {s.titleEn.length > 34 ? `${s.titleEn.slice(0, 32)}…` : s.titleEn}
                      </span>
                      {s.slaDays != null && (
                        <span className="text-[8px] text-muted-foreground">{uiText("SLA")} {s.slaDays}d</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
