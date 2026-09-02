# Development Roadmap

Each stage should be delivered through reviewed, focused changes. Acceptance requires evidence from commands or tests that actually ran; documentation alone does not prove an implementation control.

## 1. Repository inspection and preparation

Establish the repository boundary, product scope, architecture direction, contribution rules, security policy, environment template, and delivery sequence.

**Acceptance criteria**

- Existing files, tooling, Git state, and likely secret risks are inspected without discarding useful work.
- Required foundation documents and `.gitignore` are present and internally consistent.
- `.env.example` contains names and guidance only, with no credentials.
- No application, database schema, authentication, report generation, or parent portal is prematurely implemented.

## 2. Next.js foundation and project tooling — Complete

Initialize one Next.js App Router application in the repository using TypeScript and Tailwind CSS, then select and record the package manager and supported runtime.

**Acceptance criteria**

- One non-nested application starts locally using documented commands.
- Formatting, linting, type-checking, test, and build scripts are defined as appropriate.
- Baseline accessible layouts and route boundaries exist without hard-coded school data.
- CI validates the agreed checks, and dependency/tool versions are documented.

**Completion evidence (2026-07-29)**

- The npm-managed Next.js App Router application is located at the repository root and exposes the five Stage 2 routes.
- Strict TypeScript, Tailwind CSS, ESLint, Prettier, environment validation, Supabase client boundaries, and reusable accessible components are configured.
- Unit/component tests, the production build, and the Playwright Chromium smoke test pass without real credentials.
- `.github/workflows/quality.yml` runs the complete validation suite for pull requests and the default branch.

## 3. Supabase schema and migrations — Complete

Design the normalized data model, constraints, indexes, generated types, migration workflow, and seed strategy using synthetic data.

**Acceptance criteria**

- All schema changes are represented by reviewed, reproducible migrations.
- Academic configuration and historically significant rules are data-driven and versionable.
- Foreign keys, uniqueness, check constraints, indexes, and deletion behavior are tested.
- No real student data or production credentials appear in migrations or fixtures.

**Completion evidence (2026-07-29)**

- Seven ordered Supabase migrations create 36 normalized public tables, stable
  workflow enums, internal trigger functions, cross-scope validation, explicit
  indexes, and restrictive foreign-key behavior.
- Membership-backed workflow actors are independently constrained to the
  record's school, including privileged writes; Stage 5 remains responsible for
  deciding which roles may perform each action.
- All public application tables force RLS with no permissive policies, and
  browser-role table, sequence, and function privileges are revoked.
- A deterministic configuration-only seed and 93 pgTAP assertions pass through
  a clean local database reset; Supabase schema lint reports no errors.
- TypeScript database definitions are generated from the local schema and used
  by both Supabase client factories.
- CI reproduces the local database, tests it, regenerates types, and checks that
  the committed generated contract is current without remote credentials.

## 4. Staff authentication — Complete

Implement Supabase Auth integration for staff sessions, sign-in, sign-out, recovery, and account-state handling.

**Acceptance criteria**

- Protected routes and server operations require a valid staff session.
- Session refresh, logout, disabled-account, and recovery behavior are tested.
- Secrets and privileged Supabase credentials remain server-only.
- Authentication events provide appropriate audit and operational signals without logging credentials.

**Implementation evidence (2026-07-29)**

- Cookie-based Supabase SSR sessions refresh through the Next.js 16 proxy while
  protected layouts and actions independently validate the user and membership;
  redirects preserve rotated and cleared Supabase cookies.
- Sign-in, POST sign-out, invitation completion, recovery, account-unavailable,
  and multi-school selection flows are implemented with generic failures and
  sanitized internal redirects.
- Migration 08 grants narrow own-identity reads only; academic access and
  browser writes remain denied and are covered by pgTAP.
- Migration 09 provides service-role-only, invoker-rights atomic invitation
  activation with row locking, exact-set verification, and transactional
  success audits.
- Public signup and anonymous sign-in are disabled, Supabase enforces a
  12-character minimum password, and recovery requires a signed 15-minute
  purpose- and user-bound proof beyond the normal session.
- PKCE recovery and invitation callbacks require distinct 15-minute HMAC
  states bound to the authoritative Auth email before code exchange; invitation
  also requires an own RLS-filtered `INVITED` membership. Redirect destinations
  are never treated as flow proof.
