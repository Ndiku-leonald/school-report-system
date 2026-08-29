# Immutable report snapshots

Stage 12 turns one authoritative Stage 11 calculation run into student-specific
report records. It stores document data, not PDF layout or publication state.

## Source and versioning

`generate_student_report_snapshot` and
`generate_grade_report_snapshots` accept only a calculation-run ID and, for the
single-student operation, an enrollment ID. PostgreSQL derives the student,
school, term, grade, placement, subjects, Stage 11 result values, attendance,
and comments. A calculation run must belong to the selected school and the
enrollment must have a calculated result in that run.

The existing `reports`, `report_batches`, `report_snapshots`, and
`report_subject_results` tables are reused. Migration 28 adds calculation-run
linkage, a nullable legacy-safe template relationship, immutable snapshot
checksums, schema version 1, and frozen subject display/result fields.
`report_snapshot_sources` links each snapshot to exactly one calculated student
result and stores the Stage 11 input and output checksums.

Migration 28 is `20260828055808_28_report_snapshot_generation.sql`, migration
29 is `20260828073615_29_report_snapshot_integrity_hardening.sql`, and
migration 30 is the additive authoritative-source/history hardening migration.

Report version and calculation version are separate. The first report for a
student and term is report version 1. A newer Stage 11 calculation normally
creates the next report version and sets the prior report's `superseded_by`
relationship. A legitimate change to frozen report context, such as a
comment, attendance value, or school identity, may also create the next report
version from the same calculation run. The prior snapshot and its source
lineage remain readable.

Idempotence is current-report-only: the complete canonical snapshot payload,
ordered subject rows, and Stage 11 input/output checksums form a context
checksum. Repeating the same run, enrollment, and context reuses the current
immutable report without a new snapshot, subject rows, or creation audit. A
changed context creates one successor version. A later return to an earlier
context is a new historical version: A -> B -> A produces v1 -> v2 -> v3 even
when the content checksum of v1 and v3 is equal. History identity is the
term/enrollment/version constraint, not the content checksum.

## Snapshot payload

The JSON payload has explicit `snapshot_schema_version: 1` and contains school
identity, student identity, academic period, placement, academic summary,
attendance, comments, safe signatory display names, and the next configured
term's opening date when available. Subject rows remain normalized in
`report_subject_results`, ordered by the immutable Stage 11 curriculum source
manifest. The checksum is SHA-256 over canonical JSON, the ordered subject
row representation, and Stage 11 lineage checksums. It is independent of
report version so the same context has the same identity even when a version
number would otherwise change.

Attendance and comments are copied only when records exist. Missing attendance
or comments are represented as `null`; the preview never substitutes current
live values or invented zeroes. The current schema has no final subject-report
comment workflow, so Stage 12 leaves `teacher_comment` unavailable rather than
concatenating per-assessment mark-entry remarks. It also does not hard-code
behavior categories. `updated_by` is a generic comment editor, not an
authoritative head-teacher signer, so `signatories.head_teacher` is
deliberately `null`; the head-teacher comment text is still preserved.

The class-teacher signatory is frozen only from an active, effective,
same-term, same-class assignment in the selected school, and only its display
name and role context are included. The next-term row is selected
chronologically across the same school's academic years only when
`candidate.starts_on > current_term.ends_on`, then by earliest date and UUID.
It is `null` when no genuinely later term exists.

Only the latest Stage 11 run whose stored rule IDs reproduce the current
authoritative input checksum may create a new snapshot. The term and every
latest required mark-sheet scope must be locked. A reopened term, unlocked
latest sheet, stale checksum, or older calculation is rejected with a stable
`REPORT_SOURCE_NOT_FINALIZED` or `REPORT_SOURCE_STALE` error. Historical
snapshots remain readable after their source becomes stale.

Readiness means that a structurally valid, selected-school, current Stage 11
source has at least one calculated student. It does not mean that reports already exist:
`missing_report_snapshots` can be positive while `ready` is true. Completion
is represented separately by `missing_report_snapshots = 0`.

The final source lock order is selected Auth session, selected membership,
selected school, live role grants, permission mappings, teaching assignments,
term, academic year, grade, curriculum mappings, class sections, mark sheets,
latest calculation run, term/enrollment report-history advisory lock,
enrollment, student, attendance, comments, class-teacher context, school
settings, next-term row, and subjects. Stage 11 and Stage 12 use the same
term/grade serialization prefix to avoid lock inversion.

## Security and later stages

Generation requires `REPORTS_GENERATE`; schoolwide reads require
`REPORTS_VIEW_ALL` or `REPORTS_GENERATE`. `REPORTS_VIEW_ASSIGNED` remains a
database/RLS report visibility permission for currently assigned classes; it
does not grant schoolwide Stage 12 dashboard access or generation. Subject
teachers do not gain report access through marks permissions. The database
repeats selected-membership checks and locks authority before source rows.
Direct browser table writes are revoked, new lineage storage uses forced RLS,
and anonymous access is denied. Snapshot payloads are available only through
narrow read RPCs.

`/dashboard/reports` provides readiness, batch generation, and historical report
listing. `/dashboard/reports/[reportId]` renders an HTML preview from the frozen
payload and normalized rows. It has no PDF download, parent publication,
parent access, or promotion controls. PDF rendering starts in Stage 13.

## Acceptance verification

The dedicated acceptance coverage uses isolated authenticated fixtures. It
covers `REPORTS_GENERATE`, `REPORTS_VIEW_ALL`-only, assigned class-teacher
child RLS, subject-teacher denial, cross-school scope, selected multi-school
membership, same-run A-to-B-to-A checksum rules, fresh single/batch duplicate
races, changed-context races, authority revocation and suspension, selected
membership switching, generation-wins ordering, batch rollback, readiness
isolation, next-term selection, frozen history, privacy, and Stage 12 scope
boundaries. The integration suite contains 55 meaningful scenarios and the
dedicated Playwright suite contains 61 browser scenarios. Database behavior
also asserts that A-to-B-to-A v1 and v3 checksums are equal while their report
IDs differ, and that exact current-context generation reuses v3.
