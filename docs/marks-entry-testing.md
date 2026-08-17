# Marks-entry testing

Run Stage 9 locally after `npm run db:start`:

```bash
npm run db:reset
npm run db:test
npm run test:marks-entry
npm run test:e2e:marks-entry
```

The Stage 9 pgTAP file has 81 assertions covering RPC privilege/search-path
posture, forced RLS, authority-row and assignment/term/sheet locking,
immutable identities, score constraints, compact audit hooks, the privacy-safe
return contract and the absence of Stage 10 transition RPCs. Its runtime
fixture also proves a privileged in-place sheet-version update fails and
leaves the complete revision identity unchanged.

The signed-in integration suite has 40 cases and uses anon-key product clients
for normal flows. It covers idempotent/concurrent initialization, cells and
attendance, stale writes, rollback, cross-scope attempts, read-only viewers
and historical continuity. Real two-connection tests synchronize on observed
PostgreSQL lock waits to prove authority-change-first behavior for concurrent
role/permission revocation, membership suspension, school deactivation,
selected-membership switching, assignment ending, term changes and sheet
workflow changes. The inverse marks-write-first ordering is proved against a
concurrent membership suspension. The dedicated Playwright suite has 25 cases
covering the teacher grid, validation, save and conflict UX, read-only
dashboard, keyboard/mobile access, privacy and the absence of workflow
controls. Fixture setup alone uses local administrative access and synthetic
data. No remote Supabase project is linked or modified.
