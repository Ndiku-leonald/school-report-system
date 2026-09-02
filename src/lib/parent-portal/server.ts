import "server-only";

import { cookies } from "next/headers";
import { headers } from "next/headers";

import { createAdministrativeSupabaseClient } from "@/lib/supabase/admin";

import {
  hashParentClientKey,
  hashParentAccessCode,
  hashParentSessionToken,
} from "./crypto";
import {
  PARENT_SESSION_COOKIE,
  type IssuedParentCredential,
  type ParentArtifactDescriptor,
  type ParentReportDetail,
  type ParentReportListItem,
  type ParentSession,
} from "./types";

type RpcResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

function rpc<T>(name: string, args: Record<string, unknown>) {
  return createAdministrativeSupabaseClient().rpc(
    name as never,
    args as never,
  ) as unknown as Promise<RpcResult<T>>;
}

function one<T>(data: T[] | null) {
  return data?.[0] ?? null;
}

export async function readParentSessionToken() {
  return (await cookies()).get(PARENT_SESSION_COOKIE)?.value ?? null;
}

export async function getParentSession(): Promise<ParentSession | null> {
  const token = await readParentSessionToken();
  if (!token) return null;
  const result = await rpc<ParentSession[]>("validate_parent_access_session", {
    session_token_hash: hashParentSessionToken(token),
  });
  if (result.error) return null;
  return one(result.data);
}

export async function requireParentSession() {
  const session = await getParentSession();
  if (!session) throw new Error("PARENT_SESSION_REQUIRED");
  return session;
}

export async function verifyParentLogin(
  accessCode: string,
  pin: string,
  clientKey: string,
) {
  const result = await rpc<
    { ok: boolean; session_token: string | null; retry_after_seconds: number }[]
  >("verify_parent_access", {
    access_code_lookup_hash: hashParentAccessCode(accessCode),
    pin_text: pin,
    client_key_hash: hashParentClientKey(clientKey),
  });
  if (result.error) return { ok: false, retryAfterSeconds: 0 };
  const row = one(result.data);
  if (!row?.ok || !row.session_token)
    return { ok: false, retryAfterSeconds: row?.retry_after_seconds ?? 0 };
  return { ok: true, token: row.session_token, retryAfterSeconds: 0 };
}

export async function getParentClientKey() {
  const requestHeaders = await headers();
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("user-agent") || "unknown-client";
}

export async function getParentReports() {
  const token = await readParentSessionToken();
  if (!token) return null;
  const result = await rpc<ParentReportListItem[]>(
    "get_parent_published_reports",
    {
      session_token_hash: hashParentSessionToken(token),
    },
  );
  if (result.error) return null;
  return result.data ?? [];
}

export async function getParentReportDetail(reportId: string) {
  const token = await readParentSessionToken();
  if (!token) return null;
  const result = await rpc<ParentReportDetail[]>("get_parent_report_detail", {
    session_token_hash: hashParentSessionToken(token),
    target_report_id: reportId,
  });
  if (result.error) return null;
  return one(result.data);
}

export async function getParentArtifactDescriptor(reportId: string) {
  const token = await readParentSessionToken();
  if (!token) return null;
  const result = await rpc<ParentArtifactDescriptor[]>(
    "get_parent_report_artifact_descriptor",
    {
      session_token_hash: hashParentSessionToken(token),
      target_report_id: reportId,
    },
  );
  if (result.error) return null;
  return one(result.data);
}

export async function recordParentArtifactAccess(
  reportId: string,
  checksum: string,
) {
  const token = await readParentSessionToken();
  if (!token) return false;
  const result = await rpc<boolean>("record_parent_report_artifact_access", {
    session_token_hash: hashParentSessionToken(token),
    target_report_id: reportId,
    verified_checksum: checksum,
  });
  return !result.error && result.data === true;
}

export async function revokeParentSession() {
  const token = await readParentSessionToken();
  if (!token) return;
  await rpc<boolean>("revoke_parent_access_session", {
    session_token_hash: hashParentSessionToken(token),
  });
}

export type { IssuedParentCredential };