- Only invitation and recovery token-hash confirmation types are supported.
  Token-hash invite/recovery, the signed invitation callback gate, and
  signed-state PKCE recovery are tested locally without remote Supabase changes
  or a production email-delivery claim.
- Unit, local Auth integration, Playwright, build, lint, type, formatting, and
  database checks are part of the repository validation and CI workflows.

## 5. Roles and permissions — Implemented for review

Implement proposed staff roles, contextual assignments, server-side permission checks, and Row Level Security.

**Acceptance criteria**

- Access is deny-by-default and scoped by role, assignment, academic period, and target.
- Subject teachers cannot access unassigned classes or subjects.
- Class teachers can view full results only for assigned classes.
- Positive and negative authorization tests cover client manipulation and cross-scope access.

**Implementation evidence (2026-07-29)**

- Migration 10 creates 35 stable permissions, a forced-RLS
  migration-controlled role matrix, seven caller-scoped internal predicates,
  and the own-membership `get_my_effective_permissions` RPC.
- Corrective migration 11 binds one active membership to the verified JWT
  `session_id`, exposes only narrow caller-scoped selection RPCs, and replaces
  every authorization predicate so direct RLS queries cannot combine access
  from several memberships. Separate sessions for one profile remain
  independent.
- Academic configuration and explicitly approved academic records have
  school-scoped `SELECT` policies; student, mark, attendance/comment, and report
  reads distinguish schoolwide, class-teacher, and subject-teacher scope.
- Guardian/parent records, direct role-matrix access, and every browser
  academic mutation remain denied.
- Request-bound generated-type authorization utilities protect `/dashboard`
  and `/teacher`, provide generic forbidden routing, and filter navigation on
  the server without treating it as enforcement.
- Multi-school roles are evaluated for only the session-selected membership in
  both application context and PostgreSQL RLS. Revoked roles, unavailable
  memberships, inactive schools, and unavailable assignments fail on the next
  request. Assignment-limited enrolment reads exclude withdrawn, transferred,
  and completed history while schoolwide authorized roles retain it.
- The local database, anonymous-key integration, and browser authorization
  suites run in CI alongside the retained Stage 4 tests. No hosted Supabase
  project is linked or modified.

## 6. Academic configuration — Complete

Implement academic years, terms, classes, streams, subjects, assessment models, grading scales, aggregate rules, ranking behavior, and promotion-rule configuration.

**Acceptance criteria**

- Authorized users can manage valid configuration without source-code changes.
- Validation prevents overlapping, incomplete, or internally inconsistent active rules.
- Effective scope or versioning preserves historical interpretation.
- School identity and all academic labels and thresholds remain configurable.

**Implementation evidence (2026-07-30)**

- Migrations 12 and 13 add selected-session, school-scoped configuration RPCs,
  immediate optimistic-concurrency conflicts, dependency-backed class scope and
  curriculum identity locks, transactional audits, explicit lifecycle checks,
  and version-from-existing protection while direct browser writes stay denied.
- The permission-aware `/dashboard/academic` route family exposes school
  configuration, full edit and reorder controls, structured component, band,
  ranking, and promotion editors, and a read-only experience for non-managing
  staff.
- Corrective migration 14 freezes referenced scheme definitions, protects
  active/retired configuration history even from privileged direct writes,
  persists field-array ordering, and rejects no-op lifecycle audits. Migration
  15 requires active schemes only for new or changed mark-sheet references,
  retains existing retired-scheme references for later trusted workflow
  transitions, and continues full scope validation on every update.
- Shared Zod schemas, generated database contracts, 341 pgTAP assertions, 20
  focused signed-in integration tests, and 26 Playwright scenarios cover the
  Stage 6 boundary.
- The full application, local database, signed-in integration, and Playwright
  validation suites pass without linking or modifying a remote project.
- Stage 7 was not part of the Stage 6 merge; calculation, ranking execution and
  promotion decisions remain unimplemented.

## 11. Deterministic results calculation — Implemented for review

Migration 23 adds immutable calculation runs, exact source manifests, weighted
subject and overall results, configurable aggregate classification, ranking
positions/ties, checksums, explanations, and calculation-review RPCs/routes.
Inputs are limited to the latest locked revisions for a locked term. Stage 12
owns report snapshots; Stage 13 owns PDFs; Stage 17 owns promotion decisions.

