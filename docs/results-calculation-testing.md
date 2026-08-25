# Results calculation testing

The database suite is `supabase/tests/database/results_calculation.test.sql`.
It verifies the migration inventory, forced RLS, direct-write denial, fixed
search paths and internal grants, locked/latest input guards, rule binding,
formula markers, append-only tables, checksum/idempotence structure,
classification range exclusion, and privacy of read contracts.

The dedicated commands are:

```bash
npm run test:results-engine
npm run test:e2e:results-engine
```

Live integration and browser coverage require a running local Supabase stack,
synthetic fixtures, and signed-in anonymous-key clients. The application never
uses the service-role client for calculation or result reads. With Docker
available, run `npm run db:reset`, `npm run db:test`, the dedicated integration
command, and the dedicated Playwright command. Concurrency correctness is
serialized by a PostgreSQL transaction advisory lock over the term/grade scope;
tests must use independent database transactions rather than sleeps.

The Stage 11 acceptance set includes 45 live integration scenarios and 51
browser scenarios. It covers explicit rule selection, curriculum drift and
obsolete-sheet handling, immutable source manifests, checksum/idempotence,
attendance and exemption semantics, aggregate/classification boundaries,
class/grade/subject ranking and tie metadata, normalized admission-number
ordering, keyboard and narrow-viewport accessibility, privacy-shaped result
payloads, and concurrent identical calls. Migration-level pgTAP remains the
authority for RLS, privileges, fixed search paths, and append-only invariants.
