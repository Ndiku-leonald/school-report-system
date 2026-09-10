# Stage 17 — Promotion and progression

Stage 17 provides a secure, selected-school workflow for turning current
locked Stage 11 results into explainable recommendations. A recommendation is
never a final decision, and a confirmed decision never creates an enrolment
until an authorized user explicitly applies progression.

## Authorization and scope

`PROMOTION_VIEW` is the read permission. `PROMOTION_CONFIRM` is required in
addition for generation, confirmation, reopening, and progression. The
database derives both from the single active membership selected for the
authenticated session. URLs, metadata, client permission lists, and other
memberships are not authoritative. Head teachers and school administrators
can confirm; registrars are read-only; class and subject teachers are denied.

## Readiness and rules

Only a configured `terms.is_promotion_term = true` term is eligible. The
selected grade must have a current Stage 11 run: the newest run version, a
locked term, every current locked source, and the accepted
`internal.results_input_checksum` must agree. Missing or stale evidence is
shown as unavailable; Stage 17 never calls `calculate_grade_results`.

Active-rule precedence is deterministic: school + academic year + grade,
school + academic year, school + grade, then school-wide. Within a scope the
highest version and then UUID is used. Active, retired rules are excluded from
new recommendations. The exact rule ID and version are copied into evidence.

Required subjects support only `{"schema_version":1,"subjects":[{"subject_id":"<uuid>","require":"PASS"}]}`. `PASS` requires `COMPLETE` and `is_pass = true`; `COMPLETE` requires only `COMPLETE`. Empty `{}` means no required-subject criteria. Subjects must be unique, belong to the school, and be in the selected grade curriculum. Additional rules accept either `{}` or the exact schema `{"schema_version":"1","require_complete_result":true,"success_outcome":"PROMOTED|PROMOTED_WITH_SUPPORT","failure_outcome":"ACADEMIC_REVIEW|REPEAT_RECOMMENDED","incomplete_outcome":"ACADEMIC_REVIEW|REPEAT_RECOMMENDED"}`. Empty `{}` safely defaults to complete results, promotion on success, and academic review on failure or incompleteness. Unknown keys, schemas, and JSON types fail closed.

## Evidence and recommendations

Each generated row creates an immutable `promotion_recommendation_snapshots`
record. It freezes the academic scope, calculation IDs/checksums, calculated
learner and subject values, attendance, rule configuration, sorted criterion
evaluations, and the system outcome. A SHA-256 checksum over canonical
PostgreSQL `jsonb` text (with deterministic array ordering and no generation
timestamp) proves reproducibility.

The population is active students with `ACTIVE` or `REPEATING` enrolments in
the selected source year and grade. Attendance is available only when
`days_open > 0`; missing or zero-day attendance is unavailable evidence and
therefore forces conservative `ACADEMIC_REVIEW`, even when other criteria
pass. Complete results use the configured success/failure outcomes; incomplete
results use the configured incomplete outcome. A final grade always uses
`COMPLETED` for a successful complete result and never recommends promotion.
The system never recommends `REPEAT_CONFIRMED`.

## Decisions and progression

`promotion_decisions` is versioned with a unique `(term_id, enrollment_id,
version)` and one current row where `superseded_by IS NULL`. Legacy rows are
backfilled as version 1 but have no trusted Stage 17 snapshot. Source fields
and confirmed decisions are immutable. Reopening creates a new recommendation
version with a required reason and retains confirmed history; reopening is
forbidden after progression.

Human final outcomes are `PROMOTED`, `PROMOTED_WITH_SUPPORT`,
`ACADEMIC_REVIEW`, `REPEAT_CONFIRMED`, and `COMPLETED`. The
`REPEAT_RECOMMENDED` → `REPEAT_CONFIRMED` confirmation is not an override;
every other semantic change requires a trimmed 3–2000 character reason.

Progression is explicit and idempotent, and every application stores an
immutable `application_snapshot` plus SHA-256 `application_checksum`. The
target year is the first later year whose status is `ACTIVE` or `DRAFT` and
whose start follows the source year end. Promoted learners move to the next
active grade; repeaters remain in the same grade and receive `REPEATING`.
The source enrolment exits on the source academic year's `ends_on`; final-grade
completion closes the source enrolment and student as `COMPLETED` without a
target enrolment. The final-grade and current-snapshot checks are repeated at
application time. Exact retries return the existing application; conflicting
retries fail. `ACADEMIC_REVIEW` and unsupported outcomes cannot progress. The
target class is verified and locked before counting current enrolments,
preventing last-seat races. Audit events contain academic evidence only and
never guardian, parent credential/session, or private storage data.

Migration 39 is frozen and Migration 40 is the single additive acceptance
hardening migration; Migration 41 does not exist. Migrations 37 and 38 remain unchanged. Production
deployment, remote rollout, monitoring, backups, incident response, and the
final production security review remain Stage 18.
