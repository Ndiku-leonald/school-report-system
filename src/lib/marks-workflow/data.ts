import "server-only";

import { notFound } from "next/navigation";

import { requireAnyPermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { marksReviewFiltersSchema, type MarksReviewFilters } from "./schemas";

const nullId = null as unknown as string;
const nullStatus = null as unknown as
  "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "RETURNED" | "APPROVED" | "LOCKED";

async function workflowReader() {
  return requireAnyPermission([
    "MARKS_VIEW_ALL",
    "MARKS_REVIEW",
    "MARKS_APPROVE",
    "MARKS_LOCK",
  ]);
}

export async function getMarksReviewQueue(input: MarksReviewFilters) {
  await workflowReader();
  const filters = marksReviewFiltersSchema.parse(input);
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("list_marks_review_queue", {
    filter_academic_year_id: filters.year ?? nullId,
    filter_term_id: filters.term ?? nullId,
    filter_grade_level_id: filters.grade ?? nullId,
    filter_class_section_id: filters.class ?? nullId,
    filter_subject_id: filters.subject ?? nullId,
    filter_staff_membership_id: filters.teacher ?? nullId,
    filter_workflow_status: filters.status ?? nullStatus,
    page_number: page,
    page_size: 25,
  });
  if (result.error) {
    console.error("Marks review queue query failed.", {
      code: result.error.code,
    });
    throw new Error("The marks review queue could not be loaded.");
  }
  const rows = result.data ?? [];
  return {
    rows,
    filters,
    page,
    pageSize: 25,
    total: Number(rows[0]?.total_count ?? 0),
  };
}

export async function getMarkSheetWorkflow(markSheetId: string) {
  await requireAnyPermission([
    "MARKS_VIEW_ALL",
    "MARKS_VIEW_ASSIGNED",
    "MARKS_ENTER",
    "MARKS_SUBMIT",
    "MARKS_REVIEW",
    "MARKS_APPROVE",
    "MARKS_LOCK",
  ]);
  const supabase = await createServerSupabaseClient();
  const [detail, history] = await Promise.all([
    supabase.rpc("get_mark_sheet_workflow_detail", {
      target_mark_sheet_id: markSheetId,
    }),
    supabase.rpc("get_mark_sheet_workflow_history", {
      target_mark_sheet_id: markSheetId,
    }),
  ]);
  if (detail.error || history.error) {
    if (
      [detail.error?.code, history.error?.code].some((code) =>
        ["42501", "P0002"].includes(code ?? ""),
      )
    ) {
      notFound();
    }
    console.error("Mark-sheet workflow query failed.", {
      resources: [detail.error?.code, history.error?.code].filter(Boolean),
    });
    throw new Error("The mark-sheet workflow could not be loaded.");
  }
  if (!detail.data?.[0]) notFound();
  return { detail: detail.data[0], history: history.data ?? [] };
}

export async function getMarksWorkflowTerms() {
  await workflowReader();
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("list_marks_workflow_terms");
  if (result.error) {
    console.error("Term marks workflow query failed.", {
      code: result.error.code,
    });
    throw new Error("Term marks readiness could not be loaded.");
  }
  return result.data ?? [];
}

export async function getTermMarksReadiness(termId: string) {
  await workflowReader();
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("get_term_marks_workflow_readiness", {
    target_term_id: termId,
  });
  if (result.error)
    throw new Error("Term marks readiness could not be loaded.");
  if (!result.data?.[0]) notFound();
  return result.data[0];
}
