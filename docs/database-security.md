# Database Security

## Current access boundary

Every application table in `public` has Row Level Security enabled and forced.
Stage 4 own-identity reads remain in place. Stage 5 adds authenticated `SELECT`
only for the approved academic-configuration, assignment, student/enrolment,
mark, attendance/comment, report, and audit tables. Each policy derives school
scope from database relationships and evaluates active memberships, active
schools, unrevoked roles, and current assignments.

Migration 11 adds the non-exposed
`internal.staff_session_active_memberships` table. Its UUID primary key is the
verified JWT `session_id`; each row also records the authenticated profile and
one referenced staff membership. `public`, `anon`, and `authenticated` have no
direct table privileges. Fixed-search-path definer functions are required only
to read or mutate this internal table and never accept a caller-supplied
session ID.

Authenticated clients use the narrow `set_my_active_membership`,
`get_my_active_membership`, and `clear_my_active_membership` RPCs. Selection
requires the caller's own `ACTIVE` membership and an active school. Every
permission and assignment predicate rechecks the selection, membership,
school, current role, and current assignment state. Thus stale selection rows
cannot grant access, and direct RLS queries authorize at most one membership
per Supabase session. Separate sessions for the same profile remain
independent.

Anonymous access and all browser academic writes remain denied. Guardians,
student-guardian links, student access credentials, parent sessions, and
unapproved future workflow tables remain inaccessible. Database tests exercise
positive access, cross-school/class/subject denial, anonymous denial, and
continued write denial.

Assignment-limited users with `STUDENTS_VIEW_ASSIGNED` can read only
`ACTIVE` and `REPEATING` enrolments. Authorized schoolwide
`STUDENTS_VIEW_ALL` users retain historical enrolment reads.

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

Same-school scope triggers remain integrity checks rather than role
authorization. Stage 5 read policies now determine which active roles and
assignments can see a record. Workflow mutations remain deferred; any later
administrative override must be explicit and audited.

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

The current RLS boundary is not the complete production security model. No real
records may be introduced until later mutation workflows, storage controls,
abuse-case tests, backup/restore procedures, and operational monitoring are
independently reviewed.

The helper and RPC security review is documented in
[authorization-model.md](authorization-model.md).
