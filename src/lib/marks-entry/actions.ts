"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";

import { markEntryBatchSchema, teachingAssignmentIdSchema } from "./schemas";

export type MarksActionResult =
  | { ok: true; message: string; versions?: Record<string, number> }
  | { ok: false; message: string; conflict?: boolean };

function safeMarkError(error: {
  code?: string;
  message: string;
}): MarksActionResult {
  if (error.code === "PT409" || error.message.includes("MARK_ENTRY_CONFLICT")) {
    return {
      ok: false,
      conflict: true,
      message:
        "Another session changed at least one mark. Your entries are still visible; reload when you are ready to reconcile them.",
    };
  }
  if (error.message.includes("TERM_NOT_EDITABLE"))
    return { ok: false, message: "This term is not open for marks entry." };
  if (error.message.includes("SHEET_NOT_DRAFT"))
    return { ok: false, message: "Only draft mark sheets can be edited." };
  if (
    error.message.includes("ACTIVE_SCHEME") ||
    error.message.includes("SCHEME_COMPONENTS")
  )
    return {
      ok: false,
      message: "A complete active assessment scheme is required.",
    };
  if (error.message.includes("SCORE_ABOVE_MAXIMUM"))
    return {
      ok: false,
      message: "A score exceeds its assessment component maximum.",
    };
  if (error.message.includes("ATTENDANCE_SCORE"))
    return {
      ok: false,
      message:
        "Present learners require a score; other attendance states require an empty score.",
    };
  if (error.message.includes("COMPONENT_OUT_OF_SCOPE"))
    return {
      ok: false,
      message: "An assessment component does not belong to this sheet.",
    };
  if (error.message.includes("ENROLLMENT_OUT_OF_SCOPE"))
    return {
      ok: false,
      message: "A learner does not belong to this mark-sheet roster.",
    };
  if (error.message.includes("ASSIGNMENT") || error.code === "42501")
    return {
      ok: false,
      message:
        "Your current selected membership is not authorized for this mark sheet.",
    };
  return {
    ok: false,
    message: "The draft could not be saved. Review the entries and try again.",
  };
}

export async function openDraftMarkSheetAction(teachingAssignmentId: string) {
  const parsed = teachingAssignmentIdSchema.safeParse(teachingAssignmentId);
  if (!parsed.success) return;
  await requirePermission("MARKS_ENTER");
  const supabase = await createServerSupabaseClient();
  const response = await supabase.rpc("get_or_create_draft_mark_sheet", {
    target_teaching_assignment_id: parsed.data,
  });
  if (response.error || !response.data?.[0]) {
    console.error("Draft mark-sheet initialization failed.", {
      code: response.error?.code,
      operation: "get_or_create_draft_mark_sheet",
    });
    redirect("/teacher/marks?error=unavailable");
  }
  redirect(`/teacher/marks/${response.data[0].mark_sheet_id}`);
}

export async function saveMarkEntriesAction(
  input: unknown,
): Promise<MarksActionResult> {
  const parsed = markEntryBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Review the entered marks.",
    };
  }
  await requirePermission("MARKS_ENTER");
  const supabase = await createServerSupabaseClient();
  const response = await supabase.rpc("save_mark_entries", {
    target_mark_sheet_id: parsed.data.markSheetId,
    entries: parsed.data.entries as unknown as Json,
  });
  if (response.error) {
    console.error("Mark-entry batch mutation failed.", {
      code: response.error.code,
      operation: "save_mark_entries",
    });
    return safeMarkError(response.error);
  }
  revalidatePath(`/teacher/marks/${parsed.data.markSheetId}`);
  revalidatePath("/teacher/marks");
  revalidatePath("/dashboard/marks");
  return {
    ok: true,
    message: `${response.data.length} ${response.data.length === 1 ? "cell" : "cells"} saved.`,
    versions: Object.fromEntries(
      response.data.map((row) => [
        `${row.enrollment_id}:${row.assessment_component_id}`,
        row.row_version,
      ]),
    ),
  };
}
