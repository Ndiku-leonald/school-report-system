import "server-only";

import { notFound } from "next/navigation";

import { requireAnyPermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

export type StudentListRow =
  Database["public"]["Functions"]["list_students"]["Returns"][number];
export type StudentDetail =
  Database["public"]["Functions"]["get_student_details"]["Returns"][number];
export type EnrollmentHistoryRow =
  Database["public"]["Functions"]["get_student_enrollment_history"]["Returns"][number];
export type GuardianRow =
  Database["public"]["Functions"]["get_student_guardians"]["Returns"][number];

export type StudentFilters = {
  q?: string;
  status?: string;
  year?: string;
  grade?: string;
  class?: string;
  enrollment?: string;
  page?: string;
};

function enumOrNull<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
) {
  return allowed.includes(value as T) ? (value as T) : null;
}

export async function getStudentReferenceData() {
  const context = await requireAnyPermission([
    "STUDENTS_VIEW_ALL",
    "STUDENTS_VIEW_ASSIGNED",
  ]);
  const supabase = await createServerSupabaseClient();
  const [years, grades, classes] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id,name,status,starts_on,ends_on")
      .eq("school_id", context.activeSchoolId)
      .order("starts_on", { ascending: false }),
    supabase
      .from("grade_levels")
      .select("id,name,code")
      .eq("school_id", context.activeSchoolId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("class_sections")
      .select(
        "id,name,class_code,capacity,is_active,academic_year_id,grade_level_id, enrollments(status)",
      )
      .eq("is_active", true)
      .order("name"),
  ]);
  if (years.error || grades.error || classes.error) {
    console.error("Student reference data query failed.", {
      resources: [
        years.error?.code,
        grades.error?.code,
        classes.error?.code,
      ].filter(Boolean),
    });
    throw new Error("Student reference data could not be loaded.");
  }
  return {
    canManage: context.permissions.has("STUDENTS_MANAGE"),
    canOverrideCapacity: context.activeRoles.some(
      (role) => role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN",
    ),
    canViewGuardians: context.permissions.has("STUDENTS_VIEW_ALL"),
    years: years.data ?? [],
    grades: grades.data ?? [],
    classes: (classes.data ?? []).map((section) => ({
      ...section,
      activeCount: section.enrollments.filter(
        (item) => item.status === "ACTIVE" || item.status === "REPEATING",
      ).length,
    })),
  };
}

export async function getStudentDirectory(filters: StudentFilters) {
  const reference = await getStudentReferenceData();
  const supabase = await createServerSupabaseClient();
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const result = await supabase.rpc("list_students", {
    search_text: filters.q?.trim() || undefined,
    filter_student_status:
      enumOrNull(filters.status, [
        "ACTIVE",
        "TRANSFERRED",
        "WITHDRAWN",
        "COMPLETED",
        "DECEASED",
        "INACTIVE",
      ] as const) ?? undefined,
    filter_academic_year_id: filters.year || undefined,
    filter_grade_level_id: filters.grade || undefined,
    filter_class_section_id: filters.class || undefined,
    filter_enrollment_status:
      enumOrNull(filters.enrollment, [
        "ACTIVE",
        "TRANSFERRED",
        "WITHDRAWN",
        "COMPLETED",
        "REPEATING",
      ] as const) ?? undefined,
    page_number: page,
    page_size: 25,
  });
  if (result.error) {
    console.error("Student directory query failed.", {
      code: result.error.code,
    });
    throw new Error("The student directory could not be loaded.");
  }
  return {
    ...reference,
    students: result.data ?? [],
    page,
    total: result.data?.[0]?.total_count ?? 0,
    pageSize: 25,
  };
}

export async function getStudentRecord(studentId: string) {
  const reference = await getStudentReferenceData();
  const supabase = await createServerSupabaseClient();
  const [detail, history, guardians] = await Promise.all([
    supabase.rpc("get_student_details", { target_student_id: studentId }),
    supabase.rpc("get_student_enrollment_history", {
      target_student_id: studentId,
    }),
    reference.canViewGuardians
      ? supabase.rpc("get_student_guardians", { target_student_id: studentId })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (detail.error || history.error || guardians.error) {
    console.error("Student detail query failed.", {
      resources: [
        detail.error?.code,
        history.error?.code,
        guardians.error?.code,
      ].filter(Boolean),
    });
    throw new Error("The student record could not be loaded.");
  }
  const student = detail.data?.[0];
  if (!student) notFound();
  let photoUrl: string | null = null;
  if (student.photo_storage_path) {
    const signed = await supabase.storage
      .from("student-photos")
      .createSignedUrl(student.photo_storage_path, 120);
    if (!signed.error) photoUrl = signed.data.signedUrl;
  }
  return {
    ...reference,
    student,
    history: history.data ?? [],
    guardians: guardians.data ?? [],
    photoUrl,
  };
}
