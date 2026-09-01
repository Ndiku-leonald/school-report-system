import { createHash, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../../src/types/database.generated";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const enabled = Boolean(url && anonKey && serviceKey && databaseUrl);
const password = "synthetic-stage-fourteen-lifecycle-password";
const admin = enabled ? createClient<Database>(url!, serviceKey!) : null;
const db = new Client({
  connectionString: databaseUrl ?? "postgresql://invalid",
});

type Actor = {
  client: SupabaseClient<Database>;
  email: string;
  membershipId: string;
  userId: string;
};

type Evidence = {
  markSheetId: string;
  markSheetVersion: number;
  calculationRunId: string;
  calculationVersion: number;
  inputChecksum: string;
  outputChecksum: string;
  reportId: string;
  reportVersion: number;
  snapshotId: string;
  snapshotChecksum: string;
  snapshotData: unknown;
  artifactPath: string;
  artifactSha256: string;
  artifactBytes: Buffer;
  publishedAt: string;
  publishedBy: string;
  academic: {
    subjectScore: string | null;
    subjectGrade: string | null;
    aggregate: string | null;
    overallAverage: string | null;
    classPosition: number | null;
    gradePosition: number | null;
  };
  marks: string;
  calculatedSubjectRows: string;
  calculatedStudentRows: string;
};

const ids = Object.fromEntries(
  [
    "school",
    "year",
    "term",
    "grade",
    "section",
    "subject",
    "scheme",
    "component",
    "student",
    "enrollment",
    "assignment",
    "scale",
    "rule",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;

const createdUsers: string[] = [];
let teacher: Actor;
let reviewer: Actor;
let sheetId = "";

async function createActor(label: string, roles: string[]) {
  const email = `stage14-lifecycle-${label}-${Date.now()}@example.invalid`;
  const created = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  createdUsers.push(created.data.user.id);
  const membershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Lifecycle')",
    [created.data.user.id, label],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [
      membershipId,
      ids.school,
      created.data.user.id,
      `ST14-L-${label}-${Date.now()}`,
    ],
  );
  for (const role of roles)
    await db.query(
      "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,$3,now()-interval '1 day')",
      [randomUUID(), membershipId, role],
    );
  const client = createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: membershipId,
  });
  if (selected.error) throw selected.error;
  return { client, email, membershipId, userId: created.data.user.id };
}

async function updatedAt(table: "mark_sheets" | "terms", id: string) {
  const result = await db.query<{ updated_at: string }>(
    `select updated_at::text from public.${table} where id=$1`,
    [id],
  );
  return result.rows[0].updated_at;
}

async function uploadArtifact(path: string, bytes: Buffer, checksum: string) {
  const result = await admin!.storage
    .from("report-artifacts")
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
      metadata: { checksum },
    });
  if (result.error) throw result.error;
}

async function materialize(reportId: string) {
  const bytes = Buffer.from(`%PDF-stage14-real-lifecycle-${reportId}`);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const path = `${reportId}/${checksum}.pdf`;
  await uploadArtifact(path, bytes, checksum);
  const stored = await reviewer.client.rpc("register_report_pdf_artifact", {
    target_report_id: reportId,
    expected_workflow_version: 0,
    canonical_storage_path: path,
  });
  if (stored.error) throw stored.error;
  return {
    bytes,
    checksum,
    path,
    workflowVersion: Number(stored.data[0].workflow_version),
  };
}

