/**
 * Executable checks for the ФКГ guarantee-issuance scheme.
 *
 * These are compliance guarantees, not incidental unit tests: each assertion
 * corresponds to a rule in the ФКГ Guideline that the old free-form status field
 * did not enforce. Run with:
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader-register.mjs \
 *        scripts/verify-fkg-scheme.ts
 *
 * or simply: pnpm verify:scheme
 */

import { readFileSync } from 'node:fs'
import {
  SCHEME_STEPS,
  STEP_BY_STATUS,
  ALLOWED_TRANSITIONS,
  ASSESSMENT_THRESHOLD_USD,
  canTransition,
  canActOnStep,
  getNextStatuses,
  getStepByNumber,
  requiresAssessment,
  requiresRiskReview,
  requiredQuorum,
  toUsd,
  evaluateCommitteeOutcome,
  tallyVotes,
} from '@/lib/workflow/fkg-scheme'
import { workflowRequestSchema } from '@/lib/workflow/transition-input'
import { ROLE_CODES } from '@/lib/types/database'
import type { LoanStatus } from '@/lib/types/database'

let passed = 0
const failures: string[] = []

function check(label: string, condition: boolean) {
  if (condition) {
    passed++
  } else {
    failures.push(label)
  }
}

// ── 1. Transitions that the old implementation wrongly permitted ─────────────
// The pre-existing UI moved an application from `under_review` straight to
// `approved` in one click, skipping every control in the Guideline.
check('under_review cannot jump to approved', !canTransition('under_review', 'approved'))
check('submitted cannot jump to guarantee_issued', !canTransition('submitted', 'guarantee_issued'))
check('draft cannot jump to approved', !canTransition('draft', 'approved'))
check('eligibility_review cannot reach management_review', !canTransition('eligibility_review', 'management_review'))
check('compliance_check cannot issue directly', !canTransition('compliance_check', 'guarantee_issued'))

// ── 2. The happy path is walkable end to end ─────────────────────────────────
const happyPath: LoanStatus[] = [
  'draft', 'submitted', 'uko_registration', 'eligibility_review', 'assessment',
  'risk_review', 'kkg_scheduled', 'kkg_review', 'kkg_protocol',
  'formal_application', 'uko_reconciliation', 'compliance_check',
  'deputy_review', 'management_review', 'approved', 'guarantee_issued',
]
for (let i = 0; i < happyPath.length - 1; i++) {
  check(
    `happy path ${happyPath[i]} -> ${happyPath[i + 1]}`,
    canTransition(happyPath[i], happyPath[i + 1]),
  )
}

// ── 3. The document-return loop (step 3) actually loops ──────────────────────
check('uko_registration can bounce to docs_incomplete', canTransition('uko_registration', 'docs_incomplete'))
check('docs_incomplete returns to uko_registration', canTransition('docs_incomplete', 'uko_registration'))
check('docs_incomplete cannot skip ahead to eligibility', !canTransition('docs_incomplete', 'eligibility_review'))

// ── 4. Verification loop (step 9) returns to the committee ───────────────────
check('kkg_review can request verification', canTransition('kkg_review', 'verification'))
check('verification returns to kkg_review', canTransition('verification', 'kkg_review'))
check('uko_reconciliation can send back to ККГ on mismatch', canTransition('uko_reconciliation', 'kkg_review'))