Final acceptance correction adds migration 27, curriculum-authoritative
readiness, explicit multi-rule selection, stored-rule checksum validation, and
normalized deterministic ordinal tiebreaks. This stage does not begin report
snapshots, PDF generation, or promotion decisions.

## 7. Student management â€” Implemented for review

Implement student profiles, guardian relationships, academic-period enrolment,
class or stream placement and status changes. Secure access credentials remain
Stage 15.

**Acceptance criteria**

- Authorized staff can manage students and enrolments with server validation.
- Transfers, withdrawals, and duplicate-record constraints are handled predictably.
- Views expose only the minimum necessary personal information.
- Tests use synthetic data and sensitive changes are audited.

**Implementation evidence (2026-08-01)**

- Migration 16 adds normalized identity constraints, lifecycle and capacity
  rules, selected-session RPCs, optimistic concurrency, private photo policies,
  no-physical-delete protection and transactional audits.
- `/dashboard/students` provides server-side search/filtering/pagination,
  responsive directory/detail/admission/edit/enrolment interfaces, guarded
  guardian contacts and short-lived private images.
- 401 pgTAP assertions, 21 focused signed-in integration scenarios and 26
  dedicated Playwright scenarios cover the Stage 7 boundary while all earlier
  suites remain in CI.
- No remote Supabase project was linked or modified. Stage 8 teacher-assignment
  management and Stage 15 parent access were not started.

## 8. Teacher assignments

Implement class-teacher and subject-teacher assignments by academic period, class, stream, and subject.

**Acceptance criteria**

- Administrators can create, revise, expire, and inspect assignments.
- Conflicting or invalid assignments are rejected according to approved policy.
- Assignment changes immediately affect server-side and RLS access.
- Historical assignments remain traceable through audit or effective dating.

## 9. Marks entry

Implement assignment-scoped draft marks entry with validation, completeness feedback, and safe batch operations.

**Implemented boundary:** migration 19 and the teacher marks workspace provide
selected-membership, exact-assignment DRAFT entry in `MARKS_ENTRY` terms. The
implementation binds an active 100% assessment scheme, keeps missing cells
implicit, validates authoritative rosters/components and uses atomic
row-version saves. Submission and calculations remain later stages.

**Acceptance criteria**

- Teachers can edit only eligible draft marks in their assignments.
- Scores, absence or exemption states, and assessment components validate against configuration.
- Concurrent or stale updates cannot silently overwrite newer work.
- Usability, keyboard navigation, failure recovery, and relevant audit behavior are tested.

## 10. Submission and approval workflow

Implement mark-state transitions, reviewer queues, return reasons, approval, locking, and exceptional correction controls.

**Acceptance criteria**

- Only valid transitions by authorized actors are accepted.
- Submitted and locked marks reject ordinary edits.
- Return, approval, lock, unlock, and exceptional changes are audited.
- Separation-of-duties requirements and failure paths have automated tests.

## 11. Calculation engine

Implement deterministic totals, averages, grades, aggregates, rankings, subject performance, and configurable tie or eligibility rules.

**Acceptance criteria**

- The engine consumes locked inputs and an identified rule version.
- Unit tests cover boundaries, missing or exempt marks, rounding, ties, and invalid configuration.
- Repeated calculation with the same snapshot produces the same result.
- Output explains enough rule context to support review without exposing unrelated data.

## 12. Report snapshots

Create immutable, versioned report snapshots that decouple approved academic data from presentation.

**Acceptance criteria**

- A snapshot identifies the student, academic scope, locked source data, calculation output, and rule versions.
- Readiness checks block incomplete or unapproved reports.
- Corrections create a new version and retain prior audit history.
- Snapshot access is server-authorized and tested.

**Implementation evidence (2026-08-29)**

- Migration 28 (renamed with its original bytes preserved) and additive
  migration 29 reuse the existing report tables, add Stage 11 calculation
  lineage, schema-versioned JSON, SHA-256 context checksums, frozen subject
  identity, append-only report versioning, guarded single/batch generation
  RPCs, and forced-RLS lineage storage.
- Migration 30 is the additive final correction: only a current, up-to-date
  Stage 11 run with a locked term and locked latest source sheets may create
  new snapshots. Reopened terms, unlocked sources, stale checksums, and older
  calculation runs are rejected, while historical reports remain readable.
