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

`marks_workflow_management.test.sql` checks RPCs, execution grants, fixed
search paths, forced RLS, direct-write denial, workflow guards, lineage,
separation of duties, deterministic locks, downstream protection, privacy, and
the Stage 11 boundary. Existing database suites exercise runtime constraints
and privileged frozen-state behavior.

The signed-in integration suite executes the teacher/reviewer/locker flow
through anonymous-key clients. It covers completeness, selected-school
isolation, frozen marks, returned editing, separation of duties, readiness,
locking, controlled reopen, correction cloning, one-successor enforcement,
source immutability, post-lock roster freezing with non-roster metadata still
allowed, and relock. Independent PostgreSQL and PostgREST connections
deterministically exercise both save/submit winner orders, a true double
submit, competing reviewers, and competing correction creators.

The Playwright suite covers incomplete and complete submission, read-only
inputs, forbidden review access, queue/review/return, teacher resubmission,
approval/locking, correction creation, new-revision navigation, old locked
history, mobile grid usability, privacy, and absence of Stage 11 calculations.

CI runs both dedicated suites after rebuilding migrations, regenerates types,
and requires a clean generated contract. Its cleanup always stops Supabase.