// ── 5. The 10,000 USD routing gate ───────────────────────────────────────────
for (const amount of [0, 9_999, 10_000, 10_001, null]) {
  check(`assessment required at ${amount ?? 'unknown'} USD`, requiresAssessment(amount) === true)
}
check('threshold constant is 10000', ASSESSMENT_THRESHOLD_USD === 10_000)
check('small low-risk case skips separate risk review', !requiresRiskReview(9_999, 'low'))
check('threshold requires separate risk review', requiresRiskReview(10_000, 'low'))
check('elevated small case requires risk review', requiresRiskReview(9_999, 'elevated'))
check('high-risk small case requires risk review', requiresRiskReview(9_999, 'high'))
check('unknown exposure requires risk review', requiresRiskReview(null, 'low'))
check('unknown rating requires risk review', requiresRiskReview(9_999, null))
check('toUsd refuses a null rate', toUsd(100_000, null) === null)
check('toUsd refuses a zero rate', toUsd(100_000, 0) === null)
check('toUsd converts correctly', toUsd(109_500, 10.95) === 10_000)
// Both routes out of the gate exist.
check('gate D can route to assessment', canTransition('eligibility_review', 'assessment'))
check('eligibility cannot bypass the assessment', !canTransition('eligibility_review', 'risk_review'))
check('assessment can route small low-risk cases to committee', canTransition('assessment', 'kkg_scheduled'))
check('committee clarification returns to assessment', canTransition('docs_incomplete', 'assessment'))

// ── 5b. Quorum bands read the same boundary the same way ─────────────────────
// The 10,000 constant drives both routing and quorum. If the two disagreed, an
// exposure of exactly 10,000 would need a full assessment yet sit in the
// smallest quorum band, so the boundary is pinned in both directions.
check('9,999 USD needs quorum of 3', requiredQuorum(9_999) === 3)
check('10,000 USD needs quorum of 4 (inclusive)', requiredQuorum(10_000) === 4)
check('99,999 USD needs quorum of 4', requiredQuorum(99_999) === 4)
check('100,000 USD needs quorum of 5 (inclusive)', requiredQuorum(100_000) === 5)
check('unknown exposure demands the strictest quorum', requiredQuorum(null) === 5)
check(
  'assessment and quorum agree at the boundary',
  requiresAssessment(10_000) === true && requiredQuorum(10_000) > 3,
)

