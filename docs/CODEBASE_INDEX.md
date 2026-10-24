# Codebase Index — Credit Guarantee Fund MIS

Generated reference map of the application. ~32,500 lines across app/, components/, lib/, scripts/.

## Stack

| Item | Value |
|---|---|
| Framework | Next.js 16.1.6 (App Router) |
| React | 19 |
| Styling | Tailwind CSS 3.4.17 (`tailwind.config.ts`) |
| UI | shadcn/ui — 50 files in `components/ui/` |
| Backend | Supabase (Postgres + Auth + RLS) |
| i18n | Custom — 3 locales: `en`, `ru`, `tj` |
| Middleware | `proxy.ts` (Next.js 16 naming) |

## Routes

Route lists below are the navigation index; use `app/**/page.tsx` and `app/**/route.ts` to confirm additions rather than relying on a fixed page count.

### Auth — `app/auth/`
`login` · `sign-up` · `sign-up-success` · `forgot-password` · `reset-password` · `error`

### Dashboard — `app/dashboard/`
| Route | Purpose |
|---|---|
| `/` | Main dashboard + stats widgets |
| `loans` · `loans/[id]` · `loans/new` · `loans/drafts` | Loan applications (core module) |
| `borrowers` | Borrower registry |
| `claims` | Claim submission/processing |
| `fees` | Fees & commissions |
| `guarantee-reports` · `[id]` · `new` | Guarantee reporting (+ `actions.ts` server actions) |
| `recoveries` · `reconciliation` | Recovery tracking, reconciliation |
| `reports` · `documents` · `audit` | Reporting, document center, audit trail |
| `committee` | Committee sittings, seats, votes, protocols |
| `form-requirements` | Configurable required fields |
| `users` · `roles` · `column-config` · `settings` · `profile` · `manual` | Admin & config |
| `banks` · `banks/[id]` | Bank/branch management |

### API — `app/api/`
`admin/create-user` · `users` · `loans/[id]/generate-guarantee` · `loans/[id]/workflow` · `notifications/validation-alert`

## Key Library Modules — `lib/`

| Path | Role |
|---|---|
| `types/database.ts` (443 L) | All DB types, `ROLE_TIERS`, `ROLE_CODES` |
| `i18n/translations.ts` (1307 L) | en/ru/tj strings; `i18n/context.tsx` provider |
| `hooks/use-loan-draft.ts` | Autosave/restore loan drafts |
| `hooks/use-loan-form-validation.ts` | Field-level loan form rules |
| `contexts/permission-context.tsx` | Client-side permission gating; user/role state from dashboard layout |
| `workflow/fkg-scheme.ts` | Transition graph, actor lanes, assessment gate, unanimity evaluator |
| `workflow/transition-input.ts` | Strict workflow request schema; only reference and FX rate are client-supplied |
| `employee-flags.ts` | Employee-flag validation and administrator-only update authorization |
| `forms/field-requirements.ts` · `hooks/use-field-requirements.ts` | Shared configurable field rules |
| `utils/route-permissions.ts` | Dashboard route-to-resource permission map |
| `contexts/column-config-context.tsx` | User-configurable table columns |
| `utils/permissions.ts` · `utils/roles.ts` | RBAC logic, tier comparison |
| `utils/document-engine.ts` (691 L) | Document generation engine |
| `utils/pdf-generator.ts` | HTML→PDF, print |
| `utils/export.ts` · `utils/excel-parser.ts` | CSV/Excel import & export |
| `utils/validation.ts` | Shared validators (TIN, etc.) |
| `supabase/client.ts` · `server.ts` · `proxy.ts` | Supabase clients per context |
| `admin/accounts.ts` · `error/monitoring.ts` | Validated administrator account inputs, error capture |

## Components

