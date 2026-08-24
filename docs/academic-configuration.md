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
- `ACTIVE` assessment schemes are available for new mark sheets. `RETIRED`
  schemes are not selectable for new or changed scheme references, but sheets
  that already use one retain it and remain available to later trusted workflow
  transitions.
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

## Historical immutability

Migration 14 establishes compatible mark-sheet scope and immutable assessment
history. Migration 15 requires an active, compatible scheme when a mark sheet is
inserted or its scheme reference changes. An update that keeps the existing
scheme ID may continue after that scheme retires, including later workflow,
actor, timestamp, version, and `updated_at` changes; the trigger still validates
term, academic year, class, grade, subject, assignment, and scheme scope on every
update. Once a scheme has a mark-sheet or mark dependency, its identity, name,
creator, scope, version, effective date, and components cannot change.
Retirement therefore prevents new selection while preserving the exact historic
definition. Database triggers also protect active and retired grading scales and
bands, ranking rules, and promotion rules from redefinition or deletion.
Promotion decisions may select only an active rule at selection time, while
later retirement leaves the recorded decision valid.

Component and grading-band array position is the authoritative display order:
the server derives sequential `sort_order` values on every save. Coverage checks
continue to use grading score boundaries, not display order. Repeated lifecycle
requests fail as no-ops and create no audit event.

Stage 7 consumes configured academic years, grade levels, active classes and
class capacity without redefining them. It adds student, guardian and enrolment
workflows only. Teacher-assignment management remains Stage 8; marks,
calculations, reports, parent access and promotion execution remain later
stages.

## Aggregate classification configuration

Stage 11 adds optional versioned aggregate-classification scales and bands.
They are school-scoped, may be scoped to an academic year and grade, reject
overlapping ranges, preserve active/retired history, and are edited only by
audited configuration RPCs. Labels and ranges are configuration data, not
universal Division rules.