// ── 6. Role lanes ────────────────────────────────────────────────────────────
const step2 = STEP_BY_STATUS['uko_registration']!
const step6 = STEP_BY_STATUS['risk_review']!
const step16 = getStepByNumber(16)!
check('base analyst may register at step 2', canActOnStep(ROLE_CODES.PRSF_ANALYST, step2))
check('retired UKO role cannot register', !canActOnStep(ROLE_CODES.UKO_OFFICER, step2))
check('bank officer may not act on step 2', !canActOnStep(ROLE_CODES.BANK_OFFICER, step2))
check('credit risk officer may act on step 6', canActOnStep(ROLE_CODES.CREDIT_RISK_OFFICER, step6))
check('УКО officer may not act on step 6', !canActOnStep(ROLE_CODES.UKO_OFFICER, step6))
check('management may issue the ПВГ', canActOnStep(ROLE_CODES.FKG_MANAGEMENT, step16))
check('compliance officer may not issue the ПВГ', !canActOnStep(ROLE_CODES.COMPLIANCE_OFFICER, step16))
check('an unknown role may act nowhere', !canActOnStep(null, step2))
for (const code of [ROLE_CODES.SUPER_ADMIN, ROLE_CODES.PRSF_ADMIN, ROLE_CODES.AUDITOR]) {
  check(`${code} cannot complete any workflow step`, SCHEME_STEPS.every((step) => !canActOnStep(code, step)))
}
const committeeStep = getStepByNumber(8)!
const secretaryStep = getStepByNumber(7)!
const committeeFlags = { department: 'operations', is_loan_committee_member: true, is_committee_secretary: true }
check('flagged analyst may convene', canActOnStep(ROLE_CODES.PRSF_ANALYST, secretaryStep, committeeFlags))
check('unflagged analyst cannot convene', !canActOnStep(ROLE_CODES.PRSF_ANALYST, secretaryStep))
check('flagged operations analyst may participate', canActOnStep(ROLE_CODES.PRSF_ANALYST, committeeStep, committeeFlags))
check('unflagged analyst cannot participate', !canActOnStep(ROLE_CODES.PRSF_ANALYST, committeeStep))
check('product tags never restrict membership', canActOnStep(ROLE_CODES.PRSF_ANALYST, committeeStep, { ...committeeFlags, product_tags: ['green'] }))
for (const code of [ROLE_CODES.SUPER_ADMIN, ROLE_CODES.PRSF_ADMIN, ROLE_CODES.AUDITOR, ROLE_CODES.BANK_ADMIN, ROLE_CODES.BANK_OFFICER]) {
  check(`${code} cannot gain committee rights through flags`, !canActOnStep(code, secretaryStep, committeeFlags) && !canActOnStep(code, committeeStep, committeeFlags))
}
for (const code of [ROLE_CODES.KKG_MEMBER, ROLE_CODES.KKG_SECRETARY, ROLE_CODES.UKO_OFFICER]) {
  check(`${code} retired role has no workflow authority`, SCHEME_STEPS.every((step) => !canActOnStep(code, step, committeeFlags)))
}
const unanimous = tallyVotes([{ vote: 'for' }, { vote: 'for' }, { vote: 'for' }])
check('all assigned members in favour carries', evaluateCommitteeOutcome(unanimous, 3, 3).carried)
check('majority is not unanimity', !evaluateCommitteeOutcome(tallyVotes([{ vote: 'for' }, { vote: 'for' }, { vote: 'against' }]), 3, 3).carried)
check('abstention prevents consent', !evaluateCommitteeOutcome(tallyVotes([{ vote: 'for' }, { vote: 'for' }, { vote: 'abstain' }]), 3, 3).carried)
check('missing assigned vote prevents consent', !evaluateCommitteeOutcome(unanimous, 3, 4).carried)
check('extra votes cannot create consent', !evaluateCommitteeOutcome(unanimous, 2, 2).carried)
check('empty committee cannot carry', !evaluateCommitteeOutcome(tallyVotes([]), 0, 0).carried)
check('valid registration payload accepted', workflowRequestSchema.safeParse({ to: 'eligibility_review', payload: { usd_rate: 10.95 } }).success)
for (const value of [null, [], { to: 'approved', payload: { status: 'approved' } }, { to: 'approved', payload: { usd_rate: 1, bank_id: 'other-bank' } }, { to: 'eligibility_review', payload: { usd_rate: 0 } }, { to: 'eligibility_review', payload: { usd_rate: -1 } }]) {
  check(`unsafe request rejected: ${JSON.stringify(value)}`, !workflowRequestSchema.safeParse(value).success)
}

// ── 7. Cancellation is always available, terminal states are terminal ────────
for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
  check(`${from} can be cancelled`, (targets as LoanStatus[]).includes('cancelled'))
}
check('guarantee_issued is terminal for this scheme', getNextStatuses('guarantee_issued').length === 0)
check('rejected is terminal for this scheme', getNextStatuses('rejected').length === 0)
check('ineligible is terminal for this scheme', getNextStatuses('ineligible').length === 0)

// ── 8. Structural integrity of the step table ────────────────────────────────
const stepNumbers = SCHEME_STEPS.map((s) => s.step)
check('step numbers are unique', new Set(stepNumbers).size === stepNumbers.length)
check('step numbers ascend', stepNumbers.every((n, i) => i === 0 || n > stepNumbers[i - 1]))
check('every step maps to a distinct status', new Set(SCHEME_STEPS.map((s) => s.status)).size === SCHEME_STEPS.length)
check('every step names at least one actor', SCHEME_STEPS.every((s) => s.actors.length > 0))
check('every step cites the Guideline', SCHEME_STEPS.every((s) => Boolean(s.guidelineRef)))
check('every step has RU and EN titles', SCHEME_STEPS.every((s) => Boolean(s.titleEn) && Boolean(s.titleRu)))
// Every status reachable through a transition must be a real status.
const declared = new Set<string>([
  ...SCHEME_STEPS.map((s) => s.status),
  'draft', 'under_review', 'rejected', 'ineligible', 'cancelled', 'approved',
])
for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
  for (const t of targets as LoanStatus[]) {
    check(`${from} -> ${t} targets a declared status`, declared.has(t))
  }
}

