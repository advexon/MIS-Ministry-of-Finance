# Credit Guarantee Fund MIS

Management Information System for the Ministry of Finance of Tajikistan. Covers loan applications, guarantees, committee decisions, claims, fees, recoveries, reporting, and audited administration in English, Russian, and Tajik.

**Developed by Siyovush Mirzoev.**

## Technology

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, shadcn/ui, and Supabase PostgreSQL with native authentication and row-level security. Use the pnpm version declared in `package.json`; `pnpm-lock.yaml` is the dependency source of truth.

## Repository layout

| Directory | Responsibility |
| --- | --- |
| `app/` | Routes, layouts, API handlers, and server actions |
| `components/` | Feature components grouped by domain; shared primitives in `ui/` |
| `lib/admin/`, `lib/workflow/` | Administrative configuration and business workflow rules |
| `lib/supabase/`, `lib/middleware/` | Database clients, session handling, and API authorization |
| `lib/forms/`, `lib/hooks/`, `hooks/` | Form rules, domain hooks, and shared UI hooks |
| `lib/contexts/`, `lib/i18n/`, `lib/types/`, `lib/utils/` | Shared state, translations, types, and utilities |
| `scripts/` | Ordered SQL migrations, isolated regression checks, and explicit operational tools |
| `docs/` | Architecture, authorization, monitoring, and account setup guidance |
| `data/` | Reference requirements documents; not runtime fixtures |
| `public/` | Static assets |

The active global stylesheet is `app/globals.css`. Keep database migration names stable: verification scripts and deployment history refer to them by filename. SQL acceptance scripts are separate from migrations and must not be applied as schema setup.

## Development

Use Node.js 22.18 or newer, with native TypeScript stripping support for verification scripts. Configure local development from `.env.example` using a separate development Supabase project. Never commit credentials or use live financial records as test fixtures.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The development server serves `http://localhost:3000`.

## Verification

```sh
pnpm verify
pnpm build
```

`pnpm verify` runs TypeScript, zero-warning ESLint, and the local regression suites. Database regressions in this command use isolated PostgreSQL instances; they do not connect to production. Individual `verify:*` commands remain available for focused checks.

Live acceptance is opt-in and separate: selected scripts support `--live`, SQL acceptance scripts require a reviewed database connection, and `verify:production-security` needs a running deployment. Account provisioning is an explicit administrative operation, never part of the regression suite. `scripts/provision-qa-accounts.mjs` requires `--confirm-test-project` and an environment-supplied `QA_PASSWORD` of at least 12 characters; it never prints that password. Passing local checks does not certify live RLS, simultaneous transactions, or the complete multi-role approval/signature journey.

## Documentation

- [Codebase index and verification limits](docs/CODEBASE_INDEX.md)
- [Role-based access control](docs/RBAC.md)
- [Error monitoring](docs/ERROR_MONITORING.md)
- [Test account setup](docs/TEST_ACCOUNT_SETUP_GUIDE.md)

Third-party packages retain their respective licenses and attribution. Repository history and operational audit records must be preserved.
