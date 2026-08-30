"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { materializeReportArtifact, rpcMessage } from "./service";
import type { PublicationActionResult } from "./types";

const reportId = z.uuid();
const workflowVersion = z.number().int().nonnegative();

function invalid(message: string, code?: string): PublicationActionResult {
  return { ok: false, message, code };
}

export async function storeReportArtifactAction(input: unknown) {
  const parsed = z
    .object({ reportId, expectedWorkflowVersion: workflowVersion.optional() })
    .safeParse(input);
  if (!parsed.success) return invalid("Select a valid report.");
  try {
    const descriptor = await materializeReportArtifact(
      parsed.data.reportId,
      parsed.data.expectedWorkflowVersion,
    );
    revalidatePath(`/dashboard/reports/${parsed.data.reportId}`);
    return { ok: true, message: "Private PDF artifact stored.", descriptor };
  } catch (error) {
    return invalid(
      error instanceof Error
        ? error.message
        : "The PDF artifact could not be stored.",
    );
  }
}

async function mutate(
  name: "review_generated_report" | "publish_reviewed_report",
  reportIdValue: string,
  expectedWorkflowVersionValue: number,
): Promise<PublicationActionResult> {
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc(name, {
    target_report_id: reportIdValue,
    expected_workflow_version: expectedWorkflowVersionValue,
  });
  if (result.error) {
    const mapped = rpcMessage(result.error);
    return invalid(mapped.message, mapped.code);
  }
  revalidatePath(`/dashboard/reports/${reportIdValue}`);
  revalidatePath("/dashboard/reports");
  return {
    ok: true,
    message:
      name === "publish_reviewed_report"
        ? "Report published."
        : "Report marked reviewed.",
  };
}

export async function reviewGeneratedReportAction(input: unknown) {
  const parsed = z
    .object({ reportId, expectedWorkflowVersion: workflowVersion })
    .safeParse(input);
  if (!parsed.success)
    return invalid("Refresh the report before reviewing it.");
  return mutate(
    "review_generated_report",
    parsed.data.reportId,
    parsed.data.expectedWorkflowVersion,
  );
}

export async function publishReviewedReportAction(input: unknown) {
  const parsed = z
    .object({ reportId, expectedWorkflowVersion: workflowVersion })
    .safeParse(input);
  if (!parsed.success)
    return invalid("Refresh the report before publishing it.");
  return mutate(
    "publish_reviewed_report",
    parsed.data.reportId,
    parsed.data.expectedWorkflowVersion,
  );
}

export async function withdrawPublishedReportAction(input: unknown) {
  const parsed = z
    .object({
      reportId,
      expectedWorkflowVersion: workflowVersion,
      reason: z.string().trim().min(1).max(1000),
    })
    .safeParse(input);
  if (!parsed.success) return invalid("Enter a withdrawal reason.");
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("withdraw_published_report", {
    target_report_id: parsed.data.reportId,
    expected_workflow_version: parsed.data.expectedWorkflowVersion,
    withdrawal_reason: parsed.data.reason,
  });
  if (result.error) {
    const mapped = rpcMessage(result.error);
    return invalid(mapped.message, mapped.code);
  }
  revalidatePath(`/dashboard/reports/${parsed.data.reportId}`);
  revalidatePath("/dashboard/reports");
  return { ok: true, message: "Report publication withdrawn." };
}
