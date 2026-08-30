import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderReportCardPdf } from "../src/lib/report-pdf/render";

import { reportPdfFixture } from "./report-pdf-fixture";

async function main() {
  const root = process.cwd();
  const tempDir = join(root, "tmp", "pdfs");
  const baseline = join(
    root,
    "tests",
    "report-pdf",
    "visual",
    "report-card-page-1.png",
  );
  const pdfPath = join(tempDir, "report-card.pdf");
  const imagePath = join(tempDir, "report-card-page-1.png");
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(pdfPath, await renderReportCardPdf(reportPdfFixture));

  try {
    execFileSync(
      "pdftoppm",
      [
        "-png",
        "-r",
        "96",
        "-f",
        "1",
        "-singlefile",
        pdfPath,
        join(tempDir, "report-card-page-1"),
      ],
      { stdio: "pipe" },
    );
  } catch {
    throw new Error(
      "pdftoppm is required for PDF visual regression; install poppler-utils.",
    );
  }

  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  if (!/Page size:\s+595\.28 x 841\.89 pts \(A4\)/.test(info)) {
    throw new Error(`PDF is not A4 portrait:\n${info}`);
  }
  const textPath = join(tempDir, "report-card.txt");
  execFileSync("pdftotext", [pdfPath, textPath]);
  const extracted = readFileSync(textPath, "utf8");
  for (const expected of [
    "Kampala Élan Primary School",
    "Zoë Žurić",
    "2026 Academic Year",
    "Term Two",
    "Mathematics",
    "Advanced",
    "Term Three",
    "Snapshot fingerprint",
  ]) {
    if (!extracted.includes(expected)) {
      throw new Error(
        `PDF text extraction missed expected content: ${expected}`,
      );
    }
  }

  if (process.env.UPDATE_REPORT_PDF_VISUAL === "1") {
    mkdirSync(join(root, "tests", "report-pdf", "visual"), { recursive: true });
    writeFileSync(baseline, readFileSync(imagePath));
    console.log(`updated ${baseline}`);
  } else {
    if (!existsSync(baseline))
      throw new Error(`Missing visual baseline: ${baseline}`);
    const actualHash = createHash("sha256")
      .update(readFileSync(imagePath))
      .digest("hex");
    const expectedHash = createHash("sha256")
      .update(readFileSync(baseline))
      .digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error(
        `PDF visual regression failed. Actual ${actualHash}; expected ${expectedHash}.`,
      );
    }
    console.log(`report-pdf visual regression passed (${actualHash})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
