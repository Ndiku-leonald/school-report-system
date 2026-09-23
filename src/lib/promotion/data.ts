import "server-only";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type {
  PromotionRecommendation,
  PromotionScope,
  PromotionTargetClass,
} from "./types";

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

async function client() {
  return (await createServerSupabaseClient()) as unknown as RpcClient;
}

function rows<T>(data: unknown) {
  return (Array.isArray(data) ? data : []) as T[];
}

async function read<T>(name: string, args?: Record<string, unknown>) {
  const result = await (await client()).rpc(name, args);
  if (result.error) {
    console.error("Promotion query failed.", {
      code: result.error.code,
      operation: name,
    });
    throw new Error("Promotion data could not be loaded.");
  }
  return rows<T>(result.data);
}

export async function getPromotionScopes() {
  await requirePermission("PROMOTION_VIEW");
  return read<PromotionScope>("list_promotion_scopes");
}

export async function getPromotionRecommendations(
  termId: string,
  gradeId: string,
) {
  await requirePermission("PROMOTION_VIEW");
  return read<PromotionRecommendation>("list_promotion_recommendations", {
    target_term_id: termId,
    target_grade_level_id: gradeId,
  });
}

export async function getPromotionTargetClasses(decisionId: string) {
  await requirePermission("PROMOTION_VIEW");
  return read<PromotionTargetClass>("list_promotion_target_classes", {
    target_decision_id: decisionId,
  });
}
