# Academic configuration testing

Stage 6 uses three local-only layers:

1. `npm run db:test` includes the original 40-assertion Stage 6 contract and a
   40-assertion corrective workflow suite, alongside all earlier database suites
   (302 assertions total).
2. `npm run test:academic-config` provisions synthetic `.invalid` identities and
   runs 18 focused workflows through signed-in anonymous-key clients.
3. `npm run test:e2e:academic-config` verifies accessible registrar and read-only
   teacher browser experiences across 24 Chromium scenarios, including mobile
   and keyboard interactions. The dedicated runner always enables this suite,
   so CI cannot silently skip it.

Start Docker Desktop and the local stack before database-backed validation:

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
npm run db:types
npm run test:academic-config
npm run test:e2e:academic-config
```

The runners use the local Auth administration API to provision synthetic users
and the local database-owner connection to arrange academic fixtures that
browser roles are intentionally forbidden to write directly. Product Server
Actions and configuration RPC calls use the normal authenticated anonymous-key
client. Test identities use `.invalid` email addresses and synthetic records;
no remote Supabase project is contacted.

The pgTAP suite verifies direct-write denial, guarded function exposure, fixed
search paths, required constraints and indexes, lifecycle columns, and forced
RLS. Integration coverage verifies role differences, selected membership
isolation, entity-specific edits, reorder transactions, class and mapping
identity locks, draft-versus-version behavior, lifecycle transitions,
stale-write rejection, audit semantics, and direct-write denial. Browser
coverage uses accessible role and label locators and exercises the structured
component, band, ranking, and promotion controls.

CI rebuilds the database solely from ordered migrations and seed data, regenerates
database types, and fails if the committed types differ. Never run `db reset`
against a remote project.