// ── 9. Every step, including mandatory deputy confirmation, is present ───────
const missing = Array.from({ length: 16 }, (_, i) => i + 1).filter((n) => !stepNumbers.includes(n))
check('all sixteen steps are implemented', missing.length === 0)
check('compliance cannot skip deputy confirmation', !canTransition('compliance_check', 'management_review'))
check('deputy review belongs to the Deputy Director', canActOnStep(ROLE_CODES.DEPUTY_DIRECTOR, getStepByNumber(14)!))
check('Director cannot self-confirm the deputy review', !canActOnStep(ROLE_CODES.FKG_MANAGEMENT, getStepByNumber(14)!))

// ── 10. Atomic RPC and trigger guard source checks ───────────────────────────
// These are regression checks on committed source, not proof that the migration
// is installed or that live RLS/transaction behavior passes integration tests.
const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const routeSource = readSource('../app/api/loans/[id]/workflow/route.ts')
const pipelineSource = readSource('./033_cgf_pipeline_repairs.sql')
const committeeSource = readSource('./024_cgf_committee_lifecycle.sql')
check('workflow delegates to the atomic RPC', routeSource.includes("supabase.rpc('cgf_transition_loan'"))
check('workflow validates input before the RPC', routeSource.includes('workflowRequestSchema.safeParse'))
check('workflow route does not update tables separately', !/\.from\([^)]*\)\.\s*(update|insert|delete)\(/.test(routeSource))
check('RPC locks the application before changing it', pipelineSource.includes('where id=p_loan for update;'))
check('RPC rejects stale application state', pipelineSource.includes("if l.status is distinct from p_from then raise exception 'TRANSITION_CONFLICT:"))
check('direct writes run the same workflow guard', /create trigger cgf_pipeline_guard before insert or update on public\.loan_applications/.test(pipelineSource))
check('history is written by the transactional trigger', /insert into public\.loan_application_history\(loan_id,action,old_status,new_status,performed_by,notes\)/.test(pipelineSource))
check('notifications are written by the transactional trigger', pipelineSource.includes('insert into public.notifications(user_id,title,message,type,link)'))
for (const code of [
  'ELIGIBILITY_MISSING', 'ASSESSMENT_NOT_SUBMITTED', 'RISK_REVIEW_MISSING',
  'QUORUM_NOT_MET', 'VERIFICATION_MISSING', 'FORMAL_APPLICATION_MISSING',
  'RECONCILIATION_MISSING', 'COMPLIANCE_MISSING', 'MGMT_DECISION_MISSING',
  'UNANIMOUS_DECISION_REQUIRED', 'READ_ONLY_ROLE', 'INVALID_PAYLOAD',
]) {
  check(`database guard raises ${code}`, pipelineSource.includes(`raise exception '${code}:`))
}
check('committee rejects invalid vote values', committeeSource.includes("p_data->>'vote' not in ('for','against','abstain')"))
check('committee counts only assigned members', committeeSource.includes('mm.member_id=v.member_id and mm.meeting_id=mid'))
check('committee requires unanimous assigned votes', committeeSource.includes("count(*)=cnt and bool_and(vote='for')") && committeeSource.includes('if not coalesce(unanimous_for or unanimous_against,false) then raise exception'))
check('protocol transition requires every signature', pipelineSource.includes('mm.signed_at is null'))
check('committee clarification writes audit evidence', pipelineSource.includes("'COMMITTEE_CLARIFICATION',auth.uid()"))

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\nФКГ scheme checks: ${passed} passed, ${failures.length} failed`)
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`)
  process.exit(1)
}
if (missing.length) {
  console.log(`  NOTE  step ${missing.join(', ')} is not yet implemented (see KNOWN GAP above)`)
}
console.log('ФКГ routing and guard-source checks passed. Live database verification is separate.\n')
