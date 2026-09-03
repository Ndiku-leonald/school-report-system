"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/authorization/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { IssuedParentCredential } from "./types";

export type ParentAccessStatus = {
  student_id: string;
  school_id: string;
  guardian_access_eligible: boolean;
  credential_id: string | null;
  credential_active: boolean | null;
  credential_created_at: string | null;
  last_used_at: string | null;
  locked_until: string | null;
  expires_at: string | null;
};

export type ParentAccessActionResult =
  | { ok: true; message: string; credential?: IssuedParentCredential }
  | { ok: false; message: string };

type RpcResponse<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

function safeError(error: { code?: string; message: string }) {
  if (error.code === "42501")
    return "You no longer have permission to manage parent access.";
  if (error.message.includes("NOT_ELIGIBLE"))
    return "Link an active guardian with report access before issuing credentials.";
  return "The parent-access change could not be saved. Refresh and try again.";
}

export async function getStudentParentAccessStatus(studentId: string) {
  await requirePermission("STUDENTS_MANAGE");
  const supabase = await createServerSupabaseClient();
  const result = (await supabase.rpc(
    "get_student_parent_access_status" as never,
    {
      target_student_id: studentId,
    } as never,
  )) as unknown as RpcResponse<ParentAccessStatus[]>;
  if (result.error) return null;
  return result.data?.[0] ?? null;
}

export async function issueStudentParentAccessCredential(
  studentId: string,
): Promise<ParentAccessActionResult> {
  await requirePermission("STUDENTS_MANAGE");
  const supabase = await createServerSupabaseClient();
  const result = (await supabase.rpc(
    "issue_student_parent_access_credential" as never,
    {
      target_student_id: studentId,
    } as never,
  )) as unknown as RpcResponse<IssuedParentCredential[]>;
  if (result.error || !result.data?.[0]) {
    return {
      ok: false,
      message: result.error
        ? safeError(result.error)
        : "No credentials were issued.",
    };
  }
  revalidatePath(`/dashboard/students/${studentId}`);
  return {
    ok: true,
    message: "Parent credentials generated. They are displayed once.",
    credential: result.data[0],
  };
}

export async function revokeStudentParentAccessCredential(
  studentId: string,
): Promise<ParentAccessActionResult> {
  await requirePermission("STUDENTS_MANAGE");
  const supabase = await createServerSupabaseClient();
  const result = (await supabase.rpc(
    "revoke_student_parent_access_credential" as never,
    {
      target_student_id: studentId,
    } as never,
  )) as unknown as RpcResponse<boolean>;
  if (result.error) return { ok: false, message: safeError(result.error) };
  revalidatePath(`/dashboard/students/${studentId}`);
  return {
    ok: true,
    message: result.data
      ? "Parent access revoked."
      : "No active parent credential was found.",
  };
}
