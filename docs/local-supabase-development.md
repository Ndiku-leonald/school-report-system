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
npm run test:auth
npm run test:authorization
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

Run browser authentication scenarios while the local stack is running:

```bash
npx playwright install chromium
npm run test:e2e:auth
npm run test:e2e:authorization
```

The Auth and authorization test runners obtain local API values from
`supabase status -o env`,
pass them only to child processes, and do not print the local service-role key.
They also inject a synthetic `AUTH_FLOW_SIGNING_SECRET` without printing it and
refuse to substitute a remote project.

Local Auth disables project-wide public signup and anonymous sign-in and
requires passwords of at least 12 characters. Keep the email/password provider
enabled so invited staff can sign in; the global signup switch rejects public
`signUp()`. Restart (`db:stop`, then `db:start`) after changing
`supabase/config.toml`, because running containers do not reload it.

Provision a synthetic local staff invitation using the documented guarded
command in [staff-provisioning.md](staff-provisioning.md).

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

Local configuration does not alter a hosted Supabase project. Before
production, independently disable hosted public signup and anonymous sign-in,
enable email/password only for invited staff login, set the minimum password
length to 12, and configure exact trusted callback origins. No remote Supabase
project was modified during the Stage 4, Stage 5, Stage 6, or Stage 7 work.

Stage 6 adds `npm run test:academic-config` and
`npm run test:e2e:academic-config`. Both discover credentials from the running
local CLI stack and provision only synthetic `.invalid` identities. Run them
after a local reset; never provide a remote project reference to these commands.

Stage 7 adds `npm run test:students` and `npm run test:e2e:students`. The
integration runner refuses a non-loopback API URL and provisions disposable
synthetic `.invalid` identities. The browser suite covers 26 student-management
scenarios and must run in CI. Student photo objects remain inside the local
private Storage service. On Windows, if the standard local ports are reserved,
use a temporary local remap and restore `supabase/config.toml` before staging.
