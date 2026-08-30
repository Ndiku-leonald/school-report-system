# Report publication workflow

Stage 14 adds a staff-only publication workflow around the immutable Stage 12
report snapshot and the deterministic Stage 13 renderer.

## Lifecycle

`GENERATED` reports can receive one immutable private PDF artifact. A reviewer
then moves the report to `REVIEWED`; a staff member with `REPORTS_PUBLISH` can
move it to `PUBLISHED`; a staff member with `REPORTS_WITHDRAW` can move it to
`WITHDRAWN` with a required reason. A newer report version is published
through its own artifact and review cycle. The previous published report
remains published until the successor is published atomically, then becomes
`SUPERSEDED`. Withdrawn versions remain withdrawn.

## Permissions and authority

Artifact generation uses `REPORTS_GENERATE`, review uses `REPORTS_REVIEW`,
publication uses `REPORTS_PUBLISH`, and withdrawal uses `REPORTS_WITHDRAW`.
Every RPC revalidates the current JWT `session_id`, selected active
membership, active school, live role assignments, and live permission mapping
under row locks. Report readers retain the existing schoolwide or selected
class-teacher scope; subject teachers do not receive report access.

## Private artifacts

PDFs are stored in the private `report-artifacts` bucket, limited to
`application/pdf` and 10 MiB. The server reuses the Stage 13 renderer and
computes SHA-256 and size from the resulting bytes. The canonical object name
is `<report_id>/<lowercase-sha256>.pdf`. The database registration RPC verifies
that the object exists, matches the report, and has not already been
registered. Registered objects cannot be overwritten or deleted by normal
authenticated users.

The Stage 13 `GET /api/reports/[reportId]/pdf` route renders a preview/on-demand
PDF. Stage 14 `GET /api/reports/[reportId]/artifact` downloads the exact stored
artifact, verifies its checksum first, and records `REPORT_ARTIFACT_ACCESSED`.
No public URL or signed URL is issued.

## Auditing and concurrency

Successful operations emit `REPORT_ARTIFACT_STORED`, `REPORT_REVIEWED`,
`REPORT_PUBLISHED`, `REPORT_SUPERSEDED`, `REPORT_WITHDRAWN`, and
`REPORT_ARTIFACT_ACCESSED` as appropriate. Failed operations emit no success
event. `workflow_version` is an optimistic-concurrency counter incremented by
each successful workflow mutation. The partial unique index on
`(term_id, enrollment_id)` for `PUBLISHED` prevents two current published
versions.

## Boundaries

Stage 14 does not change snapshots, calculation results, marks, credentials,
parent sessions, or guardian data. It does not add parent login, public report
URLs, anonymous access, QR verification, promotion, analytics, or messaging.
Published reports are only eligible for a later parent-access stage.
