# Authorization Model

## Boundary

Stage 5 separates authentication from authorization. Supabase Auth establishes
the user identity, the Stage 4 staff context revalidates school memberships,
and the Stage 5 authorization context requests permissions for exactly the
selected active membership. Permissions are never accepted from browser input,
editable Auth metadata, or a long-lived permission cookie.

The authoritative request path is:

1. `auth.getUser()` validates the Supabase session.
2. The selected membership cookie is matched against the caller's own
   memberships.
3. The membership must be `ACTIVE` and its school must be active.
4. `get_my_effective_permissions(membership_id)` reads current, unrevoked role
   assignments and the migration-controlled role matrix.
5. A Server Component, Server Action, or Route Handler applies a typed guard.
6. PostgreSQL RLS independently restricts every browser-session read.

The normal cookie-aware anonymous-key Supabase client is used for application
authorization and academic reads. The service-role client is not an
authorization shortcut.

## Permission matrix

The `app_permission` enum contains 35 stable values. `SUPER_ADMIN` and
`SCHOOL_ADMIN` receive all 35 within the membership's school. The remaining
initial mappings are:

| Role                 | Effective permissions                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HEAD_TEACHER`       | `DASHBOARD_VIEW`, `SCHOOL_SETTINGS_VIEW`, `STAFF_VIEW`, `ACADEMIC_CONFIGURATION_VIEW`, `STUDENTS_VIEW_ALL`, `ASSIGNMENTS_VIEW_ALL`, `MARKS_VIEW_ALL`, `MARKS_REVIEW`, `MARKS_APPROVE`, `MARKS_LOCK`, `ATTENDANCE_VIEW_ALL`, `COMMENTS_VIEW_ALL`, `REPORTS_VIEW_ALL`, `REPORTS_GENERATE`, `REPORTS_REVIEW`, `REPORTS_PUBLISH`, `REPORTS_WITHDRAW`, `ANALYTICS_VIEW`, `PROMOTION_VIEW`, `PROMOTION_CONFIRM`, `AUDIT_VIEW` |
| `ACADEMIC_REGISTRAR` | `DASHBOARD_VIEW`, `ACADEMIC_CONFIGURATION_VIEW`, `ACADEMIC_CONFIGURATION_MANAGE`, `STUDENTS_VIEW_ALL`, `STUDENTS_MANAGE`, `ASSIGNMENTS_VIEW_ALL`, `ASSIGNMENTS_MANAGE`, `MARKS_VIEW_ALL`, `MARKS_REVIEW`, `MARKS_APPROVE`, `ATTENDANCE_VIEW_ALL`, `COMMENTS_VIEW_ALL`, `REPORTS_VIEW_ALL`, `REPORTS_GENERATE`, `REPORTS_REVIEW`, `ANALYTICS_VIEW`, `PROMOTION_VIEW`                                                     |
| `CLASS_TEACHER`      | `TEACHER_WORKSPACE_VIEW`, `ACADEMIC_CONFIGURATION_VIEW`, `STUDENTS_VIEW_ASSIGNED`, `ASSIGNMENTS_VIEW_OWN`, `MARKS_VIEW_ASSIGNED`, `ATTENDANCE_MANAGE_ASSIGNED`, `COMMENTS_MANAGE_ASSIGNED`, `REPORTS_VIEW_ASSIGNED`                                                                                                                                                                                                     |
| `SUBJECT_TEACHER`    | `TEACHER_WORKSPACE_VIEW`, `ACADEMIC_CONFIGURATION_VIEW`, `STUDENTS_VIEW_ASSIGNED`, `ASSIGNMENTS_VIEW_OWN`, `MARKS_VIEW_ASSIGNED`, `MARKS_ENTER`, `MARKS_SUBMIT`                                                                                                                                                                                                                                                         |

`role_permissions` is system configuration. RLS is enabled and forced, browser
roles have no direct table access, and changes require a reviewed migration.
The names of future mutation permissions do not grant browser writes in Stage 5.

## School and assignment scope

A role assignment inherits its school only through
`school_staff_memberships`. A role in School A is never reused to authorize a
School B row. The current-user RPC returns permissions for one requested
membership, so permissions from multiple memberships are not unioned in the
application context.

Subject-teacher access requires a currently available teaching assignment with
the same membership, term, class, subject, academic year, and school.
Class-teacher access requires the equivalent current class assignment.
Assignment-limited roster access follows current enrolments into those classes.
Class teachers can read all subject mark sheets and complete reports in an
assigned class; subject teachers can read only their assigned subject marks and
do not receive complete-report access.

Revoked roles, invited/suspended/disabled memberships, inactive schools, and
inactive or expired assignments fail on the next authoritative request. No JWT
expiry or global application cache is involved. Urgent Supabase session
revocation remains a separate authentication operation.

## RLS and definer-rights review

The internal predicates use `auth.uid()`, fixed `search_path` values, no dynamic
SQL, and boolean-only results. Definer rights are used because the identity,
role-matrix, and assignment tables force RLS and would otherwise create policy
recursion. `anon` and `public` execution is revoked. `authenticated` receives
schema usage and execute only on the predicates referenced by current RLS
policies; the internal schema is not exposed through the public API.

`get_my_effective_permissions` is the only public authorization RPC. It returns
distinct enum values only when the target membership belongs to `auth.uid()`,
is active, and belongs to an active school.

## Application guards and navigation

`src/lib/authorization` contains the request-bound context, typed permission
predicates, redirecting guards, assignment/school scope assertions, and
server-side navigation filtering. `/dashboard` requires `DASHBOARD_VIEW`;
`/teacher` requires `TEACHER_WORKSPACE_VIEW`; insufficient permission uses the
generic, non-indexed `/forbidden` route. Membership failures continue to use
the Stage 4 account-state routes.

Navigation declarations carry required permissions and are filtered before
rendering. This is a usability control only. Every destination and data
operation must still apply a server guard and database RLS.

## Deny-by-default boundaries

Stage 5 adds authenticated reads only to the approved academic-configuration,
assignment, student/enrolment, mark, attendance/comment, report, and audit
tables. Guardians, student-guardian links, parent credentials/sessions, report
templates/batches, promotion decisions, unrelated identity rows, and all
browser mutation paths remain denied.

Stages 6–17 remain responsible for CRUD, marks workflows, calculations,
reports/PDFs, parent access, analytics, and promotion behavior.
