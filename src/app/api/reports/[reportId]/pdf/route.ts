import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import {
  getGeneratedReport,
  getReportSubjects,
} from "@/lib/report-snapshots/data";
import {
  contentDisposition,
  safeReportFilename,
} from "@/lib/report-pdf/format";
import { renderReportCardPdf } from "@/lib/report-pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportIdSchema = z.uuid();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  if (!reportIdSchema.safeParse(reportId).success) {
    return NextResponse.json(
      { message: "Invalid report identifier." },
      { status: 400 },
    );
  }

  try {
    const report = await getGeneratedReport(reportId);
    const subjects = await getReportSubjects(reportId);
    const pdf = await renderReportCardPdf({ report, subjects });
    return new NextResponse(pdf as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDisposition(safeReportFilename(report)),
        "Content-Length": String(pdf.byteLength),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Report-card PDF generation failed.", { reportId });
    return NextResponse.json(
      { message: "The report-card PDF could not be generated." },
      { status: 500 },
    );
  }
}
