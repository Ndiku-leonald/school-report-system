import "server-only";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type {
  AnalyticsAttentionStudent,
  AnalyticsCoverage,
  AnalyticsDistributionRow,
  AnalyticsScope,
  AnalyticsStudentDetail,
  AnalyticsStudentSubject,
  AnalyticsSubjectPerformance,
  AnalyticsTopStudent,
  ClassAnalyticsSummary,
  GradeAnalyticsSummary,
  SchoolAnalyticsSummary,
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

function first<T>(data: unknown) {
  return rows<T>(data)[0] ?? null;
}

async function read<T>(name: string, args?: Record<string, unknown>) {
  const result = await (await client()).rpc(name, args);
  if (result.error) throw new Error("Analytics data could not be loaded.");
  return rows<T>(result.data);
}

export async function getAnalyticsScopes() {
  await requirePermission("ANALYTICS_VIEW");
  return read<AnalyticsScope>("list_analytics_scopes");
}

export async function getSchoolAnalytics(termId: string) {
  await requirePermission("ANALYTICS_VIEW");
  const data = await read<SchoolAnalyticsSummary>("get_school_analytics", {
    target_term_id: termId,
  });
  const summary = first<SchoolAnalyticsSummary>(data);
  if (!summary) return null;
  return {
    ...summary,
    coverage: (Array.isArray(summary.coverage)
      ? summary.coverage
      : []) as AnalyticsCoverage[],
  };
}

export async function getAnalyticsGrade(runId: string) {
  await requirePermission("ANALYTICS_VIEW");
  return first<GradeAnalyticsSummary>(
    await read<GradeAnalyticsSummary>("get_grade_analytics", {
      target_run_id: runId,
    }),
  );
}

export async function getAnalyticsClasses(runId: string) {
  await requirePermission("ANALYTICS_VIEW");
  return read<ClassAnalyticsSummary>("list_analytics_class_summaries", {
    target_run_id: runId,
  });
}

export async function getAnalyticsClass(runId: string, classSectionId: string) {
  await requirePermission("ANALYTICS_VIEW");
  return first<ClassAnalyticsSummary>(
    await read<ClassAnalyticsSummary>("get_class_analytics", {
      target_run_id: runId,
      target_class_section_id: classSectionId,
    }),
  );
}

export async function getAnalyticsDistributions(
  runId: string,
  classSectionId?: string,
) {
  await requirePermission("ANALYTICS_VIEW");
  return read<AnalyticsDistributionRow>("list_analytics_distributions", {
    target_run_id: runId,
    target_class_section_id: classSectionId ?? null,
  });
}

export async function getAnalyticsSubjects(
  runId: string,
  classSectionId?: string,
) {
  await requirePermission("ANALYTICS_VIEW");
  return read<AnalyticsSubjectPerformance>(
    "list_analytics_subject_performance",
    {
      target_run_id: runId,
      target_class_section_id: classSectionId ?? null,
    },
  );
}

export async function getAnalyticsTopStudents(
  runId: string,
  classSectionId?: string,
  maxPosition = 10,
) {
  await requirePermission("ANALYTICS_VIEW");
  return read<AnalyticsTopStudent>("list_analytics_top_students", {
    target_run_id: runId,
    target_class_section_id: classSectionId ?? null,
    max_position: maxPosition,
  });
}

export async function getAnalyticsAttention(
  runId: string,
  classSectionId?: string,
) {
  await requirePermission("ANALYTICS_VIEW");
  return read<AnalyticsAttentionStudent>("list_analytics_attention_students", {
    target_run_id: runId,
    target_class_section_id: classSectionId ?? null,
  });
}

export async function getAnalyticsStudent(runId: string, enrollmentId: string) {
  await requirePermission("ANALYTICS_VIEW");
  const api = await client();
  const [detail, subjects] = await Promise.all([
    api.rpc("get_analytics_student", {
      target_run_id: runId,
      target_enrollment_id: enrollmentId,
    }),
    api.rpc("list_analytics_student_subjects", {
      target_run_id: runId,
      target_enrollment_id: enrollmentId,
    }),
  ]);
  if (detail.error || subjects.error) {
    throw new Error("Student analytics could not be loaded.");
  }
  const student = first<AnalyticsStudentDetail>(detail.data);
  if (!student) return null;
  return {
    student,
    subjects: rows<AnalyticsStudentSubject>(subjects.data),
  };
}

export async function getAnalyticsExportData(
  runId: string,
  exportType: "summary" | "distributions" | "subjects",
) {
  await requirePermission("ANALYTICS_VIEW");
  if (exportType === "summary") {
    const [grade, classes] = await Promise.all([
      read<GradeAnalyticsSummary>("get_grade_analytics", {
        target_run_id: runId,
      }),
      read<ClassAnalyticsSummary>("list_analytics_class_summaries", {
        target_run_id: runId,
      }),
    ]);
    return { grade: first<GradeAnalyticsSummary>(grade), classes };
  }
  if (exportType === "distributions") {
    return {
      distributions: await read<AnalyticsDistributionRow>(
        "list_analytics_distributions",
        { target_run_id: runId, target_class_section_id: null },
      ),
    };
  }
  return {
    subjects: await read<AnalyticsSubjectPerformance>(
      "list_analytics_subject_performance",
      { target_run_id: runId, target_class_section_id: null },
    ),
  };
}
