# Database Security

## Current access boundary

Every Stage 3 application table in `public` has Row Level Security enabled and
forced. No RLS policy is created yet, so access fails closed. All table,
sequence, and function privileges are revoked from `anon` and `authenticated`,
including matching default privileges for future objects.

Consequently, anonymous sessions cannot read or mutate schools, students,
marks, reports, or any other academic table. A generic authenticated user also
has no direct academic access. Database tests exercise both roles. Stage 5 will
add narrow policies based on active memberships, roles, staff assignments,
academic periods, workflow state, and the requested record. It must retain
negative cross-school, cross-class, and cross-subject tests.

The Supabase service role bypasses RLS and is therefore server-only. It must
never be placed in `NEXT_PUBLIC_*` configuration, a browser client, logs,
screenshots, or error responses. A privileged server operation must still
authorize its caller and expose only the required result; possession of the
service credential is not business authorization.

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
