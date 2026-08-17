# System Architecture

## Architecture overview

The planned system is a single Next.js application backed by Supabase and deployed through Vercel.

```text
Next.js application
    ├── Staff dashboard
    ├── Teacher workspace
    ├── Parent report portal
    ├── Server Actions and Route Handlers
    └── Report-generation services

Supabase
    ├── PostgreSQL
    ├── Authentication
    ├── Row Level Security
    ├── Private Storage
    └── Database migrations

Vercel
    ├── Preview deployments
    └── Production deployment
```

The application, Stage 3 PostgreSQL foundation, Stage 4 staff authentication,
and Stage 5 school/assignment authorization boundary are implemented. Domain
CRUD services, calculations, report rendering, storage, and parent access
remain deferred.

## Application responsibilities

### Next.js application

The App Router will provide separate user experiences for authorized staff, teachers, and parents while sharing validated domain services. React Server Components should be the default for data-heavy views; client components should be introduced only where browser interactivity requires them.

Server Actions and Route Handlers will receive untrusted requests, validate inputs, establish the authenticated actor, enforce contextual authorization, execute domain operations, and return intentionally limited data. Client-side checks may improve usability but cannot grant access.

Report-generation services will eventually produce artifacts from approved, immutable report snapshots. The final PDF rendering approach and layout remain deferred until the approved real-world report sample is available.

### Supabase

PostgreSQL will be the system of record for academic configuration, assignments, enrolments, marks, workflow state, calculation inputs and outputs, report metadata, promotion decisions, and audit events.

Supabase Auth will authenticate staff. Parent verification may use a separate restricted flow appropriate to student code and PIN access; its design must not grant staff privileges or expose Supabase service credentials.

Row Level Security will provide defense in depth for protected tables and storage objects. Policies must be tested for expected access, denied access, cross-assignment access, anonymous access, and privileged service paths.

Generated reports will be stored in private Supabase Storage. Access will use an authorized server-mediated flow or suitably short-lived signed access after verification.

Database changes will be applied through version-controlled migrations. Production schema changes must not depend on manual dashboard edits.

### Vercel

Vercel will host preview and production deployments. Preview environments must use non-production data and appropriately scoped secrets. Production environment variables, deployment permissions, observability, and rollback procedures must be configured before release.

## Domain boundaries

The implementation should keep these concerns explicit:

- Identity and staff access
- Academic-period configuration
- Classes, streams, subjects, and assessments
- Staff assignments and student enrolment
- Marks capture and workflow transitions
- Grading, aggregate, ranking, and promotion calculation
- Report snapshots, artifacts, review, and publication
- Parent verification and restricted report access
- Analytics
- Audit and operational observability

Boundaries should prevent report rendering, interface components, or external delivery concerns from becoming the source of truth for academic calculations.

## Configurable business rules

Subjects, grading scales, aggregate rules, assessment weights, ranking and tie rules, report readiness requirements, and promotion thresholds must be database-configurable and must not be hard-coded. School identity, class and stream labels, and report presentation must also be configuration-driven.

Rules that affect historical results should have an effective academic scope or version. A finalized report snapshot must identify the exact configuration and result data from which it was generated so later configuration changes do not silently rewrite history.

## Data and request flow

1. A browser initiates an operation through the appropriate application surface.
2. Server-side code validates the request and establishes the actor or restricted parent session.
3. Contextual authorization confirms role, assignment, student scope, academic period, and workflow state.
4. PostgreSQL operations execute under Row Level Security and a deliberately selected credential context.
5. Sensitive state changes create audit records in the same transaction where practical.
6. The application returns only the data needed by the caller.

Privileged server credentials must be reserved for narrow server-only operations and cannot replace explicit authorization checks.

## Reports and publication

Result calculation, report snapshot creation, artifact generation, report review, and publication are distinct domain events. Generation failures must not publish partial artifacts. Publication must reference a reviewed generated version; regenerated reports should supersede rather than overwrite prior versions.

## Environments and delivery

Local, preview, and production environments must use separate configuration and appropriately isolated data. Secrets are supplied through ignored local environment files or managed deployment configuration. CI checks should eventually cover formatting, linting, types, unit and integration tests, migrations, security controls, and build output before production promotion.

## Decisions deferred to later stages

- Parent-session design details
- Calculation-engine representation
- Background job or queue requirements
- PDF rendering technology and approved report layout
- Monitoring, backup, recovery, retention, and regional deployment settings

Each decision should be documented when evidence and school requirements are available.