- `dashboard/dashboard-shell.tsx` — main app shell/nav
- `dashboard/notifications-bell.tsx` — user-scoped SWR notification feed, realtime insert/update delivery, and polling fallback. Uses live `notifications.link`; email delivery has been removed.
- `admin/password-reset.tsx` + `api/admin/reset-password` — system-administrator password recovery without emailed links. Privilege ceiling, self-reset denial and audit entries without passwords.
- Account provisioning is administrator-only through `api/admin/create-user`, with preconfirmed Auth accounts and a required active role. Migration `033_cgf_internal_notifications_admin_accounts.sql` rejects new Auth users lacking the server-owned `app_metadata.account_provisioning=administrator` marker and publishes notifications for Realtime. Existing users are unchanged. For first-admin bootstrap on a self-hosted instance, use the server-side Auth Admin API with this marker; never put the service-role key in the browser.
- Deployment target is a future local server. The current backend is still hosted Supabase; running Next.js locally alone does not migrate Auth, Postgres, Storage or Realtime. Self-host these services and replay migrations separately. Disable Auth SMTP/security-notification emails in that deployment. In-app alerts work while MIS is open and do not use external Web Push providers.
- Email-free operation verification: frozen-lockfile installation, `pnpm verify:notifications` (account/alert input validation and safe destinations), 199 scheme checks, 68 role assertions, 15 employee-flag assertions, full TypeScript and production build passed. Live metadata confirmed the provisioning trigger, notification publication and RLS are enabled. Desktop browser checks confirmed English/Russian account-recovery instructions and the signup-to-login redirect. Signed-in account creation/reset and notification delivery were not browser-tested because no authenticated session was available. Existing security advisories listed below remain; the new invoker trigger has a pinned search path and no public execution grants.
- `documents/guarantee-letter.tsx` — printable guarantee letter
- `admin/role-assignment.tsx`, `admin/cgf-workflow-controls.tsx` — active base roles, committee rules and temporary signature delegation
- `workflow/signature-review-panel.tsx` — deputy confirmation and authorized guarantee signature. The production workflow jump/tester utility has been removed.
- `error-boundary.tsx`, `theme-provider.tsx`
- `ui/` — 50 shadcn primitives

## Database — public schema

This section is a domain map, not authoritative live metadata. Workflow artifact tables and committee tables have been added since the original inventory; inspect `information_schema` and `pg_policies` through Supabase MCP before changing queries.

**Core:** `loan_applications` (42 cols) · `borrowers` (23) · `banks` · `bank_branches` · `loan_products` · `sectors` · `profiles`

**Workflow:** `loan_application_history` · `loan_documents` · `loan_drafts` · `payment_schedules` · `guarantee_letters`

**Committee:** `committee_meetings` · `committee_meeting_members` · `committee_agenda_items` · `committee_votes`

**Step artifacts:** `eligibility_checks` · `assessment_notes` · `risk_reviews` · `verifications` · `formal_applications` · `uko_reconciliations` · `compliance_checks` · `management_decisions`

**Financial:** `claims` (27) · `fees` · `recoveries` · `monthly_reports`

**Guarantee reporting:** `guarantee_reports` · `guarantee_report_loans` (56 cols) · `guarantee_report_payments` · `guarantee_report_audit`

**Access/config:** `roles` · `column_configurations` (34) · `column_config_audit` · `system_settings` · `notifications` · `audit_trail` · `access_logs`

### Borrowers columns
`id, customer_code, legal_type, name, tin_number, registration_number, sector_id, address_street, address_city, address_district, phone, email, legal_rep_*, workforce_count, created_by, created_at, updated_at`

`legal_type` stored values: `llc` / `jsc` → "Legal Entity"; `sole_proprietor` → "Individual Entrepreneur". Form offers only these two types (`individual` retired).

## Migrations — `scripts/`
`001_create_schema` · `002_seed_data` · `003-complete-modules` · `01-create-test-accounts-onboarding` · `010_add_role_tiers` · `011_access_control` · `012_add_tin_unique_constraint` · `013_column_configurations` · `014_loan_drafts` · `015_notifications` · `016_borrowers_legal_type_constraint` · `017_remove_zip_code` · `018_enable_rls_access_logs_guarantee_letters` · `019_borrowers_customer_code_optional` · `create-guarantee-reports`

## RBAC

Lower tier means greater administrative authority, not permission to decide applications. `lib/utils/permissions.ts` combines the static matrix and database overrides with non-overridable prohibitions: auditors cannot write; `super_admin` and `prsf_admin` cannot approve loans/claims. `lib/workflow/fkg-scheme.ts` separately rejects those roles for every workflow step. `proxy.ts` and `lib/utils/route-permissions.ts` protect navigation; RLS remains necessary for direct Data API access. Older threshold descriptions in `docs/RBAC.md` must not override the approved CGF role document.

## Loan status values

