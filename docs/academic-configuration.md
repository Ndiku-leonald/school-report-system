# Academic configuration management

Stage 6 provides school-scoped management of academic years, terms, grade
levels, class sections, subjects, grade-subject curriculum mappings, assessment
schemes and components, grading scales and bands, ranking rules, and promotion
rules. It does not enter marks, calculate ranks, generate reports, or make
promotion decisions.

## Authorization boundary

Reads require `ACADEMIC_CONFIGURATION_VIEW`. Mutations require
`ACADEMIC_CONFIGURATION_MANAGE`. Head teachers, class teachers, and subject
teachers receive the former only; academic registrars, school administrators,
and super administrators receive both through the migration-owned role matrix.

Every mutation uses a narrow `SECURITY DEFINER` RPC. The RPC derives its actor
and school from the active membership selected for the JWT `session_id`, then
rechecks membership ownership, `ACTIVE` status, school activity, live role
assignments, and manage permission. Browser-supplied school and membership IDs
are never authority. Direct `INSERT`, `UPDATE`, and `DELETE` table privileges
remain denied to `authenticated`.

Server Actions use the normal cookie-backed anonymous-key client and independently
require manage permission. Application guards improve the experience but never
replace database enforcement.

## Lifecycle and history

- Academic years: `DRAFT → ACTIVE → CLOSED → ARCHIVED`.
- Terms: Stage 6 supports `DRAFT → OPEN`; later workflow states are out of scope.
- Assessment schemes: `DRAFT → ACTIVE → RETIRED`.
- Grading scales, ranking rules, and promotion rules use draft, active, and
  retired lifecycle state derived from `is_active` and `retired_at`.
- Active historical schemes, scales, and rules are never edited in place. Saving
  changes from an active or retired version creates the next positive version.
- Grade levels, class sections, and subjects are deactivated rather than deleted,
  preserving historical references.

All updates and transitions accept an `expected_updated_at`. A stale value raises
the stable `ACADEMIC_CONFIGURATION_CONFLICT` error with SQLSTATE `PT409`, which
PostgREST returns immediately as HTTP 409 rather than retrying as a serialization
failure. The transaction changes no configuration and writes no successful audit
event.

Draft years, terms, grade levels, subjects, class sections, curriculum flags,
assessment schemes, grading scales, ranking rules, and promotion rules have
explicit edit workflows. Grade and subject order changes submit the complete
active set atomically, with a concurrency token for every row.

A class section's year and grade may change only while the section has no
enrolment, teaching-assignment, class-teacher-assignment, mark-sheet, or report
dependency. Once referenced, the UI explains and locks those scope controls,
and the database independently rejects forged changes. Descriptive fields and
capacity remain editable while its academic year is configurable.

A curriculum mapping permanently identifies one grade-subject pair. Editing
changes only the required, aggregate, and order flags. Repointing is rejected;
administrators create a separate pair instead. Removal remains dependency-aware.

## Validation

Terms must fit within their academic year and cannot overlap. A year has at most
one promotion term. Grade and subject ordering is unique among active records,
and reorder RPCs lock and update the complete ordered set transactionally.

Assessment components are edited as structured rows and saved atomically with
their draft scheme. The interface supports add, remove, and keyboard-accessible
reordering with a live weight total. Activation requires one or more components
and weights totalling exactly 100. Grading bands use the equivalent structured
editor with live gap, overlap, and 0-100 coverage feedback; database constraints
and activation checks remain authoritative.

Ranking configuration uses a documented version-1 shape for direction,
incomplete-result handling, minimum subjects, and an optional configured
metric. Promotion rules use structured threshold fields and same-school
required-subject rows. Zod and database validation reject unknown or malformed
options. Ranking calculations, promotion recommendations, and promotion
decisions are intentionally absent.

Draft versions are edited in place. Active or retired assessment, grading,
ranking, and promotion records expose an explicit "Create new version" workflow
that preserves the source, creates a new draft ID, and increments the scope
version.

## Auditing

Each successful RPC appends exactly one configuration event to the existing
append-only `audit_logs` in the same transaction. First-time records use
`ACADEMIC_CONFIGURATION_CREATED`, draft edits use
`ACADEMIC_CONFIGURATION_UPDATED`, explicit versions use
`ACADEMIC_CONFIGURATION_VERSION_CREATED` with both source and new identity, and
lifecycle operations use their activate, deactivate, retire, or status action.
Events contain the selected school, actor profile and membership, entity
identity, and bounded old and new values. They exclude passwords, keys, request
headers, and unrelated personal information.

## Routes

The configuration hub is `/dashboard/academic`, with implemented routes for
years, grade levels, classes, subjects, curriculum, assessment schemes, grading,
ranking, and promotion. Year details include their configured terms. Staff
without manage permission receive the same school-scoped views without
functioning mutation controls.

## Remote safety

Stage 6 validation is local-only. The repository is not linked to a remote
Supabase project, and this work does not guess a project reference, apply remote
migrations, or reset remote data.
