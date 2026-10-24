/**
 * ФКГ guarantee-issuance scheme (16 steps).
 *
 * Single source of truth for the process defined in the ФКГ Guideline
 * (Grant № E2040-TJ). Statuses, allowed transitions, the 10,000 USD routing
 * gate, ККГ quorum and the segregation-of-duties rule all live here so the UI,
 * API routes and reports cannot drift apart.
 *
 * Currency note: the Guideline expresses its thresholds in USD, but banks book
 * loans in TJS. Each application therefore carries `usd_rate` captured at УКО
 * registration; `amount_usd` is the converted figure the gates are evaluated
 * against. The rate is frozen per application so a decision taken years ago can
 * still be reproduced exactly.
 */

import type { LoanStatus, RoleCode } from '@/lib/types/database'
import { ROLE_CODES } from '@/lib/types/database'

/** Guideline threshold that decides whether a full assessment is required. */
export const ASSESSMENT_THRESHOLD_USD = 10_000

/** Assessment note SLA from the scheme (step 5). */
export const ASSESSMENT_SLA_DAYS = 1

export type Lane = 'bank' | 'уко' | 'operations' | 'credit_risk' | 'kkg' | 'management'

export interface SchemeStep {
  step: number
  code: string
  status: LoanStatus
  lane: Lane
  titleEn: string
  titleRu: string
  guidelineRef: string
  /** Roles permitted to complete this step. */
  actors: RoleCode[]
  slaDays?: number
  isDecision?: boolean
}

/**
 * The 16 steps. `step` matches the numbering on the official scheme diagram, so
 * step 14 is intentionally absent: the diagram routes step 13 straight into the
 * Management decision at 15.
 */
export const SCHEME_STEPS: SchemeStep[] = [
  {
    step: 1,
    code: 'bank_request',
    status: 'submitted',
    lane: 'bank',
    titleEn: 'Bank submits guarantee request',
    titleRu: 'Банк направляет заявку на гарантию',
    guidelineRef: '7.1.1',
    actors: [ROLE_CODES.BANK_OFFICER, ROLE_CODES.BANK_ADMIN],
  },
  {
    step: 2,
    code: 'uko_registration',
    status: 'uko_registration',
    lane: 'уко',
    titleEn: 'УКО registers request and checks amount',
    titleRu: 'УКО регистрирует заявку и проверяет сумму',
    guidelineRef: '7.1.2',
    actors: [ROLE_CODES.UKO_OFFICER],
  },
  {
    step: 3,
    code: 'docs_returned',
    status: 'docs_incomplete',
    lane: 'уко',
    titleEn: 'Incomplete package returned to bank',
    titleRu: 'Неполный пакет возвращён банку',
    guidelineRef: '7.1.3',
    actors: [ROLE_CODES.UKO_OFFICER],
  },
  {
    step: 4,
    code: 'mis_record',
    status: 'eligibility_review',
    lane: 'operations',
    titleEn: 'Borrower and loan recorded in MIS; eligibility, ESMS and KYC screening',
    titleRu: 'Заёмщик и кредит внесены в МИС; проверка приемлемости, СЭСР и KYC',
    guidelineRef: '7.1.4',
    actors: [ROLE_CODES.PRSF_ANALYST, ROLE_CODES.COMPLIANCE_OFFICER],
  },
  {
    step: 5,
    code: 'assessment_note',
    status: 'assessment',
    lane: 'operations',
    titleEn: 'Assessment note prepared',
    titleRu: 'Подготовка оценочной записки',
    guidelineRef: '7.1.5',
    actors: [ROLE_CODES.PRSF_ANALYST],
    slaDays: ASSESSMENT_SLA_DAYS,
  },
  {
    step: 6,
    code: 'risk_review',
    status: 'risk_review',
    lane: 'credit_risk',
    titleEn: 'Credit Risk Department analysis',
    titleRu: 'Анализ Департамента кредитных рисков',
    guidelineRef: '7.1.6',
    actors: [ROLE_CODES.CREDIT_RISK_OFFICER],
  },
  {
    step: 7,
    code: 'kkg_assignment',
    status: 'kkg_scheduled',
    lane: 'kkg',
    titleEn: 'ККГ members assigned and quorum set',
    titleRu: 'Назначение членов ККГ и определение кворума',
    guidelineRef: '7.1.7',
    actors: [ROLE_CODES.KKG_SECRETARY],
  },
  {
    step: 8,
    code: 'kkg_meeting',
    status: 'kkg_review',
    lane: 'kkg',
    titleEn: 'ККГ reviews application',
    titleRu: 'ККГ рассматривает заявку',
    guidelineRef: '7.1.8',
    actors: [ROLE_CODES.KKG_SECRETARY, ROLE_CODES.KKG_MEMBER],
    isDecision: true,
  },
  {
    step: 9,
    code: 'verification',
    status: 'verification',
    lane: 'operations',
    titleEn: 'Verification and borrower visit',
    titleRu: 'Верификация и посещение заёмщика',
    guidelineRef: '7.1.9',
    actors: [ROLE_CODES.PRSF_ANALYST],
  },
  {
    step: 10,
    code: 'kkg_protocol',
    status: 'kkg_protocol',
    lane: 'kkg',
    titleEn: 'ККГ protocol issued',
    titleRu: 'Оформление протокола ККГ',
    guidelineRef: '7.1.10',
    actors: [ROLE_CODES.KKG_SECRETARY],
  },
  {
    step: 11,
    code: 'formal_application',
    status: 'formal_application',
    lane: 'operations',
    titleEn: 'Formal application (Appendix 1.1)',
    titleRu: 'Официальная заявка (Приложение 1.1)',
    guidelineRef: '7.1.11',
    actors: [ROLE_CODES.PRSF_ANALYST, ROLE_CODES.UKO_OFFICER],
  },
  {
    step: 12,
    code: 'uko_reconciliation',
    status: 'uko_reconciliation',
    lane: 'уко',
    titleEn: 'УКО decision reconciled with ККГ recommendation',
    titleRu: 'Сверка решения УКО с рекомендацией ККГ',
    guidelineRef: '7.1.12',
    actors: [ROLE_CODES.UKO_OFFICER],
  },
  {
    step: 13,
    code: 'compliance_check',
    status: 'compliance_check',
    lane: 'operations',
    titleEn: 'Compliance check note',
    titleRu: 'Записка комплаенс-проверки',
    guidelineRef: '7.1.13',
    actors: [ROLE_CODES.COMPLIANCE_OFFICER],
  },
  {
    step: 15,
    code: 'management_decision',
    status: 'management_review',
    lane: 'management',
    titleEn: 'ФКГ Management final decision',
    titleRu: 'Окончательное решение руководства ФКГ',
    guidelineRef: '7.1.15',
    actors: [ROLE_CODES.FKG_MANAGEMENT],
    isDecision: true,
  },
  {
    step: 16,
    code: 'guarantee_issued',
    status: 'guarantee_issued',
    lane: 'management',
    titleEn: 'ПВГ issued electronically',
    titleRu: 'ПВГ выдаётся электронно',
    guidelineRef: '7.1.16',
    actors: [ROLE_CODES.FKG_MANAGEMENT, ROLE_CODES.PRSF_ADMIN],
  },
]

