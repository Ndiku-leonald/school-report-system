# Secure marks entry

Stage 9 established version-1 draft entry. Stage 10 now submits, returns,
reviews, approves, locks, and creates controlled correction revisions while
still calculating no grades, averages, aggregates, ranks, or positions. See
[marks-workflow.md](marks-workflow.md) for state and correction rules.

## Authority and availability

The database resolves the active membership selected for the current Auth
session. A mutation needs live `MARKS_ENTER`, a live `SUBJECT_TEACHER` grant,
and the exact current teaching assignment for the sheet term, class and
subject. The school is derived from that assignment. Entry is allowed only
when the term status is `MARKS_ENTRY` and today falls inside both the term and
assignment inclusive date ranges. Every other term status is read-only.

Mutations lock and revalidate the current session selection, membership,
school, live role grants and permission mappings before taking the existing
assignment, term and sheet locks. If a valid marks transaction owns those
locks first it may finish before a concurrent authority change; if the
authority change commits first, the marks request re-reads the new state and
fails without changing a cell or writing a success audit.

## Sheet, scheme and roster

Draft initialization locks the teaching assignment, returns an existing
working DRAFT idempotently, and never creates version 2. A new sheet binds the
single compatible `ACTIVE` scheme whose component weights total exactly 100%.
That scheme identity is immutable. If it later retires, the existing sheet and
marks remain readable and bound to it; new sheets use the then-active scheme.

Components always come from the bound scheme in `sort_order`. Learners come
from enrolments in the sheet class and academic year whose participation
overlaps the term (`enrolled_on <= term end` and no exit before term start).
Student school must match. Missing learner/component combinations remain
implicit. Withdrawing a learner does not delete an existing mark.

## Cell semantics and saving

`PRESENT` requires a score, including a valid genuine zero. `ABSENT`,
`EXEMPTED` and `NOT_ASSESSED` require a null score. Scores must be between zero
and the component maximum. Remarks are trimmed, empty values become null, the
limit is 500 characters, and control characters are rejected.

Existing cells require the expected `row_version`; a mismatch raises PT409 and
does not audit success. An update increments once. Batch payloads contain at
most 500 unique cells, lock existing cells in deterministic order and roll
back completely on any invalid or stale entry. Mark identity and sheet academic
scope/scheme identity and sheet `version` are immutable, Stage 9 never changes
the sheet revision in place, and deletion is denied. The grid preserves dirty input on a
conflict until the teacher explicitly reloads.

## Privacy and audit

Read RPCs return only sheet metadata, component definitions, minimal learner
identity and existing cells. Guardian contacts and staff email/phone are not
returned. Successful draft creation, single-cell creation/update and batch
save emit `MARK_SHEET_DRAFT_CREATED`, `MARK_ENTRY_CREATED`,
`MARK_ENTRY_UPDATED` and `MARK_ENTRY_BATCH_SAVED`. Audit payloads are compact.
All development used local Supabase and synthetic `.invalid` identities.
