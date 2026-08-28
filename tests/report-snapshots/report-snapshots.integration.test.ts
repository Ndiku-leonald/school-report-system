import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
for (const [name, value] of Object.entries({
  url,
  anonKey,
  serviceKey,
  databaseUrl,
})) {
  if (!value)
    throw new Error(
      `${name} is required for report snapshot integration tests.`,
    );
}

const admin = createClient(url!, serviceKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new Client({ connectionString: databaseUrl! });
const ids = Object.fromEntries(
  [
    "school",
    "user",
    "membership",
    "year",
    "term",
    "grade",
    "section",
    "subject",
    "mapping",
    "student",
    "enrollment",
    "assignment",
    "scheme",
    "component",
    "sheet",
    "scale",
    "rule",
    "run",
    "run2",
    "source",
    "studentResult",
    "subjectResult",
    "attendance",
    "comment",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;
const password = "synthetic-report-snapshot-password";
let client: SupabaseClient;

async function query(text: string, values: unknown[] = []) {
  return db.query(text, values);
}

async function createRun(
  id: string,
  sourceId: string,
  resultId: string,
  subjectResultId: string,
  version: number,
  supersedesRunId: string | null,
  score: number,
) {
  await query(
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,supersedes_run_id,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      id,
      ids.term,
      ids.grade,
      version,
      supersedesRunId,
      ids.scale,
      ids.rule,
      String.fromCharCode(96 + version).repeat(64),
      String.fromCharCode(97 + version).repeat(64),
      ids.membership,
    ],
  );
  await query(
    "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values($1,$2,$3,$4,$5,1,$6,$7,true,true,1)",
    [
      sourceId,
      id,
      ids.sheet,
      ids.section,
      ids.subject,
      ids.scheme,
      ids.mapping,
    ],
  );
  await query(
    "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) values($1,$2,$3,$4,1,1,1,$5,$5,'A',3,'Advanced',true,true,$5,1,1,1,1,false,false)",
    [resultId, id, ids.enrollment, ids.section, score],
  );
  await query(
    "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) values($1,$2,$3,$4,$5,$6,'COMPLETE',$7,'A',3,true,100,false,false,1,1,false)",
    [
      subjectResultId,
      id,
      ids.enrollment,
      ids.section,
      ids.subject,
      ids.sheet,
      score,
    ],
  );
}

async function setup() {
  await db.connect();
  const auth = await admin.auth.admin.createUser({
    email: `report-snapshot.${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  ids.user = auth.data.user.id;
  await query(
    "insert into public.schools(id,name,slug,school_code) values($1,'Snapshot School',$2,'SNAP')",
    [ids.school, `snapshot-${Date.now()}`],
  );
  await query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Snapshot','Admin')",
    [ids.user],
  );
  await query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,'SNAP-ADMIN','ACTIVE')",
    [ids.membership, ids.school, ids.user],
  );
  await query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [ids.membership],
  );
  await query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Snapshot Year','2045-01-01','2045-12-31','ACTIVE')",
    [ids.year, ids.school],
  );
  await query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Snapshot Term',1,'2045-01-01','2045-06-30','LOCKED')",
    [ids.term, ids.year],
  );
  await query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'S1','Snapshot Grade',1)",
    [ids.grade, ids.school],
  );
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Snapshot Class','SNAP-A')",
    [ids.section, ids.year, ids.grade],
  );
  await query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'SNP','Snapshot Subject',1)",
    [ids.subject, ids.school],
  );
  await query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,sort_order) values($1,$2,$3,1)",
    [ids.mapping, ids.grade, ids.subject],
  );
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,'SNAP-001','Frozen','Student','2045-01-02')",
    [ids.student, ids.school],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,'2045-01-02')",
    [ids.enrollment, ids.student, ids.year, ids.section],
  );
  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2045-01-02')",
    [ids.assignment, ids.term, ids.section, ids.subject, ids.membership],
  );
  await query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Snapshot Scheme','DRAFT','2045-01-02',$5)",
    [ids.scheme, ids.term, ids.grade, ids.subject, ids.membership],
  );
  await query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Exam','EXAM',100,100,1)",
    [ids.component, ids.scheme],
  );
  await query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [ids.scheme],
  );
  await query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,workflow_status,locked_by,locked_at) values($1,$2,$3,$4,$5,$6,'LOCKED',$7,now())",
    [
      ids.sheet,
      ids.term,
      ids.section,
      ids.subject,
      ids.scheme,
      ids.assignment,
      ids.membership,
    ],
  );
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,effective_from,created_by) values($1,$2,$3,$4,'Snapshot Scale','2045-01-02',$5)",
    [ids.scale, ids.school, ids.year, ids.grade, ids.membership],
  );
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Snapshot Ranking','AVERAGE','DENSE','{}',true,$5)",
    [ids.rule, ids.school, ids.year, ids.grade, ids.membership],
  );
  await query(
    "insert into public.term_attendance(id,term_id,enrollment_id,days_open,days_present,days_absent,times_late,recorded_by) values($1,$2,$3,90,84,6,2,$4)",
    [ids.attendance, ids.term, ids.enrollment, ids.membership],
  );
  await query(
    "insert into public.student_term_comments(id,term_id,enrollment_id,class_teacher_comment,head_teacher_comment,conduct_grade,created_by,updated_by) values($1,$2,$3,'Comment A','Head A','A',$4,$4)",
    [ids.comment, ids.term, ids.enrollment, ids.membership],
  );
  await createRun(
    ids.run,
    ids.source,
    ids.studentResult,
    ids.subjectResult,
    1,
    null,
    88,
  );
  const signedIn = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await signedIn.auth.signInWithPassword({
    email: auth.data.user.email!,
    password,
  });
  if (login.error) throw login.error;
  const selected = await signedIn.rpc("set_my_active_membership", {
    target_membership_id: ids.membership,
  });
  if (selected.error) throw selected.error;
  client = signedIn;
}

describe("report snapshots integration", () => {
  beforeAll(setup);
  afterAll(async () => db.end());

  it("reports a valid populated Stage 11 run as ready before generation", async () => {
    const readiness = await client.rpc("get_report_generation_readiness", {
      target_calculation_run_id: ids.run,
    });
    expect(readiness.error).toBeNull();
    expect(readiness.data?.[0]).toMatchObject({
      student_population: 1,
      eligible_student_count: 1,
      existing_report_snapshots: 0,
      missing_report_snapshots: 1,
      ready: true,
    });
  });

  it("generates a frozen, lineaged snapshot from Stage 11 values", async () => {
    const generated = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: ids.run,
      target_enrollment_id: ids.enrollment,
    });
    expect(generated.error).toBeNull();
    expect(generated.data?.[0]).toMatchObject({
      report_version: 1,
      reused: false,
    });
    const reportId = generated.data?.[0]?.report_id;
    const detail = await client.rpc("get_generated_report", {
      target_report_id: reportId,
    });
    expect(detail.error).toBeNull();
    expect(detail.data?.[0]?.snapshot_data).toMatchObject({
      snapshot_schema_version: 1,
      school: { name: "Snapshot School" },
      student: { display_name: "Frozen Student" },
      academic_summary: {
        overall_total: 88,
        overall_average: 88,
        overall_grade: "A",
        aggregate_total: 3,
      },
      attendance: { days_present: 84, days_absent: 6 },
      comments: { class_teacher_comment: "Comment A" },
    });
    const subjects = await client.rpc("get_report_subject_results", {
      target_report_id: reportId,
    });
    expect(subjects.data?.[0]).toMatchObject({
      subject_name: "Snapshot Subject",
      subject_score: 88,
      subject_position: 1,
    });
    expect(detail.data?.[0]?.input_checksum).toHaveLength(64);
    expect(detail.data?.[0]?.output_checksum).toHaveLength(64);
  });

  it("reuses generation without a duplicate report or audit", async () => {
    const before = await query(
      "select count(*)::int as count from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$1",
      [ids.run],
    );
    const reused = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: ids.run,
      target_enrollment_id: ids.enrollment,
    });
    const after = await query(
      "select count(*)::int as count from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$1",
      [ids.run],
    );
    expect(reused.error).toBeNull();
    expect(reused.data?.[0]?.reused).toBe(true);
    expect(after.rows[0].count).toBe(before.rows[0].count);
    expect(
      (
        await query(
          "select count(*)::int as count from public.reports where calculation_run_id=$1",
          [ids.run],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it("does not fall back to live identity, attendance, or comments", async () => {
    await query("update public.schools set name='Renamed School' where id=$1", [
      ids.school,
    ]);
    await query("update public.students set first_name='Renamed' where id=$1", [
      ids.student,
    ]);
    await query(
      "update public.subjects set name='Renamed Subject' where id=$1",
      [ids.subject],
    );
    await query(
      "update public.term_attendance set days_present=1,days_absent=89 where id=$1",
      [ids.attendance],
    );
    await query(
      "update public.student_term_comments set class_teacher_comment='Comment B' where id=$1",
      [ids.comment],
    );
    const report = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run,
    });
    const detail = await client.rpc("get_generated_report", {
      target_report_id: report.data?.[0]?.report_id,
    });
    expect(detail.data?.[0]?.snapshot_data).toMatchObject({
      school: { name: "Snapshot School" },
      student: { display_name: "Frozen Student" },
      attendance: { days_present: 84, days_absent: 6 },
      comments: { class_teacher_comment: "Comment A" },
    });
    expect(
      (
        await client.rpc("get_report_subject_results", {
          target_report_id: report.data?.[0]?.report_id,
        })
      ).data?.[0]?.subject_name,
    ).toBe("Snapshot Subject");
  });

  it("creates a new same-run immutable version when the comment changes", async () => {
    await query(
      "update public.student_term_comments set class_teacher_comment='Comment B' where id=$1",
      [ids.comment],
    );
    const generated = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: ids.run,
      target_enrollment_id: ids.enrollment,
    });
    expect(generated.error).toBeNull();
    expect(generated.data?.[0]).toMatchObject({
      report_version: 2,
      reused: false,
    });
  });

  it("creates another same-run version when attendance changes", async () => {
    await query(
      "update public.term_attendance set days_present=80,days_absent=10 where id=$1",
      [ids.attendance],
    );
    const generated = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: ids.run,
      target_enrollment_id: ids.enrollment,
    });
    expect(generated.error).toBeNull();
    expect(generated.data?.[0]).toMatchObject({
      report_version: 3,
      reused: false,
    });
  });

  it("creates another same-run version when student identity changes", async () => {
    await query(
      "update public.students set first_name='Corrected' where id=$1",
      [ids.student],
    );
    const generated = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: ids.run,
      target_enrollment_id: ids.enrollment,
    });
    expect(generated.error).toBeNull();
    expect(generated.data?.[0]).toMatchObject({
      report_version: 4,
      reused: false,
    });
  });

  it("creates another same-run version when school identity changes", async () => {
    await query(
      "update public.schools set name='Corrected School' where id=$1",
      [ids.school],
    );
    const generated = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: ids.run,
      target_enrollment_id: ids.enrollment,
    });
    expect(generated.error).toBeNull();
    expect(generated.data?.[0]).toMatchObject({
      report_version: 5,
      reused: false,
    });
  });

  it("creates another same-run version when subject identity changes", async () => {
    await query(
      "update public.subjects set name='Corrected Subject' where id=$1",
      [ids.subject],
    );
    const generated = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: ids.run,
      target_enrollment_id: ids.enrollment,
    });
    expect(generated.error).toBeNull();
    expect(generated.data?.[0]).toMatchObject({
      report_version: 6,
      reused: false,
    });
  });

  it("creates report version two from a corrected calculation and preserves v1", async () => {
    const run2 = (ids.run2 = randomUUID());
    await createRun(
      run2,
      randomUUID(),
      randomUUID(),
      randomUUID(),
      2,
      ids.run,
      92,
    );
    const generated = await client.rpc("generate_student_report_snapshot", {
      target_calculation_run_id: run2,
      target_enrollment_id: ids.enrollment,
    });
    expect(generated.error).toBeNull();
    expect(generated.data?.[0]).toMatchObject({
      report_version: 7,
      reused: false,
    });
    const history = await client.rpc("get_student_report_history", {
      target_enrollment_id: ids.enrollment,
      target_term_id: ids.term,
    });
    expect(history.data).toHaveLength(7);
    expect(
      history.data?.map(
        (item: { report_version: number }) => item.report_version,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(history.data?.[5]?.superseded_by).toBe(
      generated.data?.[0]?.report_id,
    );
    expect(history.data?.[6]?.is_latest).toBe(true);
  });

  it("serializes concurrent batch reuse and exposes readiness counts", async () => {
    const readiness = await client.rpc("get_report_generation_readiness", {
      target_calculation_run_id: ids.run,
    });
    expect(readiness.data?.[0]).toMatchObject({
      student_population: 1,
      existing_report_snapshots: 6,
      missing_report_snapshots: 0,
      ready: true,
    });
    const results = await Promise.all([
      client.rpc("generate_grade_report_snapshots", {
        target_calculation_run_id: ids.run,
      }),
      client.rpc("generate_grade_report_snapshots", {
        target_calculation_run_id: ids.run,
      }),
    ]);
    expect(results.every((result) => result.error === null)).toBe(true);
    expect(
      (
        await query(
          "select count(*)::int as count from public.reports where calculation_run_id=$1",
          [ids.run],
        )
      ).rows[0].count,
    ).toBe(6);
  });

  it("keeps the report list scoped to its calculation run", async () => {
    const listed = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run,
    });
    expect(listed.error).toBeNull();
    expect(listed.data).toHaveLength(1);
    expect(listed.data?.[0]?.calculation_run_id).toBe(ids.run);
  });

  it("returns the frozen detail without live table joins", async () => {
    const listed = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run,
    });
    const detail = await client.rpc("get_generated_report", {
      target_report_id: listed.data?.[0]?.report_id,
    });
    expect(detail.error).toBeNull();
    expect(detail.data?.[0]?.snapshot_data?.school?.name).toBe(
      "Snapshot School",
    );
    expect(detail.data?.[0]?.snapshot_data?.student?.display_name).toBe(
      "Frozen Student",
    );
  });

  it("does not infer a head teacher from a generic comment updater", async () => {
    const listed = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run,
    });
    const detail = await client.rpc("get_generated_report", {
      target_report_id: listed.data?.[0]?.report_id,
    });
    expect(detail.data?.[0]?.snapshot_data?.signatories?.head_teacher).toBe(
      null,
    );
  });

  it("returns frozen subject identity and result values", async () => {
    const listed = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run,
    });
    const subjects = await client.rpc("get_report_subject_results", {
      target_report_id: listed.data?.[0]?.report_id,
    });
    expect(subjects.error).toBeNull();
    expect(subjects.data).toHaveLength(1);
    expect(subjects.data?.[0]).toMatchObject({
      subject_name: "Snapshot Subject",
      subject_score: 88,
      subject_status: "COMPLETE",
    });
  });

  it("exposes a stable context checksum on the report and snapshot", async () => {
    const row = await query(
      `select report.snapshot_context_checksum, snapshot.snapshot_checksum
       from public.reports report
       join public.report_snapshots snapshot on snapshot.report_id = report.id
       where report.calculation_run_id=$1`,
      [ids.run],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].snapshot_context_checksum).toHaveLength(64);
    expect(row.rows[0].snapshot_context_checksum).toBe(
      row.rows[0].snapshot_checksum,
    );
  });

  it("keeps version history ordered and marks only the latest report", async () => {
    const history = await client.rpc("get_student_report_history", {
      target_enrollment_id: ids.enrollment,
      target_term_id: ids.term,
    });
    expect(history.error).toBeNull();
    expect(
      history.data?.map(
        (item: { report_version: number }) => item.report_version,
      ),
    ).toEqual([1, 2]);
    expect(
      history.data?.filter((item: { is_latest: boolean }) => item.is_latest),
    ).toHaveLength(1);
    expect(history.data?.[1]?.is_latest).toBe(true);
  });

  it("links the successor report to the direct successor calculation", async () => {
    const row = await query(
      "select id, calculation_run_id, superseded_by from public.reports where calculation_run_id=$1",
      [ids.run2],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].calculation_run_id).toBe(ids.run2);
    expect(row.rows[0].superseded_by).toBeNull();
    const old = await query(
      "select id, superseded_by from public.reports where calculation_run_id=$1",
      [ids.run],
    );
    expect(old.rows[0].superseded_by).toBe(row.rows[0].id);
  });

  it("keeps batch completion bounded by distinct enrollment coverage", async () => {
    const batch = await query(
      "select total_reports, completed_reports, failed_reports, status from public.report_batches where calculation_run_id=$1",
      [ids.run],
    );
    expect(batch.rows).toHaveLength(1);
    expect(batch.rows[0].completed_reports).toBeLessThanOrEqual(
      batch.rows[0].total_reports,
    );
    expect(batch.rows[0].status).toBe("COMPLETED");
    expect(batch.rows[0].failed_reports).toBe(0);
  });

  it("does not create an audit event for exact reuse", async () => {
    const audits = await query(
      "select count(*)::int as count from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$1",
      [ids.run],
    );
    expect(audits.rows[0].count).toBe(1);
  });

  it("rejects direct generated-report mutation", async () => {
    const report = await query(
      "select id from public.reports where calculation_run_id=$1",
      [ids.run],
    );
    await expect(
      query("update public.reports set status='DRAFT' where id=$1", [
        report.rows[0].id,
      ]),
    ).rejects.toThrow();
  });

  it("rejects direct snapshot mutation", async () => {
    const report = await query(
      "select id from public.reports where calculation_run_id=$1",
      [ids.run],
    );
    await expect(
      query(
        "update public.report_snapshots set snapshot_data='{}' where report_id=$1",
        [report.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  it("rejects direct subject snapshot mutation", async () => {
    const report = await query(
      "select id from public.reports where calculation_run_id=$1",
      [ids.run],
    );
    await expect(
      query(
        "update public.report_subject_results set subject_name='Tampered' where report_id=$1",
        [report.rows[0].id],
      ),
    ).rejects.toThrow();
  });

  it("rejects direct lineage deletion", async () => {
    await expect(
      query(
        "delete from public.report_snapshot_sources where calculation_run_id=$1",
        [ids.run],
      ),
    ).rejects.toThrow();
  });

  it("preserves historical report identity after live source updates", async () => {
    const old = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run,
    });
    const newest = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run2,
    });
    expect(old.data?.[0]?.report_id).not.toBe(newest.data?.[0]?.report_id);
    expect(old.data?.[0]?.snapshot_checksum).not.toBe(
      newest.data?.[0]?.snapshot_checksum,
    );
  });

  it("returns the report snapshot through the dedicated snapshot reader", async () => {
    const listed = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run,
    });
    const snapshot = await client.rpc("get_report_snapshot", {
      target_report_id: listed.data?.[0]?.report_id,
    });
    expect(snapshot.error).toBeNull();
    expect(snapshot.data?.[0]?.snapshot_schema_version).toBe(1);
    expect(snapshot.data?.[0]?.snapshot_checksum).toHaveLength(64);
  });

  it("keeps the calculation source manifest tied to the report source", async () => {
    const lineage = await query(
      "select source.calculation_run_id, result.enrollment_id from public.report_snapshot_sources source join public.calculated_student_results result on result.id=source.calculated_student_result_id where source.calculation_run_id=$1",
      [ids.run],
    );
    expect(lineage.rows).toHaveLength(1);
    expect(lineage.rows[0].calculation_run_id).toBe(ids.run);
    expect(lineage.rows[0].enrollment_id).toBe(ids.enrollment);
  });

  it("does not expose a publication or parent-access state", async () => {
    const columns = await query(
      `select count(*)::int as count from information_schema.columns
       where table_schema='public' and table_name='reports'
       and column_name in ('published_at','pdf_storage_path','student_access_credentials')`,
    );
    expect(columns.rows[0].count).toBe(0);
  });

  it("keeps the report snapshot schema version explicit in the API", async () => {
    const listed = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run2,
    });
    const detail = await client.rpc("get_generated_report", {
      target_report_id: listed.data?.[0]?.report_id,
    });
    expect(detail.data?.[0]?.snapshot_schema_version).toBe(1);
    expect(detail.data?.[0]?.snapshot_checksum).toHaveLength(64);
  });

  it("keeps the generated report status immutable and readable", async () => {
    const listed = await client.rpc("list_generated_reports", {
      target_calculation_run_id: ids.run2,
    });
    expect(listed.data?.[0]?.status).toBe("GENERATED");
    expect(listed.data?.[0]?.is_latest).toBe(true);
  });

  it("returns no duplicate reports after repeated batch generation", async () => {
    const count = await query(
      "select count(*)::int as count from public.reports where enrollment_id=$1 and term_id=$2",
      [ids.enrollment, ids.term],
    );
    expect(count.rows[0].count).toBe(7);
    const history = await client.rpc("get_student_report_history", {
      target_enrollment_id: ids.enrollment,
      target_term_id: ids.term,
    });
    expect(history.data).toHaveLength(7);
  });
});
