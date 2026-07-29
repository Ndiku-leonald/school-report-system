# Local Supabase Development

## Prerequisites

Install Node.js 20.9 or later, npm, Git, and a running Docker-compatible engine.
The Supabase CLI is lockfile-managed as a development dependency; do not rely on
an unrecorded global version.

## Local workflow

Install dependencies and start the local stack:

```bash
npm ci
npm run db:start
```

Rebuild the database from all migrations and load the synthetic seed:

```bash
npm run db:reset
```

Run database linting and pgTAP tests:

```bash
npm run db:lint
npm run db:test
```

Generate and format the committed TypeScript representation of `public`:

```bash
npm run db:types
npx prettier --write src/types/database.generated.ts
```

Review generated changes. CI regenerates this file and fails when the committed
version is stale. Create the next ordered migration with:

```bash
npm run db:migration:new -- descriptive_change_name
```

Inspect or stop the stack with:

```bash
npm run db:status
npm run db:stop
```

`db:reset` is destructive to the **local** development database and is expected
to erase local-only data. The seed intentionally contains configuration-only
synthetic records.

## Remote-development safety

Local validation is required before considering a remote database. Do not guess
a project reference, copy credentials into configuration, or link to an
ambiguous project. Authenticate through the Supabase CLI's supported secure
mechanism, confirm the intended non-production project with its owner, then:

```bash
npx supabase link --project-ref <confirmed-development-project-ref>
npx supabase migration list
npx supabase db push --dry-run
```

Review the migration list and preview before applying:

```bash
npx supabase db push
```

Never run `supabase db reset` against a remote database. Never connect CI to a
production project. Access tokens, database passwords, connection strings, and
service-role keys belong only in ignored local files or an approved encrypted
secret store and must never be committed or pasted into pull requests.