async function reportEvidence(reportId: string): Promise<Evidence> {
  const result = await db.query<{
    mark_sheet_id: string;
    mark_sheet_version: number;
    calculation_run_id: string;
    calculation_version: number;
    input_checksum: string;
    output_checksum: string;
    report_version: number;
    snapshot_id: string;
    snapshot_checksum: string;
    snapshot_data: unknown;
    artifact_path: string;
    artifact_sha: string;
    published_at: string;
    published_by: string;
    subject_score: string | null;
    subject_grade: string | null;
    aggregate: string | null;
    overall_average: string | null;
    class_position: number | null;
    grade_position: number | null;
    marks: string;
    calculated_subject_rows: string;
    calculated_student_rows: string;
  }>(
    `select source.mark_sheet_id,source.mark_sheet_version,
        report.calculation_run_id,run.version calculation_version,
        source.input_checksum,source.output_checksum,report.version report_version,
        snapshot.id snapshot_id,snapshot.snapshot_checksum,snapshot.snapshot_data,
        report.pdf_storage_path artifact_path,report.file_checksum artifact_sha,
        report.published_at,report.published_by,
        subject.subject_score::text,subject.grade subject_grade,
        student.aggregate_total::text aggregate,student.overall_average::text overall_average,
        student.class_position,student.grade_level_position grade_position,
        (select jsonb_agg(to_jsonb(mark) order by mark.assessment_component_id)::text
           from public.marks mark where mark.mark_sheet_id=source.mark_sheet_id) marks,
        (select jsonb_agg(to_jsonb(subject_row) order by subject_row.subject_id)::text
           from public.calculated_subject_results subject_row
          where subject_row.calculation_run_id=report.calculation_run_id
            and subject_row.enrollment_id=report.enrollment_id) calculated_subject_rows,
        (select jsonb_agg(to_jsonb(student_row) order by student_row.enrollment_id)::text
           from public.calculated_student_results student_row
          where student_row.calculation_run_id=report.calculation_run_id
            and student_row.enrollment_id=report.enrollment_id) calculated_student_rows
     from public.reports report
     join public.result_calculation_runs run on run.id=report.calculation_run_id
     join public.report_snapshots snapshot on snapshot.report_id=report.id
     join public.report_snapshot_sources source on source.report_id=report.id
     join public.calculated_subject_results subject
       on subject.calculation_run_id=report.calculation_run_id
      and subject.enrollment_id=report.enrollment_id
      and subject.subject_id=$2
     join public.calculated_student_results student
       on student.calculation_run_id=report.calculation_run_id
      and student.enrollment_id=report.enrollment_id
    where report.id=$1`,
    [reportId, ids.subject],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Missing lifecycle evidence for ${reportId}.`);
  const downloaded = await admin!.storage
    .from("report-artifacts")
    .download(row.artifact_path);
  if (downloaded.error || !downloaded.data)
    throw downloaded.error ?? new Error("Lifecycle artifact is missing.");
  const artifactBytes = Buffer.from(await downloaded.data.arrayBuffer());
  return {
    markSheetId: row.mark_sheet_id,
    markSheetVersion: row.mark_sheet_version,
    calculationRunId: row.calculation_run_id,
    calculationVersion: row.calculation_version,
    inputChecksum: row.input_checksum,
    outputChecksum: row.output_checksum,
    reportId,
    reportVersion: row.report_version,
    snapshotId: row.snapshot_id,
    snapshotChecksum: row.snapshot_checksum,
    snapshotData: row.snapshot_data,
    artifactPath: row.artifact_path,
    artifactSha256: row.artifact_sha,
    artifactBytes,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    academic: {
      subjectScore: row.subject_score,
      subjectGrade: row.subject_grade,
      aggregate: row.aggregate,
      overallAverage: row.overall_average,
      classPosition: row.class_position,
      gradePosition: row.grade_position,
    },
    marks: row.marks,
    calculatedSubjectRows: row.calculated_subject_rows,
    calculatedStudentRows: row.calculated_student_rows,
  };
}

async function completeMarkSheetWorkflow() {
  const draft = await teacher.client.rpc("get_or_create_draft_mark_sheet", {
    target_teaching_assignment_id: ids.assignment,
  });
  expect(draft.error).toBeNull();
  sheetId = draft.data![0].mark_sheet_id;
  const saved = await teacher.client.rpc("save_mark_entries", {
    target_mark_sheet_id: sheetId,
    entries: [
      {
        assessmentComponentId: ids.component,
        enrollmentId: ids.enrollment,
        expectedRowVersion: null,
        score: 60,
        attendanceStatus: "PRESENT",
        teacherRemark: null,
      },
    ],
  });
  expect(saved.error).toBeNull();
  expect(
    (
      await teacher.client.rpc("submit_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await updatedAt("mark_sheets", sheetId),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await reviewer.client.rpc("start_mark_sheet_review", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await updatedAt("mark_sheets", sheetId),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await reviewer.client.rpc("approve_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await updatedAt("mark_sheets", sheetId),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await reviewer.client.rpc("advance_term_marks_to_review", {
        target_term_id: ids.term,
        expected_updated_at: await updatedAt("terms", ids.term),
      })
    ).error,
  ).toBeNull();
  expect(
    (
      await reviewer.client.rpc("lock_mark_sheet", {
        target_mark_sheet_id: sheetId,
        expected_updated_at: await updatedAt("mark_sheets", sheetId),
      })
    ).error,
  ).toBeNull();
  const lockedTerm = await reviewer.client.rpc("lock_term_marks", {
    target_term_id: ids.term,
    expected_updated_at: await updatedAt("terms", ids.term),
  });
  expect(lockedTerm.error).toBeNull();
}

async function calculate() {
  const result = await reviewer.client.rpc("calculate_grade_results", {
    target_term_id: ids.term,
    target_grade_level_id: ids.grade,
    target_grading_scale_id: ids.scale,
    target_ranking_rule_id: ids.rule,
  });
  if (result.error || !result.data?.[0])
    throw result.error ?? new Error("Calculation failed.");
  return result.data[0];
}

async function generateGradeReport(runId: string) {
  const result = await reviewer.client.rpc("generate_grade_report_snapshots", {
    target_calculation_run_id: runId,
  });
  if (result.error) throw result.error;
  const report = await db.query<{ id: string; version: number }>(
    "select id,version from public.reports where calculation_run_id=$1 and enrollment_id=$2",
    [runId, ids.enrollment],
  );
  if (!report.rows[0]) throw new Error("Stage 12 did not create the report.");
  return {
    ...result.data[0],
    reportId: report.rows[0].id,
    reportVersion: report.rows[0].version,
  };
}

describe("Stage 14 continuous real Stage 10-to-14 lifecycle", () => {
  beforeAll(async () => {
    if (!enabled) return;
    await db.connect();
    await db.query(
      "insert into public.schools(id,name,slug,school_code) values($1,'Stage 14 Lifecycle School',$2,$3)",
      [ids.school, `stage14-lifecycle-${Date.now()}`, `ST14L-${Date.now()}`],
    );
    teacher = await createActor("Teacher", ["SUBJECT_TEACHER"]);
    reviewer = await createActor("Reviewer", ["HEAD_TEACHER", "SCHOOL_ADMIN"]);
    await db.query(
      "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Lifecycle Year',current_date-90,current_date+90,'ACTIVE')",
      [ids.year, ids.school],
    );
    await db.query(
      "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Lifecycle Term',1,current_date-30,current_date+30,'MARKS_ENTRY')",
      [ids.term, ids.year],
    );
    await db.query(
      "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'L1','Lifecycle Grade',1)",
      [ids.grade, ids.school],
    );
    await db.query(
      "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Lifecycle Class','LFC')",
      [ids.section, ids.year, ids.grade],
    );
    await db.query(
      "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'LFS','Lifecycle Subject',1)",
      [ids.subject, ids.school],
    );
    await db.query(
      "insert into public.grade_level_subjects(grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,true,true,1)",
      [ids.grade, ids.subject],
    );
    await db.query(
      "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,version,status,effective_from,created_by) values($1,$2,$3,$4,'Lifecycle Scheme',1,'DRAFT',current_date-30,$5)",
      [ids.scheme, ids.term, ids.grade, ids.subject, teacher.membershipId],
    );
    await db.query(
      "update public.assessment_schemes set status='ACTIVE' where id=$1",
      [ids.scheme],
    );
    await db.query(
      "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Final','FINAL',100,100,1)",
      [ids.component, ids.scheme],
    );
    await db.query(
      "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,'ST14-L-001','Proof','Learner',current_date-60)",
      [ids.student, ids.school],
    );
    await db.query(
      "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE',current_date-30)",
      [ids.enrollment, ids.student, ids.year, ids.section],
    );
    await db.query(
      "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,current_date-30)",
      [
        ids.assignment,
        ids.term,
        ids.section,
        ids.subject,
        teacher.membershipId,
      ],
    );
    await db.query(
      "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Lifecycle Scale',1,true,current_date-30,$5)",
      [ids.scale, ids.school, ids.year, ids.grade, reviewer.membershipId],
    );
    await db.query(
      "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,80,'C',2,true,2),($1,80,100,'A',3,true,3)",
      [ids.scale],
    );
    await db.query(
      "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Lifecycle Ranking',1,'AVERAGE','DENSE',$5,true,$6)",
      [
        ids.rule,
        ids.school,
        ids.year,
        ids.grade,
        JSON.stringify({
          direction: "DESC",
          include_incomplete: true,
          minimum_subjects: 1,
        }),
        reviewer.membershipId,
      ],
    );
  });

  afterAll(async () => {
    if (admin)
      for (const userId of createdUsers)
        await admin.auth.admin.deleteUser(userId);
    if (enabled) await db.end();
  });

  it("proves the complete correction chain and immutable published predecessor", async () => {
    if (!enabled) return;
    await completeMarkSheetWorkflow();
    const v1Calculation = await calculate();
    const v1Run = await db.query<{
      version: number;
      input_checksum: string;
      output_checksum: string;
    }>(
      "select version,input_checksum,output_checksum from public.result_calculation_runs where id=$1",
      [v1Calculation.calculation_run_id],
    );
    const v1Batch = await generateGradeReport(v1Calculation.calculation_run_id);
    const v1Materialized = await materialize(v1Batch.reportId);
    const v1Reviewed = await reviewer.client.rpc("review_generated_report", {
      target_report_id: v1Batch.reportId,
      expected_workflow_version: v1Materialized.workflowVersion,
    });
    expect(v1Reviewed.error).toBeNull();
    const v1Published = await reviewer.client.rpc("publish_reviewed_report", {
      target_report_id: v1Batch.reportId,
      expected_workflow_version: Number(v1Reviewed.data![0].workflow_version),
    });
    expect(v1Published.error).toBeNull();
    const v1 = await reportEvidence(v1Batch.reportId);
    expect(v1.reportVersion).toBe(1);

    const reopened = await reviewer.client.rpc(
      "reopen_locked_term_for_mark_correction",
      {
        target_term_id: ids.term,
        expected_updated_at: await updatedAt("terms", ids.term),
        correction_reason: "Verified final score correction",
      },
    );
    expect(reopened.error).toBeNull();
    expect(reopened.data![0].term_status).toBe("MARKS_ENTRY");
    const correction = await reviewer.client.rpc(
      "create_mark_sheet_correction_revision",
      {
        source_mark_sheet_id: sheetId,
        expected_source_updated_at: await updatedAt("mark_sheets", sheetId),
        correction_reason: "Corrected final score",
      },
    );
    expect(correction.error).toBeNull();
    const correctionSheetId = correction.data![0].correction_sheet_id;
    expect(correction.data![0].correction_version).toBe(2);
    const correctedRow = await db.query<{ row_version: number }>(
      "select row_version from public.marks where mark_sheet_id=$1 and assessment_component_id=$2 and enrollment_id=$3",
      [correctionSheetId, ids.component, ids.enrollment],
    );
    const edited = await teacher.client.rpc("save_mark_entry", {
      target_mark_sheet_id: correctionSheetId,
      target_assessment_component_id: ids.component,
      target_enrollment_id: ids.enrollment,
      expected_row_version: correctedRow.rows[0].row_version,
      entered_score: 90,
      entered_attendance_status: "PRESENT",
      entered_teacher_remark: "Corrected final score",
    });
    expect(edited.error).toBeNull();
    const correctionSubmit = await teacher.client.rpc("submit_mark_sheet", {
      target_mark_sheet_id: correctionSheetId,
      expected_updated_at: await updatedAt("mark_sheets", correctionSheetId),
    });
    expect(correctionSubmit.error).toBeNull();
    const correctionReview = await reviewer.client.rpc(
      "start_mark_sheet_review",
      {
        target_mark_sheet_id: correctionSheetId,
        expected_updated_at: await updatedAt("mark_sheets", correctionSheetId),
      },
    );
    expect(correctionReview.error).toBeNull();
    const correctionApprove = await reviewer.client.rpc("approve_mark_sheet", {
      target_mark_sheet_id: correctionSheetId,
      expected_updated_at: await updatedAt("mark_sheets", correctionSheetId),
    });
    expect(correctionApprove.error).toBeNull();
    const relockSheet = await reviewer.client.rpc("lock_mark_sheet", {
      target_mark_sheet_id: correctionSheetId,
      expected_updated_at: await updatedAt("mark_sheets", correctionSheetId),
    });
    expect(relockSheet.error).toBeNull();
    const relockTerm = await reviewer.client.rpc("lock_term_marks", {
      target_term_id: ids.term,
      expected_updated_at: await updatedAt("terms", ids.term),
    });
    expect(relockTerm.error).toBeNull();

    const v2Calculation = await calculate();
    const v2Run = await db.query<{
      version: number;
      input_checksum: string;
      output_checksum: string;
    }>(
      "select version,input_checksum,output_checksum from public.result_calculation_runs where id=$1",
      [v2Calculation.calculation_run_id],
    );
    expect(v2Run.rows[0].version).toBeGreaterThan(v1Run.rows[0].version);
    expect(v2Run.rows[0].input_checksum).not.toBe(v1.inputChecksum);
    const v2Batch = await generateGradeReport(v2Calculation.calculation_run_id);
    const generatedStates = await db.query<{
      v1_status: string;
      v2_status: string;
      superseded_by: string;
    }>(
      "select (select status from public.reports where id=$1) v1_status,(select status from public.reports where id=$2) v2_status,(select superseded_by::text from public.reports where id=$1) superseded_by",
      [v1.reportId, v2Batch.reportId],
    );
    expect(generatedStates.rows[0]).toEqual({
      v1_status: "PUBLISHED",
      v2_status: "GENERATED",
      superseded_by: v2Batch.reportId,
    });
    const v2Materialized = await materialize(v2Batch.reportId);
    const v2Reviewed = await reviewer.client.rpc("review_generated_report", {
      target_report_id: v2Batch.reportId,
      expected_workflow_version: v2Materialized.workflowVersion,
    });
    expect(v2Reviewed.error).toBeNull();
    const reviewedStates = await db.query<{
      v1_status: string;
      v2_status: string;
    }>(
      "select (select status from public.reports where id=$1) v1_status,(select status from public.reports where id=$2) v2_status",
      [v1.reportId, v2Batch.reportId],
    );
    expect(reviewedStates.rows[0]).toEqual({
      v1_status: "PUBLISHED",
      v2_status: "REVIEWED",
    });
    const v2Published = await reviewer.client.rpc("publish_reviewed_report", {
      target_report_id: v2Batch.reportId,
      expected_workflow_version: Number(v2Reviewed.data![0].workflow_version),
    });
    expect(v2Published.error).toBeNull();
    const v2 = await reportEvidence(v2Batch.reportId);
    expect(v2.academic.subjectScore).not.toBe(v1.academic.subjectScore);
    const finalStates = await db.query<{
      v1_status: string;
      v2_status: string;
      current_published: string;
    }>(
      `select (select status from public.reports where id=$1) v1_status,
          (select status from public.reports where id=$2) v2_status,
          (select count(*)::text from public.reports report
             where report.term_id=$3 and report.enrollment_id=$4 and report.status='PUBLISHED') current_published`,
      [v1.reportId, v2.reportId, ids.term, ids.enrollment],
    );
    expect(finalStates.rows[0]).toEqual({
      v1_status: "SUPERSEDED",
      v2_status: "PUBLISHED",
      current_published: "1",
    });
    const v1After = await reportEvidence(v1.reportId);
    expect(v1After.markSheetId).toBe(v1.markSheetId);
    expect(v1After.markSheetVersion).toBe(v1.markSheetVersion);
    expect(v1After.inputChecksum).toBe(v1.inputChecksum);
    expect(v1After.outputChecksum).toBe(v1.outputChecksum);
    expect(v1After.snapshotId).toBe(v1.snapshotId);
    expect(v1After.snapshotChecksum).toBe(v1.snapshotChecksum);
    expect(v1After.snapshotData).toEqual(v1.snapshotData);
    expect(v1After.artifactPath).toBe(v1.artifactPath);
    expect(v1After.artifactSha256).toBe(v1.artifactSha256);
    expect(v1After.artifactBytes).toEqual(v1.artifactBytes);
    expect(v1After.publishedAt).toBe(v1.publishedAt);
    expect(v1After.publishedBy).toBe(v1.publishedBy);
    expect(v1After.marks).toBe(v1.marks);
    expect(v1After.calculatedSubjectRows).toBe(v1.calculatedSubjectRows);
    expect(v1After.calculatedStudentRows).toBe(v1.calculatedStudentRows);
    expect(v1After.academic).toEqual(v1.academic);
    console.info(
      "STAGE14_REAL_STAGE10_TO_14_LIFECYCLE",
      JSON.stringify({
        v1MarkSheetId: v1.markSheetId,
        v1MarkSheetVersion: v1.markSheetVersion,
        v1CalculationRunId: v1.calculationRunId,
        v1CalculationVersion: v1.calculationVersion,
        v1CalculationInputChecksum: v1.inputChecksum,
        v1CalculationOutputChecksum: v1.outputChecksum,
        v1ReportId: v1.reportId,
        v1ReportVersion: v1.reportVersion,
        v1SnapshotId: v1.snapshotId,
        v1SnapshotChecksum: v1.snapshotChecksum,
        v1SnapshotJson: v1.snapshotData,
        v1ArtifactPath: v1.artifactPath,
        v1ArtifactSha256: v1.artifactSha256,
        v1ArtifactByteLength: v1.artifactBytes.length,
        v1PublishedAt: v1.publishedAt,
        v1PublishedBy: v1.publishedBy,
        v1Academic: v1.academic,
        correctionMarkSheetId: correctionSheetId,
        correctionMarkSheetVersion: correction.data![0].correction_version,
        actualReopenRpc: "MARKS_ENTRY",
        correctionSubmit: "SUBMITTED",
        correctionReview: "REVIEW",
        correctionApprove: "APPROVED",
        correctionLock: "LOCKED",
        termRelock: "LOCKED",
        v2CalculationRunId: v2.calculationRunId,
        v2CalculationVersion: v2.calculationVersion,
        v2CalculationInputChecksum: v2.inputChecksum,
        v2CalculationOutputChecksum: v2.outputChecksum,
        v2ReportId: v2.reportId,
        v2ReportVersion: v2.reportVersion,
        v2SnapshotId: v2.snapshotId,
        v2SnapshotChecksum: v2.snapshotChecksum,
        v2ArtifactPath: v2.artifactPath,
        v2ArtifactSha256: v2.artifactSha256,
        v2ArtifactByteLength: v2.artifactBytes.length,
        v2Academic: v2.academic,
        v1StatusAfterV2Generation: "PUBLISHED",
        v1StatusAfterV2Review: "PUBLISHED",
        v1FinalStatus: "SUPERSEDED",
        v2FinalStatus: "PUBLISHED",
        v1AcademicContentUnchanged: true,
        v1SnapshotUnchanged: true,
        v1ArtifactBytesUnchanged: true,
      }),
    );
  });
});
