# Results calculation

Stage 11 calculates one `term + grade level` at a time. PostgreSQL is the
source of truth: the term must be `LOCKED`, every active class section in the
grade must have a source sheet for every curriculum subject, and the source
sheet selected for each class/subject is the highest revision. A historical
locked predecessor is never substituted for a newer revision.

## Immutable runs and lineage

`result_calculation_runs` starts at version 1 for a term/grade. A changed
locked correction creates version `n + 1` and points `supersedes_run_id` at the
immediately preceding run. Runs, source manifests, student results, subject
results, explanations, and performance summaries are append-only. An identical
input checksum returns the existing run and creates no second audit event.

The manifest records the exact mark sheet, revision, class, subject, and
assessment scheme. Input and output checksums are SHA-256 hex digests over
stable, ordered numeric/text representations; they are not caller-supplied.

## Readiness and rule selection

Readiness is authoritative over active class sections in the selected academic
year and grade, crossed with `grade_level_subjects`. Sheets for obsolete or
unmapped subjects do not inflate source counts or block calculation. For each
expected class/subject scope, only the highest sheet version is authoritative;
an unlocked newer revision blocks the scope even when an older revision is
locked.

The calculation form enables when one or more active grading scales and ranking
rules apply. The operator must explicitly select both IDs; the UI never silently
chooses the first option. A first-run checksum is available when each rule type
has exactly one applicable option. Once a run exists, readiness computes the
checksum with that run's stored grading, ranking, and optional classification
IDs, even if those rules are later retired or replaced.

## Subject score

For `PRESENT`, normalized score is `score / maximum_score` and weighted
contribution is normalized score × configured percentage. A present zero is
valid. `ABSENT` contributes zero while retaining its weight. `EXEMPTED`
contributes no score and removes its weight. Required `NOT_ASSESSED` or missing
data makes the subject `INCOMPLETE`; optional unassessed or missing data removes
its weight.

```text
included_weight = sum(PRESENT and ABSENT weights)
subject_score = round(sum(weighted contributions) * 100 / included_weight, 2)
```

All arithmetic uses PostgreSQL `numeric`. A zero included weight is
`EXEMPTED` when the inputs represent legitimate exclusion; it is never treated
as zero. Stored rounded scores and averages map to exactly one configured
grading band. Overall total sums complete subject scores, and overall average
is the rounded total divided by the number of complete subjects. Exempted
subjects are excluded from both values. Completeness is based on required
curriculum subjects and is separate from ranking eligibility.

Aggregate points come only from `grade_level_subjects.contributes_to_aggregate`
and the selected grading band's `aggregate_points`. Partial aggregates are
never emitted. Optional aggregate classification scales and bands are
school-scoped, versioned, overlap-protected, and selected explicitly; no
Division label or range is hard-coded.

## Ranking and boundaries

The selected versioned rule supports `TOTAL`, `AVERAGE`, `AGGREGATE`, or a
validated configured metric. Eligibility requires a non-null metric, the
configured minimum subject count, and (when configured) complete required
subjects. The configured direction is honored. DENSE, COMPETITION, ORDINAL,
and SHARED tie behavior is persisted with class and grade-level tie metadata;
subject positions are calculated separately from complete subject scores. Every
`ORDINAL` ordering uses `upper(btrim(admission_number))`, then the immutable
enrollment UUID as the final deterministic tiebreaker for class, grade, and
subject rankings.

`REPORTS_GENERATE` is required to calculate. Whole-school reads require
`REPORTS_VIEW_ALL` or `REPORTS_GENERATE`; assignment-scoped subject teachers
cannot calculate or read the dashboard. All new tables force RLS and deny
direct browser writes. Read RPCs omit guardian contacts. Stage 11 does not
write reports, report snapshots, PDFs, publication state, or promotion
decisions. Those boundaries belong to Stages 12, 13, and 17.
