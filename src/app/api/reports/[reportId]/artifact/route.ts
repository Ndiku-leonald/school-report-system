import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  contentDisposition,
  safeReportFilename,
} from "@/lib/report-pdf/format";
import { materializeReportArtifact } from "@/lib/report-publication/service";
import { downloadReportArtifact } from "@/lib/report-publication/service";
import { getGeneratedReport } from "@/lib/report-snapshots/data";

const reportIdSchema = z.uuid();
const requestSchema = z
  .object({
    expectedWorkflowVersion: z.number().int().nonnegative().optional(),
  })
  .strict();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  if (!reportIdSchema.safeParse(reportId).success)
    return NextResponse.json(
      { message: "The report artifact is unavailable." },
      { status: 404 },
    );
  let input: unknown = {};
  try {
    input = await request.json();
  } catch {
    // An empty body is valid; the server reads the current workflow version.
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    return NextResponse.json(
      { message: "The report artifact request is invalid." },
      { status: 400 },
    );
  try {
    const descriptor = await materializeReportArtifact(
      reportId,
      parsed.data.expectedWorkflowVersion,
    );
    return NextResponse.json({
      reportId: descriptor.report_id,
      status: descriptor.status,
      workflowVersion: descriptor.workflow_version,
      hasArtifact: descriptor.has_artifact,
      checksum: descriptor.file_checksum,
      sizeBytes: descriptor.file_size,
      rendererVersion: descriptor.renderer_version,
      storedAt: descriptor.stored_at,
    });
  } catch {
    return NextResponse.json(
      { message: "The report artifact could not be stored." },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  if (!reportIdSchema.safeParse(reportId).success)
    return NextResponse.json(
      { message: "The report artifact is unavailable." },
      { status: 404 },
    );
  try {
    const [{ bytes }, report] = await Promise.all([
      downloadReportArtifact(reportId),
      getGeneratedReport(reportId),
    ]);
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDisposition(safeReportFilename(report)),
        "Content-Length": String(bytes.byteLength),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "The report artifact is unavailable." },
      { status: 500 },
    );
  }
}
