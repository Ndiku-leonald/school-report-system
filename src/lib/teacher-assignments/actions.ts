"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

import {
  assignmentEndSchema,
  assignmentUpdateSchema,
  classTeacherAssignmentSchema,
  primaryReplacementSchema,
  teachingAssignmentSchema,
} from "./schemas";

export type AssignmentActionResult =
  | { ok: true; message: string; assignmentId?: string }
  | { ok: false; message: string; conflict?: boolean };

type Functions = Database["public"]["Functions"];
type FunctionName = keyof Functions;
type FunctionArgs<Name extends FunctionName> = Functions[Name]["Args"];
const nullableDate = null as unknown as string;

function failed(message: string, conflict = false): AssignmentActionResult {
  return { ok: false, message, ...(conflict ? { conflict: true } : {}) };
}

function firstIssue(parsed: {
  success: false;
  error: { issues: { message: string }[] };
}) {
  return failed(
    parsed.error.issues[0]?.message ?? "Review the submitted values.",
  );
}

function mutationError(error: { code?: string; message: string }) {
  if (
    error.code === "PT409" ||
    error.message.includes("TEACHER_ASSIGNMENT_CONFLICT")
  ) {
    return failed(
      "This assignment changed elsewhere. Refresh and try again.",
      true,
    );
  }
  if (error.message.includes("TERM_INVALID"))
    return failed("Choose a valid term in the selected school.");
  if (
    error.message.includes("TERM_CLOSED") ||
    error.message.includes("DATES_OUTSIDE_TERM")
  )
    return failed("Assignment dates must be inside an available term.");
  if (error.message.includes("CLASS_INVALID"))
    return failed("Choose a valid class in the selected term.");
  if (error.message.includes("CLASS_INACTIVE"))
    return failed("New assignments cannot use an inactive class.");
  if (error.message.includes("SUBJECT_INACTIVE"))
    return failed("New assignments cannot use an inactive subject.");
  if (error.message.includes("SUBJECT_NOT_MAPPED"))
    return failed("That subject is not mapped to the class grade.");
  if (error.message.includes("TEACHER_INACTIVE"))
    return failed("Choose an active staff membership.");
  if (error.message.includes("ROLE_REQUIRED"))
    return failed(
      "The selected staff membership lacks the required live teacher role.",
    );
  if (error.message.includes("CROSS_SCHOOL"))
    return failed("The selected records do not belong to this school.");
  if (error.message.includes("PRIMARY_CLASS_TEACHER"))
    return failed(
      "That period conflicts with the primary class teacher history.",
    );
  if (error.code === "23P01" || error.message.includes("OVERLAP"))
    return failed("That assignment period overlaps an existing assignment.");
  if (error.message.includes("ACADEMIC_DEPENDENCY"))
    return failed(
      "Academic records depend on this period, so the date change is unsafe.",
    );
  if (error.message.includes("HISTORICAL_IMMUTABLE"))
    return failed(
      "Ended historical assignments cannot be reactivated or rewritten.",
    );
  if (error.code === "42501")
    return failed("You no longer have permission to manage assignments.");
  if (error.code === "23514" || error.code === "55000")
    return failed(
      "The assignment is not valid for the selected scope or dates.",
    );
  return failed(
    "The assignment change could not be saved. Review the values and try again.",
  );
}

async function runMutation<Name extends FunctionName>(
  name: Name,
  args: FunctionArgs<Name>,
  successMessage: string,
) {
  await requirePermission("ASSIGNMENTS_MANAGE");
  const supabase = await createServerSupabaseClient();
  const response = await supabase.rpc(name, args);
  if (response.error) {
    console.error("Teacher-assignment mutation failed.", {
      code: response.error.code,
      operation: name,
    });
    return { result: mutationError(response.error), data: null };
  }
  revalidatePath("/dashboard/assignments");
  revalidatePath("/teacher/assignments");
  return {
    result: { ok: true, message: successMessage } as AssignmentActionResult,
    data: response.data,
  };
}

export async function createTeachingAssignment(input: unknown) {
  const parsed = teachingAssignmentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const { result, data } = await runMutation(
    "create_teaching_assignment",
    {
      target_term_id: parsed.data.termId,
      target_class_section_id: parsed.data.classSectionId,
      target_subject_id: parsed.data.subjectId,
      target_staff_membership_id: parsed.data.staffMembershipId,
      assignment_starts_on: parsed.data.startsOn,
      assignment_ends_on: parsed.data.endsOn ?? nullableDate,
    },
    "Subject-teaching assignment created.",
  );
  return result.ok && data?.[0]
    ? { ...result, assignmentId: data[0].assignment_id }
    : result;
}

export async function updateTeachingAssignment(input: unknown) {
  const parsed = assignmentUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "update_teaching_assignment",
      {
        target_assignment_id: parsed.data.assignmentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        assignment_starts_on: parsed.data.startsOn,
        assignment_ends_on: parsed.data.endsOn ?? nullableDate,
      },
      "Subject-teaching dates updated.",
    )
  ).result;
}

export async function endTeachingAssignment(input: unknown) {
  const parsed = assignmentEndSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "end_teaching_assignment",
      {
        target_assignment_id: parsed.data.assignmentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        assignment_ends_on: parsed.data.endsOn,
        reason: parsed.data.reason,
      },
      "Subject-teaching assignment ended.",
    )
  ).result;
}

export async function createClassTeacherAssignment(input: unknown) {
  const parsed = classTeacherAssignmentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  const { result, data } = await runMutation(
    "create_class_teacher_assignment",
    {
      target_term_id: parsed.data.termId,
      target_class_section_id: parsed.data.classSectionId,
      target_staff_membership_id: parsed.data.staffMembershipId,
      assignment_is_primary: parsed.data.isPrimary,
      assignment_starts_on: parsed.data.startsOn,
      assignment_ends_on: parsed.data.endsOn ?? nullableDate,
    },
    "Class-teacher assignment created.",
  );
  return result.ok && data?.[0]
    ? { ...result, assignmentId: data[0].assignment_id }
    : result;
}

export async function updateClassTeacherAssignment(input: unknown) {
  const parsed = assignmentUpdateSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "update_class_teacher_assignment",
      {
        target_assignment_id: parsed.data.assignmentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        assignment_starts_on: parsed.data.startsOn,
        assignment_ends_on: parsed.data.endsOn ?? nullableDate,
      },
      "Class-teacher dates updated.",
    )
  ).result;
}

export async function endClassTeacherAssignment(input: unknown) {
  const parsed = assignmentEndSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "end_class_teacher_assignment",
      {
        target_assignment_id: parsed.data.assignmentId,
        expected_updated_at: parsed.data.expectedUpdatedAt,
        assignment_ends_on: parsed.data.endsOn,
        reason: parsed.data.reason,
      },
      "Class-teacher assignment ended.",
    )
  ).result;
}

export async function replacePrimaryClassTeacher(input: unknown) {
  const parsed = primaryReplacementSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed);
  return (
    await runMutation(
      "replace_primary_class_teacher",
      {
        target_term_id: parsed.data.termId,
        target_class_section_id: parsed.data.classSectionId,
        target_staff_membership_id: parsed.data.staffMembershipId,
        replacement_starts_on: parsed.data.startsOn,
        reason: parsed.data.reason,
      },
      "Primary class teacher replaced atomically.",
    )
  ).result;
}
