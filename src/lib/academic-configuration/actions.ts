"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  academicYearSchema,
  assessmentSchemeSchema,
  classSectionSchema,
  curriculumMappingSchema,
  gradeLevelSchema,
  gradingScaleSchema,
  promotionRuleSchema,
  rankingRuleSchema,
  subjectSchema,
  termSchema,
} from "./schemas";

export type ConfigurationActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; conflict?: boolean };

type RpcResult = Promise<{
  data: unknown;
  error: { code?: string; message: string } | null;
}>;

type ConfigurationRpcClient = {
  rpc(name: string, args: Record<string, unknown>): RpcResult;
};

function actionError(error: { code?: string; message: string }) {
  const conflict =
    error.code === "40001" ||
    error.message.includes("ACADEMIC_CONFIGURATION_CONFLICT");

  if (conflict) {
    return {
      ok: false,
      conflict: true,
      message: "This record changed elsewhere. Refresh the page and try again.",
    } satisfies ConfigurationActionResult;
  }

  if (error.code === "42501") {
    return {
      ok: false,
      message: "You no longer have permission to change this configuration.",
    } satisfies ConfigurationActionResult;
  }

  if (error.code === "23505" || error.code === "23P01") {
    return {
      ok: false,
      message: "That value conflicts with existing school configuration.",
    } satisfies ConfigurationActionResult;
  }

  return {
    ok: false,
    message:
      "The configuration change could not be saved. Review the values and try again.",
  } satisfies ConfigurationActionResult;
}

async function runMutation(
  name: string,
  args: Record<string, unknown>,
  successMessage: string,
): Promise<ConfigurationActionResult> {
  await requirePermission("ACADEMIC_CONFIGURATION_MANAGE");
  const supabase = await createServerSupabaseClient();
  const rpc = supabase as unknown as ConfigurationRpcClient;
  const { error } = await rpc.rpc(name, args);

  if (error) {
    console.error("Academic configuration mutation failed.", {
      code: error.code,
      operation: name,
    });
    return actionError(error);
  }

  revalidatePath("/dashboard/academic", "layout");
  return { ok: true, message: successMessage };
}

export async function createAcademicYear(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = academicYearSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid year.",
    };
  }

  return runMutation(
    "create_academic_year",
    {
      year_name: parsed.data.name,
      year_starts_on: parsed.data.startsOn,
      year_ends_on: parsed.data.endsOn,
    },
    "Draft academic year created.",
  );
}

export async function createGradeLevel(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = gradeLevelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid grade.",
    };
  }

  return runMutation(
    "create_grade_level",
    {
      grade_code: parsed.data.code,
      grade_name: parsed.data.name,
      grade_sort_order: parsed.data.sortOrder,
      grade_is_final: parsed.data.isFinalGrade,
    },
    "Grade level created.",
  );
}

export async function createSubject(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = subjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid subject.",
    };
  }

  return runMutation(
    "create_subject",
    {
      subject_code: parsed.data.code,
      subject_name: parsed.data.name,
      subject_description: parsed.data.description,
      subject_is_core: parsed.data.isCore,
      subject_contributes_to_aggregate: parsed.data.contributesToAggregate,
      subject_sort_order: parsed.data.sortOrder,
    },
    "Subject created.",
  );
}

export async function createTerm(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid term.",
    };
  }
  return runMutation(
    "create_term",
    {
      target_academic_year_id: parsed.data.academicYearId,
      term_name: parsed.data.name,
      target_term_number: parsed.data.termNumber,
      term_starts_on: parsed.data.startsOn,
      term_ends_on: parsed.data.endsOn,
      promotion_term: parsed.data.isPromotionTerm,
    },
    "Draft term created.",
  );
}

export async function createClassSection(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = classSectionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid class.",
    };
  }
  return runMutation(
    "create_class_section",
    {
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      section_name: parsed.data.name,
      section_code: parsed.data.classCode,
      section_capacity: parsed.data.capacity,
    },
    "Class section created.",
  );
}

export async function setCurriculumMapping(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = curriculumMappingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid mapping.",
    };
  }
  return runMutation(
    "set_grade_level_subject",
    {
      target_grade_level_id: parsed.data.gradeLevelId,
      target_subject_id: parsed.data.subjectId,
      mapping_required: parsed.data.isRequired,
      mapping_contributes_to_aggregate: parsed.data.contributesToAggregate,
      mapping_sort_order: parsed.data.sortOrder,
      target_mapping_id: null,
      expected_updated_at: null,
    },
    "Curriculum mapping saved.",
  );
}

export async function saveAssessmentScheme(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = assessmentSchemeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid scheme.",
    };
  }
  return runMutation(
    "save_assessment_scheme_draft",
    {
      target_scheme_id: null,
      expected_updated_at: null,
      target_term_id: parsed.data.termId,
      target_grade_level_id: parsed.data.gradeLevelId,
      target_subject_id: parsed.data.subjectId,
      scheme_name: parsed.data.name,
      scheme_effective_from: parsed.data.effectiveFrom,
      scheme_components: parsed.data.components.map((component) => ({
        name: component.name,
        component_code: component.componentCode,
        maximum_score: component.maximumScore,
        weight_percentage: component.weightPercentage,
        sort_order: component.sortOrder,
        is_required: component.isRequired,
      })),
    },
    "Draft assessment scheme saved.",
  );
}