## Stage 2 implementation decisions

- **Single root application:** The Next.js App Router application is initialized directly in the repository root with `src/app`; no nested application was created.
- **Package management:** npm is the selected package manager and `package-lock.json` is the only lockfile.
- **Rendering boundary:** Pages and layouts are Server Components by default. Client Components currently exist only for the required error-boundary reset controls.
- **Environment validation:** Zod schemas separate browser-safe and server-only variables. Validation occurs when an integration requests configuration, allowing static Stage 2 pages, tests, and builds to run without real credentials while still failing clearly at the integration boundary.
- **Supabase clients:** A browser client uses only public configuration. A cookie-aware server client is marked server-only and uses the public anonymous key so future Row Level Security remains in force. No administrative service-role client exists because Stage 2 has no justified privileged operation.
- **Styling:** Tailwind CSS 4 consumes generic CSS design tokens. School identity and final branding remain unconfigured.
- **Testing:** Vitest and Testing Library cover units and rendered components; Playwright provides an independent browser smoke test. Tests use no Supabase credentials.
- **Continuous integration:** The quality workflow runs formatting, linting, strict type checking, unit/component tests, production build, and the Chromium smoke test.

These decisions refine the planned architecture without changing its domain boundaries.

## Stage 3 implementation decisions

- **Schema source of truth:** ordered Supabase SQL migrations define all public
  application tables, types, constraints, indexes, triggers, and privileges. No
  ORM or parallel schema representation is used.
- **Tenant ownership:** school-scoped entities reference `schools`; validated
  trigger functions reject cross-school and cross-academic-scope relationships
  that ordinary foreign keys cannot express.
- **Historical integrity:** roles, memberships, assignments, enrollments, rules,
  mark sheets, reports, and templates preserve status, effective dates, or
  versions. Historically sensitive foreign keys restrict deletion.
- **Workflow aggregate:** marks submission and approval state belongs to the mark
  sheet rather than individual marks.
- **Reports:** immutable snapshots separate historical report inputs from mutable
  live academic records.
- **Browser access:** all public application tables force RLS, with table,
  sequence, and function privileges revoked from `anon` and `authenticated`.
  Scoped policies are intentionally deferred to Stage 5.
- **Local reproducibility:** a lockfile-managed Supabase CLI, deterministic
  synthetic seed, pgTAP tests, generated TypeScript types, and a local-only CI
  database job validate the schema.

The detailed model and security boundary are in
[database-design.md](database-design.md) and
[database-security.md](database-security.md).

## Stage 4 implementation decisions

- Supabase Auth sessions use `@supabase/ssr` cookies. `src/proxy.ts` refreshes
  tokens with validated claims and performs only optimistic redirects.
- Protected layouts and server actions load the current Auth user and query the
  caller's profile, memberships, role labels, and schools through RLS.
- An HttpOnly active-membership cookie is treated as untrusted input and matched
  against the current user's active membership set.
- A separate server-only service-role client is limited to invitation
  provisioning, membership activation, and authentication audit writes.
- Stage 4 migration 08 grants only authenticated `SELECT` on the four identity
  context tables. Academic tables and all browser writes remain denied.
- Invitation and recovery links support both PKCE callback codes and
  email-template token hashes, sanitize internal destinations, and fail with
  generic messages.
- Authentication tests run only against the local Supabase stack. No workflow
  applies migrations or creates users in a remote project.

See [staff-authentication.md](staff-authentication.md) for the request and trust
boundaries.

## Stage 5 implementation decisions

- A 35-value PostgreSQL permission enum and migration-controlled
  `role_permissions` table define the initial matrix. Browser roles cannot read
  or mutate the matrix directly.
- Migration 11 binds one selected membership to the verified JWT `session_id`
  in a non-exposed internal table. Narrow caller-scoped selection RPCs never
  accept a session ID, and separate Auth sessions for one profile may select
  different schools.
- The public caller-scoped permission RPC accepts one membership ID only when
  it equals the current session selection, then evaluates current active
  membership, active school, and unrevoked roles.
- Internal fixed-search-path, no-dynamic-SQL predicates use definer rights only
  to avoid forced-RLS recursion. Anonymous execution is revoked and
  authenticated execution is function-specific.
- Academic RLS grants approved reads only. Schoolwide roles are tenant-scoped;
  teacher rosters, marks, attendance/comments, and reports follow current
  subject or class assignments. Assignment-limited enrolments are restricted
  to current roster statuses. Guardian and parent-access data stays denied.