export const STEP_BY_STATUS: Partial<Record<LoanStatus, SchemeStep>> = Object.fromEntries(
  SCHEME_STEPS.map((s) => [s.status, s]),
) as Partial<Record<LoanStatus, SchemeStep>>

export function getStepByNumber(step: number): SchemeStep | undefined {
  return SCHEME_STEPS.find((s) => s.step === step)
}

/**
 * Allowed transitions. Anything not listed is refused, which is what stops the
 * old "one click from under_review to approved" shortcut from reappearing.
 *
 * Terminal and post-issuance states are deliberately excluded: the existing claims
 * and recoveries flows own those and are unchanged by this scheme.
 */
export const ALLOWED_TRANSITIONS: Partial<Record<LoanStatus, LoanStatus[]>> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['uko_registration', 'cancelled'],
  // Legacy bridge: applications created before the scheme was implemented sit in
  // `under_review`, which is not a scheme status. Without this they would be
  // stranded with no legal move. They re-enter at step 2 so the FX rate and the
  // eligibility screening are captured rather than assumed.
  under_review: ['uko_registration', 'rejected', 'cancelled'],
  // Step 2 either accepts the package or bounces it back to the bank.
  uko_registration: ['eligibility_review', 'docs_incomplete', 'rejected', 'cancelled'],
  // Step 3 loop: the bank completes the package and resubmits.
  docs_incomplete: ['uko_registration', 'cancelled'],
  // Gate D: small exposures skip the assessment note and go straight to risk.
  eligibility_review: ['assessment', 'risk_review', 'ineligible', 'docs_incomplete', 'cancelled'],
  assessment: ['risk_review', 'ineligible', 'cancelled'],
  risk_review: ['kkg_scheduled', 'ineligible', 'cancelled'],
  kkg_scheduled: ['kkg_review', 'cancelled'],
  // Step 8 may send the case out for verification before it can be concluded.
  kkg_review: ['verification', 'kkg_protocol', 'rejected', 'cancelled'],
  verification: ['kkg_review', 'kkg_protocol', 'cancelled'],
  kkg_protocol: ['formal_application', 'rejected', 'cancelled'],
  formal_application: ['uko_reconciliation', 'cancelled'],
  uko_reconciliation: ['compliance_check', 'kkg_review', 'rejected', 'cancelled'],
  compliance_check: ['management_review', 'rejected', 'cancelled'],
  management_review: ['approved', 'rejected', 'cancelled'],
  approved: ['guarantee_issued', 'cancelled'],
}

