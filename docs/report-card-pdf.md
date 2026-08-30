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
summary, frozen subjects, attendance, comments, signatories, next term, the
snapshot and calculation fingerprints, and layout version `report-card-a4-v1`.
Guardian contacts, publication/official labels, parent access controls, and
mutable storage assets are excluded.

## Assets and determinism

School logos and learner photographs are intentionally not embedded. Stage 7
storage paths point at replaceable private objects, while Stage 12 does not
persist an immutable asset checksum or report asset copy. Omitting them avoids
rendering a later image into a historical report. The renderer uses local,
bundled Noto Sans TTF files (assembled from the OFL-licensed package subsets)
and fixed PDF metadata; it does not fetch fonts or images over the network.

The layout version and snapshot fingerprints make the source and presentation
contract explicit. The focused renderer test renders the same fixture twice
and requires byte identity, checks the PDF signature and forbidden active
action tokens, and verifies safe filenames. Visual regression rasterizes page
one with pinned Poppler tooling and compares a committed PNG baseline by
exact SHA-256 equality (zero pixel tolerance). The same check validates A4
dimensions and extracts representative text for structural coverage.

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
