import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const password = "synthetic-report-publication-trust-password";
const enabled = Boolean(url && anonKey && serviceKey && databaseUrl);

const admin = enabled
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
const db = new Client({
  connectionString: databaseUrl ?? "postgresql://invalid",
});

type Actor = {
  client: SupabaseClient;
  email: string;
  membershipId: string;
  userId: string;
};

let reportId = "";
let workflowVersion = 0;
let effectiveActor: Actor;
let futureActor: Actor;

async function createActor(key: string, grantedAt: string): Promise<Actor> {
  const email = `stage14-trust-${key}-${Date.now()}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const userId = auth.data.user.id;
  const membershipId = randomUUID();
  const school = await db.query<{ school_id: string }>(
    `select year.school_id
       from public.reports report
       join public.terms term on term.id = report.term_id
       join public.academic_years year on year.id = term.academic_year_id
      where report.id = $1`,
    [reportId],
  );
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Trust')",
    [userId, key],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [
      membershipId,
      school.rows[0].school_id,
      userId,
      `ST14-${key}-${Date.now()}`,
    ],
  );
  await db.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',$2)",
    [membershipId, grantedAt],
  );
  const client = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });
  if (selected.error) throw selected.error;
  return { client, email, membershipId, userId };
}

describe("Stage 14 artifact trust boundary", () => {
  beforeAll(async () => {
    if (!enabled) return;
    await db.connect();
    const report = await db.query<{
      id: string;
      workflow_version: number;
    }>(
      `select id, workflow_version
         from public.reports
        where status = 'GENERATED'
          and calculation_run_id is not null
          and superseded_by is null
          and pdf_storage_path is null
        order by created_at desc
        limit 1`,
    );
    if (!report.rows[0])
      throw new Error("A generated synthetic report is required.");
    reportId = report.rows[0].id;
    workflowVersion = report.rows[0].workflow_version;
    effectiveActor = await createActor(
      "effective",
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );
    futureActor = await createActor(
      "future",
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  afterAll(async () => {
    if (admin) {
      for (const userId of [effectiveActor?.userId, futureActor?.userId]) {
        if (userId) await admin.auth.admin.deleteUser(userId);
      }
    }
    if (enabled) await db.end();
  });

  it("1. uses a real signed-in user-session client", async () => {
    if (!enabled) return;
    await expect(
      effectiveActor.client.auth.getSession(),
    ).resolves.toMatchObject({
      data: { session: { user: { id: effectiveActor.userId } } },
    });
  });

  it("2. permits the effective REPORTS_GENERATE authority check", async () => {
    if (!enabled) return;
    const result = await effectiveActor.client.rpc(
      "authorize_report_artifact_generation",
      { target_report_id: reportId },
    );
    expect(result.error).toBeNull();
    expect(result.data?.[0].workflow_version).toBe(workflowVersion);
  });

  it("3. denies a future-dated REPORTS_GENERATE grant", async () => {
    if (!enabled) return;
    const result = await futureActor.client.rpc(
      "authorize_report_artifact_generation",
      { target_report_id: reportId },
    );
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("4. denies future-dated review authority", async () => {
    if (!enabled) return;
    const result = await futureActor.client.rpc("review_generated_report", {
      target_report_id: reportId,
      expected_workflow_version: workflowVersion,
    });
    expect(result.error).not.toBeNull();
  });

  it("5. denies future-dated publish authority", async () => {
    if (!enabled) return;
    const result = await futureActor.client.rpc("publish_reviewed_report", {
      target_report_id: reportId,
      expected_workflow_version: workflowVersion,
    });
    expect(result.error).not.toBeNull();
  });

  it("6. denies future-dated withdrawal authority", async () => {
    if (!enabled) return;
    const result = await futureActor.client.rpc("withdraw_published_report", {
      target_report_id: reportId,
      expected_workflow_version: workflowVersion,
      withdrawal_reason: "synthetic test",
    });
    expect(result.error).not.toBeNull();
  });

  it("7. allows the same actor after the grant becomes effective", async () => {
    if (!enabled) return;
    await db.query(
      "update public.staff_role_assignments set granted_at = now() - interval '1 minute' where membership_id = $1",
      [futureActor.membershipId],
    );
    const result = await futureActor.client.rpc(
      "authorize_report_artifact_generation",
      { target_report_id: reportId },
    );
    expect(result.error).toBeNull();
  });

  it("8. denies direct authenticated Storage upload", async () => {
    if (!enabled) return;
    const path = `${reportId}/${"b".repeat(64)}.pdf`;
    const result = await effectiveActor.client.storage
      .from("report-artifacts")
      .upload(path, Buffer.from("%PDF-forgery"), {
        contentType: "application/pdf",
        upsert: false,
      });
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("9. denies direct authenticated Storage update", async () => {
    if (!enabled) return;
    const result = await effectiveActor.client.storage
      .from("report-artifacts")
      .update(`${reportId}/${"b".repeat(64)}.pdf`, Buffer.from("%PDF-forgery"));
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("10. denies direct authenticated Storage delete", async () => {
    if (!enabled) return;
    const result = await effectiveActor.client.storage
      .from("report-artifacts")
      .remove([`${reportId}/${"b".repeat(64)}.pdf`]);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("11. denies direct authenticated Storage read", async () => {
    if (!enabled) return;
    const result = await effectiveActor.client.storage
      .from("report-artifacts")
      .download(`${reportId}/${"b".repeat(64)}.pdf`);
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("12. denies registration without a trusted server-created object", async () => {
    if (!enabled) return;
    const result = await effectiveActor.client.rpc(
      "register_report_pdf_artifact",
      {
        target_report_id: reportId,
        expected_workflow_version: workflowVersion,
        canonical_storage_path: `${reportId}/${"c".repeat(64)}.pdf`,
      },
    );
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("13. leaves artifact metadata unchanged after forged registration", async () => {
    if (!enabled) return;
    const result = await db.query(
      "select pdf_storage_path, file_checksum, pdf_size_bytes, pdf_renderer_version, workflow_version from public.reports where id = $1",
      [reportId],
    );
    expect(result.rows[0]).toMatchObject({
      pdf_storage_path: null,
      file_checksum: null,
      pdf_size_bytes: null,
      pdf_renderer_version: null,
      workflow_version: workflowVersion,
    });
  });

  it("14. emits no stored-artifact success audit for forged registration", async () => {
    if (!enabled) return;
    const result = await db.query<{ count: string }>(
      "select count(*)::text from public.audit_logs where entity_id = $1 and action = 'REPORT_ARTIFACT_STORED'",
      [reportId],
    );
    expect(result.rows[0].count).toBe("0");
  });
});