export async function saveGradingScale(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = gradingScaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid scale.",
    };
  }
  return runMutation(
    "save_grading_scale_draft",
    {
      target_scale_id: null,
      expected_updated_at: null,
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      scale_name: parsed.data.name,
      scale_effective_from: parsed.data.effectiveFrom,
      scale_bands: parsed.data.bands.map((band) => ({
        minimum_score: band.minimumScore,
        maximum_score: band.maximumScore,
        grade: band.grade,
        aggregate_points: band.aggregatePoints,
        description: band.description,
        is_pass: band.isPass,
        sort_order: band.sortOrder,
      })),
    },
    "Draft grading scale saved.",
  );
}

export async function saveRankingRule(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = rankingRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid rule.",
    };
  }
  return runMutation(
    "save_ranking_rule",
    {
      target_rule_id: null,
      expected_updated_at: null,
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      rule_name: parsed.data.name,
      rule_ranking_basis: parsed.data.rankingBasis,
      rule_tie_method: parsed.data.tieMethod,
      rule_configuration: parsed.data.configuration,
    },
    "Draft ranking rule saved.",
  );
}

export async function savePromotionRule(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = promotionRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid rule.",
    };
  }
  return runMutation(
    "save_promotion_rule",
    {
      target_rule_id: null,
      expected_updated_at: null,
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      rule_name: parsed.data.name,
      rule_minimum_average: parsed.data.minimumAverage,
      rule_maximum_aggregate: parsed.data.maximumAggregate,
      rule_minimum_subjects_passed: parsed.data.minimumSubjectsPassed,
      rule_minimum_attendance_percentage:
        parsed.data.minimumAttendancePercentage,
      rule_required_subjects: parsed.data.requiredSubjectRules,
      rule_additional_configuration: parsed.data.additionalRules,
    },
    "Draft promotion rule saved.",
  );
}

export type ConfigurationTransition =
  | "activate-year"
  | "close-year"
  | "archive-year"
  | "open-term"
  | "activate-grade"
  | "deactivate-grade"
  | "activate-class"
  | "deactivate-class"
  | "activate-subject"
  | "deactivate-subject"
  | "remove-mapping"
  | "activate-scheme"
  | "retire-scheme"
  | "activate-scale"
  | "deactivate-scale"
  | "activate-ranking"
  | "deactivate-ranking"
  | "activate-promotion"
  | "deactivate-promotion";

export async function transitionConfiguration(
  transition: ConfigurationTransition,
  id: string,
  expectedUpdatedAt: string,
): Promise<ConfigurationActionResult> {
  const operations: Record<
    ConfigurationTransition,
    { name: string; args: Record<string, unknown>; message: string }
  > = {
    "activate-year": {
      name: "activate_academic_year",
      args: { target_year_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Academic year activated.",
    },
    "close-year": {
      name: "close_academic_year",
      args: { target_year_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Academic year closed.",
    },
    "archive-year": {
      name: "archive_academic_year",
      args: { target_year_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Academic year archived.",
    },
    "open-term": {
      name: "open_term",
      args: { target_term_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Term opened.",
    },
    "activate-grade": {
      name: "set_grade_level_active",
      args: {
        target_grade_level_id: id,
        expected_updated_at: expectedUpdatedAt,
        target_active: true,
      },
      message: "Grade level activated.",
    },
    "deactivate-grade": {
      name: "set_grade_level_active",
      args: {
        target_grade_level_id: id,
        expected_updated_at: expectedUpdatedAt,
        target_active: false,
      },
      message: "Grade level deactivated.",
    },
    "activate-class": {
      name: "set_class_section_active",
      args: {
        target_class_section_id: id,
        expected_updated_at: expectedUpdatedAt,
        target_active: true,
      },
      message: "Class section activated.",
    },
    "deactivate-class": {
      name: "set_class_section_active",
      args: {
        target_class_section_id: id,
        expected_updated_at: expectedUpdatedAt,
        target_active: false,
      },
      message: "Class section deactivated.",
    },
    "activate-subject": {
      name: "set_subject_active",
      args: {
        target_subject_id: id,
        expected_updated_at: expectedUpdatedAt,
        target_active: true,
      },
      message: "Subject activated.",
    },
    "deactivate-subject": {
      name: "set_subject_active",
      args: {
        target_subject_id: id,
        expected_updated_at: expectedUpdatedAt,
        target_active: false,
      },
      message: "Subject deactivated.",
    },
    "remove-mapping": {
      name: "remove_grade_level_subject",
      args: { target_mapping_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Unused curriculum mapping removed.",
    },
    "activate-scheme": {
      name: "activate_assessment_scheme",
      args: { target_scheme_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Assessment scheme activated.",
    },
    "retire-scheme": {
      name: "retire_assessment_scheme",
      args: { target_scheme_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Assessment scheme retired.",
    },
    "activate-scale": {
      name: "activate_grading_scale",
      args: { target_scale_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Grading scale activated.",
    },
    "deactivate-scale": {
      name: "deactivate_grading_scale",
      args: { target_scale_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Grading scale retired.",
    },
    "activate-ranking": {
      name: "activate_ranking_rule",
      args: { target_rule_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Ranking rule activated.",
    },
    "deactivate-ranking": {
      name: "deactivate_ranking_rule",
      args: { target_rule_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Ranking rule retired.",
    },
    "activate-promotion": {
      name: "activate_promotion_rule",
      args: { target_rule_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Promotion rule activated.",
    },
    "deactivate-promotion": {
      name: "deactivate_promotion_rule",
      args: { target_rule_id: id, expected_updated_at: expectedUpdatedAt },
      message: "Promotion rule retired.",
    },
  };
  const operation = operations[transition];
  return runMutation(operation.name, operation.args, operation.message);
}
