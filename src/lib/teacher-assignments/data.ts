import "server-only";

import { notFound } from "next/navigation";

import { requireAnyPermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { assignmentFiltersSchema, assignmentScopeSchema } from "./schemas";
import type {
  AssignmentFilters,
  ClassTeacherAssignmentRow,
  TeachingAssignmentRow,
} from "./types";

const nullId = null as unknown as string;
const nullBoolean = null as unknown as boolean;

async function assignmentReader() {
  return requireAnyPermission([
    "ASSIGNMENTS_VIEW_ALL",
    "ASSIGNMENTS_VIEW_OWN",
    "ASSIGNMENTS_MANAGE",
  ]);
}

function pageNumber(value: string | undefined) {
  return Math.max(1, Number.parseInt(value ?? "1", 10) || 1);
}

export async function getAssignmentReferenceData() {
  const context = await assignmentReader();
  const supabase = await createServerSupabaseClient();
  const schoolId = context.activeSchoolId;
  const [years, terms, grades, classes, subjects, mappings] = await Promise.all(
    [
      supabase
        .from("academic_years")
        .select("id,name,status,starts_on,ends_on")
        .eq("school_id", schoolId)
        .order("starts_on", { ascending: false }),
      supabase
        .from("terms")
        .select("id,academic_year_id,name,term_number,starts_on,ends_on,status")
        .order("term_number"),
      supabase
        .from("grade_levels")
        .select("id,name,code,sort_order,is_active")
        .eq("school_id", schoolId)
        .order("sort_order"),
      supabase
        .from("class_sections")
        .select("id,academic_year_id,grade_level_id,name,class_code,is_active")
        .order("name"),
      supabase
        .from("subjects")
        .select("id,name,code,sort_order,is_active")
        .eq("school_id", schoolId)
        .order("sort_order"),
      supabase
        .from("grade_level_subjects")
        .select("grade_level_id,subject_id")
        .order("sort_order"),
    ],
  );
  const results = [years, terms, grades, classes, subjects, mappings];
  if (results.some((result) => result.error)) {
    console.error("Assignment reference query failed.", {
      resources: results.map((result) => result.error?.code).filter(Boolean),
    });
    throw new Error("Assignment reference data could not be loaded.");
  }
  return {
    canManage: context.permissions.has("ASSIGNMENTS_MANAGE"),
    canViewAll:
      context.permissions.has("ASSIGNMENTS_VIEW_ALL") ||
      context.permissions.has("ASSIGNMENTS_MANAGE"),
    years: years.data ?? [],
    terms: terms.data ?? [],
    grades: grades.data ?? [],
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    mappings: mappings.data ?? [],
  };
}

export async function getAssignmentDirectory(filters: AssignmentFilters) {
  const safeFilters = assignmentFiltersSchema.parse(filters);
  const reference = await getAssignmentReferenceData();
  const supabase = await createServerSupabaseClient();
  const page = pageNumber(safeFilters.page);
  const [teaching, classTeachers, teacherDirectory] = await Promise.all([
    supabase.rpc("list_teaching_assignments", {
      filter_academic_year_id: safeFilters.year || nullId,
      filter_term_id: safeFilters.term || nullId,
      filter_grade_level_id: safeFilters.grade || nullId,
      filter_class_section_id: safeFilters.class || nullId,
      filter_subject_id: safeFilters.subject || nullId,
      filter_staff_membership_id: safeFilters.teacher || nullId,
      filter_period: safeFilters.period || nullId,
      page_number: page,
      page_size: 25,
    }),
    supabase.rpc("list_class_teacher_assignments", {
      filter_academic_year_id: safeFilters.year || nullId,
      filter_term_id: safeFilters.term || nullId,
      filter_grade_level_id: safeFilters.grade || nullId,
      filter_class_section_id: safeFilters.class || nullId,
      filter_staff_membership_id: safeFilters.teacher || nullId,
      filter_primary:
        safeFilters.designation === "primary"
          ? true
          : safeFilters.designation === "assistant"
            ? false
            : nullBoolean,
      filter_period: safeFilters.period || nullId,
      page_number: page,
      page_size: 25,
    }),
    supabase.rpc("list_assignment_teachers"),
  ]);
  if (teaching.error || classTeachers.error || teacherDirectory.error) {
    console.error("Assignment directory query failed.", {
      resources: [
        teaching.error?.code,
        classTeachers.error?.code,
        teacherDirectory.error?.code,
      ].filter(Boolean),
    });
    throw new Error("The assignment directory could not be loaded.");
  }
  const teachingRows = (teaching.data ?? []) as TeachingAssignmentRow[];
  const classRows = (classTeachers.data ?? []) as ClassTeacherAssignmentRow[];
  return {
    ...reference,
    teaching: teachingRows,
    classTeachers: classRows,
    teachers: (teacherDirectory.data ?? []).map((teacher) => ({
      id: teacher.staff_membership_id,
      label: `${teacher.display_name} · ${teacher.employee_number}`,
    })),
    filters: safeFilters,
    page,
    pageSize: 25,
    teachingTotal: Number(teachingRows[0]?.total_count ?? 0),
    classTeacherTotal: Number(classRows[0]?.total_count ?? 0),
  };
}

export async function getTeachingAssignment(assignmentId: string) {
  await assignmentReader();
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("get_teaching_assignment", {
    target_assignment_id: assignmentId,
  });
  if (result.error) throw new Error("The assignment could not be loaded.");
  const assignment = result.data?.[0];
  if (!assignment) notFound();
  return assignment;
}

export async function getClassTeacherAssignment(assignmentId: string) {
  await assignmentReader();
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("get_class_teacher_assignment", {
    target_assignment_id: assignmentId,
  });
  if (result.error) throw new Error("The assignment could not be loaded.");
  const assignment = result.data?.[0];
  if (!assignment) notFound();
  return assignment;
}

export async function getEligibleSubjectTeachers(input: unknown) {
  const context = await requireAnyPermission(["ASSIGNMENTS_MANAGE"]);
  const parsed = assignmentScopeSchema.safeParse(input);
  if (!parsed.success || !parsed.data.subjectId) return [];
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("list_eligible_subject_teachers", {
    target_term_id: parsed.data.termId,
    target_class_section_id: parsed.data.classSectionId,
    target_subject_id: parsed.data.subjectId,
    assignment_starts_on: parsed.data.startsOn,
    assignment_ends_on: parsed.data.endsOn ?? nullId,
  });
  if (result.error) {
    console.error("Eligible subject-teacher query failed.", {
      code: result.error.code,
      school: context.activeSchoolId,
    });
    return [];
  }
  return result.data ?? [];
}

export async function getEligibleClassTeachers(input: unknown) {
  await requireAnyPermission(["ASSIGNMENTS_MANAGE"]);
  const parsed = assignmentScopeSchema.safeParse(input);
  if (!parsed.success) return [];
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("list_eligible_class_teachers", {
    target_term_id: parsed.data.termId,
    target_class_section_id: parsed.data.classSectionId,
    assignment_starts_on: parsed.data.startsOn,
    assignment_ends_on: parsed.data.endsOn ?? nullId,
    assignment_is_primary: parsed.data.isPrimary,
  });
  if (result.error) return [];
  return result.data ?? [];
}

export async function getMyTeacherAssignments() {
  await requireAnyPermission(["ASSIGNMENTS_VIEW_OWN"]);
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("get_my_teacher_assignments");
  if (result.error) {
    console.error("Own assignment query failed.", { code: result.error.code });
    throw new Error("Your assignments could not be loaded.");
  }
  return result.data ?? [];
}