- Readiness is source readiness rather than completion. Idempotence compares
  only with the current report; A -> B -> A creates v1 -> v2 -> v3 even when
  v1 and v3 have the same content checksum. Report history serialization is
  scoped to term plus enrollment, report version remains independent of
  calculation version, and `latest_report_versions` is scoped to the target
  run's calculated population.
- Generic comment updaters are never labeled as head teachers, next-term
  selection requires a start date after the current term end (including
  cross-year terms), and `REPORTS_VIEW_ASSIGNED` remains an RLS visibility
  rule distinct from the schoolwide Stage 12 dashboard.
- `/dashboard/reports` and `/dashboard/reports/[reportId]` provide staff-only
  readiness, generation, historical navigation, and an HTML snapshot preview;
  PDF rendering and publication remain later stages. Database-backed
  acceptance is completed by CI only when the Supabase suites pass; local
  Docker-unavailable runs are not treated as proof.

## 13. PDF generation - Implemented for review

Stage 13 adds a dedicated Node.js report-card PDF module using PDFKit 0.20.1.
`GET /api/reports/[reportId]/pdf` loads the exact
immutable Stage 12 snapshot and frozen subject-result rows through the
session-bound Supabase client. The route is dynamic, private, uncached, and
available only to the existing schoolwide or assigned-class report readers.

The A4 portrait layout includes school and learner identity, placement, the
frozen subject table, academic summary including class and grade-level
positions, attendance, comments, signatories, the next-term value, and
snapshot, calculation-input, and calculation-output SHA-256 fingerprints. It
has no guardian contact fields, date of birth, publication labels, parent
controls, or current timestamps. Committed OFL Noto Sans TTF files handle
report text; absent or invalid values render as `Unavailable`. Student photos
and school logos are not embedded
because their storage paths can be replaced and are not immutable report
assets. The passive-PDF check rejects active actions, and the route never
accepts a URL, storage path, or image source from the caller.

The report detail page exposes exactly `Download PDF`; historical detail pages
target their own report ID. Safe attachment headers, server-only imports, Node
runtime selection, deterministic metadata, and the PDF contract are covered by
focused renderer tests, a 25-case signed-in integration suite, a dedicated
40-case browser suite, and typical plus multipage visual baselines. Subject
rows use measured heights and repeat headers across pages; comments paginate
sequentially, and buffered pages render `Page X of Y`. `next.config.ts` traces
both font files into the PDF route deployment output. CI uses the fixed
`ubuntu-24.04` runner and Poppler package `24.02.0-1ubuntu9.9`, logging both
`pdftoppm` and `pdfinfo` versions. No remote Supabase project or database
migration is part of Stage 13.

**Acceptance criteria**

- The approved design is represented without hard-coding school-specific academic rules.
- Generation is repeatable from an immutable snapshot and handles page, font, image, and data edge cases.
- Artifacts contain the expected student and academic scope and no unrelated records.
- Failure handling, visual regression checks, and representative synthetic fixtures are documented and tested.

## 14. Publication workflow

Stage 14 implements private artifact storage, review, publication, withdrawal,
regeneration through new immutable report versions, and publication-aware
supersession. Artifact bytes are rendered by the Stage 13 server path and
transported through a narrow server-only Storage wrapper; user-session
authorization remains authoritative for report reads, workflow RPCs, and
access audits. Migration 33 also rejects future-dated role grants and
preserves published/withdrawn predecessor history during Stage 12 generation.
See `docs/report-publication.md` for the trust and correction model.

**Acceptance criteria**

- Storage is private and object identifiers do not grant access.
- Generation and publication remain distinct authorized actions.
- Only a reviewed version can be published, and withdrawal takes effect promptly.
- Publication lifecycle events and artifact access are audited and tested.

**Implementation evidence (2026-09-01)**

- Migration 33 is additive and leaves Migration 32 byte-for-byte unchanged. It
  requires `granted_at <= now()` plus a null `revoked_at`, removes direct
  authenticated report-artifact Storage policies, derives registration
  metadata from the canonical object, and applies publication-aware automatic
  supersession.
- `storage-admin.ts` is a server-only, narrow transport for report-artifact
  upload, verified download, and unregistered orphan cleanup only. Authorization,
  report reads, workflow RPCs, and audit attribution remain user-session and
  database controlled.
- The database behavior fixture covers live transitions and denial paths. The
  signed-in integration suite covers the trust boundary; the dedicated
  concurrency runner uses independent PostgreSQL connections and explicit row
  lock barriers for 12 race classes plus successor/immutability lifecycle
  proofs; the publication browser suite contains 46 scenarios.
