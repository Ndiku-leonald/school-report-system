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
the stable `ACADEMIC_CONFIGURATION_CONFLICT` error with SQLSTATE `40001`. The
transaction changes no configuration and writes no successful audit event.

## Validation

Terms must fit within their academic year and cannot overlap. A year has at most
one promotion term. Grade and subject ordering is unique among active records,
and reorder RPCs lock and update the complete ordered set transactionally.

Assessment components are saved atomically with their draft scheme. Activation
requires one or more components and weights totalling exactly 100. Grading bands
use an exclusion constraint to reject overlap; activation additionally requires
continuous coverage from 0 through 100 with no gaps.

Ranking and promotion JSON is validated with Zod and defensively checked as a
bounded database object. Ranking calculations, promotion recommendations, and
promotion decisions are intentionally absent.

## Auditing

Each successful RPC appends exactly one configuration event to the existing
append-only `audit_logs` in the same transaction. Events contain the selected
school, actor profile and membership, entity identity, action, and bounded old
and new values. They exclude passwords, keys, request headers, and unrelated
personal information.

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
