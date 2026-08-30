import assert from "node:assert/strict";

import {
  contentDisposition,
  safeReportFilename,
} from "../src/lib/report-pdf/format";
import { renderReportCardPdf } from "../src/lib/report-pdf/render";

import { reportPdfFixture } from "./report-pdf-fixture";

async function main() {
  const pdf = await renderReportCardPdf(reportPdfFixture);
  const secondPdf = await renderReportCardPdf(reportPdfFixture);

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal(
    pdf.compare(secondPdf),
    0,
    "same snapshot must render byte-identically",
  );
  assert.doesNotMatch(
    pdf.toString("latin1"),
    /\/(?:JavaScript|JS|Launch|OpenAction)\b/i,
  );

  const filename = safeReportFilename(reportPdfFixture.report);
  assert.match(
    filename,
    /^S13-001-Zoe-Zuric-2026-Academic-Year-Term-Two-v2\.pdf$/,
  );
  assert.match(
    contentDisposition(filename),
    /^attachment; filename="[A-Za-z0-9._-]+"$/,
  );
  assert.doesNotMatch(contentDisposition(filename), /[\r\n]/);

  assert.ok(
    pdf.byteLength > 3_000,
    "rendered report should contain the full report card",
  );
  console.log(
    `report-pdf tests passed (1 PDF, ${pdf.byteLength} bytes, deterministic)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
