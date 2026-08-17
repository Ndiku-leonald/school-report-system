# Teacher assignments

Stage 8 manages effective-dated class-teacher and subject-teacher responsibility in the existing `class_teacher_assignments` and `teaching_assignments` tables. It does not implement marks, attendance, comments, reports, analytics, promotion, or parent access; those workflows remain outside this stage.

Every mutation is a guarded PostgreSQL RPC. The actor is derived from the authenticated session and `internal.staff_session_active_memberships`, so one selected active school membership supplies all roles, permissions, and school scope. Managers need `ASSIGNMENTS_MANAGE`. Schoolwide readers need `ASSIGNMENTS_VIEW_ALL`; own-assignment readers receive only rows for the selected membership.

Subject teachers must have an active membership and a live `SUBJECT_TEACHER` role. The active subject must belong to the school and be mapped through `grade_level_subjects` to the class grade. Class teachers similarly require a live `CLASS_TEACHER` role. An administrative role never substitutes for the teacher role.

Dates are inclusive and stay within the term. Future rows are upcoming and grant no current class scope; an end date remains effective through that date. Ended or inactive rows grant no current scope. Exclusion constraints prevent overlapping periods for the same subject-teacher scope, overlapping periods for the same class teacher, and overlapping primary class-teacher periods. Different assistant teachers may coexist.

Primary replacement locks the class scope, ends the former primary the day before the replacement starts, creates the replacement, and writes two explicit audit events in one transaction. Any failure rolls the whole replacement back. Historical rows cannot be deleted or repointed, and unsafe date narrowing is rejected when marks, attendance, comments, reports, report batches, or promotion decisions depend on the affected period.

Eligible-teacher RPCs return only membership ID, display name, employee number, teacher role, membership status, and overlap state. Email, phone, invitation, authentication, token, and other-school data are excluded.

The management teacher filter uses a separate selected-school directory of staff with assignment history. It returns only membership ID, display name, and employee number, so filtering remains complete across paginated assignment results without exposing the staff table.

RLS is forced on both tables. Authenticated browser roles retain read access only through selected-school policies and have no direct insert, update, or delete privilege. Transactional audit JSON contains assignment scope and dates only.

Management routes live under `/dashboard/assignments`; the read-only selected-membership workspace is `/teacher/assignments`.
