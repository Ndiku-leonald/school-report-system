# Academic configuration testing

Stage 6 uses three local-only layers:

1. `npm run db:test` includes the 40-assertion pgTAP academic configuration
   contract, alongside all earlier database suites.
2. `npm run test:academic-config` provisions synthetic `.invalid` identities and
   exercises the RPCs through signed-in anonymous-key clients.
3. `npm run test:e2e:academic-config` verifies accessible registrar and read-only
   teacher browser experiences.

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

The integration runner uses the local service role only to create and remove
synthetic test fixtures. Product Server Actions and configuration RPC calls use
the normal authenticated anonymous-key client. Test identities use `.invalid`
email addresses and synthetic records; no remote Supabase project is contacted.

The pgTAP suite verifies direct-write denial, guarded function exposure, fixed
search paths, required constraints and indexes, lifecycle columns, and forced
RLS. Integration coverage verifies role differences, selected membership
isolation, year lifecycle, stale-write rejection, audit events, and direct-write
denial. Browser coverage uses accessible role and label locators.

CI rebuilds the database solely from ordered migrations and seed data, regenerates
database types, and fails if the committed types differ. Never run `db reset`
against a remote project.
