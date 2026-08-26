"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  aggregateClassificationSchema,
  aggregateClassificationUpdateSchema,
  aggregateClassificationVersionSchema,
  calculateResultsSchema,
} from "./schemas";
import type { ResultActionResult } from "./types";

type UntypedRpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code: string; message: string } | null;
  }>;
};

function invalid(message: string, code?: string): ResultActionResult {
  return { ok: false, message, code };
}

function mapError(error: {
  code: string;
  message: string;
}): ResultActionResult {
  const code = error.message.match(/RESULT_[A-Z_]+/)?.[0] ?? error.code;
  const messages: Record<string, string> = {
    RESULT_TERM_NOT_LOCKED:
      "This term is not locked. Results can only be calculated after the marks workflow is locked.",
    RESULT_SCOPE_INCOMPLETE:
      "The grade scope is incomplete. Every active class and curriculum subject needs its latest source sheet.",
    RESULT_SOURCE_NOT_LOCKED: "The latest mark-sheet revision is not locked.",
    RESULT_SOURCE_NOT_LATEST:
      "A historical mark-sheet revision was selected. Recheck the latest correction revision.",
    RESULT_GRADING_SCALE_INVALID:
      "The selected grading scale is not active or does not apply to this school, year, and grade.",
    RESULT_GRADING_BAND_MISSING:
      "A calculated score does not map to exactly one grading band.",
    RESULT_AGGREGATE_CONFIGURATION_INVALID:
      "The selected aggregate classification configuration is invalid for this scope.",
    RESULT_RANKING_RULE_INVALID:
      "The selected ranking rule is not active or does not apply to this scope.",
    RESULT_CLASSIFICATION_UNMATCHED:
      "An aggregate total does not match the selected classification scale.",
    RESULT_CALCULATION_CONFLICT:
      "Another calculation won the versioning race. Refresh to see the current run.",
    RESULT_CALCULATION_FORBIDDEN:
      "Your selected school membership cannot calculate or review whole-school results.",
  };
  if (error.code === "40001" || code === "RESULT_CALCULATION_CONFLICT")
    return invalid(messages.RESULT_CALCULATION_CONFLICT, code);
  if (error.code === "42501")
    return invalid(messages.RESULT_CALCULATION_FORBIDDEN, code);
  return invalid(
    messages[code] ??
      "The results calculation could not be completed. No partial results were saved.",
    code,
  );
}

export async function calculateGradeResultsAction(
  input: unknown,
): Promise<ResultActionResult> {
  const parsed = calculateResultsSchema.safeParse(input);
  if (!parsed.success)
    return invalid(
      parsed.error.issues[0]?.message ?? "Select valid calculation inputs.",
    );
  await requirePermission("REPORTS_GENERATE");
  const supabase =
    (await createServerSupabaseClient()) as unknown as UntypedRpcClient;
  const result = await supabase.rpc("calculate_grade_results", {
    target_term_id: parsed.data.termId,
    target_grade_level_id: parsed.data.gradeLevelId,
    target_grading_scale_id: parsed.data.gradingScaleId,
    target_ranking_rule_id: parsed.data.rankingRuleId,
    target_aggregate_classification_scale_id: parsed.data.classificationScaleId,
  });
  if (result.error) {
    console.error("Results calculation failed.", { code: result.error.code });
    return mapError(result.error);
  }
  const row = (
    result.data as
      | {
          calculation_run_id: string;
          calculation_version: number;
          reused: boolean;
        }[]
      | null
  )?.[0];
  revalidatePath("/dashboard/results");
  if (row) revalidatePath(`/dashboard/results/${row.calculation_run_id}`);
  return {
    ok: true,
    message: row?.reused
      ? "The identical calculation already exists; no new version was created."
      : "Results calculation completed.",
    runId: row?.calculation_run_id,
    version: row?.calculation_version,
    reused: row?.reused,
  };
}

function classificationBands(
  value: {
    minimumAggregate: number;
    maximumAggregate: number;
    label: string;
    description: string;
    sortOrder: number;
  }[],
) {
  return value.map((band) => ({
    minimum_aggregate: band.minimumAggregate,
    maximum_aggregate: band.maximumAggregate,
    label: band.label,
    description: band.description,
    sort_order: band.sortOrder,
  }));
}

async function configurationMutation(
  name: string,
  args: Record<string, unknown>,
  success: string,
): Promise<ResultActionResult> {
  await requirePermission("ACADEMIC_CONFIGURATION_MANAGE");
  const supabase =
    (await createServerSupabaseClient()) as unknown as UntypedRpcClient;
  const result = await supabase.rpc(name, args);
  if (result.error) return mapError(result.error);
  revalidatePath("/dashboard/academic");
  revalidatePath("/dashboard/academic/aggregate-classifications");
  revalidatePath("/dashboard/results");
  return { ok: true, message: success };
}

export async function saveAggregateClassificationAction(
  input: unknown,
): Promise<ResultActionResult> {
  const parsed = aggregateClassificationSchema.safeParse(input);
  if (!parsed.success)
    return invalid(
      parsed.error.issues[0]?.message ?? "Enter valid classification bands.",
    );
  return configurationMutation(
    "save_aggregate_classification_scale",
    {
      target_scale_id: null,
      expected_updated_at: null,
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      scale_name: parsed.data.name,
      scale_bands: classificationBands(parsed.data.bands),
    },
    "Draft classification scale saved.",
  );
}

export async function updateAggregateClassificationAction(
  input: unknown,
): Promise<ResultActionResult> {
  const parsed = aggregateClassificationUpdateSchema.safeParse(input);
  if (!parsed.success)
    return invalid(
      parsed.error.issues[0]?.message ?? "Enter valid classification bands.",
    );
  return configurationMutation(
    "save_aggregate_classification_scale",
    {
      target_scale_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      scale_name: parsed.data.name,
      scale_bands: classificationBands(parsed.data.bands),
    },
    "Draft classification scale updated.",
  );
}

export async function createAggregateClassificationVersionAction(
  input: unknown,
): Promise<ResultActionResult> {
  const parsed = aggregateClassificationVersionSchema.safeParse(input);
  if (!parsed.success)
    return invalid(
      parsed.error.issues[0]?.message ?? "Enter valid classification bands.",
    );
  return configurationMutation(
    "create_aggregate_classification_scale_version",
    {
      source_scale_id: parsed.data.sourceId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      scale_name: parsed.data.name,
      scale_bands: classificationBands(parsed.data.bands),
    },
    "New draft classification version created.",
  );
}

export async function transitionAggregateClassificationAction(input: {
  id: string;
  expectedUpdatedAt: string;
  active: boolean;
}): Promise<ResultActionResult> {
  return configurationMutation(
    input.active
      ? "activate_aggregate_classification_scale"
      : "deactivate_aggregate_classification_scale",
    {
      target_scale_id: input.id,
      expected_updated_at: input.expectedUpdatedAt,
    },
    input.active
      ? "Classification scale activated."
      : "Classification scale retired.",
  );
}
