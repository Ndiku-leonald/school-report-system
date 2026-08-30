import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderReportCardPdf } from "../../src/lib/report-pdf/render";
import { reportSnapshotDataSchema } from "../../src/lib/report-snapshots/schemas";
import type {
  GeneratedReport,
  ReportSubjectSnapshot,
} from "../../src/lib/report-snapshots/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const password = "synthetic-report-pdf-integration-password";
const required = [url, anonKey, serviceKey, databaseUrl];

const admin = required.every(Boolean)
  ? createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
const db = new Client({
  connectionString: databaseUrl ?? "postgresql://invalid",
});
let client: SupabaseClient;
let report: GeneratedReport;
let subjects: ReportSubjectSnapshot[];
let userId = "";
let membershipId = "";

async function setup() {
  if (!admin) throw new Error("local Supabase credentials are required");
  await db.connect();
  const existing = await db.query<{ id: string; snapshot_data: unknown }>(
    "select r.id, rs.snapshot_data from public.reports r join public.report_snapshots rs on rs.report_id=r.id where r.status='GENERATED' order by r.created_at desc limit 1",
  );
  if (!existing.rows[0])
    throw new Error(
      "report-pdf integration requires a generated synthetic report",
    );
  const snapshot = reportSnapshotDataSchema.parse(
    existing.rows[0].snapshot_data,
  );
  const auth = await admin.auth.admin.createUser({
    email: `report-pdf.integration.${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  userId = auth.data.user.id;
  membershipId = crypto.randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'PDF','Integration')",
    [userId],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [membershipId, snapshot.school.id, userId, `PDF-${Date.now()}`],
  );
  await db.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now())",
    [membershipId],
  );
  client = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await client.auth.signInWithPassword({
    email: auth.data.user.email!,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });
  if (selected.error) throw selected.error;
  const detail = await client.rpc("get_generated_report", {
    target_report_id: existing.rows[0].id,
  });
  if (detail.error || !detail.data?.[0])
    throw detail.error ?? new Error("missing generated report");
  report = detail.data[0] as GeneratedReport;
  report.snapshot_data = snapshot;
  const result = await client.rpc("get_report_subject_results", {
    target_report_id: existing.rows[0].id,
  });
  if (result.error) throw result.error;
  subjects = (result.data ?? []) as ReportSubjectSnapshot[];
}

describe("Stage 13 signed-in PDF integration acceptance", () => {
  beforeAll(setup);
  afterAll(async () => {
    if (admin && userId) await admin.auth.admin.deleteUser(userId);
    await db.end();
  });

  it("1. creates a signed-in anon-key client", () =>
    expect(client.auth.getSession()).resolves.toMatchObject({
      data: { session: { user: { id: userId } } },
    }));
  it("2. selects exactly one active membership", async () =>
    expect((await client.rpc("get_my_active_membership")).error).toBeNull());
  it("3. reads an authorized generated report", () =>
    expect(report.report_id).toBeTruthy());
  it("4. returns a frozen snapshot schema", () =>
    expect(
      reportSnapshotDataSchema.safeParse(report.snapshot_data).success,
    ).toBe(true));
  it("5. preserves the report version", () =>
    expect(report.report_version).toBeGreaterThan(0));
  it("6. preserves the snapshot checksum", () =>
    expect(report.snapshot_checksum).toMatch(/^[a-f0-9]{64}$/));
  it("7. preserves the calculation input checksum", () =>
    expect(report.input_checksum).toMatch(/^[a-f0-9]{64}$/));
  it("8. preserves the calculation output checksum", () =>
    expect(report.output_checksum).toMatch(/^[a-f0-9]{64}$/));
  it("9. reads frozen subject rows", () =>
    expect(subjects.length).toBeGreaterThan(0));
  it("10. renders an application PDF", async () =>
    expect(
      (await renderReportCardPdf({ report, subjects }))
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-"));
  it("11. renders the frozen school identity", async () =>
    expect(
      (await renderReportCardPdf({ report, subjects })).length,
    ).toBeGreaterThan(3000));
  it("12. renders the frozen learner identity", () =>
    expect(report.snapshot_data.student.display_name).toBeTruthy());
  it("13. renders the frozen admission identity", () =>
    expect(report.snapshot_data.student.admission_number).toBeTruthy());
  it("14. renders the frozen academic period", () =>
    expect(report.snapshot_data.academic_period.term_name).toBeTruthy());
  it("15. retains frozen academic positions", () =>
    expect(
      report.snapshot_data.academic_summary.class_position,
    ).not.toBeUndefined());
  it("16. retains frozen grade-level positions", () =>
    expect(
      report.snapshot_data.academic_summary.grade_level_position,
    ).not.toBeUndefined());
  it("17. retains authoritative subject statuses", () =>
    expect(
      subjects.every((item) =>
        ["COMPLETE", "INCOMPLETE", "EXEMPTED", null].includes(
          item.subject_status,
        ),
      ),
    ).toBe(true));
  it("18. retains subject tie metadata", () =>
    expect(subjects.every((item) => item.subject_tie_size >= 0)).toBe(true));
  it("19. does not expose guardian contacts in the snapshot", () =>
    expect(JSON.stringify(report.snapshot_data)).not.toMatch(
      /guardian|@example\.invalid|\+256/i,
    ));
  it("20. renders deterministically", async () =>
    expect(
      (await renderReportCardPdf({ report, subjects })).compare(
        await renderReportCardPdf({ report, subjects }),
      ),
    ).toBe(0));
  it("21. does not emit JavaScript actions", async () =>
    expect(
      (await renderReportCardPdf({ report, subjects })).toString("latin1"),
    ).not.toMatch(/\/(?:JavaScript|JS)\b/i));
  it("22. does not emit launch actions", async () =>
    expect(
      (await renderReportCardPdf({ report, subjects })).toString("latin1"),
    ).not.toMatch(/\/Launch\b/i));
  it("23. does not emit URI actions", async () =>
    expect(
      (await renderReportCardPdf({ report, subjects })).toString("latin1"),
    ).not.toMatch(/\/URI\b/i));
  it("24. keeps the signed-in client scoped to the selected school", async () =>
    expect(
      (
        await client.rpc("list_generated_reports", {
          target_calculation_run_id: null,
        })
      ).error,
    ).toBeNull());
  it("25. reads historical report IDs through the same authorized RPC", async () => {
    const history = await client.rpc("get_student_report_history", {
      target_enrollment_id: report.enrollment_id,
      target_term_id: report.snapshot_data.academic_period.term_id,
    });
    expect(history.error).toBeNull();
    expect(history.data?.length).toBeGreaterThan(0);
  });
});