export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export function getNextStatuses(from: LoanStatus): LoanStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? []
}

/** Convert a TJS amount to USD using the rate frozen on the application. */
export function toUsd(amount: number | null, usdRate: number | null): number | null {
  if (amount == null || usdRate == null || usdRate <= 0) return null
  return amount / usdRate
}

/**
 * Gate D routing. Returns null when the USD amount is unknown, which the caller
 * must treat as "cannot decide yet" rather than as "no assessment needed" —
 * silently skipping the assessment would be an audit finding.
 *
 * The threshold is INCLUSIVE: an exposure of exactly 10,000.00 USD requires the
 * full assessment note. Confirmed against the Guideline's "from 10,000 USD and
 * above" reading. Do not weaken this to `>` without a documented basis — it is
 * the difference between a round-number case getting a full review or skipping
 * straight to Credit Risk.
 */
export function requiresAssessment(amountUsd: number | null): boolean | null {
  if (amountUsd == null) return null
  return amountUsd >= ASSESSMENT_THRESHOLD_USD
}

/**
 * ККГ quorum. The scheme ties committee composition to exposure, so larger
 * guarantees need more members present.
 */
export function requiredQuorum(amountUsd: number | null): number {
  if (amountUsd == null) return 5 // unknown exposure: demand the stricter quorum
  if (amountUsd >= 100_000) return 5
  // Inclusive, to match requiresAssessment above. If this stayed exclusive, an
  // exposure of exactly 10,000 USD would require the full assessment note yet
  // sit in the smallest quorum band — the same boundary read two ways.
  if (amountUsd >= ASSESSMENT_THRESHOLD_USD) return 4
  return 3
}

export interface VoteTally {
  for: number
  against: number
  abstain: number
  total: number
}

export function tallyVotes(votes: { vote: 'for' | 'against' | 'abstain' }[]): VoteTally {
  const t: VoteTally = { for: 0, against: 0, abstain: 0, total: votes.length }
  for (const v of votes) t[v.vote] += 1
  return t
}

export interface QuorumResult {
  quorumMet: boolean
  carried: boolean
  reason: string
}

/** Every assigned member must vote in favour; an abstention is not consent. */
export function evaluateCommitteeOutcome(
  tally: VoteTally,
  requiredQuorumCount: number,
  assignedMemberCount = requiredQuorumCount,
): QuorumResult {
  if (requiredQuorumCount < 1 || assignedMemberCount < requiredQuorumCount || tally.total < requiredQuorumCount) {
    return {
      quorumMet: false,
      carried: false,
      reason: `Quorum not met: ${tally.total} of ${requiredQuorumCount} required members voted.`,
    }
  }
  if (tally.total === assignedMemberCount && tally.for === assignedMemberCount) {
    return { quorumMet: true, carried: true, reason: `Unanimous: all ${assignedMemberCount} assigned members voted in favour.` }
  }
  return {
    quorumMet: true,
    carried: false,
    reason: `Not unanimous: ${tally.for} in favour, ${tally.against} against, ${tally.abstain} abstained; all ${assignedMemberCount} assigned members must vote in favour.`,
  }
}

export function isWorkflowReadOnlyRole(roleCode: string | null | undefined): boolean {
  return !roleCode || ['super_admin', 'prsf_admin', 'auditor'].includes(roleCode)
}

export function canActOnStep(roleCode: string | null | undefined, step: SchemeStep): boolean {
  if (isWorkflowReadOnlyRole(roleCode)) return false
  return (step.actors as string[]).includes(roleCode!)
}

/**
 * Segregation of duties, Guideline 7.2.1.1.
 *
 * The officer who prepared the assessment note (step 5) must not also perform
 * verification (step 9), audits or overdue management for the same borrower.
 * Enforced here so assignment UIs and API routes share one rule.
 */
export const SEGREGATED_STEP_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [5, 9], // assessment note vs verification
]

export interface SodViolation {
  conflictingStep: number
  message: string
}

export function checkSegregationOfDuties(
  targetStep: number,
  candidateUserId: string,
  priorStepActors: Record<number, string | null | undefined>,
): SodViolation | null {
  for (const [a, b] of SEGREGATED_STEP_PAIRS) {
    const other = targetStep === a ? b : targetStep === b ? a : null
    if (other == null) continue
    if (priorStepActors[other] && priorStepActors[other] === candidateUserId) {
      return {
        conflictingStep: other,
        message:
          `Segregation of duties (Guideline 7.2.1.1): this user already performed step ${other} ` +
          `for this application and therefore cannot be assigned step ${targetStep}.`,
      }
    }
  }
  return null
}

/** Human-readable label for a status, for badges and timelines. */
export function statusLabel(status: LoanStatus, lang: 'en' | 'ru' = 'en'): string {
  const step = STEP_BY_STATUS[status]
  if (step) return lang === 'ru' ? step.titleRu : step.titleEn
  return status.replace(/_/g, ' ')
}