- The retained Stage 10 reopen RPC rejects downstream reports by design and its
  existing tests assert that behavior. Stage 14 does not rewrite that contract,
  so a post-publication Stage 10 reopen cannot be claimed as completed here.
  No Stage 15 work has started and no remote Supabase project is modified.

## 15. Parent portal

Implemented on the Stage 15 feature branch: rate-limited access-code and
secure-PIN verification, restricted custom sessions, guardian eligibility
checks, and current and historical published-report access.

**Acceptance criteria**

- PINs are never stored or logged in plaintext.
- Verification responses resist student or account enumeration and brute-force attempts.
- A parent session can access only the verified student's published reports.
- Session expiry, revocation, withdrawal, cross-student attempts, and accessible responsive behavior are tested.
- Login and every protected request recheck live guardian eligibility; removal
  before login creates no session or success audit.
- Parent detail uses frozen Stage 12 subject identity, and later live subject
  renames cannot change historical HTML or PDF identity.

The acceptance hardening adds Migration 36 without rewriting Migration 35,
real signed-in database behavior coverage, a runtime pgTAP boundary file, nine
distinct deterministic concurrency races, and a fixture-backed Playwright
acceptance suite with more than 45 meaningful parent flows. See [Parent
portal](parent-portal.md) for the session, report-snapshot and private-artifact
trust boundaries.

## 16. Analytics

Implement authorized school, class, student, aggregate-distribution, and subject-performance views.

**Acceptance criteria**

- Metrics define their population, academic scope, exclusions, and calculation rules.
- Dashboards reconcile with approved calculation output for representative fixtures.
- Access is appropriately scoped and exports cannot bypass permissions.
- Small-group or personal-data exposure is reviewed before production.

## 17. Promotion system

Implement configurable final-term promotion recommendations and controlled final decisions.

**Acceptance criteria**

- Recommendation rules and effective versions are data-driven.
- Recommendations are reproducible from finalized results and do not become decisions automatically.
- Authorized head teachers confirm decisions and provide reasons for overrides.
- Historical decisions remain stable, auditable, and linked to their source snapshot.

## 18. Security testing, deployment and documentation

Complete production hardening, operational readiness, deployment, and user or administrator guidance.

**Acceptance criteria**

- Threat modeling, authorization and RLS tests, dependency review, secrets scanning, input validation, and parent-portal abuse testing are complete.
- Backup, restore, retention, monitoring, alerting, incident response, and rollback procedures are tested.
- Preview and production data and credentials are separated; production deployment uses reviewed configuration.
- Accessibility, performance, browser support, operational runbooks, user guidance, and known limitations are documented.

## Stage 7 correction status

Stage 7 migration 17 hardens student management without advancing the roadmap.
It serializes capacity and primary-guardian replacement, enforces one current
enrolment, separates enrolment closure from student lifecycle, requires
explicit reactivation, supports privacy-safe historical directory filters and
verifies private photo-object existence. Stage 8 has not started, and the work
used only the local Supabase stack; no remote project was linked or modified.

# Stage 8 — teacher assignments

Stage 8 adds secure subject and class-teacher lifecycle management, overlap protection, atomic primary replacement, selected-membership visibility, audit events, and dedicated local validation. Stage 9 adds draft marks entry.

# Stage 10 — marks workflow

Submission, review, return/resubmission, approval, sheet/term locking,
readiness, timelines, and controlled correction revisions are implemented.
The correction verification includes 173 Stage 10 database assertions, 20
signed-in integration cases, and 39 browser scenarios. It covers selected-
school isolation, exact bound-teacher authority, stale writes, all nine
workflow race classes, roster freezing, correction lineage, stable revision
navigation, browser console cleanliness, privacy, and the Stage 11 boundary.
Stage 11 calculations remain unstarted.

## Stage 14 — Secure report publication workflow

Implemented on the Stage 14 feature branch: private checksum-verified PDF
artifacts, staff review/publication/withdrawal workflow, publication-aware
supersession, selected-membership authorization, audit events, and staff UI.
Stage 15 adds the separate parent/guardian portal, one-time credential
issuance/reset/revocation, hashed custom sessions, guardian eligibility
revalidation, publication-aware report filtering, parent-safe snapshot detail,
and checksum-verified private artifact delivery. Public publication remains
out of scope.
