import "server-only";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AcademicConfigurationData = Awaited<
  ReturnType<typeof getAcademicConfigurationData>
>;

export async function getAcademicConfigurationData() {
  const context = await requirePermission("ACADEMIC_CONFIGURATION_VIEW");
  const supabase = await createServerSupabaseClient();
  const schoolId = context.activeSchoolId;

  const [
    years,
    terms,
    grades,
    classes,
    subjects,
    curriculum,
    schemes,
    grading,
    ranking,
    promotion,
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("*")
      .eq("school_id", schoolId)
      .order("starts_on", { ascending: false }),
    supabase
      .from("terms")
      .select("*, academic_years!inner(school_id, name)")
      .eq("academic_years.school_id", schoolId)
      .order("term_number"),
    supabase
      .from("grade_levels")
      .select("*")
      .eq("school_id", schoolId)
      .order("sort_order"),
    supabase
      .from("class_sections")
      .select(
        "*, academic_years!inner(school_id, name, status), grade_levels!inner(name, code)",
      )
      .eq("academic_years.school_id", schoolId)
      .order("name"),
    supabase
      .from("subjects")
      .select("*")
      .eq("school_id", schoolId)
      .order("sort_order"),
    supabase
      .from("grade_level_subjects")
      .select(
        "*, grade_levels!inner(school_id, name, code), subjects!inner(name, code)",
      )
      .eq("grade_levels.school_id", schoolId)
      .order("sort_order"),
    supabase
      .from("assessment_schemes")
      .select(
        "*, terms!inner(name, academic_years!inner(school_id)), grade_levels!inner(name), subjects!inner(name), assessment_components(*)",
      )
      .eq("terms.academic_years.school_id", schoolId)
      .order("created_at", { ascending: false }),
    supabase
      .from("grading_scales")
      .select("*, grading_bands(*)")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false }),
    supabase
      .from("ranking_rules")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false }),
    supabase
      .from("promotion_rules")
      .select("*")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false }),
  ]);

  const failures = [
    years,
    terms,
    grades,
    classes,
    subjects,
    curriculum,
    schemes,
    grading,
    ranking,
    promotion,
  ].filter((result) => result.error);

  if (failures.length > 0) {
    console.error("Academic configuration query failed.", {
      resources: failures.map((result) => result.error?.code),
    });
    throw new Error("Academic configuration could not be loaded.");
  }

  return {
    canManage: context.permissions.has("ACADEMIC_CONFIGURATION_MANAGE"),
    years: years.data ?? [],
    terms: terms.data ?? [],
    grades: grades.data ?? [],
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    curriculum: curriculum.data ?? [],
    schemes: schemes.data ?? [],
    grading: grading.data ?? [],
    ranking: ranking.data ?? [],
    promotion: promotion.data ?? [],
  };
}
