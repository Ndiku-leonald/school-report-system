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

Stage 6 mutation functions are reviewed `SECURITY DEFINER` boundaries with fixed
search paths and no dynamic SQL. Execution is revoked from `PUBLIC` and `anon`
and granted only to `authenticated`; every call still fails unless the current
JWT `session_id` has a selected, owned, active membership in an active school
with live `ACADEMIC_CONFIGURATION_MANAGE`. Direct authenticated table writes
remain revoked. Conflict and validation failures roll back their audit insert.

Migration 13 adds defense-in-depth triggers for class-section and curriculum
identity. These triggers apply even to privileged writes and therefore do not
depend on a page hiding a field. Stale mutations raise the stable
`ACADEMIC_CONFIGURATION_CONFLICT` with PostgREST SQLSTATE `PT409`, producing an
immediate HTTP 409 without retrying a serialization error. Mapping creation,
flag editing, dependency-aware removal, and version creation are separate
least-authority functions.

Configuration audit actions distinguish creation, draft editing, explicit
version creation, activation, deactivation, and retirement. A version event
records its source and new record identity. Failed validation, permission,
scope, dependency, and concurrency transactions produce no success audit.

Migration 14 keeps helper functions in the private `internal` schema with fixed
search paths and revokes helper execution from browser roles. Lifecycle and
dependency triggers apply to privileged writes as well as RPC calls. They block
historical redefinition, new draft/retired scheme selection by mark sheets, and
false no-op lifecycle audits; direct browser table writes and service-role
exposure remain prohibited.

Migration 15 preserves those privileges and immutability controls while allowing
trusted workflow updates to an existing sheet whose unchanged scheme later
retired. Inserts and changed scheme references still require `ACTIVE`; every
update still checks term, year, class, grade, subject, teaching assignment, and
scheme agreement. The replacement trigger function retains a fixed search path
and is not executable by `public`, `anon`, or `authenticated`.

## Stage 7 student and Storage security

Student-management RPCs are `SECURITY DEFINER` functions with fixed
`pg_catalog, public, internal` search paths, no dynamic SQL and explicit
authenticated-only execution. The manager helper accepts no caller school or
membership authority. Failed permission, scope, validation, capacity and
concurrency checks roll back without success audit rows.

Guardian tables retain no broad authenticated `SELECT`; contacts are exposed
only through a schoolwide caller-scoped function. Assigned teachers receive
student and current-enrolment projections only for live assignments. Storage
object policies require the private bucket, a valid school/student key and live
view or manage authority. Signed URLs are short-lived and never persisted or
audited. `student_access_credentials` and `parent_access_sessions` remain
denied and untouched.

Migration 17 keeps all SECURITY DEFINER entry points on fixed search paths and
preserves authenticated-only grants. Destination-row locks close the capacity
race, and student/relationship locks serialize lifecycle and primary-guardian
changes. Historical directory selection is available only to
`STUDENTS_VIEW_ALL`; `STUDENTS_VIEW_ASSIGNED` is rechecked against a live class
assignment even when historical filters are supplied. Photo linking reads
`storage.objects` only to verify the scoped private key exists and never writes
Storage metadata or persists a signed URL.

# Assignment data security

Both assignment tables use forced RLS and deny authenticated insert, update, and delete privileges. Fixed-search-path definer RPCs derive the actor from the selected session membership and expose narrow typed results. Eligible-teacher directories omit contacts and Auth identifiers. Audit events are transactional and contain only assignment scope, dates, state, and an operational reason.

# Stage 9 marks security

Forced RLS remains enabled on `mark_sheets` and `marks`, while ordinary
authenticated roles have no direct INSERT, UPDATE or DELETE. Fixed-search-path
definer RPCs enforce selected school, exact assignment, DRAFT workflow,
`MARKS_ENTRY` term state, scheme/component binding, enrolment overlap and
maximum scores. Identity and deletion triggers also protect privileged direct
writes. Audit rows contain identifiers, versions and changed-field metadata,
not contacts, credentials or whole classroom payloads.

# Stage 10 workflow security

Migration 21 adds transaction-held workflow authority, optimistic transitions,
submitter separation, frozen mark triggers, deterministic readiness locks,
immutable correction lineage, and downstream guards before a locked term can
reopen. A correction may reuse only its exact locked source scheme; arbitrary
retired schemes remain invalid. Enrollment roster identity is also frozen for
submitted sheets and `REVIEW`/`LOCKED` terms, so an authorized student manager
cannot alter the completion or report scope behind a protected revision.

## Stage 11 result security

Calculation and result-read RPCs use fixed search paths and revalidate the
session-selected membership. Calculation requires `REPORTS_GENERATE`; reads
require `REPORTS_VIEW_ALL` or that permission. New result tables force RLS and
deny authenticated direct writes. Results are derived in PostgreSQL from a
locked term and latest source revisions, and append-only triggers protect
historical runs.
