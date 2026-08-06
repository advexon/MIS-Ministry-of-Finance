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
`001_create_schema` · `002_seed_data` · `003-complete-modules` · `01-create-test-accounts-onboarding` · `010_add_role_tiers` · `011_access_control` · `012_add_tin_unique_constraint` · `013_column_configurations` · `014_loan_drafts` · `015_notifications` · `016_borrowers_legal_type_constraint` · `017_remove_zip_code` · `create-guarantee-reports`

## RBAC

Tier-based (`lib/utils/roles.ts`): lower tier = higher authority. Approval thresholds — >500K requires PRSF Admin, >100K requires PRSF Analyst, ≤100K Bank Admin. Route protection matrix in `proxy.ts` maps each dashboard route to a `{resource, permission}` pair. See `docs/RBAC.md`.

## Loan status values
`draft` `submitted` `under_review` `approved` `rejected` `guarantee_issued` `disbursed` `active` `extension_pending` `rescheduled` `claim_pending` `claim_paid` `claim_rejected` `defaulted` `settled` `closed` `cancelled`

---

## Known Issues (audit findings)

### Security — RLS disabled on 2 tables
`access_logs` and `guarantee_letters` have `relrowsecurity = false` while all 25 other tables enforce RLS. Both hold sensitive data and are reachable via the anon key.

### Bug — Borrowers table City column always blank
`app/dashboard/borrowers/page.tsx:252` reads `b.city`, but the column is `address_city`. Renders `—` for every row.

### 30 TypeScript errors (pre-existing, `tsc --noEmit`)
1. **`Role.name` does not exist** (9×) — `roles/page.tsx`, `admin/role-assignment.tsx`. Type likely uses `name_en`/`code`.
2. **Supabase joined relations typed as arrays** (8×) — `claims`, `fees`, `guarantee-reports`, `dashboard`. `.select('borrower(name)')` returns `T[]`, cast to `T`.
3. **`t.locale` missing** (4×) — `banks/page.tsx`, `banks/[id]/page.tsx`.
4. **`RoleWithPermissions` extends `Role` incompatibly** — `roles/page.tsx:77`.
5. **`Borrower.city`** — see bug above.
6. **`boolean | undefined`** — `loans/[id]/page.tsx:262`.

### Draft completion never reaches 100%
`use-loan-draft.ts` still counts phone/address/city/birthdate/passport as required after those became optional.
