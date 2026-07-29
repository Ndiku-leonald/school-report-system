# Database Security

## Current access boundary

Every application table in `public` has Row Level Security enabled and forced.
Stage 4 adds authenticated `SELECT` policies only for `profiles`,
`school_staff_memberships`, `staff_role_assignments`, and `schools`. Each policy
is restricted to the current `auth.uid()` identity and its memberships.
Anonymous access, browser writes, sequences, functions, and every academic
table remain denied.

Consequently, anonymous sessions cannot read or mutate identity or academic
data. An authenticated user can establish only their own staff context and has
no direct academic access. Database tests exercise own-row access, cross-user
isolation, denied writes, anonymous denial, and continued academic denial.
Stage 5 will add narrow academic policies based on active memberships, roles,
staff assignments, academic periods, workflow state, and the requested record.

The Supabase service role bypasses RLS and is therefore server-only. It must
never be placed in `NEXT_PUBLIC_*` configuration, a browser client, logs,
screenshots, or error responses. A privileged server operation must still
authorize its caller and expose only the required result; possession of the
service credential is not business authorization.

Migration 09 adds `activate_staff_invitation(uuid, uuid[])`, an invoker-rights
function with a fixed `pg_catalog, public` search path. Execute is revoked from
`public`, `anon`, and `authenticated` and granted only to `service_role`. It
locks the exact supplied rows; rejects missing, duplicate, cross-profile,
non-`INVITED`, or inactive-school memberships; activates the complete set;
returns that exact set; and appends both success audit events in the same
transaction. It cannot alter roles, schools, employee numbers, or another
profile.

## Actor scope and authorization

Database triggers reject membership-backed workflow actors from a different
school, including role grantors; mark-sheet and mark actors; attendance and
comment actors; report actors; and audit actors. This invariant also applies to
service-role and database-owner writes, so privileged execution cannot attach
an unrelated school's membership to an academic event.

Same-school scope is not role authorization. Stage 5 must still determine which
active roles and assignments may perform each operation and enforce workflow
transitions. Mark-sheet submission currently requires the teaching assignment
membership; any later administrative override must be explicit and audited.

Audit events may use a same-school membership, a profile with evidence of
membership in that school, or null profile and membership values for a
documented system-generated event. An unrelated profile cannot be attached to
the event merely because the write uses a privileged credential.

## Tamper resistance and sensitive values

Report snapshots and audit logs reject updates and deletes through database
triggers. Browser roles have no direct privileges on either table. Later
security-sensitive workflows must append focused audit events through a
controlled server or database path for role changes, marks transitions,
locking, corrections, report publication/withdrawal, promotion confirmation,
and credential lifecycle events. Audit JSON must exclude passwords, PINs,
tokens, secret keys, and complete authentication credentials.

Authentication audit IP metadata stores only the trimmed first
`x-forwarded-for` value after Node IP validation. Malformed input becomes
`null`, so an attacker-controlled header cannot make the audit insert fail.

`student_access_credentials` stores an access-code lookup hash and PIN hash
only. `parent_access_sessions` stores only a session-token hash. Plaintext or
recoverable credentials must never be added. Stage 15 must use appropriate
password hashing, constant-time verification, rate limits, generic failure
responses, expiry, lockout, rotation, and revocation.

Reports and snapshots are private student records. Stage 3 creates metadata
only; it creates no Storage buckets or policies. A future implementation must
use private storage and server-authorized or short-lived access, and must deny
unpublished, withdrawn, cross-student, and expired-session requests.

## Development data

Only synthetic data may be used in migrations, seeds, tests, CI, screenshots,
issues, and pull requests. The repository must never contain real school,
student, guardian, or staff records; parent credentials; reports; database
dumps; access tokens; database passwords; or service-role keys.

The current RLS foundation is not the complete production authorization model.
No real records may be introduced until authentication, Stage 5 policies,
storage controls, abuse-case tests, backup/restore procedures, and operational
monitoring are independently reviewed.
