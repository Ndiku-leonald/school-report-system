# Marks-entry testing

Run Stage 9 locally after `npm run db:start`:

```bash
npm run db:reset
npm run db:test
npm run test:marks-entry
npm run test:e2e:marks-entry
```

The pgTAP file has 52 structural assertions covering RPC
privilege/search-path posture, forced RLS, the presence of assignment, term,
scheme and concurrency controls, immutable identities, score constraints,
compact audit hooks, the privacy-safe return contract and the absence of
Stage 10 transition RPCs. Behavioral authorization and transaction outcomes
are exercised by the signed-in integration suite rather than inferred from
the pgTAP count alone.

The signed-in integration suite has 31 cases and uses anon-key product clients
for normal flows. It covers idempotent/concurrent initialization, cells and
attendance, stale writes, rollback, revocations, suspension, cross-scope
attempts, read-only viewers and historical continuity. The dedicated
Playwright suite has 25 cases covering the teacher grid, validation, save and
conflict UX, read-only dashboard, keyboard/mobile access, privacy and the
absence of workflow controls. Fixture setup alone uses local administrative
access and synthetic data. No remote Supabase project is linked or modified.
