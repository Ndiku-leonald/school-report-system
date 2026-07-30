"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database.generated";

import {
  academicYearSchema,
  academicYearUpdateSchema,
  assessmentSchemeSchema,
  assessmentSchemeUpdateSchema,
  assessmentSchemeVersionSchema,
  classSectionSchema,
  classSectionUpdateSchema,
  curriculumMappingSchema,
  curriculumMappingUpdateSchema,
  gradeLevelSchema,
  gradeLevelUpdateSchema,
  gradingScaleSchema,
  gradingScaleUpdateSchema,
  gradingScaleVersionSchema,
  mutationIdentitySchema,
  promotionRuleSchema,
  promotionRuleUpdateSchema,
  promotionRuleVersionSchema,
  rankingRuleSchema,
  rankingRuleUpdateSchema,
  rankingRuleVersionSchema,
  reorderConfigurationSchema,
  subjectSchema,
  subjectUpdateSchema,
  termSchema,
  termUpdateSchema,
} from "./schemas";

export type ConfigurationActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; conflict?: boolean };

type PublicFunctions = Database["public"]["Functions"];
type PublicFunctionName = keyof PublicFunctions;
type PublicFunctionArgs<Name extends PublicFunctionName> =
  PublicFunctions[Name]["Args"];

function invalid(message: string): ConfigurationActionResult {
  return { ok: false, message };
}

function actionError(error: { code?: string; message: string }) {
  const conflict =
    error.code === "40001" ||
    error.code === "PT409" ||
    error.message.includes("ACADEMIC_CONFIGURATION_CONFLICT");

  if (conflict) {
    return {
      ok: false,
      conflict: true,
      message: "This record changed elsewhere. Refresh the page and try again.",
    } satisfies ConfigurationActionResult;
  }

  if (error.code === "42501") {
    return invalid(
      "You no longer have permission to change this configuration.",
    );
  }

  if (error.message.includes("CLASS_SCOPE_IN_USE")) {
    return invalid(
      "This class already has academic records or assignments. Its year and grade can no longer be changed.",
    );
  }

  if (error.message.includes("MAPPING_IN_USE")) {
    return invalid(
      "This curriculum mapping is already in use and cannot be removed.",
    );
  }

  if (error.message.includes("MAPPING_IDENTITY_IMMUTABLE")) {
    return invalid(
      "A curriculum mapping cannot be repointed. Create the new pair separately.",
    );
  }

  if (
    error.message.includes("IMMUTABLE") ||
    error.message.includes("VERSION_SOURCE_INVALID")
  ) {
    return invalid(
      "This historical configuration is immutable. Create a new version instead.",
    );
  }

  if (error.message.includes("WEIGHTS_INVALID")) {
    return invalid(
      "Assessment component weights must total exactly 100% before activation.",
    );
  }

  if (error.message.includes("BAND_COVERAGE_INVALID")) {
    return invalid(
      "Grading bands must cover 0–100 without gaps or overlaps before activation.",
    );
  }

  if (
    error.message.includes("RANKING_RULE_INVALID") ||
    error.message.includes("PROMOTION_RULE_INVALID") ||
    error.code === "22023"
  ) {
    return invalid(
      "The rule configuration is incomplete or contains unsupported values.",
    );
  }

  if (error.code === "23505" || error.code === "23P01") {
    return invalid(
      "That value conflicts with existing school configuration. Check names, dates, ordering, and version scope.",
    );
  }

  if (error.code === "55006") {
    return invalid(
      "This configuration is already in use and cannot be removed or re-scoped.",
    );
  }

  if (error.code === "23514" || error.code === "55000") {
    return invalid(
      "This change is not valid for the record’s current school, dates, or lifecycle state.",
    );
  }

  return invalid(
    "The configuration change could not be saved. Review the values and try again.",
  );
}

