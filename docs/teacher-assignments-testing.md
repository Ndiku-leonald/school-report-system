# Teacher assignment testing

Stage 8 is tested only against the local Supabase stack. No remote project is linked, migrated, reset, or modified.

Run:

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
npm run test:teacher-assignments
npm run test:e2e:teacher-assignments
npm run db:types
```

The pgTAP file contains 41 Stage 8 assertions covering RPC privileges, fixed search paths, forced RLS, direct-write denial, selected-membership policies, role eligibility, effective dates, overlap constraints, serialization, audit behavior, dependency checks, and private eligible-teacher results.

The dedicated integration suite contains 22 signed-in anonymous-key workflow cases covering manager writes, schoolwide read-only access, matching-role own visibility, multi-school switching, role and membership revocation, effective access, primary and duplicate-assignment concurrency, optimistic conflicts, audits, and contact-field exclusion.

The dedicated Playwright suite contains 20 scenarios for management, filtering, creation, replacement, ending, selected-membership views, forbidden routes, responsive cards, keyboard access, privacy, and the explicit Stage 9 boundary. CI runs it without a skip flag after the local stack is started.

Temporary local port overrides must be restored and the local stack stopped before committing.
