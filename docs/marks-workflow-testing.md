# Marks workflow testing

All Stage 10 fixtures use synthetic `.invalid` identities and a loopback-only
local Supabase stack. Dedicated runners reject non-loopback API and database
URLs.

```bash
npm run db:reset
npm run db:lint
npm run db:test
npm run test:marks-workflow
npm run test:e2e:marks-workflow
```

Stage 10 has 173 database assertions: 58 structural assertions in
`marks_workflow_management.test.sql` and 115 runtime behavioral assertions in
`marks_workflow_behavior.test.sql`. Together they verify authenticated RPC
execution, grants, fixed search paths, forced RLS, direct-write denial,
selected-school and exact-teacher authority, every workflow state transition,
completeness, stale writes, term readiness, correction lineage, audit
cardinality, frozen enrollment scope, downstream protection, privacy, and the
Stage 11 boundary.

The 20-case signed-in integration suite executes the
teacher/reviewer/approver/locker flow through anonymous-key clients. It covers
completeness, selected-school isolation, exact bound-teacher authority, live
role and membership changes, frozen marks, returned editing, separation of
duties, readiness, locking, controlled reopen, correction cloning,
one-successor enforcement, source immutability, post-lock roster freezing with
non-roster metadata still allowed, downstream report-batch protection, audit
presence with selected exact cardinality checks, and relock. Independent
PostgreSQL and PostgREST connections exercise submit-first and save-first
ordering, double submit,
competing review, return versus approval, role revocation, membership
suspension, term-readiness re-evaluation, and competing correction creation.

The 39-scenario Playwright suite uses two schools, multiple selected
memberships, a teacher, a registrar reviewer/approver, a head-teacher
locker/corrector, an unauthorized teacher, and a synthetic guardian-contact
fixture. It covers incomplete and complete submission, read-only inputs,
forbidden review access,
queue/review/return, teacher resubmission, approval/locking, readiness and term
controls, stale conflicts, correction creation, revision-two workflow and
relock, current/historical labels, stable unique list keys, clean browser
console output, mobile and keyboard usability, contact privacy, and absence of
Stage 11 calculations.

CI runs both dedicated suites after rebuilding migrations, regenerates types,
and requires a clean generated contract. Its cleanup always stops Supabase.
