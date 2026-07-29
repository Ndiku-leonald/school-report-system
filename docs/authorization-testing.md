# Authorization Testing

Stage 5 tests run only against the lockfile-managed local Supabase stack and
synthetic `.invalid` users. They do not link, migrate, or reset a hosted
project.

Start and rebuild the local database:

```bash
npm run db:start
npm run db:reset
npm run db:lint
npm run db:test
```

The database suite contains 90 Stage 5 assertions in addition to the existing
132 assertions, for 222 total. It verifies the enum and exact role matrix,
session-scoped selection RPCs, missing and malformed session claims,
independent selections for two sessions of one profile, switching and clearing,
revocation, inactive membership/school behavior, selected-membership
cross-school isolation, assignment-limited rosters/marks/reports, historical
enrolment privacy, guardian and parent-record denial, internal-table privilege
denial, write denial, anonymous denial, and forced RLS.

Run signed-in anonymous-key integration tests:

```bash
npm run test:auth
npm run test:authorization
```

The 15-test authorization suite provisions nine synthetic role cases, signs in
through Supabase Auth, explicitly selects memberships, checks each effective
permission set, and queries RLS-protected records through normal anonymous-key
clients. Its multi-school case proves no academic access before selection,
School B assignment scope while School B is selected, School A administrative
scope only after switching, and an independent second session that remains on
School B. A direct connection to the local database is used only to grant and
revoke temporary fixture-setup privileges; no hosted credentials or project
reference is accepted.

Run browser suites:

```bash
npm run test:e2e:auth
npm run test:e2e:authorization
```

The 16 authorization browser cases cover the two workspace guards, forbidden
and membership-failure routing, selected-school permissions and direct
Supabase reads, secure school switching, forged membership-cookie rejection,
independent browser-session selections, sign-out cleanup, server-filtered
navigation, next-request role revocation, and mobile keyboard navigation.

Before review, also run:

```bash
npm run test:e2e:authorization -- --repeat-each=5
npm run db:types
git diff --exit-code -- src/types/database.generated.ts
```

CI starts and always stops its own local Supabase stack. It runs the retained
authentication suites and the new authorization suites without remote
Supabase secrets.
