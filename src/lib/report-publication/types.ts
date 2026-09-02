import type { Database } from "@/types/database.generated";

export const REPORT_PDF_RENDERER_VERSION = "report-card-v1";
export const REPORT_ARTIFACT_BUCKET = "report-artifacts";
export const REPORT_ARTIFACT_MAX_BYTES = 10 * 1024 * 1024;

export type ReportArtifactDescriptor = {
  report_id: string;
  status: Database["public"]["Enums"]["report_status"];
  report_version: number;
  workflow_version: number;
  has_artifact: boolean;
  file_checksum: string | null;
  file_size: number | null;
  renderer_version: string | null;
  stored_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  withdrawn_at: string | null;
  storage_path: string | null;
};

export type PublicationActionResult =
  | { ok: true; message: string; descriptor?: ReportArtifactDescriptor }
  | { ok: false; message: string; code?: string };
