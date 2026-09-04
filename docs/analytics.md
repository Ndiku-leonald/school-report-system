# Stage 16: secure academic analytics

Stage 16 is a staff-only, read-only workspace at `/dashboard/analytics`. It
provides school coverage, grade and class summaries, distributions, subject
performance, Stage 11 rankings, factual academic-attention indicators, and
student drill-down. Promotion, repetition, progression, report publication,
marks editing, and parent analytics are outside this stage.

## Authority and scope

Every RPC and page requires `ANALYTICS_VIEW`. The database resolves exactly
the active membership selected for the verified Auth `session_id`, and then
checks that membership and school are active. `CLASS_TEACHER` and
`SUBJECT_TEACHER` do not receive this permission by default. Reports, marks,
student, or dashboard permissions never substitute for it.

Analytics reads only immutable Stage 11 tables: `result_calculation_runs`,
`result_calculation_sources`, `calculated_student_results`,
`calculated_subject_results`, `calculated_component_explanations`,
`calculated_subject_performance`, and
`calculated_grade_subject_performance`. It does not join guardian, parent,
credential, session, report, PDF, publication, or snapshot tables, and it
does not recalculate results.

A run is current only when it is the newest version for its term and grade,
the term is `LOCKED`, every current class/subject source scope has a latest
`LOCKED` mark sheet, the run belongs to the selected school, and its
`input_checksum` equals `internal.results_input_checksum(...)`. Missing,
unlocked, reopened, stale, or absent runs show an unavailable state and link
back to the results workflow. Stale output is never used as a fallback.

School summaries are one database-side operation over current grade runs and
include eligible/current/excluded grade counts plus coverage details. Partial
coverage is disclosed and is never labelled as a full-school population.
Grade, class, student, subject, top-student, attention, and export calls all
bind to an explicit `calculation_run_id` and independently recheck currentness.

The authoritative term-year grade scope is an active grade in the selected
school and term academic year with at least one active `class_sections` row for
that grade. An active grade with no class in that academic year is not an
analytics scope and cannot inflate excluded counts or source population. A real
class with incomplete academic configuration remains a visible unavailable
scope so the missing readiness is not hidden.

## Metric definitions

- Analytics population is the count of authoritative calculated student rows.
- Complete and incomplete counts use Stage 11 `is_complete` directly.
- Mean overall average is the arithmetic mean of non-null
  `overall_average`; `average_population_count` is its denominator. Null is
  never treated as zero.
- Graded learners have a non-null `overall_grade`; ungraded learners are
  reported separately from grade distributions.
- Classified learners have a non-null `aggregate_classification`; an absent
  classification scale is displayed as “No classification scale”.
- Grade and classification percentages use their corresponding non-null
  populations and preserve configured band order. Each configured output label
  is emitted once; repeated grade or classification labels use the minimum
  configured band `sort_order` and counts match the persisted output label,
  rather than multiplying by matching bands.
- Subject min, max, mean, counts, grade distribution, and pass rate use
  Stage 11 subject output. Passing is never recomputed from a hard-coded
  threshold.
- Strongest and weakest subjects are all tied subjects among subjects with
  `complete_count > 0` and non-null `mean_score`, using maximum/minimum mean.
- Top lists use Stage 11 positions and eligibility. They preserve tie size and
  include every learner whose position is within the bounded display cutoff.
  Presentation order is deterministic: persisted position ascending, then
  admission number ascending, then enrollment UUID ascending. Stage 16 never
  recalculates rank positions.
- Academic attention is factual only: incomplete overall results, incomplete
  subjects, and failed complete subjects. Exempted subjects are not failures.
  The feature makes no promotion, repetition, progression, or risk prediction.

## Privacy and exports

Student drill-down contains academic values, class, grade, term, and
calculation lineage only. It excludes guardian contacts, parent credentials
and sessions, DOB, photo paths, report/PDF paths, demographic analytics, and
publication data. Stage 16 bulk exports are aggregate-only: class/grade
summaries, distributions, and subject performance. They contain no student
names, admission numbers, top lists, attention lists, or student rows.

`GET /api/analytics/export?run=<run-id>&type=summary|distributions|subjects`
rechecks `ANALYTICS_VIEW`, selected-school ownership, and currentness. It
returns `text/csv; charset=utf-8`, `private, no-store`, and `nosniff`. The
filename removes CR/LF and unsafe characters. Values are quoted with commas,
quotes, and newlines escaped; text beginning after trimming with `=`, `+`,
`-`, or `@` receives a safe apostrophe so spreadsheet formulas remain inert.

Analytics is confidential academic data. Very small cohorts may still be
inferable to already-authorized senior staff; Stage 18 must confirm whether
school or legal policy requires a suppression threshold. Stage 16 does not
invent an arbitrary threshold. Parents and anonymous users cannot access the
workspace, and there is no public or shareable analytics URL.

## Local validation

Use synthetic data and the local Supabase stack only:

```text
npm run test:analytics
npm run test:e2e:analytics
npm run db:reset
npm run db:test
```

Migration 37 is the original Stage 16 implementation and is preserved
byte-for-byte. Migration 38 (`analytics_acceptance_hardening`) is the additive
correction for term-year scope eligibility, duplicate configured output-label
aggregation, and deterministic top-student ordering. It adds no analytics
tables, cache, snapshot, service-role production read, or promotion logic.

Coverage is reported by layer: 19 helper/unit cases in
`src/lib/analytics/format.test.ts`, 43 structural pgTAP assertions in
`analytics.test.sql`, 44 fixture-backed behavioral pgTAP assertions in
`analytics_behavior.test.sql`, 59 real local-Supabase DB-backed integration
scenarios in `tests/analytics/analytics.integration.test.ts`, and 69
fixture-backed Playwright scenarios in `tests/e2e/analytics.spec.ts`. The
helper cases are unit tests, not integration tests.

The dedicated integration runner provisions only synthetic fixtures with the
local service role, then authenticates staff clients and invokes the public
analytics RPCs. The browser runner uses the same local-only principle and
exercises the actual server pages, drill-down links, and aggregate CSV route.

Do not link to, migrate, read, or write a remote Supabase project. Production
hardening, deployment, monitoring, and operational policy remain Stage 18.
