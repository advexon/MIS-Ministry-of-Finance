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
  requiredQuorum,
  toUsd,
} from '@/lib/workflow/fkg-scheme'
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
  'management_review', 'approved', 'guarantee_issued',
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
check('9,999 USD does not require assessment', requiresAssessment(9_999) === false)
check('10,000 USD requires assessment (inclusive bound)', requiresAssessment(10_000) === true)
check('10,001 USD requires assessment', requiresAssessment(10_001) === true)
check('threshold constant is 10000', ASSESSMENT_THRESHOLD_USD === 10_000)
// A missing FX rate must be undecidable rather than silently "no assessment".
check('null amount is undecidable', requiresAssessment(null) === null)
check('toUsd refuses a null rate', toUsd(100_000, null) === null)
check('toUsd refuses a zero rate', toUsd(100_000, 0) === null)
check('toUsd converts correctly', toUsd(109_500, 10.95) === 10_000)
// Both routes out of the gate exist.
check('gate D can route to assessment', canTransition('eligibility_review', 'assessment'))
check('gate D can skip to risk_review', canTransition('eligibility_review', 'risk_review'))

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
check('УКО officer may act on step 2', canActOnStep(ROLE_CODES.UKO_OFFICER, step2))
check('bank officer may not act on step 2', !canActOnStep(ROLE_CODES.BANK_OFFICER, step2))
check('credit risk officer may act on step 6', canActOnStep(ROLE_CODES.CREDIT_RISK_OFFICER, step6))
check('УКО officer may not act on step 6', !canActOnStep(ROLE_CODES.UKO_OFFICER, step6))
check('management may issue the ПВГ', canActOnStep(ROLE_CODES.FKG_MANAGEMENT, step16))
check('compliance officer may not issue the ПВГ', !canActOnStep(ROLE_CODES.COMPLIANCE_OFFICER, step16))
check('an unknown role may act nowhere', !canActOnStep(null, step2))
// Admin break-glass is deliberate and should stay visible.
check('super admin retains break-glass on step 6', canActOnStep(ROLE_CODES.SUPER_ADMIN, step6))

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

// ── 9. Known gap, asserted so it cannot be forgotten ─────────────────────────
// The Guideline numbers its steps 1..16, but step 14 has no entry in this table.
// It is recorded here as a KNOWN GAP rather than left as a silent hole: the
// assertion documents the omission and will start failing once step 14 is added,
// prompting this note to be removed.
const missing = Array.from({ length: 16 }, (_, i) => i + 1).filter((n) => !stepNumbers.includes(n))
check('the only unimplemented step is 14', missing.length === 1 && missing[0] === 14)

// ── 10. Every evidence-bearing step must be gated server-side ────────────────
// The checks above all read the registry, so they cannot see whether the API
// actually enforces a step's evidence. Steps 9, 11 and 12 were fully built —
// table, RLS and form — yet had no gate, so an application could advance past a
// site visit, a signed formal application and the УКО/ККГ reconciliation without
// any of them existing. This asserts against the route source so a future step
// cannot ship its form and table while quietly skipping its gate.
const routeSource = readFileSync(
  new URL('../app/api/loans/[id]/workflow/route.ts', import.meta.url),
  'utf8',
)
const requiredGateCodes = [
  'ELIGIBILITY_MISSING',
  'ASSESSMENT_NOT_SUBMITTED',
  'RISK_REVIEW_MISSING',
  'QUORUM_NOT_MET',
  'VERIFICATION_MISSING',
  'FORMAL_APPLICATION_MISSING',
  'RECONCILIATION_MISSING',
  'COMPLIANCE_MISSING',
  'MGMT_DECISION_MISSING',
]
for (const code of requiredGateCodes) {
  check(`workflow route enforces gate ${code}`, routeSource.includes(code))
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\nФКГ scheme checks: ${passed} passed, ${failures.length} failed`)
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`)
  process.exit(1)
}
if (missing.length) {
  console.log(`  NOTE  step ${missing.join(', ')} is not yet implemented (see KNOWN GAP above)`)
}
console.log('All ФКГ scheme guarantees hold.\n')
