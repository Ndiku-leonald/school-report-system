"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

import {
  correctionRevisionSchema,
  markSheetReturnSchema,
  markSheetWorkflowTransitionSchema,
  termCorrectionSchema,
  termWorkflowTransitionSchema,
} from "./schemas";
import type { MarksWorkflowActionResult } from "./types";

type Functions = Database["public"]["Functions"];
type FunctionName = keyof Functions;

function failed(message: string, conflict = false): MarksWorkflowActionResult {
  return { ok: false, message, ...(conflict ? { conflict: true } : {}) };
}

function safeWorkflowError(error: { code?: string; message: string }) {
  if (error.code === "PT409" || error.message.includes("WORKFLOW_CONFLICT"))
    return failed(
      "This workflow changed elsewhere. Reload and try again.",
      true,
    );
  if (error.message.includes("MARK_SHEET_INCOMPLETE"))
    return failed(
      "Record every required learner and component before submitting.",
    );
  if (error.message.includes("SELF_REVIEW"))
    return failed(
      "A different authorized staff member must review this submission.",
    );
  if (error.message.includes("REASON_"))
    return failed("Enter a valid reason without control characters.");
  if (error.message.includes("MISSING_TEACHING_ASSIGNMENT"))
    return failed(
      "At least one expected class and subject lacks a teaching assignment.",
    );
  if (error.message.includes("NOT_READY_FOR_REVIEW"))
    return failed(
      "Draft, returned, or missing mark sheets still block review.",
    );
  if (error.message.includes("NOT_READY_FOR_LOCK"))
    return failed("Every latest mark-sheet revision must be locked first.");
  if (error.message.includes("DOWNSTREAM_DEPENDENCY"))
    return failed(
      "Reports or promotion records already depend on this locked term.",
    );
  if (error.message.includes("SUCCESSOR_EXISTS") || error.code === "23505")
    return failed(
      "A correction revision already exists for this locked sheet.",
    );
  if (error.message.includes("BOUND_TEACHER") || error.code === "42501")
    return failed(
      "Your selected membership is not authorized for this workflow action.",
    );
  if (error.message.includes("TRANSITION_INVALID"))
    return failed("This action is not valid in the current workflow state.");
  return failed(
    "The workflow action could not be completed. Reload and try again.",
  );
}

async function runRpc<Name extends FunctionName>(
  name: Name,
  args: Functions[Name]["Args"],
  permission: "MARKS_SUBMIT" | "MARKS_REVIEW" | "MARKS_APPROVE" | "MARKS_LOCK",
) {
  await requirePermission(permission);
  const supabase = await createServerSupabaseClient();
  const response = await supabase.rpc(name, args);
  if (response.error) {
    console.error("Marks-workflow mutation failed.", {
      code: response.error.code,
      operation: name,
    });
    return { result: safeWorkflowError(response.error), data: null };
  }
  revalidatePath("/teacher/marks");
  revalidatePath("/dashboard/marks");
  revalidatePath("/dashboard/marks/review");
  revalidatePath("/dashboard/marks/terms");
  return {
    result: {
      ok: true,
      message: "Workflow updated.",
    } as MarksWorkflowActionResult,
    data: response.data,
  };
}

function firstIssue(parsed: {
  success: false;
  error: { issues: { message: string }[] };
}) {
  return failed(
    parsed.error.issues[0]?.message ?? "Review the submitted values.",
  );
}

export async function submitMarkSheetAction(input: unknown) {
  const parsed = markSheetWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "submit_mark_sheet",
    {
      target_mark_sheet_id: parsed.data.markSheetId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_SUBMIT",
  );
  return response.result.ok
    ? { ...response.result, message: "Mark sheet submitted for review." }
    : response.result;
}

export async function resubmitMarkSheetAction(input: unknown) {
  const parsed = markSheetWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "resubmit_returned_mark_sheet",
    {
      target_mark_sheet_id: parsed.data.markSheetId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_SUBMIT",
  );
  return response.result.ok
    ? { ...response.result, message: "Corrected mark sheet resubmitted." }
    : response.result;
}

export async function startReviewAction(input: unknown) {
  const parsed = markSheetWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "start_mark_sheet_review",
    {
      target_mark_sheet_id: parsed.data.markSheetId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_REVIEW",
  );
  return response.result.ok
    ? { ...response.result, message: "Review started." }
    : response.result;
}

export async function returnMarkSheetAction(input: unknown) {
  const parsed = markSheetReturnSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "return_mark_sheet",
    {
      target_mark_sheet_id: parsed.data.markSheetId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      return_reason: parsed.data.reason,
    },
    "MARKS_REVIEW",
  );
  return response.result.ok
    ? { ...response.result, message: "Mark sheet returned for correction." }
    : response.result;
}

export async function approveMarkSheetAction(input: unknown) {
  const parsed = markSheetWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "approve_mark_sheet",
    {
      target_mark_sheet_id: parsed.data.markSheetId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_APPROVE",
  );
  return response.result.ok
    ? { ...response.result, message: "Mark sheet approved." }
    : response.result;
}

export async function lockMarkSheetAction(input: unknown) {
  const parsed = markSheetWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "lock_mark_sheet",
    {
      target_mark_sheet_id: parsed.data.markSheetId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_LOCK",
  );
  return response.result.ok
    ? { ...response.result, message: "Mark sheet locked." }
    : response.result;
}

export async function openTermMarksEntryAction(input: unknown) {
  const parsed = termWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "open_term_marks_entry",
    {
      target_term_id: parsed.data.termId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_REVIEW",
  );
  return response.result.ok
    ? { ...response.result, message: "Marks entry opened for the term." }
    : response.result;
}

export async function advanceTermToReviewAction(input: unknown) {
  const parsed = termWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "advance_term_marks_to_review",
    {
      target_term_id: parsed.data.termId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_REVIEW",
  );
  return response.result.ok
    ? { ...response.result, message: "Term advanced to marks review." }
    : response.result;
}

export async function lockTermMarksAction(input: unknown) {
  const parsed = termWorkflowTransitionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "lock_term_marks",
    {
      target_term_id: parsed.data.termId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
    },
    "MARKS_LOCK",
  );
  return response.result.ok
    ? { ...response.result, message: "Term marks locked." }
    : response.result;
}

export async function reopenTermForCorrectionAction(input: unknown) {
  const parsed = termCorrectionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "reopen_locked_term_for_mark_correction",
    {
      target_term_id: parsed.data.termId,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      correction_reason: parsed.data.reason,
    },
    "MARKS_LOCK",
  );
  return response.result.ok
    ? {
        ...response.result,
        message: "Term reopened for controlled correction.",
      }
    : response.result;
}

export async function createCorrectionRevisionAction(input: unknown) {
  const parsed = correctionRevisionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const response = await runRpc(
    "create_mark_sheet_correction_revision",
    {
      source_mark_sheet_id: parsed.data.sourceMarkSheetId,
      expected_source_updated_at: parsed.data.expectedSourceUpdatedAt,
      correction_reason: parsed.data.reason,
    },
    "MARKS_LOCK",
  );
  const created = response.data?.[0];
  return response.result.ok && created
    ? {
        ...response.result,
        message: "Correction revision created.",
        markSheetId: created.correction_sheet_id,
      }
    : response.result;
}
