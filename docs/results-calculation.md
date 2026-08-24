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
subject positions are calculated separately from complete subject scores.

`REPORTS_GENERATE` is required to calculate. Whole-school reads require
`REPORTS_VIEW_ALL` or `REPORTS_GENERATE`; assignment-scoped subject teachers
cannot calculate or read the dashboard. All new tables force RLS and deny
direct browser writes. Read RPCs omit guardian contacts. Stage 11 does not
write reports, report snapshots, PDFs, publication state, or promotion
decisions. Those boundaries belong to Stages 12, 13, and 17.
