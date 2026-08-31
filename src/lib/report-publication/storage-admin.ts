import "server-only";

import { createAdministrativeSupabaseClient } from "@/lib/supabase/admin";

import { REPORT_ARTIFACT_BUCKET, REPORT_ARTIFACT_MAX_BYTES } from "./types";

// This is the only Stage 14 module allowed to use the service-role transport.
// It never authorizes a report, reads academic data, or performs workflow RPCs.
export async function uploadPrivateReportArtifact(
  path: string,
  bytes: Uint8Array,
) {
  const { error } = await createAdministrativeSupabaseClient()
    .storage.from(REPORT_ARTIFACT_BUCKET)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (error) throw error;
}

export async function downloadPrivateReportArtifact(path: string) {
  const { data, error } = await createAdministrativeSupabaseClient()
    .storage.from(REPORT_ARTIFACT_BUCKET)
    .download(path);
  if (error || !data) throw error ?? new Error("Artifact download failed.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > REPORT_ARTIFACT_MAX_BYTES)
    throw new Error("Artifact size is invalid.");
  return Buffer.from(bytes);
}

export async function removeUnregisteredReportArtifact(path: string) {
  const { error } = await createAdministrativeSupabaseClient()
    .storage.from(REPORT_ARTIFACT_BUCKET)
    .remove([path]);
  if (error) throw error;
}
