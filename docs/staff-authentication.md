# Staff Authentication

## Boundary and request flow

Staff authentication uses Supabase Auth email/password identities and
`@supabase/ssr` cookies. The browser never receives the service-role key.

1. `src/proxy.ts` runs on authentication-relevant routes, refreshes session
   cookies with `getClaims()`, and performs optimistic signed-in/signed-out
   redirects.
2. A protected layout or server action calls `getUser()` for a current Auth
   record and reads the caller's identity context through RLS.
3. The server resolves current membership state and revalidates the
   active-membership cookie.
4. Only an active membership in an active school enters `/dashboard` or
   `/teacher`. Role/assignment authorization is intentionally deferred.

The proxy is not an authorization boundary. A forged or stale cookie cannot
select a membership that is absent from the current authenticated user's
RLS-filtered active membership set.

## Account states

- One active membership is selected automatically.
- Multiple active memberships require `/select-school`.
- An invited membership requires `/complete-invitation`.
- Suspended, disabled, inactive-school, and missing memberships use the generic
  `/account-unavailable` state.
- Missing or invalid Auth sessions return to `/staff-login`.

The selected membership cookie is HttpOnly, SameSite=Lax, scoped to `/`, expires
after eight hours, and is Secure in production.

## Login, logout, and recovery

Login errors are intentionally generic. Successful sign-in is not sufficient:
the server must also find the profile and valid membership state. Sign-out is a
POST server action that records a safe audit event before clearing the Supabase
session and active-school cookie.

Password-reset requests always return the same success message. Callback codes
are exchanged server-side; token-hash links are verified by the confirm route.
After a password update the session is signed out so the staff member must
authenticate again.

`next` destinations accept only same-origin absolute paths. External,
protocol-relative, malformed, and missing values fall back to `/dashboard`.

## Invitation flow

Administrators provision invitations through the server-only CLI described in
[staff-provisioning.md](staff-provisioning.md). The staff member follows the
single-use Auth link, chooses a password, and the trusted server operation
activates only `INVITED` memberships belonging to that verified Auth user.

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

Audit records may include membership, school, request ID, IP address, user
agent, status, and role count. They must never contain email-link token hashes,
passwords, access tokens, refresh tokens, authorization headers, service keys,
or complete cookie values.

## Revocation behavior

Changing a membership to `SUSPENDED` or `DISABLED`, or disabling its school,
blocks workspace access when the next authoritative request reloads context.
The active-school cookie does not override that state. For urgent account-wide
revocation, an administrator must additionally revoke the user's Supabase Auth
sessions using an approved operational procedure.

## Local validation

Start and reset the local stack, then run:

```bash
npm run db:test
npm run test:auth
npm run test:e2e:auth
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