async function runMutation<Name extends PublicFunctionName>(
  name: Name,
  args: PublicFunctionArgs<Name>,
  successMessage: string,
  paths: readonly string[],
): Promise<ConfigurationActionResult> {
  await requirePermission("ACADEMIC_CONFIGURATION_MANAGE");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc(name, args);

  if (error) {
    console.error("Academic configuration mutation failed.", {
      code: error.code,
      operation: name,
    });
    return actionError(error);
  }

  for (const path of new Set(["/dashboard/academic", ...paths])) {
    revalidatePath(path);
  }
  return { ok: true, message: successMessage };
}

function firstIssue(
  parsed: { success: false; error: { issues: { message: string }[] } },
  fallback: string,
) {
  return invalid(parsed.error.issues[0]?.message ?? fallback);
}

const nullId = null as unknown as string;
const nullNumber = null as unknown as number;

function assessmentComponents(
  components: {
    name: string;
    componentCode: string;
    maximumScore: number;
    weightPercentage: number;
    sortOrder: number;
    isRequired: boolean;
  }[],
): Json {
  return components.map((component) => ({
    name: component.name,
    component_code: component.componentCode,
    maximum_score: component.maximumScore,
    weight_percentage: component.weightPercentage,
    sort_order: component.sortOrder,
    is_required: component.isRequired,
  }));
}

function gradingBands(
  bands: {
    minimumScore: number;
    maximumScore: number;
    grade: string;
    aggregatePoints: number | null;
    description: string;
    isPass: boolean;
    sortOrder: number;
  }[],
): Json {
  return bands.map((band) => ({
    minimum_score: band.minimumScore,
    maximum_score: band.maximumScore,
    grade: band.grade,
    aggregate_points: band.aggregatePoints,
    description: band.description,
    is_pass: band.isPass,
    sort_order: band.sortOrder,
  }));
}

function rankingConfiguration(configuration: {
  schemaVersion: 1;
  direction: "ASC" | "DESC";
  includeIncomplete: boolean;
  minimumSubjects: number | null;
  configuredMetric: "TOTAL" | "AVERAGE" | "AGGREGATE" | null;
}): Json {
  return {
    schema_version: configuration.schemaVersion,
    direction: configuration.direction,
    include_incomplete: configuration.includeIncomplete,
    minimum_subjects: configuration.minimumSubjects,
    ...(configuration.configuredMetric
      ? { configured_metric: configuration.configuredMetric }
      : {}),
  };
}

function requiredSubjectRules(
  rules: { subjectId: string; minimumScore: number }[],
): Json {
  return rules.map((rule) => ({
    subject_id: rule.subjectId,
    minimum_score: rule.minimumScore,
  }));
}

function promotionAdditionalRules(configuration: {
  schemaVersion: 1;
  requireAllRequiredSubjects: boolean;
  allowManualReview: boolean;
}): Json {
  return {
    schema_version: configuration.schemaVersion,
    require_all_required_subjects: configuration.requireAllRequiredSubjects,
    allow_manual_review: configuration.allowManualReview,
  };
}

export async function createAcademicYear(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = academicYearSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid year.");
  return runMutation(
    "create_academic_year",
    {
      year_name: parsed.data.name,
      year_starts_on: parsed.data.startsOn,
      year_ends_on: parsed.data.endsOn,
    },
    "Draft academic year created.",
    ["/dashboard/academic/years"],
  );
}

export async function updateAcademicYear(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = academicYearUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid year.");
  return runMutation(
    "update_academic_year",
    {
      target_year_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      year_name: parsed.data.name,
      year_starts_on: parsed.data.startsOn,
      year_ends_on: parsed.data.endsOn,
    },
    "Draft academic year updated.",
    ["/dashboard/academic/years"],
  );
}

export async function createTerm(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid term.");
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
    ["/dashboard/academic/years"],
  );
}

export async function updateTerm(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = termUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid term.");
  return runMutation(
    "update_term",
    {
      target_term_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      term_name: parsed.data.name,
      target_term_number: parsed.data.termNumber,
      term_starts_on: parsed.data.startsOn,
      term_ends_on: parsed.data.endsOn,
      promotion_term: parsed.data.isPromotionTerm,
    },
    "Draft term updated.",
    ["/dashboard/academic/years"],
  );
}

