import "server-only";

import { reportSnapshotDataSchema } from "../report-snapshots/schemas";
import { writeReportCardPdf } from "./document";
import type { ReportPdfData } from "./types";

const FORBIDDEN_PDF_ACTIONS = /\/(?:JavaScript|JS|Launch|OpenAction|URI)\b/i;

export async function renderReportCardPdf(data: ReportPdfData) {
  const snapshot = reportSnapshotDataSchema.safeParse(
    data.report.snapshot_data,
  );
  if (!snapshot.success)
    throw new Error("The stored report snapshot is invalid.");
  const stream = writeReportCardPdf(data);
  const chunks: Buffer[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      const buffer = Buffer.concat(chunks);
      if (FORBIDDEN_PDF_ACTIONS.test(buffer.toString("latin1"))) {
        reject(new Error("Generated PDF contains an active action or URI."));
        return;
      }
      resolve(buffer);
    });
    stream.on("error", reject);
  });
}
