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

## Routes (30 pages, 4 API endpoints)

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
| `users` · `roles` · `column-config` · `settings` · `profile` · `manual` | Admin & config |
| `banks` · `banks/[id]` | Bank/branch management |

### API — `app/api/`
`admin/create-user` · `users` · `loans/[id]/generate-guarantee` · `notifications/validation-alert`

## Key Library Modules — `lib/`

| Path | Role |
|---|---|
| `types/database.ts` (443 L) | All DB types, `ROLE_TIERS`, `ROLE_CODES` |
| `i18n/translations.ts` (1307 L) | en/ru/tj strings; `i18n/context.tsx` provider |
| `hooks/use-loan-draft.ts` | Autosave/restore loan drafts |
| `hooks/use-loan-form-validation.ts` | Field-level loan form rules |
| `contexts/permission-context.tsx` | Client-side permission gating |
| `contexts/column-config-context.tsx` | User-configurable table columns |
| `utils/permissions.ts` · `utils/roles.ts` | RBAC logic, tier comparison |
| `utils/document-engine.ts` (691 L) | Document generation engine |
| `utils/pdf-generator.ts` | HTML→PDF, print |
| `utils/export.ts` · `utils/excel-parser.ts` | CSV/Excel import & export |
| `utils/validation.ts` | Shared validators (TIN, etc.) |
| `supabase/client.ts` · `server.ts` · `proxy.ts` | Supabase clients per context |
| `email/service.ts` · `error/monitoring.ts` | Notifications, error capture |

## Components

- `dashboard/dashboard-shell.tsx` — main app shell/nav
- `dashboard/notifications-bell.tsx` — notification dropdown
- `documents/guarantee-letter.tsx` — printable guarantee letter
- `admin/role-assignment.tsx`, `admin/workflow-tester.tsx`
- `error-boundary.tsx`, `theme-provider.tsx`
- `ui/` — 50 shadcn primitives

## Database — 27 tables (public schema)

**Core:** `loan_applications` (42 cols) · `borrowers` (23) · `banks` · `bank_branches` · `loan_products` · `sectors` · `profiles`

**Workflow:** `loan_application_history` · `loan_documents` · `loan_drafts` · `payment_schedules` · `guarantee_letters`

**Financial:** `claims` (27) · `fees` · `recoveries` · `monthly_reports`

**Guarantee reporting:** `guarantee_reports` · `guarantee_report_loans` (56 cols) · `guarantee_report_payments` · `guarantee_report_audit`

**Access/config:** `roles` · `column_configurations` (34) · `column_config_audit` · `system_settings` · `notifications` · `audit_trail` · `access_logs`

### Borrowers columns
`id, customer_code, legal_type, name, tin_number, registration_number, sector_id, address_street, address_city, address_district, phone, email, legal_rep_*, workforce_count, created_by, created_at, updated_at`

`legal_type` stored values: `llc` / `jsc` → "Legal Entity"; `sole_proprietor` → "Individual Entrepreneur". Form offers only these two types (`individual` retired).

## Migrations — `scripts/`
`001_create_schema` · `002_seed_data` · `003-complete-modules` · `01-create-test-accounts-onboarding` · `010_add_role_tiers` · `011_access_control` · `012_add_tin_unique_constraint` · `013_column_configurations` · `014_loan_drafts` · `015_notifications` · `016_borrowers_legal_type_constraint` · `017_remove_zip_code` · `018_enable_rls_access_logs_guarantee_letters` · `019_borrowers_customer_code_optional` · `create-guarantee-reports`

## RBAC

Tier-based (`lib/utils/roles.ts`): lower tier = higher authority. Approval thresholds — >500K requires PRSF Admin, >100K requires PRSF Analyst, ≤100K Bank Admin. Route protection matrix in `proxy.ts` maps each dashboard route to a `{resource, permission}` pair. See `docs/RBAC.md`.

## Loan status values
`draft` `submitted` `under_review` `approved` `rejected` `guarantee_issued` `disbursed` `active` `extension_pending` `rescheduled` `claim_pending` `claim_paid` `claim_rejected` `defaulted` `settled` `closed` `cancelled`

---

## Audit findings — all RESOLVED

`tsc --noEmit` is now clean (0 errors, down from 30).

### Security — RLS gap [FIXED]
`access_logs` and `guarantee_letters` were the only tables with `relrowsecurity = false`. Fixed in `scripts/018_enable_rls_access_logs_guarantee_letters.sql`. Note **every** Supabase client here (browser, server, proxy) uses the anon key — there is no service-role bypass, so RLS is the only gate.
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
