import { createHash, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.setConfig({ hookTimeout: 60_000, testTimeout: 60_000 });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const enabled = Boolean(url && anonKey && serviceKey && databaseUrl);
const password = "synthetic-report-publication-concurrency-password";
const admin = enabled ? createClient(url!, serviceKey!) : null;
const db = new Client({
  connectionString: databaseUrl ?? "postgresql://invalid",
});

type Actor = {
  client: SupabaseClient;
  membershipId: string;
  userId: string;
};

type Base = {
  reportId: string;
  batchId: string;
  termId: string;
  enrollmentId: string;
  runId: string;
  schoolId: string;
  gradeId: string;
  sectionId: string;
  snapshotData: unknown;
  snapshotSourceChecksum: string;
  snapshotChecksum: string;
};

const createdUsers: string[] = [];
let base: Base;
let actorA: Actor;
let actorB: Actor;
let currentRunId = "";
let templateEnrollmentId = "";

function client() {
  return createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createActor(label: string, schoolId: string) {
  const auth = await admin!.auth.admin.createUser({
    email: `stage14-concurrency-${label}-${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  createdUsers.push(auth.data.user.id);
  const membershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Concurrency')",
    [auth.data.user.id, label],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [
      membershipId,
      schoolId,
      auth.data.user.id,
      `ST14-C-${label}-${Date.now()}`,
    ],
  );
  await db.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [membershipId],
  );
  const signedIn = client();
  const login = await signedIn.auth.signInWithPassword({
    email: auth.data.user.email!,
    password,
  });
  if (login.error) throw login.error;
  const selected = await signedIn.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });
  if (selected.error) throw selected.error;
  return { client: signedIn, membershipId, userId: auth.data.user.id };
}

async function makeReport(label: string) {
  const reportId = randomUUID();
  const studentId = randomUUID();
  const enrollmentId = randomUUID();
  const resultId = randomUUID();
  const subjectResultId = randomUUID();
  const snapshotId = randomUUID();
  const snapshotSource = await db.query<{
    student_id: string;
    academic_year_id: string;
    class_section_id: string;
    admission_date: string;
    school_id: string;
    subject_id: string;
    mark_sheet_id: string;
    subject_count: number;
  }>(
    `select student.id as student_id, enrollment.academic_year_id,
            enrollment.class_section_id, student.admission_date, student.school_id,
            calculated.subject_id, calculated.mark_sheet_id, calculated.subject_count
       from public.enrollments enrollment
       join public.students student on student.id = enrollment.student_id
       join public.calculated_student_results calculated
         on calculated.enrollment_id = enrollment.id and calculated.calculation_run_id = $1
      where enrollment.id = $2
      limit 1`,
    [currentRunId, templateEnrollmentId],
  );
  const source = snapshotSource.rows[0];
  if (!source) throw new Error("The current calculation has no base result.");
  await db.query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) select $1,school_id,$2,first_name,last_name,admission_date from public.students where id=$3",
    [studentId, `${label}-${Date.now()}`, source.student_id],
  );
  await db.query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,$5)",
    [
      enrollmentId,
      studentId,
      source.academic_year_id,
      source.class_section_id,
      source.admission_date,
    ],
  );
  await db.query(
    `insert into public.calculated_student_results
       (id,calculation_run_id,enrollment_id,class_section_id,subject_count,
        complete_subject_count,subjects_passed,overall_total,overall_average,
        overall_grade,aggregate_total,aggregate_classification,is_complete,
        ranking_eligible,ranking_metric,class_position,grade_level_position,
        class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied)
     select $1,calculation_run_id,$2,class_section_id,subject_count,
        complete_subject_count,subjects_passed,overall_total,overall_average,
        overall_grade,aggregate_total,aggregate_classification,is_complete,
        ranking_eligible,ranking_metric,class_position,grade_level_position,
        class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied
       from public.calculated_student_results
      where calculation_run_id=$3 and enrollment_id=$4`,
    [resultId, enrollmentId, currentRunId, templateEnrollmentId],
  );
  await db.query(
    `insert into public.calculated_subject_results
       (id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,
        subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,
        has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied)
     select $1,calculation_run_id,$2,class_section_id,subject_id,mark_sheet_id,
        subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,
        has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied
       from public.calculated_subject_results
      where calculation_run_id=$3 and enrollment_id=$4`,
    [subjectResultId, enrollmentId, currentRunId, templateEnrollmentId],
  );
  await db.query(
    `insert into public.reports
       (id,batch_id,term_id,enrollment_id,template_id,version,status,
        calculation_run_id,snapshot_context_checksum,generated_at,created_by)
     select $1,batch_id,term_id,$2,template_id,1,'GENERATED',$4,
        $5,now(),created_by
       from public.reports where id=$3`,
    [
      reportId,
      enrollmentId,
      base.reportId,
      currentRunId,
      randomUUID().replaceAll("-", "").slice(0, 64).padEnd(64, "0"),
    ],
  );
  await db.query(
    `insert into public.report_snapshots
       (id,report_id,snapshot_version,snapshot_data,source_checksum,snapshot_checksum)
     select $1,$2,1,snapshot_data,source_checksum,$3
       from public.report_snapshots where report_id=$4 limit 1`,
    [
      snapshotId,
      reportId,
      randomUUID().replaceAll("-", "").slice(0, 64).padEnd(64, "0"),
      base.reportId,
    ],
  );
  await db.query(
    `insert into public.report_snapshot_sources
       (snapshot_id,report_id,calculation_run_id,calculated_student_result_id,
        input_checksum,output_checksum)
     select $1,$2,calculation_run_id,$3,input_checksum,output_checksum
       from public.report_snapshot_sources where report_id=$4 limit 1`,
    [snapshotId, reportId, resultId, base.reportId],
  );
  await db.query(
    `insert into public.report_subject_results
       (report_id,subject_id,subject_code,subject_name,subject_score,grade,
        aggregate_points,subject_position,subject_status,is_pass,assessed_weight,
        has_absence,has_exemption,subject_tie_size,subject_is_tied,teacher_comment,sort_order)
     select $1,subject_id,subject_code,subject_name,subject_score,grade,
        aggregate_points,subject_position,subject_status,is_pass,assessed_weight,
        has_absence,has_exemption,subject_tie_size,subject_is_tied,teacher_comment,sort_order
       from public.report_subject_results where report_id=$2`,
    [reportId, base.reportId],
  );
  return reportId;
}

async function storeArtifact(actor: Actor, reportId: string) {
  const bytes = Buffer.from(`%PDF-concurrency-${reportId}`);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const path = `${reportId}/${checksum}.pdf`;
  const uploaded = await admin!.storage
    .from("report-artifacts")
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploaded.error) throw uploaded.error;
  const result = await actor.client.rpc("register_report_pdf_artifact", {
    target_report_id: reportId,
    expected_workflow_version: 0,
    canonical_storage_path: path,
  });
  if (result.error) throw result.error;
  return {
    bytes,
    checksum,
    path,
    workflowVersion: Number(result.data?.[0]?.workflow_version),
  };
}

async function review(actor: Actor, reportId: string, version: number) {
  return actor.client.rpc("review_generated_report", {
    target_report_id: reportId,
    expected_workflow_version: version,
  });
}

async function publish(actor: Actor, reportId: string, version: number) {
  return actor.client.rpc("publish_reviewed_report", {
    target_report_id: reportId,
    expected_workflow_version: version,
  });
}

async function prepareReviewed(label: string) {
  const reportId = await makeReport(label);
  const stored = await storeArtifact(actorA, reportId);
  const result = await review(actorA, reportId, stored.workflowVersion);
  if (result.error) throw result.error;
  return {
    reportId,
    workflowVersion: Number(result.data?.[0]?.workflow_version),
  };
}

async function preparePublished(label: string) {
  const report = await prepareReviewed(label);
  const result = await publish(actorA, report.reportId, report.workflowVersion);
  if (result.error) throw result.error;
  return {
    reportId: report.reportId,
    workflowVersion: Number(result.data?.[0]?.workflow_version),
  };
}

async function waitForBlocked(holderPid: number) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const result = await db.query<{ waiting: boolean }>(
      `select exists (
         select 1 from pg_locks waiting
         join pg_locks holding on holding.locktype=waiting.locktype
          and holding.database is not distinct from waiting.database
          and holding.relation is not distinct from waiting.relation
          and holding.page is not distinct from waiting.page
          and holding.tuple is not distinct from waiting.tuple
          and holding.virtualxid is not distinct from waiting.virtualxid
          and holding.transactionid is not distinct from waiting.transactionid
          and holding.classid is not distinct from waiting.classid
          and holding.objid is not distinct from waiting.objid
          and holding.objsubid is not distinct from waiting.objsubid
          and holding.granted
         where not waiting.granted and holding.pid=$1
       ) as waiting`,
      [holderPid],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    "The competing PostgreSQL transaction never reached the lock barrier.",
  );
}

async function holdRow(
  table: string,
  id: string,
  callback: (holder: Client, pid: number) => Promise<void>,
) {
  const holder = new Client({ connectionString: databaseUrl! });
  await holder.connect();
  await holder.query("begin");
  const pid = Number(
    (await holder.query<{ pid: string }>("select pg_backend_pid() pid")).rows[0]
      .pid,
  );
  await holder.query(`select 1 from public.${table} where id=$1 for update`, [
    id,
  ]);
  try {
    await callback(holder, pid);
  } finally {
    await holder.query("rollback").catch(() => undefined);
    await holder.end();
  }
}

async function createSuccessor(reportId: string) {
  const runId = randomUUID();
  const resultId = randomUUID();
  const subjectResultId = randomUUID();
  const target = await db.query<{ run_id: string; enrollment_id: string }>(
    "select calculation_run_id as run_id,enrollment_id from public.reports where id=$1",
    [reportId],
  );
  if (!target.rows[0])
    throw new Error("The successor predecessor does not exist.");
  const targetRunId = target.rows[0].run_id;
  const targetEnrollmentId = target.rows[0].enrollment_id;
  await db.query(
    `insert into public.result_calculation_runs
       (id,term_id,grade_level_id,version,supersedes_run_id,grading_scale_id,
        ranking_rule_id,input_checksum,output_checksum,created_by)
     select $1,term_id,grade_level_id,version+1,id,grading_scale_id,ranking_rule_id,
        input_checksum,$2,created_by
       from public.result_calculation_runs where id=$3`,
    [runId, "c".repeat(64), targetRunId],
  );
  await db.query(
    `insert into public.result_calculation_sources
       (calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,
        assessment_scheme_id,grade_level_subject_id,curriculum_is_required,
        curriculum_contributes_to_aggregate,curriculum_sort_order)
     select $1,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,
        assessment_scheme_id,grade_level_subject_id,curriculum_is_required,
        curriculum_contributes_to_aggregate,curriculum_sort_order
       from public.result_calculation_sources where calculation_run_id=$2`,
    [runId, targetRunId],
  );
  await db.query(
    `insert into public.calculated_student_results
       (id,calculation_run_id,enrollment_id,class_section_id,subject_count,
        complete_subject_count,subjects_passed,overall_total,overall_average,
        overall_grade,aggregate_total,aggregate_classification,is_complete,
        ranking_eligible,ranking_metric,class_position,grade_level_position,
        class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied)
     select $1,$2,enrollment_id,class_section_id,subject_count,
        complete_subject_count,subjects_passed,overall_total,overall_average,
        overall_grade,aggregate_total,aggregate_classification,is_complete,
        ranking_eligible,ranking_metric,class_position,grade_level_position,
        class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied
       from public.calculated_student_results where calculation_run_id=$3
         and enrollment_id=$4`,
    [resultId, runId, targetRunId, targetEnrollmentId],
  );
  await db.query(
    `insert into public.calculated_subject_results
       (id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,
        subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,
        has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied)
     select $1,$2,enrollment_id,class_section_id,subject_id,mark_sheet_id,
        subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,
        has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied
       from public.calculated_subject_results where calculation_run_id=$3
         and enrollment_id=$4`,
    [subjectResultId, runId, targetRunId, targetEnrollmentId],
  );
  const generated = await actorA.client.rpc(
    "generate_student_report_snapshot",
    {
      target_calculation_run_id: runId,
      target_enrollment_id: targetEnrollmentId,
    },
  );
  if (generated.error || !generated.data?.[0])
    throw generated.error ?? new Error("successor generation failed");
  currentRunId = runId;
  templateEnrollmentId = targetEnrollmentId;
  return { runId, reportId: generated.data[0].report_id as string };
}

describe("Stage 14 deterministic concurrency acceptance", () => {
  beforeAll(async () => {
    if (!enabled) return;
    await db.connect();
    const found = await db.query<Base>(
      `select report.id as "reportId", report.batch_id as "batchId", report.term_id as "termId",
              report.enrollment_id as "enrollmentId", report.calculation_run_id as "runId",
              year.school_id as "schoolId", run.grade_level_id as "gradeId",
              enrollment.class_section_id as "sectionId", snapshot.snapshot_data as "snapshotData",
              snapshot.source_checksum as "snapshotSourceChecksum", snapshot.snapshot_checksum as "snapshotChecksum"
         from public.reports report
         join public.terms term on term.id=report.term_id
         join public.academic_years year on year.id=term.academic_year_id
         join public.result_calculation_runs run on run.id=report.calculation_run_id
         join public.enrollments enrollment on enrollment.id=report.enrollment_id
         join public.report_snapshots snapshot on snapshot.report_id=report.id
        where report.status='GENERATED' and report.superseded_by is null
          and report.pdf_storage_path is null
        order by report.created_at desc limit 1`,
    );
    if (!found.rows[0])
      throw new Error(
        "A generated report is required for concurrency acceptance.",
      );
    base = found.rows[0];
    currentRunId = base.runId;
    templateEnrollmentId = base.enrollmentId;
    actorA = await createActor("A", base.schoolId);
    actorB = await createActor("B", base.schoolId);
  });

  afterEach(async () => {
    if (!enabled) return;
    await db.query(
      "update public.school_staff_memberships set status='ACTIVE' where id = any($1::uuid[])",
      [[actorA.membershipId, actorB.membershipId]],
    );
    await db.query(
      "update public.staff_role_assignments set revoked_at=null where membership_id = any($1::uuid[])",
      [[actorA.membershipId, actorB.membershipId]],
    );
    await actorA.client.rpc("set_my_active_membership", {
      target_membership_id: actorA.membershipId,
    });
    await actorB.client.rpc("set_my_active_membership", {
      target_membership_id: actorB.membershipId,
    });
    await db.query(
      "select set_config('app.term_marks_workflow_transition','allowed',true)",
    );
    await db.query("update public.terms set status='LOCKED' where id=$1", [
      base.termId,
    ]);
  });

  afterAll(async () => {
    if (admin)
      for (const userId of createdUsers)
        await admin.auth.admin.deleteUser(userId);
    if (enabled) await db.end();
  });

  it("1. double artifact registration commits one row, one version increment, one audit, and one canonical object", async () => {
    if (!enabled) return;
    const reportId = await makeReport("double-registration");
    const bytes = Buffer.from(`%PDF-double-registration-${reportId}`);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const path = `${reportId}/${checksum}.pdf`;
    expect(
      (
        await admin!.storage.from("report-artifacts").upload(path, bytes, {
          contentType: "application/pdf",
          upsert: false,
        })
      ).error,
    ).toBeNull();
    let results: Awaited<ReturnType<typeof actorA.client.rpc>>[] = [];
    await holdRow("reports", reportId, async (holder, pid) => {
      const pending = Promise.all([
        actorA.client.rpc("register_report_pdf_artifact", {
          target_report_id: reportId,
          expected_workflow_version: 0,
          canonical_storage_path: path,
        }),
        actorB.client.rpc("register_report_pdf_artifact", {
          target_report_id: reportId,
          expected_workflow_version: 0,
          canonical_storage_path: path,
        }),
      ]);
      await waitForBlocked(pid);
      await holder.query("commit");
      results = await pending;
    });
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    const row = await db.query<{
      workflow_version: number;
      path: string;
      audits: string;
    }>(
      `select report.workflow_version, report.pdf_storage_path as path,
        (select count(*)::text from public.audit_logs where entity_id=report.id and action='REPORT_ARTIFACT_STORED') audits
       from public.reports report where report.id=$1`,
      [reportId],
    );
    expect(row.rows[0]).toMatchObject({ workflow_version: 1, path });
    expect(row.rows[0].audits).toBe("1");
  });

  it("2. double review produces one transition, one workflow increment, and one review audit", async () => {
    if (!enabled) return;
    const reportId = await makeReport("double-review");
    const stored = await storeArtifact(actorA, reportId);
    let results: Awaited<ReturnType<typeof review>>[] = [];
    await holdRow("reports", reportId, async (holder, pid) => {
      const pending = Promise.all([
        review(actorA, reportId, stored.workflowVersion),
        review(actorB, reportId, stored.workflowVersion),
      ]);
      await waitForBlocked(pid);
      await holder.query("commit");
      results = await pending;
    });
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    const row = await db.query<{
      status: string;
      workflow_version: number;
      audits: string;
    }>(
      `select status,workflow_version,(select count(*)::text from public.audit_logs where entity_id=reports.id and action='REPORT_REVIEWED') audits from public.reports where id=$1`,
      [reportId],
    );
    expect(row.rows[0]).toMatchObject({
      status: "REVIEWED",
      workflow_version: 2,
      audits: "1",
    });
  });

  it("3. double publish produces one published row, one transition, and one publish audit", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("double-publish");
    let results: Awaited<ReturnType<typeof publish>>[] = [];
    await holdRow("reports", report.reportId, async (holder, pid) => {
      const pending = Promise.all([
        publish(actorA, report.reportId, report.workflowVersion),
        publish(actorB, report.reportId, report.workflowVersion),
      ]);
      await waitForBlocked(pid);
      await holder.query("commit");
      results = await pending;
    });
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    const row = await db.query<{
      status: string;
      workflow_version: number;
      audits: string;
      published: string;
    }>(
      `select status,workflow_version,(select count(*)::text from public.audit_logs where entity_id=reports.id and action='REPORT_PUBLISHED') audits,
        (select count(*)::text from public.reports candidate where candidate.term_id=reports.term_id and candidate.enrollment_id=reports.enrollment_id and candidate.status='PUBLISHED') published
       from public.reports where id=$1`,
      [report.reportId],
    );
    expect(row.rows[0]).toMatchObject({
      status: "PUBLISHED",
      workflow_version: 3,
      audits: "1",
      published: "1",
    });
  });

  it("4. role revocation that holds the live assignment lock wins and publication has no audit", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("role-revocation");
    await holdRow(
      "staff_role_assignments",
      actorA.membershipId,
      async (holder, pid) => {
        const pending = publish(
          actorA,
          report.reportId,
          report.workflowVersion,
        );
        await waitForBlocked(pid);
        await holder.query(
          "update public.staff_role_assignments set revoked_at=now() where membership_id=$1",
          [actorA.membershipId],
        );
        await holder.query("commit");
        const result = await pending;
        expect(result.error).not.toBeNull();
      },
    );
    const count = await db.query<{ count: string }>(
      "select count(*)::text from public.audit_logs where entity_id=$1 and action='REPORT_PUBLISHED'",
      [report.reportId],
    );
    expect(count.rows[0].count).toBe("0");
  });

  it("5. membership suspension that holds the membership lock wins and publication is denied", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("membership-suspension");
    await holdRow(
      "school_staff_memberships",
      actorA.membershipId,
      async (holder, pid) => {
        const pending = publish(
          actorA,
          report.reportId,
          report.workflowVersion,
        );
        await waitForBlocked(pid);
        await holder.query(
          "update public.school_staff_memberships set status='SUSPENDED' where id=$1",
          [actorA.membershipId],
        );
        await holder.query("commit");
        expect((await pending).error).not.toBeNull();
      },
    );
    const status = await db.query<{ status: string }>(
      "select status from public.reports where id=$1",
      [report.reportId],
    );
    expect(status.rows[0].status).toBe("REVIEWED");
  });

  it("6. selected-membership switch wins and the old-school publication has no scope union", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("membership-switch");
    const otherSchool = randomUUID();
    await db.query(
      "insert into public.schools(id,name,slug,school_code) values($1,'Concurrency Other School',$2,$3)",
      [otherSchool, `concurrency-other-${Date.now()}`, `CO-${Date.now()}`],
    );
    const secondMembership = randomUUID();
    await db.query(
      "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) select $1,$2,profile_id,$3,'ACTIVE' from public.school_staff_memberships where id=$4",
      [
        secondMembership,
        otherSchool,
        `ST14-C-SW-${Date.now()}`,
        actorA.membershipId,
      ],
    );
    await db.query(
      "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
      [secondMembership],
    );
    expect(
      (
        await actorA.client.rpc("set_my_active_membership", {
          target_membership_id: secondMembership,
        })
      ).error,
    ).toBeNull();
    expect(
      (await publish(actorA, report.reportId, report.workflowVersion)).error,
    ).not.toBeNull();
  });

  it("7. publication that commits before revocation makes the next mutation fail", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("publication-authority-wins");
    const published = await publish(
      actorB,
      report.reportId,
      report.workflowVersion,
    );
    expect(published.error).toBeNull();
    await db.query(
      "update public.staff_role_assignments set revoked_at=now() where membership_id=$1",
      [actorB.membershipId],
    );
    expect(
      (
        await actorB.client.rpc("withdraw_published_report", {
          target_report_id: report.reportId,
          expected_workflow_version: published.data?.[0]?.workflow_version,
          withdrawal_reason: "race",
        })
      ).error,
    ).not.toBeNull();
  });

  it("8. term reopen that commits behind the source lock makes the waiting publication fail source finality", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("term-reopen-wins");
    await holdRow("terms", base.termId, async (holder, pid) => {
      const pending = publish(actorA, report.reportId, report.workflowVersion);
      await waitForBlocked(pid);
      await holder.query(
        "select set_config('app.term_marks_workflow_transition','allowed',true)",
      );
      await holder.query(
        "update public.terms set status='REVIEW' where id=$1",
        [base.termId],
      );
      await holder.query("commit");
      expect((await pending).error).not.toBeNull();
    });
    await db.query(
      "select set_config('app.term_marks_workflow_transition','allowed',true)",
    );
    await db.query("update public.terms set status='LOCKED' where id=$1", [
      base.termId,
    ]);
  });

  it("9. publication wins the term race and the later reopen cannot undo publication", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("publication-term-wins");
    const published = await publish(
      actorA,
      report.reportId,
      report.workflowVersion,
    );
    expect(published.error).toBeNull();
    await db.query(
      "select set_config('app.term_marks_workflow_transition','allowed',true)",
    );
    await db.query("update public.terms set status='REVIEW' where id=$1", [
      base.termId,
    ]);
    const row = await db.query<{ status: string }>(
      "select status from public.reports where id=$1",
      [report.reportId],
    );
    expect(row.rows[0].status).toBe("PUBLISHED");
    await db.query("update public.terms set status='LOCKED' where id=$1", [
      base.termId,
    ]);
  });

  it("10. successor generation wins and supersedes an old reviewed candidate before publication", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("successor-generation-wins");
    const successor = await createSuccessor(report.reportId);
    const old = await db.query<{ status: string }>(
      "select status from public.reports where id=$1",
      [report.reportId],
    );
    expect(old.rows[0].status).toBe("SUPERSEDED");
    expect(
      (await publish(actorA, report.reportId, report.workflowVersion)).error,
    ).not.toBeNull();
    const current = await db.query<{ status: string }>(
      "select status from public.reports where id=$1",
      [successor.reportId],
    );
    expect(current.rows[0].status).toBe("GENERATED");
  });

  it("11. publication wins before successor generation and keeps the predecessor published", async () => {
    if (!enabled) return;
    const report = await prepareReviewed("publication-successor-wins");
    const published = await publish(
      actorA,
      report.reportId,
      report.workflowVersion,
    );
    expect(published.error).toBeNull();
    const successor = await createSuccessor(report.reportId);
    const rows = await db.query<{ old_status: string; new_status: string }>(
      "select (select status from public.reports where id=$1) old_status,(select status from public.reports where id=$2) new_status",
      [report.reportId, successor.reportId],
    );
    expect(rows.rows[0]).toEqual({
      old_status: "PUBLISHED",
      new_status: "GENERATED",
    });
  });

  it("12. successor publish versus predecessor withdrawal has deterministic valid outcomes", async () => {
    if (!enabled) return;
    const withdrawn = await preparePublished("withdrawal-wins");
    const successorA = await createSuccessor(withdrawn.reportId);
    const withdrawal = await actorA.client.rpc("withdraw_published_report", {
      target_report_id: withdrawn.reportId,
      expected_workflow_version: withdrawn.workflowVersion,
      withdrawal_reason: "correction",
    });
    expect(withdrawal.error).toBeNull();
    const storedA = await storeArtifact(actorA, successorA.reportId);
    expect(
      (await review(actorA, successorA.reportId, storedA.workflowVersion))
        .error,
    ).toBeNull();
    const reviewedA = await db.query<{ workflow_version: number }>(
      "select workflow_version from public.reports where id=$1",
      [successorA.reportId],
    );
    expect(
      (
        await publish(
          actorA,
          successorA.reportId,
          reviewedA.rows[0].workflow_version,
        )
      ).error,
    ).toBeNull();

    const published = await preparePublished("successor-publication-wins");
    const successorB = await createSuccessor(published.reportId);
    const storedB = await storeArtifact(actorA, successorB.reportId);
    expect(
      (await review(actorA, successorB.reportId, storedB.workflowVersion))
        .error,
    ).toBeNull();
    const reviewedB = await db.query<{ workflow_version: number }>(
      "select workflow_version from public.reports where id=$1",
      [successorB.reportId],
    );
    expect(
      (
        await publish(
          actorA,
          successorB.reportId,
          reviewedB.rows[0].workflow_version,
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await actorA.client.rpc("withdraw_published_report", {
          target_report_id: published.reportId,
          expected_workflow_version: published.workflowVersion,
          withdrawal_reason: "too late",
        })
      ).error,
    ).not.toBeNull();
    const rows = await db.query<{ old_status: string; new_status: string }>(
      "select (select status from public.reports where id=$1) old_status,(select status from public.reports where id=$2) new_status",
      [published.reportId, successorB.reportId],
    );
    expect(rows.rows[0]).toEqual({
      old_status: "SUPERSEDED",
      new_status: "PUBLISHED",
    });
  });

  it("13. real Stage 12 successor generation and Stage 14 publication preserve v1 identity and bytes", async () => {
    if (!enabled) return;
    const v1 = await preparePublished("lifecycle-published");
    const before = await db.query<{
      snapshot_data: unknown;
      snapshot_checksum: string;
      input_checksum: string;
      output_checksum: string;
      subject_rows: string;
      storage_path: string;
      file_checksum: string;
      published_at: string;
      published_by: string;
    }>(
      `select snapshot.snapshot_data,snapshot.snapshot_checksum,source.input_checksum,
          source.output_checksum,
          (select jsonb_agg(subject order by subject.sort_order,subject.subject_id)::text
             from public.report_subject_results subject where subject.report_id=report.id) subject_rows,
          report.pdf_storage_path storage_path,report.file_checksum,report.published_at,report.published_by
       from public.reports report
       join public.report_snapshots snapshot on snapshot.report_id=report.id
       join public.report_snapshot_sources source on source.report_id=report.id
      where report.id=$1`,
      [v1.reportId],
    );
    const old = before.rows[0];
    const oldBytes = await admin!.storage
      .from("report-artifacts")
      .download(old.storage_path);
    if (oldBytes.error || !oldBytes.data)
      throw oldBytes.error ?? new Error("v1 artifact missing");
    const successor = await createSuccessor(v1.reportId);
    const generated = await db.query<{
      old_status: string;
      new_status: string;
      superseded_by: string;
    }>(
      `select (select status from public.reports where id=$1) old_status,
          (select status from public.reports where id=$2) new_status,
          (select superseded_by::text from public.reports where id=$1) superseded_by`,
      [v1.reportId, successor.reportId],
    );
    expect(generated.rows[0]).toEqual({
      old_status: "PUBLISHED",
      new_status: "GENERATED",
      superseded_by: successor.reportId,
    });
    const stored = await storeArtifact(actorA, successor.reportId);
    const reviewed = await review(
      actorA,
      successor.reportId,
      stored.workflowVersion,
    );
    expect(reviewed.error).toBeNull();
    const published = await publish(
      actorA,
      successor.reportId,
      Number(reviewed.data?.[0]?.workflow_version),
    );
    expect(published.error).toBeNull();
    const after = await db.query<{
      status: string;
      snapshot_data: unknown;
      snapshot_checksum: string;
      input_checksum: string;
      output_checksum: string;
      subject_rows: string;
      storage_path: string;
      file_checksum: string;
      published_at: string;
      published_by: string;
    }>(
      `select report.status,snapshot.snapshot_data,snapshot.snapshot_checksum,source.input_checksum,
          source.output_checksum,
          (select jsonb_agg(subject order by subject.sort_order,subject.subject_id)::text
             from public.report_subject_results subject where subject.report_id=report.id) subject_rows,
          report.pdf_storage_path storage_path,report.file_checksum,report.published_at,report.published_by
       from public.reports report
       join public.report_snapshots snapshot on snapshot.report_id=report.id
       join public.report_snapshot_sources source on source.report_id=report.id
      where report.id=$1`,
      [v1.reportId],
    );
    expect(after.rows[0]).toMatchObject({
      status: "SUPERSEDED",
      snapshot_data: old.snapshot_data,
      snapshot_checksum: old.snapshot_checksum,
      input_checksum: old.input_checksum,
      output_checksum: old.output_checksum,
      subject_rows: old.subject_rows,
      storage_path: old.storage_path,
      file_checksum: old.file_checksum,
      published_at: old.published_at,
      published_by: old.published_by,
    });
    const oldBytesAfter = await admin!.storage
      .from("report-artifacts")
      .download(old.storage_path);
    if (oldBytesAfter.error || !oldBytesAfter.data)
      throw oldBytesAfter.error ?? new Error("v1 artifact was lost");
    expect(Buffer.from(await oldBytesAfter.data.arrayBuffer())).toEqual(
      Buffer.from(await oldBytes.data.arrayBuffer()),
    );
    expect(stored.checksum).not.toBe(old.file_checksum);
    expect(successor.reportId).not.toBe(v1.reportId);
  });

  it("14. a withdrawn predecessor remains withdrawn after an actual successor is published", async () => {
    if (!enabled) return;
    const v1 = await preparePublished("lifecycle-withdrawn");
    const withdrawal = await actorA.client.rpc("withdraw_published_report", {
      target_report_id: v1.reportId,
      expected_workflow_version: v1.workflowVersion,
      withdrawal_reason: "Correction retained as history",
    });
    expect(withdrawal.error).toBeNull();
    const successor = await createSuccessor(v1.reportId);
    const stored = await storeArtifact(actorA, successor.reportId);
    const reviewed = await review(
      actorA,
      successor.reportId,
      stored.workflowVersion,
    );
    expect(reviewed.error).toBeNull();
    expect(
      (
        await publish(
          actorA,
          successor.reportId,
          Number(reviewed.data?.[0]?.workflow_version),
        )
      ).error,
    ).toBeNull();
    const rows = await db.query<{
      old_status: string;
      old_reason: string;
      new_status: string;
    }>(
      `select (select status from public.reports where id=$1) old_status,
          (select withdrawal_reason from public.reports where id=$1) old_reason,
          (select status from public.reports where id=$2) new_status`,
      [v1.reportId, successor.reportId],
    );
    expect(rows.rows[0]).toEqual({
      old_status: "WITHDRAWN",
      old_reason: "Correction retained as history",
      new_status: "PUBLISHED",
    });
  });
});
