# Roles and Permissions

## Authorization principles

Roles define broad responsibilities, while assignments and academic context restrict the records on which a user can act. A role alone must not grant unrestricted access to every class, subject, student, term, or report.

All sensitive permission checks must be enforced server-side and reinforced by Row Level Security where applicable. Frontend menu hiding is not sufficient authorization.

Users may hold more than one role if the future access model permits it. Effective access should be the smallest explicitly granted set, with conflicts and privileged combinations reviewed and audited.

## Stage 5 authorization boundary

Authentication proves the Supabase user identity but does not grant an academic
capability. An authenticated user can read only their own profile, memberships,
role labels, and member schools. An `ACTIVE` membership in an active school is
required to enter the dashboard or teacher shell. `INVITED` memberships enter
the completion flow; `SUSPENDED`, `DISABLED`, and missing memberships enter the
account-unavailable state.

The untrusted active-membership cookie is reconciled with one selection bound
to the verified Supabase JWT `session_id`. The selected active membership is
then passed to the caller-scoped `get_my_effective_permissions` RPC. Current,
unrevoked role assignments are joined to the migration-controlled permission
matrix on every authoritative request. The RPC and academic RLS accept only
the session-selected membership, so permissions from different school
memberships are never combined. Users may securely switch among their own
active memberships; a separate Auth session keeps its independent selection.

## Staff roles

### `SUPER_ADMIN`

Intended for tightly controlled platform or highest-level school administration.

- Manage school-level administrative accounts and high-risk role assignments
- Manage core system configuration and security-sensitive operational settings
- Support exceptional recovery or controlled administrative operations
- View audit information required for governance and incident response
- Delegate routine academic administration rather than performing it by default

Use of this role should be rare, strongly authenticated, and auditable.

### `SCHOOL_ADMIN`

Intended for day-to-day school system administration.

- Manage academic years, terms, classes, streams, subjects, assessments, and configurable rules
- Manage staff and student records
- Manage class-teacher and subject-teacher assignments
- Initiate report generation and coordinate approved publication workflows
- View authorized schoolwide operational and academic summaries
- Manage non-final configuration within established governance rules

This role does not bypass workflow state, audit requirements, or the head teacher's final decisions.

### `HEAD_TEACHER`

Intended for final academic oversight.

- Review schoolwide and class-level result summaries
- Confirm final promotion or repetition decisions
- Review exceptional overrides and unresolved academic issues
- Confirm final report publication or withdrawal when required by policy
- Access audit context relevant to academic governance

Head teachers confirm final promotion decisions and report publication. Confirmation must be explicit and audited.

### `ACADEMIC_REGISTRAR`

Intended for academic quality control and result administration.

- Review submitted marks for completeness and validity
- Return marks for correction with a reason
- Approve and lock marks when policy requirements are satisfied
- Run readiness checks and coordinate result calculations
- Review generated report sets before final publication approval
- Access authorized academic analytics and exception lists

Registrars or other explicitly authorized academic staff review and approve marks. Unlocking or post-approval correction requires a controlled, audited exception flow.

### `CLASS_TEACHER`

Intended for oversight of an assigned class or stream.

- View full results across all subjects for students in the assigned class and academic period
- Monitor missing marks, learner performance, and support indicators
- Add permitted class-level comments or recommendations
- Participate in report review and promotion recommendations within the assigned class
- Request corrections through the workflow

Class teachers may view full results only for their assigned classes. This role does not automatically permit editing marks for every subject.

### `SUBJECT_TEACHER`

Intended for subject-specific marks entry.

- View enrolled students within an active assigned class, stream, subject, and academic period
- Create and revise marks while they are in an editable workflow state
- Submit completed marks for review
- Respond to returned work and resubmit corrections
- View relevant subject-level summaries for assigned teaching scopes

Subject teachers must only access assigned classes and subjects. They cannot approve their own marks, alter locked results, view unrelated full student result profiles, or publish reports unless a separate explicit role grants that capability.

## Initial Stage 5 permission matrix

| Capability                            | Super admin   | School admin | Head teacher  | Registrar      | Class teacher               | Subject teacher |
| ------------------------------------- | ------------- | ------------ | ------------- | -------------- | --------------------------- | --------------- |
| Manage high-risk administrative roles | Controlled    | No           | No            | No             | No                          | No              |
| Manage academic configuration         | Yes           | Yes          | Oversight     | Limited        | No                          | No              |
| Manage students and enrolment         | Yes           | Yes          | View          | Yes            | Assigned view               | Assigned roster |
| Manage teacher assignments            | Yes           | Yes          | View          | View           | Own assignments             | Own assignments |
| Enter subject marks                   | If assigned   | If assigned  | No by default | No by default  | If assigned                 | Assigned scope  |
| Submit marks                          | If assigned   | If assigned  | No by default | No by default  | If assigned                 | Assigned scope  |
| Review or return marks                | Oversight     | Policy-based | Yes           | Yes            | Request only                | No              |
| Approve and lock marks                | Exceptional   | Policy-based | Yes           | Yes            | No                          | No              |
| View complete class results           | Authorized    | Authorized   | Yes           | Yes            | Assigned classes            | No              |
| Generate report sets                  | Controlled    | Yes          | Yes           | Yes            | Assigned preview if allowed | No              |
| Publish reports                       | Controlled    | Prepare      | Confirm       | Prepare/review | No                          | No              |
| Confirm promotion decisions           | No by default | Prepare      | Yes           | Recommend      | Recommend                   | No              |
| View schoolwide analytics             | Authorized    | Yes          | Yes           | Yes            | No                          | No              |

The enum-level matrix implemented by migration 10 is authoritative and listed
in [Authorization model](authorization-model.md). The capability table above
remains longer-term domain guidance: permissions naming future mutations do not
create browser write policies in Stage 5. Future matrix changes require a
reviewed migration and separation-of-duties review.

## Enforcement requirements

- Resolve the actor, role, school scope, academic period, assignment, target student or class, and record state for every sensitive request.
- Prefer deny-by-default policies and explicit grants.
- Prevent users from approving their own work where separation of duties is required.
- Revoke effective access when a staff account, assignment, enrolment, or academic period becomes inactive.
- Audit role changes, assignment changes, marks transitions, privileged reads, publication actions, and exceptional overrides.
- Test denied paths, including cross-class, cross-subject, cross-student, expired-assignment, anonymous, and client-manipulation attempts.

## Academic configuration roles

`HEAD_TEACHER`, `CLASS_TEACHER`, and `SUBJECT_TEACHER` may view configuration
for their selected school but cannot mutate it. `ACADEMIC_REGISTRAR`,
`SCHOOL_ADMIN`, and `SUPER_ADMIN` may manage configuration. The role matrix
remains migration-controlled; the UI does not infer or grant permission from a
role label, and RPCs evaluate current unrevoked mappings on every call.

## Student-management roles

`ACADEMIC_REGISTRAR`, `SCHOOL_ADMIN` and `SUPER_ADMIN` have
`STUDENTS_MANAGE` plus schoolwide student visibility. `HEAD_TEACHER` has
schoolwide read-only visibility. `CLASS_TEACHER` and `SUBJECT_TEACHER` have
assignment-scoped student visibility only. Assignment-only roles never receive
guardian contacts. A class-capacity override additionally requires a live
`SCHOOL_ADMIN` or `SUPER_ADMIN` role; the permission alone is insufficient.
Navigation follows these permissions for usability, while routes, Actions,
RPCs, RLS and Storage policies remain the enforcement layers.
