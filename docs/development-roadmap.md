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

## 3. Supabase schema and migrations

Design the normalized data model, constraints, indexes, generated types, migration workflow, and seed strategy using synthetic data.

**Acceptance criteria**

- All schema changes are represented by reviewed, reproducible migrations.
- Academic configuration and historically significant rules are data-driven and versionable.
- Foreign keys, uniqueness, check constraints, indexes, and deletion behavior are tested.
- No real student data or production credentials appear in migrations or fixtures.

## 4. Staff authentication

Implement Supabase Auth integration for staff sessions, sign-in, sign-out, recovery, and account-state handling.

**Acceptance criteria**

- Protected routes and server operations require a valid staff session.
- Session refresh, logout, disabled-account, and recovery behavior are tested.
- Secrets and privileged Supabase credentials remain server-only.
- Authentication events provide appropriate audit and operational signals without logging credentials.

## 5. Roles and permissions

Implement proposed staff roles, contextual assignments, server-side permission checks, and Row Level Security.

**Acceptance criteria**

- Access is deny-by-default and scoped by role, assignment, academic period, and target.
- Subject teachers cannot access unassigned classes or subjects.
- Class teachers can view full results only for assigned classes.
- Positive and negative authorization tests cover client manipulation and cross-scope access.

## 6. Academic configuration

Implement academic years, terms, classes, streams, subjects, assessment models, grading scales, aggregate rules, ranking behavior, and promotion-rule configuration.

**Acceptance criteria**

- Authorized users can manage valid configuration without source-code changes.
- Validation prevents overlapping, incomplete, or internally inconsistent active rules.
- Effective scope or versioning preserves historical interpretation.
- School identity and all academic labels and thresholds remain configurable.

## 7. Student management

Implement student profiles, academic-period enrolment, class or stream placement, status changes, and secure access-code administration.

**Acceptance criteria**

- Authorized staff can manage students and enrolments with server validation.
- Transfers, withdrawals, and duplicate-record constraints are handled predictably.
- Views expose only the minimum necessary personal information.
- Tests use synthetic data and sensitive changes are audited.

## 8. Teacher assignments

Implement class-teacher and subject-teacher assignments by academic period, class, stream, and subject.

**Acceptance criteria**

- Administrators can create, revise, expire, and inspect assignments.
- Conflicting or invalid assignments are rejected according to approved policy.
- Assignment changes immediately affect server-side and RLS access.
- Historical assignments remain traceable through audit or effective dating.

## 9. Marks entry

Implement assignment-scoped draft marks entry with validation, completeness feedback, and safe batch operations.

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

## 13. PDF generation

Implement report rendering only after the school supplies and approves a real report-card example.

**Acceptance criteria**

- The approved design is represented without hard-coding school-specific academic rules.
- Generation is repeatable from an immutable snapshot and handles page, font, image, and data edge cases.
- Artifacts contain the expected student and academic scope and no unrelated records.
- Failure handling, visual regression checks, and representative synthetic fixtures are documented and tested.

## 14. Publication workflow

Implement private artifact storage, review, publication, withdrawal, regeneration, and supersession.

**Acceptance criteria**

- Storage is private and object identifiers do not grant access.
- Generation and publication remain distinct authorized actions.
- Only a reviewed version can be published, and withdrawal takes effect promptly.
- Publication lifecycle events and artifact access are audited and tested.

## 15. Parent portal

Implement rate-limited student-code and secure-PIN verification, restricted sessions, and current and historical published-report access.

**Acceptance criteria**

- PINs are never stored or logged in plaintext.
- Verification responses resist student or account enumeration and brute-force attempts.
- A parent session can access only the verified student's published reports.
- Session expiry, revocation, withdrawal, cross-student attempts, and accessible responsive behavior are tested.

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
