"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { overrideReasonSchema, promotionOutcomeSchema } from "./schemas";

type Result = { ok: true; message: string } | { ok: false; message: string };

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

function message(error: { code?: string; message: string }) {
  if (error.code === "42501")
    return "Your selected membership is not authorized for this promotion action.";
  if (error.message.includes("PROMOTION_RECOMMENDATION_STALE"))
    return "This recommendation is stale. Refresh results and reopen it before confirming.";
  if (error.message.includes("CLASS_CAPACITY_REACHED"))
    return "The selected target class is full.";
  if (error.message.includes("PROMOTION_OVERRIDE_REASON_REQUIRED"))
    return "An override reason of 3–2000 characters is required.";
  if (error.message.includes("PROMOTION_RESULTS_UNAVAILABLE"))
    return "Authoritative results are unavailable. Resolve this in the results workflow.";
  if (error.message.includes("PROMOTION_RULE_UNAVAILABLE"))
    return "No active promotion rule is configured.";
  return "The promotion action could not be completed. Refresh and try again.";
}

async function rpc(
  name: string,
  args: Record<string, unknown>,
): Promise<Result> {
  const client = (await createServerSupabaseClient()) as unknown as RpcClient;
  const result = await client.rpc(name, args);
  if (result.error) return { ok: false, message: message(result.error) };
  revalidatePath("/dashboard/promotion");
  return { ok: true, message: "Promotion workflow updated." };
}

export async function generatePromotionRecommendations(
  termId: string,
  gradeId: string,
): Promise<Result> {
  await requirePermission("PROMOTION_CONFIRM");
  return rpc("generate_promotion_recommendations", {
    target_term_id: termId,
    target_grade_level_id: gradeId,
  });
}

export async function confirmPromotionDecision(
  decisionId: string,
  finalDecision: string,
  reason: string,
): Promise<Result> {
  await requirePermission("PROMOTION_CONFIRM");
  const outcome = promotionOutcomeSchema.safeParse(finalDecision);
  if (!outcome.success)
    return { ok: false, message: "Choose a valid final decision." };
  if (reason && !overrideReasonSchema.safeParse(reason).success)
    return { ok: false, message: "Reason must be 3–2000 characters." };
  return rpc("confirm_promotion_decision", {
    target_decision_id: decisionId,
    target_final_decision: outcome.data,
    decision_reason: reason || null,
  });
}

export async function reopenPromotionDecision(
  decisionId: string,
  reason: string,
): Promise<Result> {
  await requirePermission("PROMOTION_CONFIRM");
  const parsed = overrideReasonSchema.safeParse(reason);
  if (!parsed.success)
    return {
      ok: false,
      message: "A reopen reason of 3–2000 characters is required.",
    };
  return rpc("reopen_promotion_decision", {
    target_decision_id: decisionId,
    reopen_reason: parsed.data,
  });
}

export async function applyStudentProgression(
  decisionId: string,
  yearId: string | null,
  classId: string | null,
): Promise<Result> {
  await requirePermission("PROMOTION_CONFIRM");
  return rpc("apply_student_progression", {
    target_decision_id: decisionId,
    target_academic_year_id: yearId,
    target_class_section_id: classId,
  });
}
