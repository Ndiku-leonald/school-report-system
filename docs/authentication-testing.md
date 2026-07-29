# Authentication Testing

## Test layers

Stage 4 uses four complementary layers:

- Vitest unit and component tests validate schemas, signed recovery state and
  proofs, confirmation types, strict invitation redirects, audit IP parsing,
  membership routing, redirect cookie propagation, service-client
  configuration, and accessible forms.
- pgTAP validates own-row identity policies, cross-user isolation, anonymous
  denial, browser write denial, continued academic denial, and exact trusted
  service privileges, atomic invitation activation, and transactional auditing.
- `npm run test:auth` proves public signup rejection, administrative
  invitation, Supabase's 12-character password policy, password sign-in,
  session creation, membership states, RLS reads, and denied academic/write
  operations.
- `npm run test:e2e:auth` uses Playwright with generated local invitation and
  recovery links and local captured mail to test protected redirects, generic
  login failure, active login, logout, unavailable accounts, invitation
  completion, school selection, token-hash recovery, PKCE recovery,
  ordinary-session denial, forged-proof cleanup, proof consumption, and fresh
  login.

## Local commands

```bash
npm run db:start
npm run db:reset
npm run db:test
npm run test:auth
npx playwright install chromium
npm run test:e2e:auth
```

The Auth runners read local API configuration from `supabase status -o env`
without printing it. They pass values and a synthetic 32-byte-plus Auth-flow
secret only to their child test process. Test identities use `.invalid` domains
and synthetic names and employee numbers.

The Playwright suite exercises both generated token hashes and a real local
PKCE link captured from Mailpit. It does not claim that a production SMTP
provider delivered email.

Restart the local stack after changing `supabase/config.toml`. The local policy
keeps the email/password provider enabled for invited staff but disables global
signup and anonymous sign-in. Public `signUp()` must still fail. Hosted Auth
settings are separate and were not changed by these tests.

## Local email capture

Supabase local development exposes its mail-capture interface at the URL shown
by `npm run db:status` (normally `http://127.0.0.1:54324`). Use it only for
synthetic local messages. Never forward or screenshot a real invitation or
recovery link.

## Redirect configuration

For local development, configure the Supabase Auth Site URL as
`http://127.0.0.1:3100` for authenticated Playwright, or
`http://localhost:3000` for the ordinary development server. Allow:

```text
http://127.0.0.1:3100/auth/callback
http://127.0.0.1:3100/auth/confirm
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

Preview and production environments must list their exact HTTPS origins and
the same paths. Do not add broad wildcard origins without a separate review.
Templates may link to `/auth/confirm` with `token_hash`, `type`, and a safe
internal `next`; PKCE links return to `/auth/callback` with `code`.

## Safe cleanup

Integration tests delete their synthetic identity rows and Auth users. Auth E2E
events are append-only, so E2E fixtures remain until the next
`npm run db:reset`. That reset is destructive only to the local database.

Never adapt these commands to a remote project by guessing a reference or
copying production credentials into local configuration.