- Request-bound server authorization uses the normal anonymous-key client and
  generated enum types. It does not use service-role reads, editable metadata,
  module-global caching, or a browser permission cookie. The HttpOnly cookie is
  revalidated and must match the PostgreSQL session selection.
- `/dashboard` and `/teacher` have distinct permission guards. Navigation is
  filtered on the server but remains a usability control rather than an
  authorization boundary.
- Local pgTAP, signed-in integration, and Playwright suites cover revocation,
  selected-session multi-school isolation, independent sessions, forged
  membership selection, denied writes, and assignment scope. CI uses no hosted
  Supabase project.

See [authorization-model.md](authorization-model.md) and
[authorization-testing.md](authorization-testing.md).

## Stage 6 configuration boundary

Academic configuration pages read through the normal server Supabase client
under forced RLS. Server Actions validate Zod inputs, require live manage
permission, and invoke entity-specific RPCs; they never use a service-role
client. PostgreSQL derives the selected school from the verified Auth session,
locks target rows, checks `expected_updated_at`, validates state and scope, and
commits the mutation with one append-only audit event. Versioned active rules
are cloned rather than edited. See
[academic-configuration.md](academic-configuration.md).

The Stage 6 corrective layer keeps React Hook Form field-array state in isolated
client components while pages and configuration reads remain server-rendered.
Server Actions parse documented structured schemas, map stable database errors
to useful feedback, and revalidate only the affected route. PostgreSQL remains
authoritative for school scope, dependency locks, lifecycle, version identity,
ordering, concurrency, RLS, and audit atomicity.

Versioned configuration follows one directional flow: draft records edit in
place; active or retired sources can only produce a new draft with a new ID and
incremented version. The Stage 6 boundary ends at configuration persistence.
Calculation, ranking execution, promotion recommendations, and learner
progression begin in Stage 7 or later and are not invoked by these routes.

The Stage 6 history layer is enforced below Server Actions. Migration 14
prevents direct redefinition of referenced, active, or retired versions.
Migration 15 requires an active assessment scheme when a mark sheet is inserted
or changes schemes, but permits later trusted workflow transitions when an
existing sheet keeps the same scheme after retirement. Full academic-scope
validation still runs on every update, and the retired definition and components
remain immutable. Server Actions derive component and band order from submitted
field-array position, while PostgreSQL retains score-range validation and
lifecycle protection. No remote Supabase service participates in this
architecture.

## Stage 7 student-management boundary

The `/dashboard/students` route family reads through caller-scoped PostgreSQL
functions. Server Components fetch the directory, references, detail, history,
private guardian projection and short-lived photo URL. Client leaf forms use
React Hook Form where structured profile input benefits from immediate
feedback; every mutation crosses a Server Action using the ordinary
authenticated Supabase client and then a narrow RPC.

Migration 16 derives school and actor from the JWT-session-selected membership.
Schoolwide and assignment-scoped reads share no guardian projection.
Concurrency, lifecycle graphs, capacity authority, dependency-safe movement,
normalization and audit atomicity are enforced below the UI. Storage RLS parses
the school/student object path and reuses the same live selected-session
permissions. Stage 8 assignments and Stage 15 parent access are not created by
this architecture.

Migration 17 treats the class row as the serialization point for capacity and
the student row as the serialization point for lifecycle and primary-guardian
workflows. A global partial index makes the current placement singular. The
directory defaults to that placement, but schoolwide placement filters select
the latest matching historical enrolment and return an explicit historical
label. The Server Action retains photo upload/link/old-object cleanup ordering;
the database now refuses a path until the exact private object exists. These
are Stage 7 hardening changes and do not introduce Stage 8 marks or attendance.

# Stage 8 assignment layer

The Stage 8 server-only module validates Server Action input with Zod and calls generated, typed database RPCs. Management routes use server-side filters and guards; the teacher workspace is read only. PostgreSQL remains authoritative for school scope, role eligibility, date constraints, overlap exclusion, primary serialization, optimistic concurrency, dependency protection, RLS, and audit logging.

# Stage 9 marks-entry slice

Server Components call narrow read RPCs and pass contact-free grid data to a
client editor. The editor keeps dirty cells locally and sends one explicit
Server Action batch. The action validates with Zod and uses the signed-in
anonymous-key client; PostgreSQL repeats authorization and commits all cells or
none. The teacher route is assignment-scoped and the dashboard route is a
schoolwide read-only operational overview. No service-role client is present in
application code.
