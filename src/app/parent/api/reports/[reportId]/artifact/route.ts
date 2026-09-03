import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { downloadPrivateReportArtifact } from "@/lib/report-publication/storage-admin";
import {
  getParentArtifactDescriptor,
  recordParentArtifactAccess,
} from "@/lib/parent-portal/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safePart(value: string | null | undefined) {
  return (
    (value ?? "report")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "report"
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportId: string }> },
) {
  const { reportId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      reportId,
    )
  ) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const descriptor = await getParentArtifactDescriptor(reportId);
  if (!descriptor) return new NextResponse("Not found.", { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await downloadPrivateReportArtifact(descriptor.storage_path);
  } catch {
    return new NextResponse("Artifact unavailable.", { status: 404 });
  }
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (
    checksum !== descriptor.file_checksum ||
    bytes.byteLength !== descriptor.file_size ||
    bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
  ) {
    return new NextResponse("Artifact unavailable.", { status: 404 });
  }
  if (!(await recordParentArtifactAccess(reportId, checksum))) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const filename = `${safePart(descriptor.student_name)}-${safePart(descriptor.academic_year_label)}-${safePart(descriptor.term_label)}-v${descriptor.report_version}.pdf`;
  const response = new NextResponse(new Uint8Array(bytes), { status: 200 });
  response.headers.set("Content-Type", "application/pdf");
  response.headers.set(
    "Content-Disposition",
    `attachment; filename="${filename}"`,
  );
  response.headers.set("Content-Length", String(bytes.byteLength));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
