# Stage 18I — Authentication and Parent Portal Hardening

Stage 18I records the final pre-production authentication review. The review
preserves deny-by-default authorization, does not apply migrations, and does
not create production identities, emails, credentials, Storage objects, or
Vercel resources.

Evidence labels:

- **VERIFIED** — supported by repository source, migrations, or tests.
- **UNVERIFIED** — requires a hosted Dashboard check that was not available
  through the read-only connector.
- **DEFERRED** — a deployment activation item for Stage 18M/18N or Storage
  Hardening in Stage 18J.

## Staff Auth architecture

Staff use Supabase Auth for identity and a server-side application context for
authorization. `getStaffContext()` verifies the current Auth user, loads the
profile, memberships, non-revoked roles, and schools, and derives an active
membership only when the membership is `ACTIVE` and the school is active.

The active-school cookie is an untrusted selector. Database authorization is
bound to the verified JWT `session_id`, the caller's profile, the selected
membership, live membership status, school status, and non-revoked role
assignments. The internal session-selection table is not exposed to browser
roles. Auth identity alone never grants application access.

Protected dashboard and teacher operations retain both server guards and
database-side authorization. Suspended, revoked, deleted, profile-less, or
school-invalid staff lose application authorization on the next authoritative
request.

## Invitation-only and provider policy

The intended production policy is:

| Setting | Policy | Evidence |
| --- | --- | --- |
| Public signup | Disabled | **VERIFIED locally; hosted value UNVERIFIED** |
| Anonymous sign-in | Disabled | **VERIFIED locally; hosted value UNVERIFIED** |
| Phone sign-up | Disabled unless separately approved | **VERIFIED locally; hosted value UNVERIFIED** |
| Unused social providers | Disabled | Hosted value **UNVERIFIED** |
| Email/password sign-in | Enabled for provisioned staff | Application uses `signInWithPassword`; hosted provider value **UNVERIFIED** |

The repository's local policy is in `supabase/config.toml`; it must not be
treated as proof of hosted configuration. No production user was created.

## Login security

**VERIFIED.** `/staff-login` submits a server action that validates the email,
password, and safe internal `next` path before calling Supabase Auth. Auth and
application failures return generic messages. A successful Auth login is
followed by a live profile/membership check; users without a usable profile or
membership are signed out and receive the generic failure path.

Passwords, access tokens, refresh tokens, signed flow states, PINs, and service
credentials are not logged. Audit events contain action/resource metadata and
validated operational telemetry only.

## Invitation security

**VERIFIED.** `scripts/invite-staff.ts` is a trusted CLI path. It validates
identity, school, employee number, and roles; blocks remote provisioning unless
`--allow-remote` is explicit; creates an email-bound, purpose-bound, expiring
signed invitation state; and provisions the Auth user, profile, invited
membership, and role assignments through the server-only administrative client.

The callback accepts an invitation only after PKCE/code verification, state
verification, email binding, and an own-user `INVITED` membership check.
Completion validates the password and activates the exact expected membership
IDs through the transaction-safe `activate_staff_invitation` function. The
database function locks the memberships, requires `INVITED` status and active
school, updates them atomically, and is executable only by `service_role`.

Expired, modified, wrong-purpose, wrong-email, replayed, or membership-missing
flows fail closed. Partial CLI provisioning is compensated on failure.

## Recovery security

**VERIFIED.** `/forgot-password` validates the email and returns a generic
response regardless of account existence. The reset request includes a
15-minute HMAC-signed, email-bound recovery state in the fixed callback URL.

`/auth/callback` verifies the state before exchanging the code, verifies the
returned Auth email, and sets a 15-minute recovery-proof cookie that is:

- HttpOnly;
- Secure in production;
- `SameSite=Lax`; and
- scoped to `/reset-password`.

`/reset-password` requires both the proof cookie and a fresh server-side Auth
user whose ID matches the proof. Passwords are 12–128 characters and require
confirmation. Successful reset clears the proof and application membership
state, signs the user out, and requires a fresh login.

The token-hash confirmation path accepts only `invite` and `recovery` types;
signup and magic-link types are rejected. No recovery secret or token is
written to logs.

## Callback and redirect security

**VERIFIED.** `/auth/callback` and `/auth/confirm` construct security redirects
from the validated `NEXT_PUBLIC_APP_URL`, not from an arbitrary request host.
`sanitizeNextPath` allows only safe internal paths and rejects external,
protocol-relative, and `javascript:` destinations.

Callbacks reject missing/invalid codes, duplicate or conflicting state families,
unexpected `next`, expired or modified state, wrong state purpose, wrong email,
invalid token hashes, and unsupported OTP types. Callback failures clear
recovery/session state and use generic error routes.

