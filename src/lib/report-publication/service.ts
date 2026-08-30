import "server-only";

import {
  getGeneratedReport,
  getReportSubjects,
} from "@/lib/report-snapshots/data";
import { renderReportCardPdf } from "@/lib/report-pdf/render";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  REPORT_ARTIFACT_BUCKET,
  REPORT_ARTIFACT_MAX_BYTES,
  REPORT_PDF_RENDERER_VERSION,
  type ReportArtifactDescriptor,
} from "./types";
import { reportArtifactChecksum, reportArtifactPath } from "./artifact";

type RpcError = { code: string; message: string };

function descriptorFromRow(row: unknown): ReportArtifactDescriptor {
  const item = (Array.isArray(row) ? row[0] : row) as
    ReportArtifactDescriptor | undefined;
  if (!item?.report_id) throw new Error("The report artifact is unavailable.");
  return item;
}

export async function getReportArtifactDescriptor(
  reportId: string,
): Promise<ReportArtifactDescriptor> {
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("get_report_artifact_descriptor", {
    target_report_id: reportId,
  });
  if (result.error) throw new Error("The report artifact is unavailable.");
  return descriptorFromRow(result.data);
}

function digest(bytes: Uint8Array) {
  return reportArtifactChecksum(bytes);
}

async function downloadAndVerify(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  path: string,
  expectedChecksum: string,
  expectedSize?: number | null,
) {
  const result = await supabase.storage
    .from(REPORT_ARTIFACT_BUCKET)
    .download(path);
  if (result.error || !result.data)
    throw new Error("The stored report artifact is unavailable.");
  const bytes = new Uint8Array(await result.data.arrayBuffer());
  if (
    digest(bytes) !== expectedChecksum ||
    (expectedSize !== null &&
      expectedSize !== undefined &&
      bytes.byteLength !== expectedSize)
  ) {
    throw new Error(
      "The stored report artifact failed integrity verification.",
    );
  }
  return Buffer.from(bytes);
}

function rpcMessage(error: RpcError) {
  const known: Record<string, string> = {
    REPORT_FORBIDDEN: "You are not authorized for this report workflow.",
    REPORT_NOT_CURRENT:
      "This report is no longer the current publication candidate.",
    REPORT_WORKFLOW_CONFLICT:
      "Another workflow change won. Refresh and try again.",
    REPORT_ARTIFACT_ALREADY_REGISTERED:
      "This report already has an immutable PDF artifact.",
    REPORT_ARTIFACT_INVALID: "The generated PDF artifact is invalid.",
    REPORT_NOT_REVIEWABLE: "This report is not ready for review.",
    REPORT_NOT_PUBLISHABLE: "This report is not ready for publication.",
    REPORT_NOT_WITHDRAWABLE: "This report is not currently published.",
    REPORT_WITHDRAWAL_REASON_REQUIRED: "Enter a withdrawal reason.",
  };
  const code = error.message.match(/REPORT_[A-Z_]+/)?.[0] ?? error.code;
  return {
    code,
    message: known[code] ?? "The report workflow could not be completed.",
  };
}

export async function materializeReportArtifact(
  reportId: string,
  expectedWorkflowVersion?: number,
) {
  const supabase = await createServerSupabaseClient();
  const current = await supabase.rpc("get_report_artifact_descriptor", {
    target_report_id: reportId,
  });
  if (current.error) throw new Error("The report artifact is unavailable.");
  const descriptor = descriptorFromRow(current.data);
  if (
    descriptor.has_artifact &&
    descriptor.storage_path &&
    descriptor.file_checksum
  ) {
    return descriptor;
  }

  const report = await getGeneratedReport(reportId);
  const subjects = await getReportSubjects(reportId);
  const bytes = await renderReportCardPdf({ report, subjects });
  if (bytes.byteLength <= 0 || bytes.byteLength > REPORT_ARTIFACT_MAX_BYTES)
    throw new Error("The generated PDF artifact is too large.");

  const checksum = digest(bytes);
  const path = reportArtifactPath(reportId, checksum);
  const storage = supabase.storage.from(REPORT_ARTIFACT_BUCKET);
  let uploadedByRequest = false;
  const upload = await storage.upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (!upload.error) uploadedByRequest = true;

  // A retry may find the deterministic object already present after a prior
  // upload/registration crash. It is usable only after byte verification.
  await downloadAndVerify(supabase, path, checksum, bytes.byteLength);

  const registered = await supabase.rpc("register_report_pdf_artifact", {
    target_report_id: reportId,
    expected_workflow_version:
      expectedWorkflowVersion ?? descriptor.workflow_version,
    artifact_storage_path: path,
    artifact_checksum: checksum,
    artifact_size_bytes: bytes.byteLength,
    renderer_version: REPORT_PDF_RENDERER_VERSION,
  });
  if (registered.error) {
    const after = await supabase.rpc("get_report_artifact_descriptor", {
      target_report_id: reportId,
    });
    const afterDescriptor = !after.error
      ? descriptorFromRow(after.data)
      : undefined;
    if (
      afterDescriptor?.has_artifact &&
      afterDescriptor.file_checksum === checksum &&
      afterDescriptor.storage_path === path
    ) {
      return afterDescriptor;
    }
    if (uploadedByRequest) await storage.remove([path]);
    throw new Error(rpcMessage(registered.error).message);
  }
  return descriptorFromRow(registered.data);
}

export async function downloadReportArtifact(reportId: string) {
  const supabase = await createServerSupabaseClient();
  const descriptorResult = await supabase.rpc(
    "get_report_artifact_descriptor",
    {
      target_report_id: reportId,
    },
  );
  if (descriptorResult.error)
    throw new Error("The report artifact is unavailable.");
  const descriptor = descriptorFromRow(descriptorResult.data);
  if (
    !descriptor.has_artifact ||
    !descriptor.storage_path ||
    !descriptor.file_checksum
  )
    throw new Error("The report artifact is unavailable.");
  const bytes = await downloadAndVerify(
    supabase,
    descriptor.storage_path,
    descriptor.file_checksum,
    descriptor.file_size,
  );
  const audit = await supabase.rpc("record_report_artifact_access", {
    target_report_id: reportId,
    verified_checksum: descriptor.file_checksum,
  });
  if (audit.error) throw new Error("The report artifact is unavailable.");
  return { bytes, descriptor };
}

export { rpcMessage };
