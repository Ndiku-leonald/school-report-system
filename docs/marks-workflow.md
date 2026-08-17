# Marks submission, review, locking, and corrections

Stage 10 owns workflow state only. It deliberately does not calculate totals,
percentages, grades, aggregates, averages, ranks, positions, promotion outcomes,
or report values.

## State graphs

```text
DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED -> LOCKED
                            |
                            +-> RETURNED -> SUBMITTED
```

`MARKS_SUBMIT` belongs to the exact live bound subject-teacher membership.
`MARKS_REVIEW`, `MARKS_APPROVE`, and `MARKS_LOCK` authorize the corresponding
post-submission steps. The recorded submitter cannot start review, return,
approve, or lock that submission. A reviewer may also approve and lock.

```text
OPEN -> MARKS_ENTRY -> REVIEW -> LOCKED
                         ^          |
                         +----------+
                    controlled correction only
```

Opening entry requires an active academic year and a current term. Advancing to
review requires every curriculum scope with participating learners to have a
valid teaching assignment and a latest submitted, under-review, approved, or
locked sheet. Locking the term requires every latest scope to be locked.

## Completeness and returned work

PostgreSQL derives completeness from the bound scheme, required components,
the class/year roster overlapping the term, and persisted mark rows. Every
required learner/component cell needs an explicit persisted state. Absent,
exempted, and not-assessed cells count; a missing row does not. Optional cells
do not block submission.

A returned sheet stores a normalized reason and becomes editable only to the
exact bound subject teacher with a live role and `MARKS_ENTER`. During
`MARKS_ENTRY`, the assignment must still be current. During `REVIEW`, the
historical binding may be used without reactivating an ended assignment.
Resubmission repeats the completeness check.

## Frozen data and correction lineage

Marks cannot be inserted or updated in `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`,
or `LOCKED` sheets, including through privileged direct SQL. Sheet version,
academic identity, scheme, assignment, and `supersedes_mark_sheet_id` are
immutable.

An enrollment change that would add, remove, or move a learner in the roster
of a frozen sheet is rejected. The same guard rejects roster changes affecting
a term in `REVIEW` or `LOCKED`, while still allowing changes that do not affect
those term date ranges or only update non-roster metadata. This prevents
student-management actions from changing completeness or later report scope
behind an already submitted or locked result.

A locked term may return to `REVIEW` only through the `MARKS_LOCK` correction
RPC, with a normalized reason and no downstream report or promotion record. The
historical locked sheet is never unlocked. One new `DRAFT` successor receives
source version plus one and cloned marks. Its exact historical scheme may be
reused after retirement; ordinary new sheets still require an active scheme.
The bound live subject teacher edits and submits the successor, then the normal
workflow runs again.

## Concurrency and audit

Every mutation locks and revalidates the verified Auth-session selection,
membership, school, role grants ordered by UUID, and permission mappings
ordered by UUID. Sheet transitions extend this with assignment, term, sheet,
and cells ordered by component/enrolment. Term transitions lock assignments by
UUID, the term, and sheets by UUID. Stale timestamps raise `PT409` without a
silent retry.

Successful transitions append one compact audit event. Failed operations roll
back their audit. The safe history contains display name, role context, time,
action, and reason—never contacts, Auth IDs, tokens, or mark payloads.

## Application surfaces

- `/teacher/marks` and `/teacher/marks/[markSheetId]` expose completion,
  returned reasons, assigned editing, submission, resubmission, and history.
- `/dashboard/marks/review` and its detail route expose latest revisions,
  selected-school filters/pagination, read-only marks, and authorized actions.
- `/dashboard/marks/terms` exposes readiness and authorized term controls.

Server Actions validate with Zod and use the signed-in Supabase client.
PostgreSQL remains authoritative; direct authenticated writes to `mark_sheets`
and `marks` remain revoked under forced RLS.
