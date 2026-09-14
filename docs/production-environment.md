# Production Environment

This document defines the environment-variable boundary for the application. Never
commit real values to this repository, paste them into issues, or print them in logs.

## Environment categories

- Development: local Next.js and local Supabase values. Loopback HTTP URLs are allowed.
- Test: synthetic values used by Vitest, Playwright, and local integration runners.
- CI: synthetic/local values supplied by GitHub Actions; CI must not use production secrets.
- Preview: isolated Vercel project/configuration. Preview must not use production service-role,
  database, storage, parent-portal, or authentication configuration.
- Production: real hosted values, HTTPS application URL, and separately managed secrets.

## Public vs server-only values

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are intentionally browser-visible configuration.
The anon key is not a privileged credential; database security still depends on RLS.

`AUTH_FLOW_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and
`PARENT_ACCESS_RATE_LIMIT_SECRET` are server-only secrets. They must never be renamed
with a `NEXT_PUBLIC_` prefix, imported by browser modules, logged, or placed in client
bundles.

`DATABASE_URL` and `DIRECT_URL` are operations/migration-only secrets in the current
application. They are not required by the web runtime and should not be added to Vercel
unless a future server feature explicitly needs them.

## Required development variables

Local development normally uses the local Supabase values documented in
`docs/local-supabase-development.md`. Loopback HTTP URLs are permitted. Synthetic
signing and rate-limit secrets must still be at least 32 bytes where required.

## Required CI variables

CI uses local Supabase and synthetic values. It must not connect to hosted production
Supabase and must not inherit production secrets from repository or environment settings.

## Required preview variables

Preview requires its own application URL, Supabase URL, and anon key. If preview runs
server-side administrative or parent-portal flows, it requires isolated preview secrets
and an isolated Supabase project. Production service-role keys, signing secrets, database
URLs, and parent secrets must not be reused.

## Required production variables

Production requires:

- `NEXT_PUBLIC_APP_URL` with an HTTPS origin.
- `NEXT_PUBLIC_SUPABASE_URL` with an HTTPS hosted Supabase URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `AUTH_FLOW_SIGNING_SECRET` with at least 32 random bytes.
- `SUPABASE_SERVICE_ROLE_KEY` for server-only privileged operations.
- `PARENT_ACCESS_RATE_LIMIT_SECRET` when the parent portal is enabled, with at least 32 random bytes.

`DATABASE_URL` and `DIRECT_URL` remain outside the web runtime unless explicitly required
by a future implementation.

## Application URL configuration

The application URL is used for authentication callbacks, recovery, invitations, and
generated links. It must be an origin without credentials, query strings, or fragments.
Trailing slashes are normalized. Production rejects HTTP application URLs.

## Authentication-related configuration

Production rejects missing, empty, placeholder, synthetic, or obvious test secret values.
Validation errors report variable names only and never secret contents. Auth-flow signing
material must remain separate from Supabase keys.

## Local development notes

Do not create a committed `.env` file. Use an ignored local environment file or the
existing local Supabase scripts. The tracked `.env.example` contains no credentials.

## Production validation behavior

The public environment is validated during production builds and again when the relevant
server/client boundary is initialized. Missing variables, malformed URLs, unsafe production
HTTP origins, suspicious public secret names, placeholder secrets, and reused privileged
keys fail closed with non-secret configuration errors.

## Vercel setup notes for Stage 18D

Stage 18D must configure separate Development, Preview, and Production environments,
protect production deployments, verify final response headers, and confirm the platform's
canonical client-IP behavior before relying on parent rate limiting. No Vercel settings are
changed by Stage 18B.
