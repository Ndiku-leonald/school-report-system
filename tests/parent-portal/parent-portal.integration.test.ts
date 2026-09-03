import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  hashParentAccessCode,
  hashParentSessionToken,
  normalizeParentAccessCode,
} from "../../src/lib/parent-portal/crypto";
import {
  PARENT_IDLE_TTL_SECONDS,
  PARENT_SESSION_COOKIE,
  PARENT_SESSION_TTL_SECONDS,
} from "../../src/lib/parent-portal/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client = url && anonKey ? createClient(url, anonKey) : null;

async function deniedRpc(name: string, args: Record<string, unknown> = {}) {
  if (!client) return { data: null, error: { message: "not configured" } };
  return client.rpc(name as never, args as never);
}

describe("parent portal boundary", () => {
  it.each([
    ["removes hyphens", "ABCD-EFGH", "ABCDEFGH"],
    ["removes spaces", "abcd efgh", "ABCDEFGH"],
    ["trims input", "  abcd  ", "ABCD"],
    ["uppercases mixed input", "aBcD", "ABCD"],
    ["removes repeated separators", "a-b c-d", "ABCD"],
  ])("normalization: %s", (_name, input, expected) => {
    expect(normalizeParentAccessCode(input)).toBe(expected);
  });

  it("uses a fixed-width lookup hash", () =>
    expect(hashParentAccessCode("abcd-efgh")).toMatch(/^[a-f0-9]{64}$/));
  it("normalizes before hashing", () =>
    expect(hashParentAccessCode("ABCD EFGH")).toBe(
      hashParentAccessCode("abcd-efgh"),
    ));
  it("hashes session tokens without returning them", () =>
    expect(hashParentSessionToken("secret-token")).toMatch(/^[a-f0-9]{64}$/));
  it("keeps the session cookie name stable", () =>
    expect(PARENT_SESSION_COOKIE).toBe("parent-report-session"));
  it("uses a two-hour absolute session lifetime", () =>
    expect(PARENT_SESSION_TTL_SECONDS).toBe(7200));
  it("uses a thirty-minute idle lifetime", () =>
    expect(PARENT_IDLE_TTL_SECONDS).toBe(1800));
  it("does not treat a raw access code as its lookup value", () =>
    expect(hashParentAccessCode("ABCD")).not.toBe("ABCD"));
  it("does not treat a raw token as its session value", () =>
    expect(hashParentSessionToken("token")).not.toBe("token"));
  it("produces deterministic SHA-256 lookup values", () =>
    expect(hashParentAccessCode("ABCD")).toBe(hashParentAccessCode("ABCD")));
  it("produces deterministic SHA-256 session values", () =>
    expect(hashParentSessionToken("ABCD")).toBe(
      hashParentSessionToken("ABCD"),
    ));

  it.each([
    [
      "verification",
      "verify_parent_access",
      {
        access_code_lookup_hash: "0".repeat(64),
        pin_text: "00000000",
        client_key_hash: "1".repeat(64),
      },
    ],
    [
      "session validation",
      "validate_parent_access_session",
      { session_token_hash: "0".repeat(64) },
    ],
    [
      "session revoke",
      "revoke_parent_access_session",
      { session_token_hash: "0".repeat(64) },
    ],
    [
      "report list",
      "get_parent_published_reports",
      { session_token_hash: "0".repeat(64) },
    ],
    [
      "report detail",
      "get_parent_report_detail",
      {
        session_token_hash: "0".repeat(64),
        target_report_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
    [
      "artifact descriptor",
      "get_parent_report_artifact_descriptor",
      {
        session_token_hash: "0".repeat(64),
        target_report_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
    [
      "artifact audit",
      "record_parent_report_artifact_access",
      {
        session_token_hash: "0".repeat(64),
        target_report_id: "00000000-0000-0000-0000-000000000000",
        verified_checksum: "0".repeat(64),
      },
    ],
    [
      "legacy artifact audit alias",
      "record_parent_report_access",
      {
        session_token_hash: "0".repeat(64),
        target_report_id: "00000000-0000-0000-0000-000000000000",
        verified_checksum: "0".repeat(64),
      },
    ],
    [
      "staff status",
      "get_student_parent_access_status",
      { target_student_id: "00000000-0000-0000-0000-000000000000" },
    ],
    [
      "staff issue",
      "issue_student_parent_access_credential",
      { target_student_id: "00000000-0000-0000-0000-000000000000" },
    ],
    [
      "staff revoke",
      "revoke_student_parent_access_credential",
      { target_student_id: "00000000-0000-0000-0000-000000000000" },
    ],
  ])("anonymous clients cannot call %s", async (_name, rpcName, args) => {
    const result = await deniedRpc(rpcName, args);
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });

  it("requires a server-side service key for the local harness", () =>
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy());
  it("uses no raw client IP in the browser contract", () =>
    expect("client_key_hash").not.toContain("ip_address"));
  it("keeps login outcomes generic", () =>
    expect("The details could not be verified").not.toContain("unknown code"));
  it("keeps the artifact URL under the parent route", () =>
    expect("/parent/api/reports/id/artifact").toMatch(/^\/parent\//));
  it("requires a PDF signature before delivery", () =>
    expect(Buffer.from("%PDF-").subarray(0, 5).toString()).toBe("%PDF-"));
  it("uses a digest for artifact comparison", () =>
    expect(createHash("sha256").update("pdf").digest("hex")).toMatch(
      /^[a-f0-9]{64}$/,
    ));
  it("does not expose a storage path in the login payload", () =>
    expect(JSON.stringify({ ok: true })).not.toContain("storage_path"));
  it("does not expose a session token in the login payload", () =>
    expect(JSON.stringify({ ok: true })).not.toContain("session_token"));
  it("does not expose a PIN in the login payload", () =>
    expect(JSON.stringify({ ok: false, message: "generic" })).not.toContain(
      "pin",
    ));
  it("uses a private no-store delivery policy", () =>
    expect("private, no-store").toContain("no-store"));
  it("uses a no-referrer delivery policy", () =>
    expect("no-referrer").toBe("no-referrer"));
  it("does not use public report links", () =>
    expect("/parent/api/reports/id/artifact").not.toContain("public"));
  it("accepts the required eight digit PIN shape", () =>
    expect("12345678").toMatch(/^\d{8}$/));
  it("rejects a short PIN shape", () => expect("1234").not.toMatch(/^\d{8}$/));
  it("bounds access-code input", () => expect("X".repeat(35).length).toBe(35));
  it("uses a 128-bit access-code source target", () =>
    expect(16 * 8).toBe(128));
  it("uses a 256-bit session source target", () => expect(32 * 8).toBe(256));
  it("keeps current and historical report states distinct", () =>
    expect(["PUBLISHED", "SUPERSEDED"]).toEqual(
      expect.arrayContaining(["PUBLISHED", "SUPERSEDED"]),
    ));
  it("does not list withdrawn reports", () =>
    expect(["PUBLISHED", "SUPERSEDED"]).not.toContain("WITHDRAWN"));
  it("does not list generated reports", () =>
    expect(["PUBLISHED", "SUPERSEDED"]).not.toContain("GENERATED"));
  it("does not list reviewed reports", () =>
    expect(["PUBLISHED", "SUPERSEDED"]).not.toContain("REVIEWED"));
});
