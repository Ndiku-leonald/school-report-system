# Secure report-card PDFs

Stage 13 renders the immutable Stage 12 report snapshot as an authorized staff
download.

## Contract

`GET /api/reports/[reportId]/pdf` uses the signed-in session Supabase client and
the same report-reader boundary as the HTML detail page. Schoolwide report
readers can read their active school, while `REPORTS_VIEW_ASSIGNED` can read
only an active assigned class. Other staff, anonymous users, other schools,
subject-only readers, and parent-facing flows receive no report data.

The route is Node-only and dynamic. It returns `application/pdf`, a safe
attachment filename, `Cache-Control: private, no-store`, and
`X-Content-Type-Options: nosniff`. It does not accept report fields, live
student data, URLs, storage paths, or image requests from the caller.

## Snapshot fidelity

The renderer receives the exact `report_id` selected by the detail page. It
loads `snapshot_data` and `report_subject_results` through the existing
authorized RPC wrappers, so historical report IDs render their own frozen
version. No totals, grades, positions, attendance, comments, signatories, or
next-term values are recalculated.

The document is A4 portrait with a grayscale-safe black/white table and
section hierarchy. It includes learner identity, class placement, academic
summary, frozen class and grade-level positions, frozen subjects, attendance,
comments, signatories, next term, the snapshot, calculation input, and
calculation output fingerprints, and layout version `report-card-a4-v2`.
Guardian contacts, date of birth, publication/official labels, parent access
controls, and mutable storage assets are excluded. Gender is also omitted as a
privacy-minimized presentation choice; these values remain in Stage 12 data.

## Assets and determinism

School logos and learner photographs are intentionally not embedded. Stage 7
storage paths point at replaceable private objects, while Stage 12 does not
persist an immutable asset checksum or report asset copy. Omitting them avoids
rendering a later image into a historical report. The renderer uses local,
bundled Noto Sans TTF files (assembled from the OFL-licensed package subsets)
and fixed PDF metadata; it does not fetch fonts or images over the network.

The layout version and snapshot fingerprints make the source and presentation
contract explicit. COMPLETE remains COMPLETE when a component absence flag is
set; the PDF says `Complete · absence recorded`. INCOMPLETE and EXEMPTED remain
authoritative, while tied positions retain their frozen numeric rank. Subject
rows and comments use measured sequential layout and page-space checks, with
repeated table headers and buffered `Page X of Y` footers.

The focused renderer test renders typical, long-comment, and multipage fixtures
twice and requires byte identity. It checks the PDF signature, malformed
snapshot rejection, safe filenames, and forbidden active actions/URI entries.
Visual regression rasterizes every stress page and the representative first
page, comparing committed PNG baselines by exact SHA-256 equality (zero pixel
tolerance). CI fixes the runner to `ubuntu-24.04`, installs Poppler
`24.02.0-1ubuntu9.1`, and records `pdftoppm`/`pdfinfo` versions. The Next
output-file trace is checked for both bundled TTF files.

`tests/report-pdf/report-pdf.integration.test.ts` runs 25 signed-in,
anon-key-client scenarios when local Supabase is available; service role is
used only to create synthetic fixtures. `tests/e2e/report-pdf.spec.ts` is a
dedicated 40-scenario browser suite and is not an alias for the Stage 12 suite.

## Validation

```bash
npm run test:report-pdf
npm run test:visual:report-pdf
npm run test:e2e:report-pdf
```

The visual command needs `pdftoppm` (`poppler-utils` on Ubuntu). To update the
baseline after an intentional layout change:

```bash
UPDATE_REPORT_PDF_VISUAL=1 npm run test:visual:report-pdf
```
