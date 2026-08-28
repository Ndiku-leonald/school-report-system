"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { reportSnapshotGenerationSchema } from "./schemas";
import type { ReportActionResult } from "./types";

function invalid(message: string, code?: string): ReportActionResult {
  return { ok: false, message, code };
}

function mapError(error: {
  code: string;
  message: string;
}): ReportActionResult {
  const code = error.message.match(/REPORT_[A-Z_]+/)?.[0] ?? error.code;
  const messages: Record<string, string> = {
    REPORT_SOURCE_INVALID:
      "These locked results are not ready for report generation.",
    REPORT_SOURCE_NOT_FOUND: "The selected calculation run is unavailable.",
    REPORT_CALCULATION_MISMATCH:
      "The selected student is not part of this calculation run.",
    REPORT_ALREADY_SUPERSEDED:
      "A newer report version already exists for this student.",
    REPORT_SNAPSHOT_CONFLICT:
      "Another report request won the concurrency race. Refresh the report list.",
    REPORT_SNAPSHOT_SCHEMA_ERROR:
      "The immutable report source is incomplete and no report was saved.",
    REPORT_GENERATION_FORBIDDEN:
      "Your selected school membership cannot generate reports.",
    RESULT_CALCULATION_FORBIDDEN:
      "Your selected school membership cannot generate reports.",
  };
  if (error.code === "40001")
    return invalid(messages.REPORT_SNAPSHOT_CONFLICT, code);
  if (error.code === "42501")
    return invalid(messages.REPORT_GENERATION_FORBIDDEN, code);
  return invalid(
    messages[code] ??
      "The report snapshots could not be generated. No partial reports were saved.",
    code,
  );
}

export async function generateGradeReportSnapshotsAction(
  input: unknown,
): Promise<ReportActionResult> {
  const parsed = reportSnapshotGenerationSchema.safeParse(input);
  if (!parsed.success)
    return invalid(parsed.error.issues[0]?.message ?? "Select valid results.");
  await requirePermission("REPORTS_GENERATE");
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("generate_grade_report_snapshots", {
    target_calculation_run_id: parsed.data.calculationRunId,
  });
  if (result.error) return mapError(result.error);
  const row = (
    result.data as
      | {
          batch_id: string;
          generated_count: number;
          reused_count: number;
        }[]
      | null
  )?.[0];
  revalidatePath("/dashboard/reports");
  if (row) revalidatePath(`/dashboard/results/${parsed.data.calculationRunId}`);
  return {
    ok: true,
    message: row?.reused_count
      ? `Report generation complete: ${row.generated_count} created and ${row.reused_count} already existed.`
      : `Report generation complete: ${row?.generated_count ?? 0} reports created.`,
    batchId: row?.batch_id,
    generatedCount: row?.generated_count,
    reusedCount: row?.reused_count,
  };
}
