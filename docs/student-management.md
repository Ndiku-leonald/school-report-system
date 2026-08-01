# Student, Guardian and Enrolment Management

## Boundary

Stage 7 implements secure student admission, profile editing, learner status,
guardian relationships, academic-year enrolments, class placement, private
photos and history. It does not implement teacher-assignment management, marks,
attendance entry, comments, calculations, reports, parent authentication,
analytics or promotion decisions.

All authority comes from the JWT-session-selected active staff membership.
`STUDENTS_MANAGE` is required by every mutation RPC. `STUDENTS_VIEW_ALL`
provides schoolwide reads, while `STUDENTS_VIEW_ASSIGNED` is restricted to
current `ACTIVE` or `REPEATING` enrolments in classes visible through a current
class-teacher or subject-teacher assignment. Roles from multiple schools are
never combined.

## Admission and identity

`admit_student` derives the school from the selected membership and creates the
student, optional initial enrolment and optional first guardian in one database
transaction. Admission numbers are trimmed and stored uppercase, with
case-insensitive school uniqueness. Names are trimmed without changing case or
valid punctuation. Duplicate admissions, invalid dates, closed years, inactive
classes, mismatched scope, duplicate class numbers and capacity violations roll
back the complete transaction and its audits.

`update_student_profile` changes identity fields only and requires the exact
`updated_at` returned by the last read. Status, placement and photos use
separate RPCs. A stale token raises the stable `PT409` conflict and records no
success audit.

## Lifecycle and enrolments

Allowed student transitions are:

- `ACTIVE` to `TRANSFERRED`, `WITHDRAWN`, `COMPLETED`, `DECEASED` or `INACTIVE`;
- `INACTIVE` to `ACTIVE`, `TRANSFERRED` or `WITHDRAWN`.

Transferred, withdrawn, completed and deceased states are terminal until a
future reviewed correction workflow exists. Status changes require an effective
date and reason. A current enrolment closes atomically. Because the existing
enrolment enum has no deceased or inactive value, both are documented as an
enrolment `WITHDRAWN` closure while the student retains the precise status.

New enrolments accept only `DRAFT` or `ACTIVE` academic years, active class
sections, dates within the year, and explicit `ACTIVE` or `REPEATING` status.
Prior-year history is retained. Class movement stays within the same year and
is blocked after marks, attendance, comments, reports or promotion decisions
depend on the enrolment. No automatic promotion or repetition occurs.

Current class numbers are normalized and unique within a class. A configured
capacity cannot be silently exceeded. An override requires a reason and a live,
unrevoked `SCHOOL_ADMIN` or `SUPER_ADMIN` role; `STUDENTS_MANAGE` alone is not
enough. The override decision and reason are audited.

## Guardians and privacy

Guardian email is trimmed and stored lowercase. Optional phone numbers must be
international E.164 (`+` followed by 8–15 digits); no country is hard-coded.
One guardian can link to several students in the same school. Cross-school
links and duplicate links fail. Setting a new primary guardian clears the old
primary inside the same transaction, preserving exactly one primary record.

`can_access_reports` is eligibility metadata for Stage 15. It does not create a
student access credential, parent session, login link or current report access.
The Stage 7 migration does not modify `student_access_credentials` or
`parent_access_sessions`.

Direct guardian and relationship table reads remain denied. Schoolwide viewers
receive contacts only through `get_student_guardians`. Assignment-only teachers
receive no guardian IDs, contacts or access flags.

## Private photographs

`student-photos` is a private Storage bucket. Paths have the form
`<school-id>/<student-id>/<random-file-name>`. The bucket accepts JPEG, PNG and
WebP up to 5 MiB. Uploads use the caller's normal authenticated client and
school/student-scoped object policies. The Server Action checks the MIME type,
size and leading file signature before upload. Student rows store only an object
path. Reads use short-lived signed URLs after Storage RLS authorizes the caller.
Photo audit payloads record only whether a photo exists, never bytes, signed
URLs or object credentials.

## Retention and audit

Student, guardian and enrolment deletion triggers reject physical deletion.
Lifecycle fields and audited unlink/deactivation workflows preserve history.
Every successful RPC appends focused `audit_logs` rows in the same PostgreSQL
transaction. Failed validation, authorization, scope or concurrency checks
append no success event. Audit payloads contain no authentication secret or
photo content.

The implementation is local-only. Migration 16 creates a bucket only in the
database to which the migration is intentionally applied. No hosted Supabase
project was linked or modified during Stage 7 development.

## Current placement and lifecycle rules

Migration 17 makes current placement singular across the whole school history:
a student can have at most one `ACTIVE` or `REPEATING` enrolment, and that
enrolment can belong only to an `ACTIVE` student. Close the current enrolment
before opening a later-year placement. Completing, withdrawing or transferring
one enrolment closes that academic-year record only; it does not complete,
withdraw or transfer the student. Whole-student changes use the student
lifecycle workflow, which atomically closes any current placement. An inactive
student must be explicitly reactivated with a date and reason before a new
enrolment can be created.

Capacity decisions lock the destination class row and recount while the lock is
held through commit or rollback. Schoolwide filters search historical
placements and label matches as current or historical; assigned-only teachers
remain restricted to learners in live assigned classes. Primary replacement
locks all relationships for the student and records the former-primary
demotion. Photo linking validates both path ownership and exact private object
existence. Stage 8 academic-data entry remains out of scope.
