# Staff Authentication

## Boundary and request flow

Staff authentication uses Supabase Auth email/password identities and
`@supabase/ssr` cookies. The browser never receives the service-role key.

1. `src/proxy.ts` runs on authentication-relevant routes, refreshes session
   cookies with `getClaims()`, and performs optimistic signed-in/signed-out
   redirects. Redirects retain rotated or cleared Supabase cookies and their
   attributes, but do not copy arbitrary headers.
2. A protected layout or server action calls `getUser()` for a current Auth
   record and reads the caller's identity context through RLS.
3. The server resolves current membership state and revalidates the
   active-membership cookie.
4. The server confirms that cookie selection against the membership stored for
   the verified JWT `session_id` in PostgreSQL.
5. Stage 5 loads permissions for that exact session-selected membership.
   `/dashboard` requires `DASHBOARD_VIEW`; `/teacher` requires
   `TEACHER_WORKSPACE_VIEW`; missing permission uses `/forbidden`.

The proxy is not an authorization boundary. A forged or stale cookie cannot
select a membership that is absent from the current authenticated user's
RLS-filtered active membership set or change the PostgreSQL session selection.
Cookie/database disagreement fails closed.

## Account states

- One active membership is selected automatically in both PostgreSQL and the
  cookie.
- Multiple active memberships require `/select-school`.
- An invited membership requires `/complete-invitation`.
- Suspended, disabled, inactive-school, and missing memberships use the generic
  `/account-unavailable` state.
- Missing or invalid Auth sessions return to `/staff-login`.

The selected membership cookie is HttpOnly, SameSite=Lax, scoped to `/`, expires
after eight hours, and is Secure in production. It is an untrusted UI selector,
not the RLS authority. Each Supabase Auth session holds at most one database
selection; separate sessions for the same profile may select independently.

## Login, logout, and recovery

Login errors are intentionally generic. Successful sign-in is not sufficient:
the server must also find the profile and valid membership state. Before
setting the active-school cookie, single-school sign-in and explicit
multi-school selection call `set_my_active_membership` and verify the returned
ID. Sign-out clears the current session's database selection and cookie before
invalidating the Supabase session, then records a safe audit event.

Password-reset requests always return the same success message. PKCE redirects
contain a signed, expiring recovery state with only a keyed normalized email
hash. After code exchange, the callback compares it with the authoritative
Auth user. Token-hash recovery is verified by the confirm route.

Either valid recovery route mints an HMAC-SHA-256 proof containing the recovery
purpose, user ID, nonce, issuance time, and 15-minute expiry. Its HttpOnly,
SameSite=Lax cookie is Secure in production and scoped to `/reset-password`.
Both page and action require that proof and the same Auth user, so an ordinary
session cannot reset a password. Success clears recovery and active-school
cookies, signs out, and requires a fresh login; invalid proofs are cleared.

General `next` destinations accept only same-origin absolute paths and are
never authentication-flow evidence. The PKCE callback requires exactly one
valid `recovery_state` or `invitation_state` before exchanging a code; generic
codes and requests with missing or dual states fail closed. Both state types
are HMAC-SHA-256 signed, expire after 15 minutes, contain a one-way keyed
normalized-email hash, and are matched to the authoritative Auth user after
exchange. Confirmation is a separate token-hash path supporting only `invite`
and `recovery`; `signup` and `magiclink` are rejected.

## Invitation flow

Administrators provision invitations through the server-only CLI described in
[staff-provisioning.md](staff-provisioning.md). The staff member follows the
single-use Auth link. For PKCE, the CLI supplies a signed invitation state
bound to the invited email; the callback also requires the authoritative
user's own RLS-filtered memberships to contain an `INVITED` row before
redirecting to completion. The staff member chooses a password, and the trusted
server operation calls migration 09's service-role-only database function. It
locks and validates the exact expected membership set, activates all eligible
`INVITED` rows or none, and writes both success audits in the same transaction.
For one active membership, completion stores the current session selection
before setting the cookie. For multiple memberships, it clears both selection
and cookie before routing to `/select-school`.

## Auditing and safe metadata

Production code imports the administrative client only from
`src/lib/auth/actions.ts` (invitation activation),
`src/lib/auth/audit.ts` (append-only authentication events), and
`scripts/invite-staff.ts` (trusted provisioning). Its dedicated unit test also
imports the factory to verify session persistence is disabled. No Client
Component or browser client imports it.

The following lifecycle actions are recorded through the trusted service path:

- `STAFF_INVITED`
- `STAFF_INVITATION_COMPLETED`
- `STAFF_MEMBERSHIP_ACTIVATED`
- `STAFF_SIGN_IN_SUCCESS`
- `STAFF_SIGN_OUT`
- `PASSWORD_RESET_COMPLETED`
- `ACTIVE_SCHOOL_SELECTED`

Audit records may include membership, school, request ID, a validated first
forwarded IPv4/IPv6 address, user
agent, status, and role count. They must never contain email-link token hashes,
passwords, access tokens, refresh tokens, authorization headers, service keys,
or complete cookie values.

## Staff-only Auth configuration

`supabase/config.toml` disables project-wide public signup and anonymous
sign-in, enables the email/password provider for invited staff login, and sets
the minimum password length to 12. In the current local Auth server,
`[auth.email] enable_signup=false` disables email/password login itself, so the
project-wide switch is the enforced registration boundary. Apply the equivalent
signup-disabled, email/password-enabled, 12-character policy separately in the
hosted project before production. No remote project was changed here.

## Revocation behavior

Changing a membership to `SUSPENDED` or `DISABLED`, or disabling its school,
blocks workspace access when the next authoritative request reloads context.
Revoking a role also removes its permissions on that request because the
database-backed set is not stored in the JWT or a long-lived cache. The
active-school cookie does not override that state. For urgent account-wide
revocation, an administrator must additionally revoke the user's Supabase Auth
sessions using an approved operational procedure.

## Local validation

Start and reset the local stack, then run:

```bash
npm run db:test
npm run test:auth
npm run test:authorization
npm run test:e2e:auth
npm run test:e2e:authorization
```

Tests use synthetic `.invalid` identities. No command in this workflow applies
migrations or creates users in a remote Supabase project.

Local Auth Site/Redirect URL settings, email capture, generated-link tests, and
preview/production redirect guidance are documented in
[authentication-testing.md](authentication-testing.md).

## Troubleshooting

- A redirect loop usually means public Supabase configuration is missing,
  cookies cannot be written for the current origin, or the membership is not in
  the expected state.
- `account-unavailable` means Auth succeeded but no usable active membership was
  found.
- An invalid invitation/recovery page usually means the link expired, was
  already consumed, or its redirect URL is not allowed in Supabase Auth.
- If audit writes fail, verify only the server process has the service-role key
  and inspect server logs; never paste the key or session tokens into an issue.
