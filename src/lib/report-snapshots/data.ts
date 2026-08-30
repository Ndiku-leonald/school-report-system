import "server-only";

import { notFound } from "next/navigation";

import {
  requireAnyPermission,
  requirePermission,
} from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { reportSnapshotDataSchema } from "./schemas";
import type {
  GeneratedReport,
  GeneratedReportListItem,
  ReportGenerationReadiness,
  ReportHistoryItem,
  ReportSubjectSnapshot,
} from "./types";

const REPORT_READ_PERMISSIONS = [
  "REPORTS_VIEW_ALL",
  "REPORTS_GENERATE",
  "REPORTS_VIEW_ASSIGNED",
] as const;

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code: string; message: string } | null;
  }>;
};

async function rpcClient() {
  return (await createServerSupabaseClient()) as unknown as RpcClient;
}

export async function getReportGenerationReadiness(runId: string) {
  await requireAnyPermission(["REPORTS_VIEW_ALL", "REPORTS_GENERATE"]);
  const result = await (
    await rpcClient()
  ).rpc("get_report_generation_readiness", {
    target_calculation_run_id: runId,
  });
  if (result.error) throw new Error("Report readiness could not be loaded.");
  return ((result.data as ReportGenerationReadiness[] | null) ?? [])[0] ?? null;
}

export async function getGeneratedReports(runId?: string) {
  await requireAnyPermission(REPORT_READ_PERMISSIONS);
  const result = await (
    await rpcClient()
  ).rpc("list_generated_reports", {
    target_calculation_run_id: runId ?? null,
  });
  if (result.error) throw new Error("Generated reports could not be loaded.");
  return (result.data ?? []) as GeneratedReportListItem[];
}

export async function getGeneratedReport(reportId: string) {
  await requireAnyPermission(REPORT_READ_PERMISSIONS);
  const result = await (
    await rpcClient()
  ).rpc("get_generated_report", {
    target_report_id: reportId,
  });
  const row = (result.data as GeneratedReport[] | null)?.[0];
  if (result.error || !row) notFound();
  const parsed = reportSnapshotDataSchema.safeParse(row.snapshot_data);
  if (!parsed.success)
    throw new Error("The stored report snapshot is invalid.");
  return { ...row, snapshot_data: parsed.data };
}

export async function getReportSubjects(reportId: string) {
  await requireAnyPermission(REPORT_READ_PERMISSIONS);
  const result = await (
    await rpcClient()
  ).rpc("get_report_subject_results", {
    target_report_id: reportId,
  });
  if (result.error)
    throw new Error("Report subject snapshots could not be loaded.");
  return (result.data ?? []) as ReportSubjectSnapshot[];
}

export async function getReportHistory(enrollmentId: string, termId: string) {
  await requireAnyPermission(REPORT_READ_PERMISSIONS);
  const result = await (
    await rpcClient()
  ).rpc("get_student_report_history", {
    target_enrollment_id: enrollmentId,
    target_term_id: termId,
  });
  if (result.error) throw new Error("Report history could not be loaded.");
  return (result.data ?? []) as ReportHistoryItem[];
}

export async function canGenerateReports() {
  const context = await requireAnyPermission([
    "REPORTS_VIEW_ALL",
    "REPORTS_GENERATE",
  ]);
  return context.permissions.has("REPORTS_GENERATE");
}

export async function requireReportGeneration() {
  return requirePermission("REPORTS_GENERATE");
}