The parent logout route had one host-derived redirect construction. It was
changed to redirect from the validated configured application origin, with a
regression test covering an attacker-controlled request URL. Parent logout is
POST-only and rejects a mismatched Origin when supplied.

## Password policy

Application policy is minimum 12 and maximum 128 characters. The hosted Auth
minimum must be manually verified as at least 12 before launch. Required
character rules are not imposed by the application; the hosted choice remains
**UNVERIFIED** and should be intentional rather than contradictory.

Supabase leaked-password protection is unavailable on the current Free plan.
This is an accepted platform limitation for the initial launch review and does
not justify weakening the 12-character application policy.

References:

- [Supabase password security](https://supabase.com/docs/guides/auth/password-security)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)

## Staff session security

The `staff-active-membership` cookie is HttpOnly, `SameSite=Lax`, Secure in
production, and has an 8-hour max age. Its expiry does **not** terminate the
underlying Supabase Auth session. Sign-out clears the application selection and
calls Supabase sign-out. Password reset signs the user out after the update.

Supabase documents that default Auth sessions can remain active indefinitely,
with refresh tokens that do not expire by default. Time-boxed sessions,
inactivity timeout, and single-session enforcement are Pro-plan-and-up
features. The current Free plan therefore has no hosted hard session lifetime.
The application remains safe for initial launch because each protected request
performs live Auth, membership, school, role, and permission checks; a revoked
membership cannot continue to authorize application operations.

This is a residual platform limitation, not a concrete authorization defect.
No session framework or paid feature was added.

Reference: [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions)

## Membership revocation and active-school cookie

**VERIFIED.** The active-school cookie value is never sufficient for access. It
is revalidated against the current user, current session selection, membership
ownership, `ACTIVE` status, active school, role assignments, and permissions.
The cookie is cleared on sign-out and invalid authorization states.

The database session-selection functions use the current authenticated user's
JWT `session_id`, prevent selecting another user's membership, and return no
authorization when membership or school state is no longer valid. This covers
membership suspension/revocation, deletion, profile unavailability, school
deactivation, and role revocation on the next authoritative request.

## Service-role audit

The service-role key is server-only and is not a `NEXT_PUBLIC_*` variable. The
administrative Supabase client disables auto-refresh, URL session detection,
and session persistence.

Justified uses are narrowly scoped:

| Location | Use |
| --- | --- |
| `scripts/invite-staff.ts` | Trusted staff invitation provisioning and compensating cleanup |
| `src/lib/auth/actions.ts` | Activation of the caller's own invited memberships after application checks |
| `src/lib/auth/audit.ts` | Server-side staff audit persistence |
| `src/lib/parent-portal/server.ts` | Server-side parent RPC boundary |
| `src/lib/report-publication/storage-admin.ts` | Private report-artifact Storage operations |
| `scripts/run-local-*` | Synthetic local test configuration only |

No browser module imports the administrative client. Ordinary staff CRUD uses
the authenticated client and database authorization rather than bypassing RLS
with the service role. Service-role values are not returned in errors or logs.

## Parent authentication model

Parents are **not** Supabase Auth users. Parent access is a separate custom
credential system consisting of an access code, an eight-digit PIN, server-side
verification, an opaque random session token, a hash-only database value, and an
HttpOnly cookie scoped to `/parent`.

Credential issuance and rotation are authorized staff operations. Access-code
lookup values are hashed, PINs are bcrypt-hashed, plaintext PINs are returned
only at issuance/reset time, and security events omit secrets. Credentials are
tied to the intended student and active eligible guardian relationship.

## Parent session security

The accepted parent controls are:

| Control | Value |
| --- | --- |
| Absolute lifetime | 2 hours |
| Idle timeout | 30 minutes |
| HttpOnly cookie | Yes |
| Secure in production | Yes |
| SameSite | Lax |
| Cookie path | `/parent` |
| Server-side revocation | Yes |

Every parent request validates the hashed session token, `revoked_at`, absolute
expiry, idle timeout, credential activity/expiry, and current guardian report
eligibility. Credential revocation marks all related sessions revoked. Credential
rotation also revokes old sessions. Removing report eligibility makes existing
sessions unusable on their next validation; literal guardian unlink is blocked
while an active credential dependency remains.

Parent logout revokes the server-side session, clears the cookie, is POST-only,
and does not return or log the raw token.

## Parent report and artifact authorization

Report list, detail, artifact descriptor, and artifact-audit RPCs all require a
valid parent session and use the session's student scope. Only `PUBLISHED` and
published `SUPERSEDED` reports are eligible. Draft, never-published,
cross-student, and cross-school report IDs return no data.

Parent detail uses frozen report snapshot data and excludes staff/guardian
contact data and other sensitive internal fields. Artifact download rechecks
the report scope, reads private Storage through the server-only admin boundary,
verifies the PDF signature, registered byte size, and SHA-256 checksum, records
the access event, and returns `private, no-store` without a permanent public or
signed URL. Final bucket/upload policy remains Stage 18J.

## SMTP status

**CUSTOM SMTP REQUIRED BEFORE REAL STAFF INVITATIONS OR RECOVERY EMAILS.**

No real email was sent and no provider was selected. Supabase documents that
the default SMTP service is non-production, restricted to authorized addresses,
and rate-limited. Before launch, an operator must configure an approved SMTP
provider, verified sender domain, TLS host/port/user/secret, sender identity,
SPF/DKIM/DMARC as applicable, disabled Auth-link tracking, delivery monitoring,
and a safe delivery test.

Reference: [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

## CAPTCHA status and policy

No CAPTCHA dependency or key was added.

| Flow | Policy |
| --- | --- |
| Staff sign-in | Recommended before launch |
| Password recovery | Recommended before launch |
| Parent portal | Not required initially |

Supabase supports hCaptcha and Cloudflare Turnstile for supported Auth flows.
The custom parent portal is not covered automatically by Supabase Auth CAPTCHA;
its persistent throttle, credential lockout, fake-bcrypt unknown-code path, and
generic responses remain the primary controls. Provider keys/domain integration
are deferred activation items.

Reference: [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha)

## MFA policy

These are separate controls:

- Supabase operator/account MFA: recommended and must be verified by the
  project operator before production administration.
- Supabase organization MFA enforcement: hosted plan/policy dependent and not
  enabled in this stage.
- Application staff MFA: **recommended but not an initial launch requirement**.

Application staff MFA is not implemented. It is therefore not declared
mandatory, and its absence is not treated as a Stage 18I acceptance blocker.
Revisit the policy before exposing privileged administration broadly.

References:

- [Supabase Auth MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase organization MFA enforcement](https://supabase.com/docs/guides/platform/mfa/org-mfa-enforcement)

## Auth URL policy

The final production domain is not selected and is not invented here. Before
deployment, configure:

- Site URL: the exact canonical HTTPS production origin;
- Additional Redirect URLs: only the exact required `/auth/callback` and
  `/auth/confirm` paths for that origin.

Production must not retain unnecessary localhost, wildcard, preview, or
unrelated origins. This remains a Stage 18M/18N activation item.

Reference: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

## Hosted Auth configuration audit

Read-only access confirmed the correct project `fpixtedanpbmjnmzrumo`
(`school-report-system`) is healthy, has zero application migrations, zero
public application tables, zero Auth users, zero Storage buckets, and zero
Storage objects. Only Supabase-managed Storage tables were visible.

The available read-only connector does not expose hosted Authentication settings.
The following are therefore **UNVERIFIED — MANUAL DASHBOARD CHECK REQUIRED**:

- public signup disabled;
- anonymous sign-in disabled;
- email/password provider enabled;
- phone and unused social providers disabled;
- minimum password length at least 12;
- required password characters and secure password-change policy;
- exact Site URL and redirect allowlist;
- SMTP status and sender configuration;
- CAPTCHA status;
- Auth rate limits;
- session-control availability and current values.

No hosted Auth mutation was performed.

## CSRF and error privacy

State-changing staff operations use Next.js server actions. Cookie boundaries
use HttpOnly and `SameSite=Lax`; parent login and logout are POST-only. Parent
logout validates the supplied Origin when present. No broad CORS was added.

User-facing errors remain generic for staff login, invitation, recovery, parent
login, session validation, and artifact access. Responses do not expose account
existence, membership IDs, SQL, JWT contents, internal Supabase errors, flow
states, or service-role errors.

## Code changes

One dependency-free code fix was justified:

- `src/app/parent/api/logout/route.ts` now redirects using the validated
  `NEXT_PUBLIC_APP_URL` rather than `request.url`.
- `src/app/parent/api/logout/route.test.ts` adds coverage for GET rejection,
  cross-origin POST rejection, and a hostile request URL that must still
  redirect to the configured application origin.

No authentication redesign was made.

## Production activation checklist

Before real launch:

1. Select and record the canonical HTTPS domain.
2. Configure exact Supabase Site URL and callback/confirmation redirects.
3. Verify invitation-only Auth provider settings in the correct project.
4. Configure approved custom SMTP and sender-domain authentication.
5. Decide whether to activate staff/recovery CAPTCHA.
6. Revisit privileged-staff MFA policy.
7. Verify the final Vercel proxy/header topology.
8. Complete Stage 18J Storage hardening.
9. Run synthetic post-deploy invitation, recovery, logout, parent, report, and
   artifact checks without real student data.

## Freeze statement

Migration 39 and Migration 40 are unchanged. Migration 41 is absent. No
dependency was added. No production Auth setting, user, email, parent
credential, Storage object, Vercel project, deployment, or paid feature was
created or changed.
