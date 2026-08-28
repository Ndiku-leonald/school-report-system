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

The first report for a student and term is version 1. A later calculation run
creates the next append-only version and sets the prior report's
`superseded_by` relationship. The prior snapshot and its source lineage remain
readable. Repeating a request for the same calculation run and enrollment
reuses the existing report without a duplicate creation audit.

## Snapshot payload

The JSON payload has explicit `snapshot_schema_version: 1` and contains school
identity, student identity, academic period, placement, academic summary,
attendance, comments, safe signatory display names, and the next configured
term's opening date when available. Subject rows remain normalized in
`report_subject_results`, ordered by the immutable Stage 11 curriculum source
manifest. The checksum is SHA-256 over canonical JSON plus the ordered subject
row representation, report version, and Stage 11 lineage checksums.

Attendance and comments are copied only when records exist. Missing attendance
or comments are represented as `null`; the preview never substitutes current
live values or invented zeroes. The current schema has no final subject-report
comment workflow, so Stage 12 leaves `teacher_comment` unavailable rather than
concatenating per-assessment mark-entry remarks. It also does not hard-code
behavior categories.

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