The authoritative type is `LoanStatus` in `lib/types/database.ts`; issuance steps and transitions are in `lib/workflow/fkg-scheme.ts`. The original lifecycle list below omits intermediate scheme states such as `uko_registration`, `eligibility_review`, `assessment`, `risk_review`, `kkg_scheduled`, `kkg_review`, `verification`, `kkg_protocol`, `formal_application`, `uko_reconciliation`, `compliance_check`, and `management_review`.

`draft` `submitted` `under_review` `approved` `rejected` `guarantee_issued` `disbursed` `active` `extension_pending` `rescheduled` `claim_pending` `claim_paid` `claim_rejected` `defaulted` `settled` `closed` `cancelled`

---

## Historic audit findings

The entries below describe earlier fixes, not a guarantee that the current repository is error-free. Full TypeScript checking now passes: the 51 implicit-any diagnostics were caused by `ReturnType<typeof createBrowserClient>` erasing the singleton client's generic inference; an explicit `SupabaseClient` type fixes the source rather than adding loose callback annotations.

### Security — RLS gap [FIXED]
`access_logs` and `guarantee_letters` were the only tables with `relrowsecurity = false`. Fixed in `scripts/018_enable_rls_access_logs_guarantee_letters.sql`. Browser, server and proxy clients use the public key and rely on RLS. User-management APIs use a separately authorized service-role client; committee, deputy and signature RPCs use checked `SECURITY DEFINER` transactions with a pinned search path. Their authorization checks are part of the security boundary, not a substitute for ordinary table RLS.
- `access_logs`: append-only. INSERT open (`WITH CHECK true`) so failed/unauthenticated attempts still log; SELECT limited to `super_admin`/`auditor`; no UPDATE/DELETE.
- `guarantee_letters`: bank users see only their own bank's letters (via `loan_applications.bank_id`), PRSF roles see all; INSERT authenticated; UPDATE (revocation) admin-only; no DELETE.

### Bug — Borrowers City column blank [FIXED]
Read `b.city` but the column is `address_city`.

### Role names rendered blank everywhere [FIXED]
The `roles` table has no `name` column (only `name_en`/`name_ru`/`name_tj`), so every `role.name` read was `undefined` — 9 sites across `roles/page.tsx` and `admin/role-assignment.tsx`, including audit-log payloads. Now uses `lib/utils/localized-name.ts`.

### Rules-of-Hooks violation in roles page [FIXED]
`roles/page.tsx` returned early on the access check *before* its `useState` calls, changing hook order as `userRole` resolved. Guard moved below all hooks.

### Calendar component on dead v8 API [FIXED]
`components/ui/calendar.tsx` used react-day-picker v8 keys (`day_selected`, `nav_button`, `head_row`, `IconLeft`/`IconRight`) against installed v9, so custom arrows and most styling silently never applied. Ported to v9 (`selected`, `button_previous`, `weekdays`, orientation-aware `Chevron`).

### Supabase joined relations [FIXED]
PostgREST returns embeds as arrays; code cast them straight to objects, so `dashboard` bank/borrower names silently fell back to `Unknown`/`—`. Normalized via `lib/utils/supabase-relation.ts` (`one()`). `guarantee-reports` also declared `banks: { name }` while selecting `name_en`.

### Submission failed with 23502 on `customer_code` [FIXED]
"Bank Customer Code" is an optional form field, but `borrowers.customer_code` was `NOT NULL` with no default, so every application submitted without a bank code was rejected. Fixed in `scripts/019_borrowers_customer_code_optional.sql` (UNIQUE retained — Postgres allows multiple NULLs).

Two related problems fixed in the same pass:
- **Silent cross-customer overwrite.** The submit handler looked up an existing borrower by `customer_code` and then ran `.update()` on that row, so entering a code already owned by a *different* customer overwrote that customer's name/TIN/address. Now blocked with a clear message. Identity lookup is by TIN only.
- **Raw Postgres JSON shown to users.** `err instanceof Error ? err.message : JSON.stringify(err)` leaked driver JSON, because Supabase errors are plain objects, not `Error`s. New `lib/utils/db-error.ts` maps SQLSTATEs (23502/23505/23503/23514/22001/22P02/42501) to actionable text and never returns JSON. Reusable for other forms.

**Open question:** `customer_code` is UNIQUE *globally*, but it is a per-bank reference and `borrowers` has no `bank_id`. Two banks cannot both use their own code `42` for different customers — needs a product decision (scope per bank vs. drop uniqueness).

