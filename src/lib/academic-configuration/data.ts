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
  const canManage = context.permissions.has("ACADEMIC_CONFIGURATION_MANAGE");

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
    enrollmentDependencies,
    teachingDependencies,
    classTeacherDependencies,
    markSheetDependencies,
    reportDependencies,
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
    canManage
      ? supabase.from("enrollments").select("class_section_id")
      : Promise.resolve({ data: [], error: null }),
    canManage
      ? supabase
          .from("teaching_assignments")
          .select("class_section_id, subject_id")
      : Promise.resolve({ data: [], error: null }),
    canManage
      ? supabase.from("class_teacher_assignments").select("class_section_id")
      : Promise.resolve({ data: [], error: null }),
    canManage
      ? supabase.from("mark_sheets").select("class_section_id, subject_id")
      : Promise.resolve({ data: [], error: null }),
    canManage
      ? supabase
          .from("report_subject_results")
          .select(
            "subject_id, reports!inner(enrollments!inner(class_section_id))",
          )
      : Promise.resolve({ data: [], error: null }),
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
    enrollmentDependencies,
    teachingDependencies,
    classTeacherDependencies,
    markSheetDependencies,
    reportDependencies,
  ].filter((result) => result.error);

  if (failures.length > 0) {
    console.error("Academic configuration query failed.", {
      resources: failures.map((result) => result.error?.code),
    });
    throw new Error("Academic configuration could not be loaded.");
  }

  const lockedClassIds = new Set([
    ...(enrollmentDependencies.data ?? []).map((item) => item.class_section_id),
    ...(teachingDependencies.data ?? []).map((item) => item.class_section_id),
    ...(classTeacherDependencies.data ?? []).map(
      (item) => item.class_section_id,
    ),
    ...(markSheetDependencies.data ?? []).map((item) => item.class_section_id),
    ...(reportDependencies.data ?? []).map(
      (item) => item.reports.enrollments.class_section_id,
    ),
  ]);

  const usedPairs = new Set<string>();
  for (const scheme of schemes.data ?? []) {
    if (scheme.status === "ACTIVE") {
      usedPairs.add(`${scheme.grade_level_id}:${scheme.subject_id}`);
    }
  }
  for (const assignment of teachingDependencies.data ?? []) {
    const section = (classes.data ?? []).find(
      (item) => item.id === assignment.class_section_id,
    );
    if (section) {
      usedPairs.add(`${section.grade_level_id}:${assignment.subject_id}`);
    }
  }
  for (const sheet of markSheetDependencies.data ?? []) {
    const section = (classes.data ?? []).find(
      (item) => item.id === sheet.class_section_id,
    );
    if (section) {
      usedPairs.add(`${section.grade_level_id}:${sheet.subject_id}`);
    }
  }
  for (const result of reportDependencies.data ?? []) {
    const section = (classes.data ?? []).find(
      (item) => item.id === result.reports.enrollments.class_section_id,
    );
    if (section) {
      usedPairs.add(`${section.grade_level_id}:${result.subject_id}`);
    }
  }

  return {
    canManage,
    years: years.data ?? [],
    terms: terms.data ?? [],
    grades: grades.data ?? [],
    classes: (classes.data ?? []).map((section) => ({
      ...section,
      scope_locked: lockedClassIds.has(section.id),
    })),
    subjects: subjects.data ?? [],
    curriculum: (curriculum.data ?? []).map((mapping) => ({
      ...mapping,
      in_use: usedPairs.has(`${mapping.grade_level_id}:${mapping.subject_id}`),
    })),
    schemes: schemes.data ?? [],
    grading: grading.data ?? [],
    ranking: ranking.data ?? [],
    promotion: promotion.data ?? [],
  };
}
