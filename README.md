# Primary School Academic Results and Report Management System

## Purpose

This project will provide a secure, standalone system for managing primary-school academic results from initial configuration and marks entry through approval, report publication, parent access, analytics, and promotion recommendations.

The product must remain configurable for different schools. School identity, subjects, classes, streams, grading rules, aggregate rules, assessment weights, promotion thresholds, and the final report-card layout will be supplied through configuration rather than embedded in application code.

## Current status

**Stage 5: roles and scoped authorization is implemented for review.** The repository
contains the Stage 3 database foundation plus cookie-based Supabase Auth,
server-authoritative staff membership checks, invitation and recovery flows,
active-school selection, authentication audit events, and local-only Auth test
automation. It now also contains a 35-value permission model, migration-owned
role matrix, caller-scoped permission RPC, assignment-scoped read policies,
typed server guards, protected workspaces, and server-filtered navigation.
Public registration is disabled, recovery requires a short-lived
signed user-bound proof, PKCE recovery and invitations require purpose-specific
signed state bound to the authoritative Auth email, and invitation activation
is atomic.

Academic writes remain deny-by-default. Stage 5 grants only reviewed,
school- and assignment-scoped reads. Live CRUD, marks transitions,
calculations, report generation, storage, analytics, promotion processing, and
parent verification have not been implemented.

## Planned technology stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Row Level Security
- Vercel
- GitHub

## Planned capabilities

- Staff authentication and role-based authorization
- Academic years, terms, classes, streams, subjects, teachers, and students
- Teacher-to-class and teacher-to-subject assignments
- Controlled marks entry, submission, review, approval, and locking
- Configurable totals, averages, grades, aggregates, rankings, and promotion rules
- Individual, class, and school report generation
- Private report storage, review, and publication
- Secure parent access to current and historical published reports
- Schoolwide academic analytics and learner-support insights
- Audit logging for sensitive academic and administrative actions

The agreed MVP boundary is documented in [docs/product-requirements.md](docs/product-requirements.md).

## Local-development prerequisites

- Node.js 20.9 or later; use a supported LTS release
- npm 11 or a lockfile-compatible npm release
- Git
- Docker or another Supabase-compatible local container runtime
- Access to the required environment values when exercising Supabase integrations

## Installation

Install the lockfile-resolved dependencies from the repository root:

```bash
npm ci
```

Start the local development server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Environment variables

Copy the environment template:

```bash
cp .env.example .env.local
```

On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Supply values through an approved secrets channel. `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-safe
configuration. `AUTH_FLOW_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
`DATABASE_URL`, and `DIRECT_URL` are server-only and must never enter client
components or browser bundles. Generate the Auth-flow secret from at least 32
random bytes and never reuse a Supabase key.

Local Auth disables project-wide public signup and anonymous sign-in and
enforces a 12-character minimum password. The email/password provider remains
enabled so invited staff can sign in; the global signup switch prevents public
account creation. Configure the corresponding hosted-project signup and
password settings separately before production. This change did not modify a
remote Supabase project.

Redirect destinations are navigation data, not authentication-flow proof.
Generic PKCE callbacks are rejected unless they contain exactly one valid,
short-lived HMAC state: `recovery_state` or `invitation_state`. The callback
exchanges the code only after state verification, then binds the state to the
authoritative Auth email. Token-hash invite and recovery links remain a
separate verified path. Hosted Supabase Auth URLs, signup policy, password
policy, and email delivery still require independent production configuration.

Environment parsing is lazy so the Stage 2 placeholder pages, tests, and production build do not require real Supabase credentials. A descriptive configuration error is raised when code first requests missing configuration. Schema tests use synthetic values only.

No real credentials belong in `.env.example`, documentation, source files, commits, issues, or pull requests.

## Validation commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:auth
npm run test:authorization
npm run build
npm run test:e2e
npm run test:e2e:auth
npm run test:e2e:authorization
```

Use `npx playwright install chromium` once if the local Playwright browser is not installed.

For database development:

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:types
npm run db:stop
```

See [docs/local-supabase-development.md](docs/local-supabase-development.md)
before linking or applying migrations to any remote development project.

## Project structure

```text
src/
├── app/                 App Router layouts, pages, metadata, and errors
├── components/
│   ├── layout/          Application shell and page layout primitives
│   ├── shared/          Reusable loading and empty states
│   └── ui/              Accessible interface primitives
├── lib/
│   ├── env/             Browser-safe and server-only validation boundaries
│   ├── supabase/        Browser and cookie-aware server clients
│   └── utils/           Shared utilities
├── test/                Unit/component test setup
└── types/               Shared TypeScript contracts

tests/e2e/               Playwright smoke tests
docs/                    Product and architecture documentation
supabase/                Local config, migrations, synthetic seed, and pgTAP tests
```

Routes currently available:

- `/` — public landing page
- `/staff-login` — staff email/password sign-in
- `/forgot-password` and `/reset-password` — generic recovery flow
- `/complete-invitation` — invitation acceptance and membership activation
- `/select-school` — active-school choice for multi-school staff
- `/dashboard` and `/teacher` — authenticated staff shells
- `/forbidden` — generic insufficient-permission state
- `/account-unavailable` — safe unavailable-membership state
- `/parent` — visual parent verification placeholder

## Data protection

**Never commit real student information, parent credentials, report cards, API keys, passwords, or production database exports to this repository.** Development and testing must use synthetic or formally approved anonymized data.

Security requirements and vulnerability-reporting guidance are defined in [SECURITY.md](SECURITY.md).

## Project documentation

- [Product requirements](docs/product-requirements.md)
- [System architecture](docs/system-architecture.md)
- [Roles and permissions](docs/roles-and-permissions.md)
- [Authorization model](docs/authorization-model.md)
- [Authorization testing](docs/authorization-testing.md)
- [Academic workflow](docs/academic-workflow.md)
- [Database design](docs/database-design.md)
- [Database security](docs/database-security.md)
- [Local Supabase development](docs/local-supabase-development.md)
- [Staff authentication](docs/staff-authentication.md)
- [Authentication testing](docs/authentication-testing.md)
- [Staff provisioning](docs/staff-provisioning.md)
- [Development roadmap](docs/development-roadmap.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
