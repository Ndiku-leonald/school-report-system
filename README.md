# Primary School Academic Results and Report Management System

## Purpose

This project will provide a secure, standalone system for managing primary-school academic results from initial configuration and marks entry through approval, report publication, parent access, analytics, and promotion recommendations.

The product must remain configurable for different schools. School identity, subjects, classes, streams, grading rules, aggregate rules, assessment weights, promotion thresholds, and the final report-card layout will be supplied through configuration rather than embedded in application code.

## Current status

**Stage 2: Next.js foundation and project tooling is complete.** The repository contains a root Next.js App Router application, strict TypeScript, Tailwind CSS, ESLint, Prettier, Supabase client foundations, environment validation, accessible placeholder interfaces, and unit/component/end-to-end test foundations.

The application remains in the foundation phase. Database schema, authentication, authorization, live academic data, calculations, report generation, and parent verification have not been implemented.

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
- A Supabase project or supported local Supabase environment
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

Supply values through an approved secrets channel. `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-safe configuration. `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and `DIRECT_URL` are server-only and must never enter client components or browser bundles.

Environment parsing is lazy so the Stage 2 placeholder pages, tests, and production build do not require real Supabase credentials. A descriptive configuration error is raised when code first requests missing configuration. Schema tests use synthetic values only.

No real credentials belong in `.env.example`, documentation, source files, commits, issues, or pull requests.

## Validation commands

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Use `npx playwright install chromium` once if the local Playwright browser is not installed.

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
```

Routes currently available:

- `/` — public landing page
- `/staff-login` — visual staff sign-in placeholder
- `/dashboard` — administration shell and readiness placeholders
- `/teacher` — teacher workspace placeholder
- `/parent` — visual parent verification placeholder

## Data protection

**Never commit real student information, parent credentials, report cards, API keys, passwords, or production database exports to this repository.** Development and testing must use synthetic or formally approved anonymized data.

Security requirements and vulnerability-reporting guidance are defined in [SECURITY.md](SECURITY.md).

## Project documentation

- [Product requirements](docs/product-requirements.md)
- [System architecture](docs/system-architecture.md)
- [Roles and permissions](docs/roles-and-permissions.md)
- [Academic workflow](docs/academic-workflow.md)
- [Development roadmap](docs/development-roadmap.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