export async function createGradeLevel(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = gradeLevelSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid grade.");
  return runMutation(
    "create_grade_level",
    {
      grade_code: parsed.data.code,
      grade_name: parsed.data.name,
      grade_sort_order: parsed.data.sortOrder,
      grade_is_final: parsed.data.isFinalGrade,
    },
    "Grade level created.",
    ["/dashboard/academic/grade-levels"],
  );
}

export async function updateGradeLevel(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = gradeLevelUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid grade.");
  return runMutation(
    "update_grade_level",
    {
      target_grade_level_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      grade_code: parsed.data.code,
      grade_name: parsed.data.name,
      grade_sort_order: parsed.data.sortOrder,
      grade_is_final: parsed.data.isFinalGrade,
    },
    "Grade level updated.",
    ["/dashboard/academic/grade-levels"],
  );
}

export async function reorderGradeLevels(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = reorderConfigurationSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid grade order.");
  return runMutation(
    "reorder_grade_levels",
    {
      ordered_grades: parsed.data.map((item) => ({
        id: item.id,
        sort_order: item.sortOrder,
        expected_updated_at: item.expectedUpdatedAt,
      })),
    },
    "Grade levels reordered.",
    ["/dashboard/academic/grade-levels"],
  );
}

export async function createClassSection(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = classSectionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid class.");
  return runMutation(
    "create_class_section",
    {
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      section_name: parsed.data.name,
      section_code: parsed.data.classCode,
      section_capacity: parsed.data.capacity ?? nullNumber,
    },
    "Class section created.",
    ["/dashboard/academic/classes"],
  );
}

export async function updateClassSection(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = classSectionUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid class.");
  return runMutation(
    "update_class_section",
    {
      target_class_section_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      target_academic_year_id: parsed.data.academicYearId,
      target_grade_level_id: parsed.data.gradeLevelId,
      section_name: parsed.data.name,
      section_code: parsed.data.classCode,
      section_capacity: parsed.data.capacity ?? nullNumber,
    },
    "Class section updated.",
    ["/dashboard/academic/classes"],
  );
}

export async function createSubject(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = subjectSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid subject.");
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
    ["/dashboard/academic/subjects"],
  );
}

export async function updateSubject(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = subjectUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid subject.");
  return runMutation(
    "update_subject",
    {
      target_subject_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      subject_code: parsed.data.code,
      subject_name: parsed.data.name,
      subject_description: parsed.data.description,
      subject_is_core: parsed.data.isCore,
      subject_contributes_to_aggregate: parsed.data.contributesToAggregate,
      subject_sort_order: parsed.data.sortOrder,
    },
    "Subject updated.",
    ["/dashboard/academic/subjects"],
  );
}

export async function reorderSubjects(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = reorderConfigurationSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid subject order.");
  return runMutation(
    "reorder_subjects",
    {
      ordered_subjects: parsed.data.map((item) => ({
        id: item.id,
        sort_order: item.sortOrder,
        expected_updated_at: item.expectedUpdatedAt,
      })),
    },
    "Subjects reordered.",
    ["/dashboard/academic/subjects"],
  );
}

export async function createCurriculumMapping(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = curriculumMappingSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid mapping.");
  return runMutation(
    "create_grade_level_subject",
    {
      target_grade_level_id: parsed.data.gradeLevelId,
      target_subject_id: parsed.data.subjectId,
      mapping_required: parsed.data.isRequired,
      mapping_contributes_to_aggregate: parsed.data.contributesToAggregate,
      mapping_sort_order: parsed.data.sortOrder,
    },
    "Curriculum mapping created.",
    ["/dashboard/academic/curriculum"],
  );
}

export const setCurriculumMapping = createCurriculumMapping;

export async function updateCurriculumMapping(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = curriculumMappingUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid mapping.");
  return runMutation(
    "update_grade_level_subject",
    {
      target_mapping_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      mapping_required: parsed.data.isRequired,
      mapping_contributes_to_aggregate: parsed.data.contributesToAggregate,
      mapping_sort_order: parsed.data.sortOrder,
    },
    "Curriculum mapping updated.",
    ["/dashboard/academic/curriculum"],
  );
}

