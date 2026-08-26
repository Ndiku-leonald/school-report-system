import "server-only";

import { notFound } from "next/navigation";

import {
  requireAnyPermission,
  requirePermission,
} from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type {
  AggregateClassificationScale,
  CalculatedStudent,
  CalculatedStudentDetail,
  CalculatedSubject,
  GradeSubjectPerformance,
  ResultCalculationOption,
  ResultCalculationReadiness,
  ResultCalculationRun,
  ResultCalculationTerm,
  ResultComponentExplanation,
  SubjectPerformance,
} from "./types";

type UntypedRpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code: string; message: string } | null;
  }>;
};

async function rpcClient() {
  return (await createServerSupabaseClient()) as unknown as UntypedRpcClient;
}

export async function getResultCalculationTerms() {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (await rpcClient()).rpc("list_result_calculation_terms");
  if (result.error)
    throw new Error("Results calculation readiness could not be loaded.");
  return (result.data ?? []) as ResultCalculationTerm[];
}

export async function getResultCalculationOptions(
  termId: string,
  gradeLevelId: string,
) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (
    await rpcClient()
  ).rpc("list_result_calculation_options", {
    target_term_id: termId,
    target_grade_level_id: gradeLevelId,
  });
  if (result.error)
    throw new Error("Applicable calculation rules could not be loaded.");
  return (result.data ?? []) as ResultCalculationOption[];
}

export async function getResultCalculationReadiness(
  termId: string,
  gradeLevelId: string,
) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (
    await rpcClient()
  ).rpc("get_results_calculation_readiness", {
    target_term_id: termId,
    target_grade_level_id: gradeLevelId,
  });
  if (result.error)
    throw new Error("Results calculation readiness could not be loaded.");
  return (
    ((result.data as ResultCalculationReadiness[] | null) ?? [])[0] ?? null
  );
}

export async function getResultCalculationRun(runId: string) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (
    await rpcClient()
  ).rpc("get_result_calculation_run", { target_run_id: runId });
  if (result.error || !(result.data as unknown[] | null)?.[0]) notFound();
  return (result.data as ResultCalculationRun[])[0]!;
}

export async function getCalculatedStudents(runId: string) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (
    await rpcClient()
  ).rpc("list_calculated_student_results", { target_run_id: runId });
  if (result.error)
    throw new Error("Calculated student results could not be loaded.");
  return (result.data ?? []) as CalculatedStudent[];
}

export async function getCalculatedStudentDetail(
  runId: string,
  enrollmentId: string,
) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const client = await rpcClient();
  const [detail, subjects, explanations, run] = await Promise.all([
    client.rpc("get_calculated_student_result", {
      target_run_id: runId,
      target_enrollment_id: enrollmentId,
    }),
    client.rpc("list_calculated_subject_results", {
      target_run_id: runId,
      target_enrollment_id: enrollmentId,
    }),
    client.rpc("list_result_component_explanations", {
      target_run_id: runId,
      target_enrollment_id: enrollmentId,
    }),
    getResultCalculationRun(runId),
  ]);
  if (
    detail.error ||
    subjects.error ||
    explanations.error ||
    !(detail.data as unknown[] | null)?.[0]
  )
    notFound();
  return {
    run,
    detail: (detail.data as CalculatedStudentDetail[])[0]!,
    subjects: (subjects.data ?? []) as CalculatedSubject[],
    explanations: (explanations.data ?? []) as ResultComponentExplanation[],
  };
}

export async function getSubjectPerformance(runId: string) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (
    await rpcClient()
  ).rpc("list_result_subject_performance", { target_run_id: runId });
  if (result.error) throw new Error("Subject performance could not be loaded.");
  return (result.data ?? []) as SubjectPerformance[];
}

export async function getGradeSubjectPerformance(runId: string) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (
    await rpcClient()
  ).rpc("list_result_grade_subject_performance", { target_run_id: runId });
  if (result.error)
    throw new Error("Grade-wide subject performance could not be loaded.");
  return (result.data ?? []) as GradeSubjectPerformance[];
}

export async function getAggregateClassificationScales() {
  await requirePermission("ACADEMIC_CONFIGURATION_VIEW");
  const result = await (
    await rpcClient()
  ).rpc("list_aggregate_classification_scales");
  if (result.error)
    throw new Error(
      "Aggregate classification configuration could not be loaded.",
    );
  return (result.data ?? []) as AggregateClassificationScale[];
}