### Draft completion never reached 100% [FIXED]
Hardcoded list counted 5 optional fields (`addressStreet`, `city`, `phone`, `legalRepBirthdate`, `passportNumber`) as required and missed `legalRepTin`, capping completion near 72%. Now derived from `REQUIRED_FIELD_NAMES` in `use-loan-form-validation.ts`, so it cannot drift from the form's own validation.

## Active data flow and verification map

- `app/dashboard/layout.tsx` provides the dashboard shell and permission context. `proxy.ts` refreshes sessions and checks route access; navigation checks do not replace database authorization.
- Loan detail state lives in `app/dashboard/loans/[id]/page.tsx`. The workflow panel and artifact forms submit to `app/api/loans/[id]/workflow/route.ts`; `lib/workflow/fkg-scheme.ts` defines valid transitions and actors.
- The workflow route rejects administrators/auditors and inactive roles, validates a strict request schema, computes registration FX metadata on the server, checks committee unanimity, detects zero-row updates, and writes history using the live columns `loan_id`, `action`, `old_status`, `new_status`, `performed_by`.
- Committee state is fetched with SWR in `app/dashboard/committee/page.tsx`; `components/committee/meeting-card.tsx` calls `cgf_committee_action`. Direct authenticated INSERT/UPDATE/DELETE privileges on committee tables are revoked. The RPC selects 2–3 flagged operations members, adds the Director above the configurable TJS threshold, selects the senior chair, freezes unanimous protocols, records each assigned member's sign-off and atomically releases the loan with history. Finalized records are protected by database triggers. The durable `cgf-committee-voting-escalation` pg_cron job notifies Directors about missing votes after a weekday-based working day (Dushanbe time; public holidays are not yet modeled).
- Step 14 is `deputy_review`. `cgf_confirm_deputy` binds the confirmation to exact loan terms, closed signed committee snapshot and submitted cleared compliance note, then records the handoff/history atomically. `cgf_issue_guarantee` requires a current confirmation, a different signer, a recorded Director approval and active Director or expiring delegated signature authority. Letter, loan state, history and audit are committed together. `signature_delegations` are administrator-managed, expiring and revocable. These are recorded authenticated sign-offs, not a certificate-based qualified e-signature integration.
- The settings page's CGF workflow tab controls the 2/3-member count, Director TJS threshold and signature delegation. Settings changes are validated and audited in database triggers; ordinary settings sections now serialize the live text-backed values and surface save failures.
- `scripts/020_cgf_protect_profile_privileged_fields.sql` and `021_cgf_add_employee_flags.sql` record profile protection/flags. `022_cgf_non_overridable_write_prohibitions.sql` records the applied database restrictions: active-role writers only, auditor write denial, administrator committee write denial, and administrator decision-field guards on loans/claims.
- Focused checks: `pnpm verify:scheme`; run `scripts/verify-role-prohibitions.ts` and `scripts/verify-employee-flags.ts` with the same Node strip-types/alias-loader options. Latest results: 178 workflow checks, 68 role assertions, 15 employee-flag assertions, full TypeScript checking and the production build passed. Bash builds need the managed project environment loaded from `/vercel/share/.env.project`; an initial build without it failed on missing public Supabase values, then passed when sourced.
- Rolled-back live database tests exercised automatic committee composition, attendance, unanimous votes, unsigned issuance denial, all-member sign-offs, atomic protocol release/history, finalized protocol immutability, deputy confirmation, Director approval, IT signing denial, delegated signature, idempotency and revocation. A further test ran deputy/Director/delegate operations as PostgreSQL `authenticated` with RLS, including direct guarantee INSERT denial. Fixtures and a temporary in-transaction role assignment were rolled back; sequence reservations may leave expected numbering gaps.
- Browser verification remains incomplete: the fresh browser redirects protected pages to login. This is not an authenticated UI pass. Security advisors reported existing mutable-search-path and anonymous-definer warnings outside the new RPCs. Authenticated-definer warnings for deliberately exposed, authorization-checked RPCs are expected; see [search-path guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) and [anonymous-function guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Sequential completion ledger — 24 October 2026

This ledger records implemented work separately from the remaining request. The whole backlog is **not complete**.

| Milestone | Current state and evidence |
| --- | --- |
| Cross-bank financial/history isolation | Completed baseline: migration `036` applied. `scripts/verify-financial-isolation.sql` tests own-bank reads, cross-bank denial, unauthorized inserts/updates, financial writer success, mismatched bank/loan/claim aliases, history forgery/mutation, inactive-user denial and anonymous denial. The executed transaction rolled back; follow-up counts confirmed zero test loans/history and zero anonymous/history-write grants. Fixture applications must be bank-originated drafts because the current pipeline guard correctly rejects privileged direct active-loan inserts. |
| Response and invoice safety | Completed: no blanket public caching; dashboard/API/auth responses use private/no-store; baseline response security headers are configured. All nine invoice interpolation fields are HTML-escaped by `lib/utils/fee-invoice.ts`, and print windows detach their opener. `pnpm verify:security` covers malicious values; `pnpm verify:production-security` confirmed production 307/401/200 responses and actual headers. Signed-in printing is not yet acceptance-tested. |
| Dependencies and quality gates | In progress: Next.js `16.4.3`, React `19.3.1`, jsPDF `4.2.1`, official SheetJS `0.20.3` tarball and Zod `4.6.6`, plus targeted patched transitive overrides. `pnpm install --frozen-lockfile` and the full `pnpm audit` passed with no known vulnerabilities. `typescript.ignoreBuildErrors` is removed. ESLint installs and executes with Next core-web-vitals/TypeScript rules. The 25 October shared-contract cleanup removed 37 errors; the shared-hook/render-lifecycle follow-up removed another 9, and the loan validation-panel extraction removed 5 errors and 5 unused-import warnings, and the display-clock cleanup removed 3 purity errors without rule suppressions. The typed portfolio-report follow-up removed 9 more errors and 3 warnings; the typed bank-detail follow-up removed another 8 errors and 3 warnings, the locale-restoration follow-up removed one effect-lifecycle error, and the navigation-contract follow-up removed 3 errors and one unused-import warning, and the permission-context contract follow-up removed another 4 errors: **101 errors and 84 warnings remain**. Typed boundaries now cover spreadsheet import/export and validation, persisted loan draft fields, user-update/audit payloads, monitoring metadata, configuration audit snapshots and authorized API handler context; Tailwind uses an ESM plugin import. Remaining explicit `any` types and effect/state lifecycles still need real fixes. ESLint 9 is retained for the installed Next plugins' declared peer compatibility; its upstream deprecation warning remains. |
| Atomic claims/payment/recovery controls | Pending: controlled payment, atomic submission, financial invariants and concurrency/idempotency. Production claims committee membership must be explicitly assigned by administrators. |
| Reporting and fee correctness | Pending: canonical calculations, transactional multi-table report saves, quarter/currency/zero-value/overpayment edge cases and reporting acceptance. |
| Remaining role capabilities/settings | Pending: fund-only credit history, invitation-scoped Legal access, department-head authority, bank confirmation/withdrawal details, capability-specific switches, persisted templates, and durable stage notifications. Bank-system integration requires real bank API contracts/authentication. |
| Authenticated acceptance and local deployment | Pending: multi-role browser flows, migration reconciliation, operating/backup/restore procedures and self-hosted backend validation. The browser at 1478×753 light mode redirected `/dashboard/fees` to login; this is not a signed-in UI pass. |

25 October shared-contract verification: full TypeScript checking, the production build, 199 workflow checks, notifications, invoice/response security, Excel and PDF regressions, and production HTTP/security-header checks passed. `verify:excel` now also tests multilingual loan/payment imports, numeric parsing, report validation, invalid amount/date/payment totals and CSV quotes/newlines. The 11 changed implementation files have zero lint errors; the repository-wide lint gate still fails with the backlog above. At 1478×753/light, `/dashboard/loans/new` redirected to login, so signed-in draft restoration and form-validation interaction remain unverified. No schema, RLS or financial calculation changes were made in this cleanup.

25 October shared-hook/render-lifecycle follow-up: the canonical mobile hook now uses `useSyncExternalStore`, and the UI compatibility import re-exports it. Carousel availability reads use primitive external-store snapshots; cleanup removes both `select` and `reInit` listeners. Sidebar skeleton widths are deterministic across SSR/hydration. Report chart cards are typed module-level components rather than recreated during parent renders, with named export buttons. `pnpm verify:ui-lifecycles` passes SSR and subscription-contract regressions (mock browser/Embla events, breakpoint boundaries, cleanup, keyboard callbacks, skeleton SSR and export labels); these are not full mounted-browser interaction tests. TypeScript, the production build, all existing local workflow/notification/security/Excel/PDF regression commands and targeted shared-component/test-script lint passed. Full lint still fails with 134 errors and 96 warnings. At 1478×753/light, `/dashboard/reports` redirected to login; signed-in charts/export behavior remains unverified. No database/schema/RLS or financial-calculation changes were made.

25 October loan validation-panel follow-up: extracted `components/forms/step-validation-panel.tsx` from the new-loan page and passed validation/touched state explicitly at all five tab call sites. React now retains the same component type across page renders. Existing global touched-field visibility, per-step error selection, singular/plural messages and error content are preserved; unused page imports were removed. Extended `pnpm verify:ui-lifecycles` checks all five steps, hidden/empty/missing states, message counts and HTML escaping using SSR. Those checks, targeted lint for the extracted component/test script, TypeScript and `git diff --check` passed; full lint still fails with 129 errors and 91 warnings. This pure presentation refactor did not change validation rules, draft persistence, permissions, database access or submission behavior. No new browser or production-build check was run; authenticated form acceptance remains pending.

25 October display-clock follow-up: `hooks/use-current-time.ts` shares one 30-second timer across subscribers, exposes cached primitive snapshots and a null SSR/hydration snapshot, and clears/reset its timer/state on final unsubscribe. Notification ages, the drafts expiring-soon count and delegation expiry labels no longer read `Date.now()` during render; they update while mounted. Pending time is explicit until subscription. Relative ages clamp future timestamps to zero and label invalid timestamps as unknown; existing seven-day ceiling logic and revoked/expired status precedence are retained. Extended lifecycle regressions cover SSR defaults, stable snapshots, multiple subscribers, timer updates, cleanup/remount and time-format/expiry boundaries with mocked timers. Lifecycle regressions, targeted lint for the hook/helpers/test script and both changed components, full TypeScript, notification checks, 199 scheme checks and `git diff --check` passed. Full lint still fails with 126 errors and 91 warnings (the drafts page retains its pre-existing loading-effect error). The 1478×753/light preview of `/dashboard/loans/drafts` redirected to login; authenticated display updates are not browser-verified. Database queries, RLS, delegation authority enforcement and financial calculations are unchanged. No production build was run for this UI-only follow-up.

25 October portfolio-report follow-up: extracted typed aggregation and CSV row projection into `lib/utils/portfolio-report.ts`; the reports page no longer uses explicit `any`. Confirmed selected report column types against live Supabase metadata. Shared `one()` normalization preserves object joins and correctly groups array-shaped bank/sector joins; missing relations retain Unknown/Other fallbacks. Map-backed grouping safely handles prototype-like names. Existing date/bank query filters, summary formulas and status labels are unchanged; canonical reporting/fee correctness remains pending. `pnpm verify:portfolio-report` covers empty/null input, totals, object/array/empty joins, month/amount ordering, grouping keys, input immutability and CSV column/quote/newline preservation. That command, full TypeScript, targeted helper/test lint, Excel and UI-lifecycle regressions and `git diff --check` passed. Full lint still fails with 117 errors and 88 warnings; the reports page retains one loading-effect error. The 1478×753/light preview redirected `/dashboard/reports` to login, so signed-in charts and download behavior remain unverified. No database/schema/RLS changes or production build were performed.

25 October bank-detail follow-up: replaced all eight explicit `any` types with selected-record contracts and a keyed edit form, verified against live column metadata including nullability. The bank query now projects only the six fields used by the page; related query filters, order and 20/10/10 limits, summary formulas, editable field set, localization fallbacks and save payload remain unchanged. Saving retains the bank identifier; null active flags render an unchecked controlled switch and missing claim filing dates render an em dash rather than an epoch date. Unused router/translation bindings were removed and the stable singleton client is included in effect dependencies. Targeted page lint, full TypeScript, existing UI-lifecycle regressions and `git diff --check` passed. Full lint still fails with 109 errors and 85 warnings. The 1478×753/light preview of a bank-detail URL redirected to login; authenticated loading/edit/cancel/save and null-date display remain unverified in the browser. No database/schema/RLS or financial-calculation changes were made; no production build was run.

25 October locale-restoration follow-up: the i18n provider commits locale and translations together after successful loading. One request generation guards saved-preference restoration and explicit switches, preventing stale restoration or rapid switches from overwriting the latest choice; effect cleanup invalidates pending work. SSR remains English, invalid preferences are ignored, and denied storage or failed translation loads leave a usable language. Existing `cgf-locale` preference storage is unchanged. Expanded `pnpm verify:ui-lifecycles` uses SSR plus mocked hook/translation/storage contracts to cover all three saved languages, no synchronous restoration update, invalid preferences, restoration-versus-selection races, rapid switching, cleanup/effect replay, storage denial and load failure/recovery; these are not mounted-browser interaction tests. Lifecycle checks, targeted provider/test lint, full TypeScript (`--incremental false`) and `git diff --check` passed. Full lint still fails with 108 errors and 85 warnings. The 1478×753/light preview of `/dashboard` redirected to login, so authenticated selector/profile language changes remain unverified in the browser. No database, permissions, financial calculations, dependencies or production-build configuration changed; no production build was run.

25 October navigation-contract follow-up: removed three unnecessary `any` casts from administrative navigation keys; the existing `NavItem.titleKey` contract validates them against the English translation shape. Removed the unused `SheetTrigger` import. Runtime routes, labels and permission filtering are unchanged. Expanded `pnpm verify:ui-lifecycles` parses the actual navigation declarations with TypeScript and checks 19 unique routes, nonempty labels in all three real translation dictionaries, the existing admin-only/PRSF-only flags and the roles-resource binding. These static contract checks do not exercise authorization or signed-in navigation. Lifecycle/contract regressions, targeted shell/test-script lint, full TypeScript (`--incremental false`) and `git diff --check` passed; full lint still fails with 105 errors and 84 warnings. Browser and production-build checks were not repeated for this type-only cleanup. No database, permissions, financial logic or dependencies changed.

25 October permission-context contract follow-up: both user contracts now use Supabase's authenticated `User` type, matching the dashboard layout's `auth.getUser()` caller. Disabled-child cloning uses a checked React button-prop subset instead of `any`; refresh callback dependencies now match the role object it captures. No permission rules, queries, fallback behavior or role-loading state were changed. Expanded UI-lifecycle regressions verify hidden/disabled/allowed wrapper results, fallback content, tooltip overrides, mixed children, disabled SSR markup, click prevention and preservation of allowed children using a mocked context. These are not mounted-browser or live authorization tests. UI-lifecycle checks, full TypeScript (`--incremental false`), test-script lint, 199 scheme checks and `git diff --check` passed. Targeted context lint retains its pre-existing synchronous effect-state error; full lint still fails with 101 errors and 84 warnings. No schema/RLS, financial, dependency or build changes were made; no production build or browser check was repeated for this contract-only cleanup.

Verification commands: `pnpm verify:portfolio-report`, `pnpm verify:ui-lifecycles`, `pnpm typecheck`, `pnpm verify:scheme`, `pnpm verify:notifications`, `pnpm verify:security`, `pnpm verify:excel`, `pnpm verify:pdf`, `pnpm build`, and (after a build, with managed environment loaded) `pnpm verify:production-security`. The live SQL regression must run through Supabase MCP; it is not automatically executed by the package scripts. Security advisors still flag older mutable-search-path/anonymous-definer functions and existing exposed authenticated RPCs; see the [search-path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) and [anonymous-execute](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) guidance. Do not equate a zero npm audit with a complete application security review.

## Unfinished CGF document implementation

Do not treat these as completed based on the earlier audit section:

**Completed foundation:** migrations `023`–`030` are applied and recorded. All five legacy committee/UKO assignments became Credit Analyst with flags preserved; zero assignments remain on the three retired inactive codes. Four member flags, one secretary flag and one department-head flag were verified. Missing Deputy Director, Accountant, Reporting, Legal and Business Development roles exist with limited grants. No real accounts were arbitrarily assigned to the two deputy posts; administrators must assign the intended people through user management. Application committees, deputy confirmation, delegated signature, atomic guarantee issuance and core workflow settings are implemented as described above.

Still unfinished; do not report the entire document as complete:

1. **Claims committee and role details:** separate claims sittings are implemented by migrations `031`–`032` (applied), `components/committee/claims-register.tsx` and `cgf_claim_committee_action`. System selection requires one flagged active Risk officer, Compliance officer and Credit Analyst; the Director joins strictly above the configured threshold using the original approved loan amount from issued guarantee metadata, not the claim or mutable current loan amount. Unanimous votes freeze a protocol, every assigned member signs, and issuance atomically decides/audits the claim. Rejection also records the linked pending loan outcome/history. Direct claim decision/payment writes, preapproved claim inserts and direct loan claim outcome changes are blocked; both former single-user approve/pay interfaces are removed. **Remaining:** no production accounts currently have the claims-member flag; administrators must designate the intended staff. Legacy guarantees without original terms and non-TJS evidence fail closed pending reconciliation/FX support. Controlled claim payments and atomic submission remain unfinished; approval never marks a claim paid. Finish department-head small-amount decision/assignment authority and bank-manager confirmation/withdrawal rules. The legacy 3/4/5 `requiredQuorum` utility remains only in old evaluator/API checks and tests; it no longer controls either new sitting composition and should be retired with the remaining legacy evaluator paths.
2. **Requested feature backends and switches:** direct-officer submission toggles, bank-system reporting, product development, stage notes, fee/portfolio tools and bulk portfolio guarantees still need complete capability-specific enforcement. Do not expose switches that claim unimplemented capabilities work. Bank reporting requires actual bank API contracts/authentication, not an invented connector.
3. **Authorization boundaries:** cross-bank fee/recovery/application-history isolation is implemented in applied migration `036_cgf_financial_history_isolation.sql`; the rolled-back regression verifies actual `authenticated` and `anon` database roles. Banks can read only their own linked records; only active financial staff (`super_admin`, `prsf_admin`, `accountant`) can write fees/recoveries, with parent/alias consistency checks. Client history writes and ledger deletes are revoked. This is not the complete financial-integrity/payment milestone. Remaining: fund-only borrower credit history/audit access, lawyer invitations (the Legal role currently has no invitation-based row access), administrator deletion/retention paths and remaining service-role operations. Fix existing anonymous-definer/search-path advisories after inspecting function behavior. New-role existence does not mean every role-specific module is implemented.
4. **Ordinary workflow atomicity — pipeline milestone completed:** migrations `033_cgf_pipeline_repairs.sql`, `034_cgf_pipeline_documents.sql` and `035_cgf_pipeline_evidence_guards.sql` implement the ordinary pipeline guards. The workflow route delegates to `cgf_transition_loan`; the enabled `cgf_pipeline_events` trigger records history and bank-scoped notifications in the transition transaction. The committee secretary UI calls `cgf_request_clarification`, which cancels the current sitting without discarding votes, audits the request, returns the application to the bank and routes its response through assessment before a new sitting. Step artifacts remain separately submitted evidence; guards require appropriate evidence before advancement. Post-issuance claim/payment work remains outside this completed pipeline milestone.

   Completion review: 199 scheme checks, notification/account input checks, 68 role assertions, 15 employee-flag assertions and full TypeScript checking passed. Read-only live inspection confirmed both pipeline triggers enabled, the bank-scoped notification function, and clarification return/audit logic with pinned search paths. These metadata/source checks are not a live end-to-end transaction test. At desktop 1478×753 in light mode, `/dashboard/committee` redirected to login; authenticated multi-role browser verification remains pending.
5. **Final UI verification:** complete signed-in multi-role browser tests. A successful type-check/build and database-role tests do not replace authenticated UI validation. Claims continuation checks passed: full TypeScript, production build, 178 workflow checks, 68 role assertions, 15 employee-flag assertions and the rolled-back `scripts/verify-claims-committee.sql` regression (composition failures roll back, original-loan and threshold-equality routing, duplicate sittings, unanimous approval/rejection, unsigned issuance denial, signatures, protocol immutability, changed-term denial, direct decision/payment denial, bank protocol isolation, auditor reads, reconsideration and cancellation). No test loan fixtures or temporary flags remained. The desktop browser check at 1478×753 light mode redirected `/dashboard/committee` to login; signed-in interaction is not verified. Security advisors found no new RLS/search-path/anonymous-execute issue in claims objects; the intentionally authenticated, role-checked definer RPC is flagged as callable. Existing [mutable search-path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous definer](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and leaked-password-protection advisories remain outside this milestone.