export async function removeCurriculumMapping(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = mutationIdentitySchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid mapping.");
  return runMutation(
    "remove_grade_level_subject",
    {
      target_mapping_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "Unused curriculum mapping removed.",
    ["/dashboard/academic/curriculum"],
  );
}

export async function saveAssessmentScheme(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = assessmentSchemeSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid scheme.");
  return runMutation(
    "save_assessment_scheme_draft",
    {
      target_scheme_id: nullId,
      expected_updated_at: nullId,
      target_term_id: parsed.data.termId,
      target_grade_level_id: parsed.data.gradeLevelId,
      target_subject_id: parsed.data.subjectId,
      scheme_name: parsed.data.name,
      scheme_effective_from: parsed.data.effectiveFrom,
      scheme_components: assessmentComponents(parsed.data.components),
    },
    "Draft assessment scheme created.",
    ["/dashboard/academic/assessment-schemes"],
  );
}

export async function updateAssessmentSchemeDraft(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = assessmentSchemeUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid scheme.");
  return runMutation(
    "save_assessment_scheme_draft",
    {
      target_scheme_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      target_term_id: parsed.data.termId,
      target_grade_level_id: parsed.data.gradeLevelId,
      target_subject_id: parsed.data.subjectId,
      scheme_name: parsed.data.name,
      scheme_effective_from: parsed.data.effectiveFrom,
      scheme_components: assessmentComponents(parsed.data.components),
    },
    "Draft assessment scheme updated.",
    ["/dashboard/academic/assessment-schemes"],
  );
}

export async function createAssessmentSchemeVersion(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = assessmentSchemeVersionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid scheme version.");
  return runMutation(
    "create_assessment_scheme_version",
    {
      source_scheme_id: parsed.data.sourceId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      scheme_name: parsed.data.name,
      scheme_effective_from: parsed.data.effectiveFrom,
      scheme_components: assessmentComponents(parsed.data.components),
    },
    "New draft assessment version created.",
    ["/dashboard/academic/assessment-schemes"],
  );
}

export async function saveGradingScale(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = gradingScaleSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid scale.");
  return runMutation(
    "save_grading_scale_draft",
    {
      target_scale_id: nullId,
      expected_updated_at: nullId,
      target_academic_year_id: parsed.data.academicYearId ?? nullId,
      target_grade_level_id: parsed.data.gradeLevelId ?? nullId,
      scale_name: parsed.data.name,
      scale_effective_from: parsed.data.effectiveFrom,
      scale_bands: gradingBands(parsed.data.bands),
    },
    "Draft grading scale created.",
    ["/dashboard/academic/grading"],
  );
}

export async function updateGradingScaleDraft(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = gradingScaleUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid scale.");
  return runMutation(
    "save_grading_scale_draft",
    {
      target_scale_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      target_academic_year_id: parsed.data.academicYearId ?? nullId,
      target_grade_level_id: parsed.data.gradeLevelId ?? nullId,
      scale_name: parsed.data.name,
      scale_effective_from: parsed.data.effectiveFrom,
      scale_bands: gradingBands(parsed.data.bands),
    },
    "Draft grading scale updated.",
    ["/dashboard/academic/grading"],
  );
}

export async function createGradingScaleVersion(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = gradingScaleVersionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid scale version.");
  return runMutation(
    "create_grading_scale_version",
    {
      source_scale_id: parsed.data.sourceId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      scale_name: parsed.data.name,
      scale_effective_from: parsed.data.effectiveFrom,
      scale_bands: gradingBands(parsed.data.bands),
    },
    "New draft grading version created.",
    ["/dashboard/academic/grading"],
  );
}

export async function saveRankingRule(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = rankingRuleSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid ranking rule.");
  return runMutation(
    "save_ranking_rule",
    {
      target_rule_id: nullId,
      expected_updated_at: nullId,
      target_academic_year_id: parsed.data.academicYearId ?? nullId,
      target_grade_level_id: parsed.data.gradeLevelId ?? nullId,
      rule_name: parsed.data.name,
      rule_ranking_basis: parsed.data.rankingBasis,
      rule_tie_method: parsed.data.tieMethod,
      rule_configuration: rankingConfiguration(parsed.data.configuration),
    },
    "Draft ranking rule created.",
    ["/dashboard/academic/ranking"],
  );
}

export async function updateRankingRuleDraft(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = rankingRuleUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid ranking rule.");
  return runMutation(
    "save_ranking_rule",
    {
      target_rule_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      target_academic_year_id: parsed.data.academicYearId ?? nullId,
      target_grade_level_id: parsed.data.gradeLevelId ?? nullId,
      rule_name: parsed.data.name,
      rule_ranking_basis: parsed.data.rankingBasis,
      rule_tie_method: parsed.data.tieMethod,
      rule_configuration: rankingConfiguration(parsed.data.configuration),
    },
    "Draft ranking rule updated.",
    ["/dashboard/academic/ranking"],
  );
}

export async function createRankingRuleVersion(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = rankingRuleVersionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid ranking version.");
  return runMutation(
    "create_ranking_rule_version",
    {
      source_rule_id: parsed.data.sourceId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      rule_name: parsed.data.name,
      rule_ranking_basis: parsed.data.rankingBasis,
      rule_tie_method: parsed.data.tieMethod,
      rule_configuration: rankingConfiguration(parsed.data.configuration),
    },
    "New draft ranking version created.",
    ["/dashboard/academic/ranking"],
  );
}

export async function savePromotionRule(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = promotionRuleSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid promotion rule.");
  return runMutation(
    "save_promotion_rule",
    {
      target_rule_id: nullId,
      expected_updated_at: nullId,
      target_academic_year_id: parsed.data.academicYearId ?? nullId,
      target_grade_level_id: parsed.data.gradeLevelId ?? nullId,
      rule_name: parsed.data.name,
      rule_minimum_average: parsed.data.minimumAverage ?? nullNumber,
      rule_maximum_aggregate: parsed.data.maximumAggregate ?? nullNumber,
      rule_minimum_subjects_passed:
        parsed.data.minimumSubjectsPassed ?? nullNumber,
      rule_minimum_attendance_percentage:
        parsed.data.minimumAttendancePercentage ?? nullNumber,
      rule_required_subjects: requiredSubjectRules(
        parsed.data.requiredSubjectRules,
      ),
      rule_additional_configuration: promotionAdditionalRules(
        parsed.data.additionalRules,
      ),
    },
    "Draft promotion rule created.",
    ["/dashboard/academic/promotion"],
  );
}

export async function updatePromotionRuleDraft(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = promotionRuleUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid promotion rule.");
  return runMutation(
    "save_promotion_rule",
    {
      target_rule_id: parsed.data.id,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      target_academic_year_id: parsed.data.academicYearId ?? nullId,
      target_grade_level_id: parsed.data.gradeLevelId ?? nullId,
      rule_name: parsed.data.name,
      rule_minimum_average: parsed.data.minimumAverage ?? nullNumber,
      rule_maximum_aggregate: parsed.data.maximumAggregate ?? nullNumber,
      rule_minimum_subjects_passed:
        parsed.data.minimumSubjectsPassed ?? nullNumber,
      rule_minimum_attendance_percentage:
        parsed.data.minimumAttendancePercentage ?? nullNumber,
      rule_required_subjects: requiredSubjectRules(
        parsed.data.requiredSubjectRules,
      ),
      rule_additional_configuration: promotionAdditionalRules(
        parsed.data.additionalRules,
      ),
    },
    "Draft promotion rule updated.",
    ["/dashboard/academic/promotion"],
  );
}

export async function createPromotionRuleVersion(
  input: unknown,
): Promise<ConfigurationActionResult> {
  const parsed = promotionRuleVersionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed, "Invalid promotion version.");
  return runMutation(
    "create_promotion_rule_version",
    {
      source_rule_id: parsed.data.sourceId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      rule_name: parsed.data.name,
      rule_minimum_average: parsed.data.minimumAverage ?? nullNumber,
      rule_maximum_aggregate: parsed.data.maximumAggregate ?? nullNumber,
      rule_minimum_subjects_passed:
        parsed.data.minimumSubjectsPassed ?? nullNumber,
      rule_minimum_attendance_percentage:
        parsed.data.minimumAttendancePercentage ?? nullNumber,
      rule_required_subjects: requiredSubjectRules(
        parsed.data.requiredSubjectRules,
      ),
      rule_additional_configuration: promotionAdditionalRules(
        parsed.data.additionalRules,
      ),
    },
    "New draft promotion version created.",
    ["/dashboard/academic/promotion"],
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
  const identity = mutationIdentitySchema.safeParse({
    id,
    expectedUpdatedAt,
  });
  if (!identity.success) return firstIssue(identity, "Invalid record.");

  switch (transition) {
    case "activate-year":
      return runMutation(
        "activate_academic_year",
        {
          target_year_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Academic year activated.",
        ["/dashboard/academic/years"],
      );
    case "close-year":
      return runMutation(
        "close_academic_year",
        {
          target_year_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Academic year closed.",
        ["/dashboard/academic/years"],
      );
    case "archive-year":
      return runMutation(
        "archive_academic_year",
        {
          target_year_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Academic year archived.",
        ["/dashboard/academic/years"],
      );
    case "open-term":
      return runMutation(
        "open_term",
        {
          target_term_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Term opened.",
        ["/dashboard/academic/years"],
      );
    case "activate-grade":
    case "deactivate-grade":
      return runMutation(
        "set_grade_level_active",
        {
          target_grade_level_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
          target_active: transition === "activate-grade",
        },
        transition === "activate-grade"
          ? "Grade level activated."
          : "Grade level deactivated.",
        ["/dashboard/academic/grade-levels"],
      );
    case "activate-class":
    case "deactivate-class":
      return runMutation(
        "set_class_section_active",
        {
          target_class_section_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
          target_active: transition === "activate-class",
        },
        transition === "activate-class"
          ? "Class section activated."
          : "Class section deactivated.",
        ["/dashboard/academic/classes"],
      );
    case "activate-subject":
    case "deactivate-subject":
      return runMutation(
        "set_subject_active",
        {
          target_subject_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
          target_active: transition === "activate-subject",
        },
        transition === "activate-subject"
          ? "Subject activated."
          : "Subject deactivated.",
        ["/dashboard/academic/subjects"],
      );
    case "activate-scheme":
      return runMutation(
        "activate_assessment_scheme",
        {
          target_scheme_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Assessment scheme activated.",
        ["/dashboard/academic/assessment-schemes"],
      );
    case "retire-scheme":
      return runMutation(
        "retire_assessment_scheme",
        {
          target_scheme_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Assessment scheme retired.",
        ["/dashboard/academic/assessment-schemes"],
      );
    case "activate-scale":
      return runMutation(
        "activate_grading_scale",
        {
          target_scale_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Grading scale activated.",
        ["/dashboard/academic/grading"],
      );
    case "deactivate-scale":
      return runMutation(
        "deactivate_grading_scale",
        {
          target_scale_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Grading scale retired.",
        ["/dashboard/academic/grading"],
      );
    case "activate-ranking":
      return runMutation(
        "activate_ranking_rule",
        {
          target_rule_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Ranking rule activated.",
        ["/dashboard/academic/ranking"],
      );
    case "deactivate-ranking":
      return runMutation(
        "deactivate_ranking_rule",
        {
          target_rule_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Ranking rule retired.",
        ["/dashboard/academic/ranking"],
      );
    case "activate-promotion":
      return runMutation(
        "activate_promotion_rule",
        {
          target_rule_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Promotion rule activated.",
        ["/dashboard/academic/promotion"],
      );
    case "deactivate-promotion":
      return runMutation(
        "deactivate_promotion_rule",
        {
          target_rule_id: identity.data.id,
          expected_updated_at: identity.data.expectedUpdatedAt,
        },
        "Promotion rule retired.",
        ["/dashboard/academic/promotion"],
      );
  }
}
