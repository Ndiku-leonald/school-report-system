import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderReportCardPdf } from "../src/lib/report-pdf/render";
import {
  reportPdfFixture,
  reportPdfLongCommentFixture,
  reportPdfManySubjectsFixture,
} from "./report-pdf-fixture";

function run(command: string, args: string[]) {
  return execFileSync(command, args, { encoding: "utf8" });
}

function pagesFromInfo(info: string) {
  return Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
}

function assertA4(info: string) {
  if (!/Page size:\s+595\.28 x 841\.89 pts \(A4\)/.test(info)) {
    throw new Error(`PDF is not A4 portrait:\n${info}`);
  }
}

async function main() {
  const root = process.cwd();
  const tempDir = join(root, "tmp", "pdfs");
  mkdirSync(tempDir, { recursive: true });
  const baseline = join(
    root,
    "tests",
    "report-pdf",
    "visual",
    "report-card-page-1.png",
  );
  const pdfPath = join(tempDir, "report-card.pdf");
  const imagePath = join(tempDir, "report-card-page-1.png");
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
      "pdftoppm is required for PDF visual regression; install the pinned Poppler toolchain.",
    );
  }

  const info = run("pdfinfo", [pdfPath]);
  assertA4(info);
  const textPath = join(tempDir, "report-card.txt");
  execFileSync("pdftotext", [pdfPath, textPath]);
  const extracted = readFileSync(textPath, "utf8");
  const normalizedExtracted = extracted.replace(/\s+/g, " ");
  for (const expected of [
    "Kampala Élan Primary School",
    "Zoë Žurić",
    "S13-001",
    "2026 Academic Year",
    "Term Two",
    "Primary Six",
    "P.6 Blue",
    "88",
    "Advanced",
    "Class position",
    "Grade-level position",
    "Class teacher",
    "2",
    "4",
    "Mathematics",
    "Complete · absence recorded",
    "2 (tie of 2)",
    "Attendance and comments",
    "A thoughtful and consistent learner.",
    "Term Three",
    "A. Teacher",
    "Snapshot fingerprint",
    "Calculation input SHA-256",
    "Calculation output SHA-256",
    "Layout: report-card-a4-v2",
    "Report version 2",
  ]) {
    if (!normalizedExtracted.includes(expected))
      throw new Error(
        `PDF text extraction missed expected content: ${expected}`,
      );
  }
  if (/\bnull\b|\bundefined\b|\bNaN\b/.test(extracted))
    throw new Error("PDF contains a raw missing-data value");

  const malicious = await renderReportCardPdf({
    ...reportPdfFixture,
    report: {
      ...reportPdfFixture.report,
      snapshot_data: {
        ...reportPdfFixture.report.snapshot_data,
        school: {
          ...reportPdfFixture.report.snapshot_data.school,
          email: "javascript:alert(1)",
          website: "https://evil.invalid",
          motto: ")/Launch( ordinary report text",
        },
      },
    },
  });
  if (
    /\/(?:JavaScript|JS|Launch|OpenAction|URI)\b/i.test(
      malicious.toString("latin1"),
    )
  )
    throw new Error("malicious report text created a PDF action");

  const stressFixtures = [
    ["report-card-long-comments", reportPdfLongCommentFixture],
    ["report-card-many-subjects", reportPdfManySubjectsFixture],
  ] as const;
  const stressHashes: string[] = [];
  for (const [name, fixture] of stressFixtures) {
    const stressPath = join(tempDir, `${name}.pdf`);
    const first = await renderReportCardPdf(fixture);
    const second = await renderReportCardPdf(fixture);
    if (first.compare(second) !== 0)
      throw new Error(`${name} is not byte deterministic`);
    writeFileSync(stressPath, first);
    const stressInfo = run("pdfinfo", [stressPath]);
    assertA4(stressInfo);
    const pageCount = pagesFromInfo(stressInfo);
    if (pageCount < 2)
      throw new Error(`${name} should paginate across at least two pages`);
    const prefix = join(tempDir, name);
    execFileSync(
      "pdftoppm",
      [
        "-png",
        "-r",
        "96",
        "-f",
        "1",
        "-l",
        String(pageCount),
        stressPath,
        prefix,
      ],
      { stdio: "pipe" },
    );
    const stressText = run("pdftotext", [stressPath, "-"]).replace(/\s+/g, " ");
    for (const expected of name === "report-card-long-comments"
      ? [
          "Class teacher comment",
          "Head teacher comment",
          "Next term",
          "Signatories",
          "Snapshot fingerprint",
        ]
      : [
          "Integrated Long Curriculum Subject 1",
          "Subject 36",
          "Subject results (continued)",
          "Next term",
          "Snapshot fingerprint",
        ]) {
      if (!stressText.includes(expected))
        throw new Error(`${name} missed ${expected}`);
    }
    for (let page = 1; page <= pageCount; page += 1) {
      const pageText = run("pdftotext", [
        "-f",
        String(page),
        "-l",
        String(page),
        stressPath,
        "-",
      ]).replace(/\s+/g, " ");
      if (!pageText.includes(`Page ${page} of ${pageCount}`)) {
        throw new Error(
          `${name} is missing its page ${page} of ${pageCount} footer`,
        );
      }
    }
    if (name === "report-card-many-subjects") {
      for (let subject = 1; subject <= 36; subject += 1) {
        const occurrences =
          stressText.match(new RegExp(`Subject ${subject}(?=\\s|$)`, "g"))
            ?.length ?? 0;
        if (occurrences !== 1) {
          throw new Error(`Subject ${subject} was not rendered exactly once`);
        }
      }
    }
    for (let page = 1; page <= pageCount; page += 1) {
      const image = readFileSync(`${prefix}-${page}.png`);
      const hash = createHash("sha256").update(image).digest("hex");
      stressHashes.push(`${name} page ${page}: ${hash}`);
      const stressBaseline = join(
        root,
        "tests",
        "report-pdf",
        "visual",
        "stress",
        `${name}-${page}.png`,
      );
      if (process.env.UPDATE_REPORT_PDF_VISUAL === "1") {
        mkdirSync(join(root, "tests", "report-pdf", "visual", "stress"), {
          recursive: true,
        });
        writeFileSync(stressBaseline, image);
      } else {
        if (!existsSync(stressBaseline))
          throw new Error(`Missing stress baseline: ${stressBaseline}`);
        const expectedHash = createHash("sha256")
          .update(readFileSync(stressBaseline))
          .digest("hex");
        if (hash !== expectedHash)
          throw new Error(`${name} visual regression on page ${page}`);
      }
    }
  }

  const actualHash = createHash("sha256")
    .update(readFileSync(imagePath))
    .digest("hex");
  if (process.env.UPDATE_REPORT_PDF_VISUAL === "1") {
    mkdirSync(join(root, "tests", "report-pdf", "visual"), { recursive: true });
    writeFileSync(baseline, readFileSync(imagePath));
    console.log(`updated ${baseline}`);
  } else {
    if (!existsSync(baseline))
      throw new Error(`Missing visual baseline: ${baseline}`);
    const expectedHash = createHash("sha256")
      .update(readFileSync(baseline))
      .digest("hex");
    if (actualHash !== expectedHash)
      throw new Error(
        `PDF visual regression failed. Actual ${actualHash}; expected ${expectedHash}.`,
      );
  }
  console.log(
    `report-pdf visual regression passed (${actualHash})\n${stressHashes.join("\n")}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
