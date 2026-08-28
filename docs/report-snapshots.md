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

Report version and calculation version are separate. The first report for a
student and term is report version 1. A newer Stage 11 calculation normally
creates the next report version and sets the prior report's `superseded_by`
relationship. A legitimate change to frozen report context, such as a
comment, attendance value, or school identity, may also create the next report
version from the same calculation run. The prior snapshot and its source
lineage remain readable.

Idempotence is context-aware: the complete canonical snapshot payload,
ordered subject rows, and Stage 11 input/output checksums form a context
checksum. Repeating the same run, enrollment, and context reuses the existing
immutable report without a new snapshot, subject rows, or creation audit. A
changed context creates one successor version; the database prevents an exact
duplicate context.

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
chronologically across the same school's academic years and is locked before
the snapshot is created; it is `null` when no configured later term exists.

Readiness means that a structurally valid, selected-school Stage 11 source has
at least one calculated student. It does not mean that reports already exist:
`missing_report_snapshots` can be positive while `ready` is true. Completion
is represented separately by `missing_report_snapshots = 0`.

The source lock order is selected-membership authority, school, teaching
assignments, term, academic year, grade, curriculum mappings, class sections,
mark sheets, calculation run, calculated result, enrollment, student, class,
attendance/comments, effective class-teacher identity, school settings,
next-term configuration, and subjects. This extends the Stage 11 order and
keeps mutable values coherent for checksum construction.

## Security and later stages

Generation requires `REPORTS_GENERATE`; reads require `REPORTS_VIEW_ALL` or
`REPORTS_GENERATE`. The database repeats those checks against the selected
session membership and locks authority before source rows. Direct browser
table writes are revoked, new lineage storage uses forced RLS, and anonymous
access is denied. Snapshot payloads are available only through narrow read
RPCs.

`/dashboard/reports` provides readiness, batch generation, and historical report
listing. `/dashboard/reports/[reportId]` renders an HTML preview from the frozen
payload and normalized rows. It has no PDF download, parent publication,
parent access, or promotion controls. PDF rendering starts in Stage 13.
