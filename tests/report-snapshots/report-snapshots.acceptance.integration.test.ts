import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client, type QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

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
      `${name} is required for report snapshot acceptance tests.`,
    );
}

const admin = createClient(url!, serviceKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new Client({ connectionString: databaseUrl! });
const password = "synthetic-report-snapshot-acceptance-password";
const ids = Object.fromEntries(
  [
    "schoolA",
    "schoolB",
    "yearA",
    "termA",
    "nextTermA",
    "gradeA",
    "gradeB",
    "sectionA",
    "sectionB",
    "sectionOtherGrade",
    "subject",
    "mappingA",
    "mappingB",
    "mappingOtherGrade",
    "schemeA",
    "schemeB",
    "schemeOtherGrade",
    "componentA",
    "componentB",
    "componentOtherGrade",
    "sheetA",
    "sheetB",
    "sheetOtherGrade",
    "scaleA",
    "scaleB",
    "scaleOtherGrade",
    "ruleA",
    "ruleB",
    "ruleOtherGrade",
    "studentA",
    "studentB",
    "studentOtherGrade",
    "enrollmentA",
    "enrollmentB",
    "enrollmentOtherGrade",
    "assignmentA",
    "assignmentB",
    "assignmentOtherGrade",
    "runA",
    "runB",
    "sourceA",
    "sourceB",
    "sourceOtherGrade",
    "resultA",
    "resultB",
    "resultOtherGrade",
    "subjectResultA",
    "subjectResultB",
    "subjectResultOtherGrade",
    "attendanceA",
    "commentA",
    "commentB",
    "bEnrollment",
    "bStudent",
    "bSection",
    "bGrade",
    "bMapping",
    "bScheme",
    "bComponent",
    "bSheet",
    "bScale",
    "bRule",
    "bSubject",
    "bAssignment",
    "bRun",
    "bSource",
    "bResult",
    "bSubjectResult",
    "bComment",
    "bYear",
    "bTerm",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;

type Actor = { email: string; userId: string; membershipIds: string[] };
const actors = new Map<string, Actor>();
const clients = new Map<string, SupabaseClient>();
let v1: {
  reportId: string;
  snapshotId: string;
  context: string;
  checksum: string;
  data: unknown;
};
let v2: {
  reportId: string;
  snapshotId: string;
  context: string;
  checksum: string;
  data: unknown;
};
let v3: {
  reportId: string;
  snapshotId: string;
  context: string;
  checksum: string;
  data: unknown;
};
type ReportListRow = { report_id: string; enrollment_id: string };

async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return db.query<T>(text, values);
}

async function createActor(
  key: string,
  roles: string[],
  schoolId: string,
  extraMemberships: string[] = [],
) {
  const email = `stage12-${key}-${Date.now()}@example.invalid`;
  const auth = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  await query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Acceptance')",
    [auth.data.user.id, key],
  );
  const membershipIds = [...extraMemberships];
  const membershipId = membershipIds[0] ?? randomUUID();
  if (!membershipIds.length) membershipIds.push(membershipId);
  await query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status,joined_at) values($1,$2,$3,$4,'ACTIVE',current_date-90)",
    [membershipId, schoolId, auth.data.user.id, `ST12-${key}`],
  );
  for (const role of roles) {
    await query(
      "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,$3,now()-interval '1 day')",
      [randomUUID(), membershipId, role],
    );
  }
  const actor = { email, userId: auth.data.user.id, membershipIds };
  actors.set(key, actor);
  return actor;
}

async function signedIn(key: string, membershipId?: string) {
  const actor = actors.get(key)!;
  const client = createClient(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await client.auth.signInWithPassword({
    email: actor.email,
    password,
  });
  if (login.error) throw login.error;
  const selected = await client.rpc("set_my_active_membership", {
    target_membership_id: membershipId ?? actor.membershipIds[0],
  });
  if (selected.error) throw selected.error;
  return client;
}

async function insertScope(
  prefix: "a" | "b",
  schoolId: string,
  yearId: string,
  termId: string,
  gradeId: string,
  sectionId: string,
  studentId: string,
  enrollmentId: string,
  mappingId: string,
  schemeId: string,
  componentId: string,
  sheetId: string,
  scaleId: string,
  ruleId: string,
  assignmentId: string,
  runId: string,
  sourceId: string,
  resultId: string,
  subjectResultId: string,
  output: string,
  studentName: string,
  deferRun = false,
) {
  const schoolCode = prefix === "a" ? "S12A" : "S12B";
  const subjectId = prefix === "a" ? ids.subject : ids.bSubject;
  const creatorMembership = actors.get(
    prefix === "a" ? "generatorAdmin" : "schoolBAdmin",
  )!.membershipIds[0];
  await query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,$3,$4,1)",
    [
      gradeId,
      schoolId,
      `${prefix.toUpperCase()}12`,
      `${prefix === "a" ? "School A" : "School B"} Grade`,
    ],
  );
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,$4,$5)",
    [
      sectionId,
      yearId,
      gradeId,
      `${prefix.toUpperCase()}12 Class`,
      `${schoolCode}-A`,
    ],
  );
  await query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,sort_order) values($1,$2,$3,1)",
    [mappingId, gradeId, subjectId],
  );
  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,current_date-30)",
    [assignmentId, termId, sectionId, subjectId, creatorMembership],
  );
  await query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,$5,'DRAFT',current_date-30,$6)",
    [
      schemeId,
      termId,
      gradeId,
      subjectId,
      `${prefix} scheme`,
      creatorMembership,
    ],
  );
  await query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Exam','EXAM',100,100,1)",
    [componentId, schemeId],
  );
  await query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [schemeId],
  );
  await query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,workflow_status) values($1,$2,$3,$4,$5,$6,'DRAFT')",
    [sheetId, termId, sectionId, subjectId, schemeId, assignmentId],
  );
  await query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,effective_from,created_by) values($1,$2,$3,$4,$5,current_date-30,$6)",
    [scaleId, schoolId, yearId, gradeId, `${prefix} scale`, creatorMembership],
  );
  await query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,$5,'AVERAGE','DENSE','{}',true,$6)",
    [ruleId, schoolId, yearId, gradeId, `${prefix} rule`, creatorMembership],
  );
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,$3,$4,'Student',current_date-60)",
    [studentId, schoolId, `${schoolCode}-${studentName}`, studentName],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,current_date-50)",
    [enrollmentId, studentId, yearId, sectionId],
  );
  const checksum = await query<{ checksum: string }>(
    "select internal.results_input_checksum($1,$2,$3,$4,null) checksum",
    [termId, gradeId, scaleId, ruleId],
  );
  if (deferRun) return { checksum: checksum.rows[0].checksum, subjectId };
  await query(
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,1,$4,$5,$6,$7,$8)",
    [
      runId,
      termId,
      gradeId,
      scaleId,
      ruleId,
      checksum.rows[0].checksum,
      output.repeat(64),
      creatorMembership,
    ],
  );
  await query(
    "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values($1,$2,$3,$4,$5,1,$6,$7,true,true,1)",
    [sourceId, runId, sheetId, sectionId, subjectId, schemeId, mappingId],
  );
  await query(
    "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) values($1,$2,$3,$4,1,1,1,88,88,'A',3,'Advanced',true,true,88,1,1,1,1,false,false)",
    [resultId, runId, enrollmentId, sectionId],
  );
  await query(
    "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) values($1,$2,$3,$4,$5,$6,'COMPLETE',88,'A',3,true,100,false,false,1,1,false)",
    [subjectResultId, runId, enrollmentId, sectionId, subjectId, sheetId],
  );
  return { checksum: checksum.rows[0].checksum, subjectId };
}

async function insertRunResults(
  prefix: "a" | "b",
  termId: string,
  gradeId: string,
  scaleId: string,
  ruleId: string,
  runId: string,
  sourceId: string,
  resultId: string,
  subjectResultId: string,
  sheetId: string,
  sectionId: string,
  enrollmentId: string,
  mappingId: string,
  schemeId: string,
  output: string,
) {
  const subjectId = prefix === "a" ? ids.subject : ids.bSubject;
  const creatorMembership = actors.get(
    prefix === "a" ? "generatorAdmin" : "schoolBAdmin",
  )!.membershipIds[0];
  const checksum = await query<{ checksum: string }>(
    "select internal.results_input_checksum($1,$2,$3,$4,null) checksum",
    [termId, gradeId, scaleId, ruleId],
  );
  await query(
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,1,$4,$5,$6,$7,$8)",
    [
      runId,
      termId,
      gradeId,
      scaleId,
      ruleId,
      checksum.rows[0].checksum,
      output.repeat(64),
      creatorMembership,
    ],
  );
  await query(
    "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values($1,$2,$3,$4,$5,1,$6,$7,true,true,1)",
    [sourceId, runId, sheetId, sectionId, subjectId, schemeId, mappingId],
  );
  await query(
    "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) values($1,$2,$3,$4,1,1,1,88,88,'A',3,'Advanced',true,true,88,1,1,1,1,false,false)",
    [resultId, runId, enrollmentId, sectionId],
  );
  await query(
    "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) values($1,$2,$3,$4,$5,$6,'COMPLETE',88,'A',3,true,100,false,false,1,1,false)",
    [subjectResultId, runId, enrollmentId, sectionId, subjectId, sheetId],
  );
  return checksum.rows[0].checksum;
}

async function insertSecondSchoolAStudent() {
  await query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'S12B Class','S12A-B')",
    [ids.sectionB, ids.yearA, ids.gradeA],
  );
  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,current_date-30)",
    [
      ids.assignmentB,
      ids.termA,
      ids.sectionB,
      ids.subject,
      actors.get("generatorAdmin")!.membershipIds[0],
    ],
  );
  await query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,workflow_status) values($1,$2,$3,$4,$5,$6,'DRAFT')",
    [
      ids.sheetB,
      ids.termA,
      ids.sectionB,
      ids.subject,
      ids.schemeA,
      ids.assignmentB,
    ],
  );
  await query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,'S12A-UNASSIGNED','Unassigned','Student',current_date-60)",
    [ids.studentB, ids.schoolA],
  );
  await query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,current_date-50)",
    [ids.enrollmentB, ids.studentB, ids.yearA, ids.sectionB],
  );
}

async function setup() {
  await db.connect();
  await query(
    "insert into public.schools(id,name,slug,school_code) values($1,'Stage 12 School A',$2,'S12A')",
    [ids.schoolA, `stage12-a-${Date.now()}`],
  );
  await query(
    "insert into public.schools(id,name,slug,school_code) values($1,'Stage 12 School B',$2,'S12B')",
    [ids.schoolB, `stage12-b-${Date.now()}`],
  );
  const generator = await createActor(
    "generatorAdmin",
    ["SCHOOL_ADMIN"],
    ids.schoolA,
  );
  const schoolBAdmin = await createActor(
    "schoolBAdmin",
    ["SCHOOL_ADMIN"],
    ids.schoolB,
  );
  await query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Stage 12 Year A',current_date-60,current_date+300,'ACTIVE'),($3,$4,'Stage 12 Year B',current_date-60,current_date+300,'ACTIVE')",
    [ids.yearA, ids.schoolA, ids.bYear, ids.schoolB],
  );
  await query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Term A',1,current_date-30,current_date+30,'MARKS_ENTRY'),($3,$4,'Next Term A',2,current_date+31,current_date+90,'MARKS_ENTRY'),($5,$6,'Term B',1,current_date-30,current_date+30,'MARKS_ENTRY')",
    [ids.termA, ids.yearA, ids.nextTermA, ids.yearA, ids.bTerm, ids.bYear],
  );
  await query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'S12','Stage 12 Subject',1)",
    [ids.subject, ids.schoolA],
  );
  await insertScope(
    "a",
    ids.schoolA,
    ids.yearA,
    ids.termA,
    ids.gradeA,
    ids.sectionA,
    ids.studentA,
    ids.enrollmentA,
    ids.mappingA,
    ids.schemeA,
    ids.componentA,
    ids.sheetA,
    ids.scaleA,
    ids.ruleA,
    ids.assignmentA,
    ids.runA,
    ids.sourceA,
    ids.resultA,
    ids.subjectResultA,
    "a",
    "Assigned",
    true,
  );
  await insertSecondSchoolAStudent();
  await query(
    "insert into public.term_attendance(id,term_id,enrollment_id,days_open,days_present,days_absent,times_late,recorded_by) values($1,$2,$3,90,84,6,2,$4)",
    [ids.attendanceA, ids.termA, ids.enrollmentA, generator.membershipIds[0]],
  );
  await query(
    "insert into public.student_term_comments(id,term_id,enrollment_id,class_teacher_comment,head_teacher_comment,conduct_grade,created_by,updated_by) values($1,$2,$3,'A','Head A','A',$4,$4)",
    [ids.commentA, ids.termA, ids.enrollmentA, generator.membershipIds[0]],
  );
  await query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'S12B','Stage 12 B Subject',1)",
    [ids.bSubject, ids.schoolB],
  );
  await insertScope(
    "b",
    ids.schoolB,
    ids.bYear,
    ids.bTerm,
    ids.bGrade,
    ids.bSection,
    ids.bStudent,
    ids.bEnrollment,
    ids.bMapping,
    ids.bScheme,
    ids.bComponent,
    ids.bSheet,
    ids.bScale,
    ids.bRule,
    ids.bAssignment,
    ids.bRun,
    ids.bSource,
    ids.bResult,
    ids.bSubjectResult,
    "b",
    "Foreign",
    true,
  );
  await query(
    "insert into public.student_term_comments(id,term_id,enrollment_id,class_teacher_comment,created_by,updated_by) values($1,$2,$3,'B',$4,$4)",
    [ids.bComment, ids.bTerm, ids.bEnrollment, schoolBAdmin.membershipIds[0]],
  );
  await query("begin");
  await query(
    "select set_config('app.marks_workflow_transition','allowed',true)",
  );
  await query(
    "select set_config('app.term_marks_workflow_transition','allowed',true)",
  );
  await query("update public.terms set status='LOCKED' where id in ($1,$2)", [
    ids.termA,
    ids.bTerm,
  ]);
  await query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$1,locked_at=now() where id in ($2,$3)",
    [generator.membershipIds[0], ids.sheetA, ids.sheetB],
  );
  await query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$1,locked_at=now() where id=$2",
    [schoolBAdmin.membershipIds[0], ids.bSheet],
  );
  await insertRunResults(
    "a",
    ids.termA,
    ids.gradeA,
    ids.scaleA,
    ids.ruleA,
    ids.runA,
    ids.sourceA,
    ids.resultA,
    ids.subjectResultA,
    ids.sheetA,
    ids.sectionA,
    ids.enrollmentA,
    ids.mappingA,
    ids.schemeA,
    "a",
  );
  await query(
    "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values($1,$2,$3,$4,$5,1,$6,$7,true,true,1)",
    [
      ids.sourceB,
      ids.runA,
      ids.sheetB,
      ids.sectionB,
      ids.subject,
      ids.schemeA,
      ids.mappingA,
    ],
  );
  await query(
    "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) values($1,$2,$3,$4,1,1,1,88,88,'A',3,'Advanced',true,true,88,1,1,1,1,false,false)",
    [ids.resultB, ids.runA, ids.enrollmentB, ids.sectionB],
  );
  await query(
    "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) values($1,$2,$3,$4,$5,$6,'COMPLETE',88,'A',3,true,100,false,false,1,1,false)",
    [
      ids.subjectResultB,
      ids.runA,
      ids.enrollmentB,
      ids.sectionB,
      ids.subject,
      ids.sheetB,
    ],
  );
  await insertRunResults(
    "b",
    ids.bTerm,
    ids.bGrade,
    ids.bScale,
    ids.bRule,
    ids.bRun,
    ids.bSource,
    ids.bResult,
    ids.bSubjectResult,
    ids.bSheet,
    ids.bSection,
    ids.bEnrollment,
    ids.bMapping,
    ids.bScheme,
    "b",
  );
  await query("commit");
  await createActor("viewOnlyActor", ["SCHOOL_ADMIN"], ids.schoolA);
  const classTeacher = await createActor(
    "classTeacher",
    ["CLASS_TEACHER"],
    ids.schoolA,
  );
  const subjectTeacher = await createActor(
    "subjectTeacher",
    ["SUBJECT_TEACHER"],
    ids.schoolA,
  );
  const multi = await createActor(
    "multiSchoolUser",
    ["SCHOOL_ADMIN"],
    ids.schoolA,
  );
  const multiSchoolBMembership = randomUUID();
  multi.membershipIds.push(multiSchoolBMembership);
  await query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status,joined_at) values($1,$2,$3,'ST12-MULTI-B','ACTIVE',current_date-90)",
    [multiSchoolBMembership, ids.schoolB, multi.userId],
  );
  await query(
    "insert into public.staff_role_assignments(id,membership_id,role,granted_at) values($1,$2,'SCHOOL_ADMIN',now()-interval '1 day')",
    [randomUUID(), multiSchoolBMembership],
  );
  await query(
    "insert into public.class_teacher_assignments(id,term_id,class_section_id,staff_membership_id,starts_on) values($1,$2,$3,$4,current_date-30)",
    [randomUUID(), ids.termA, ids.sectionA, classTeacher.membershipIds[0]],
  );
  await query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,current_date-30)",
    [
      randomUUID(),
      ids.termA,
      ids.sectionA,
      ids.subject,
      subjectTeacher.membershipIds[0],
    ],
  );
  for (const key of [
    "generatorAdmin",
    "viewOnlyActor",
    "classTeacher",
    "subjectTeacher",
    "schoolBAdmin",
    "multiSchoolUser",
  ])
    clients.set(key, await signedIn(key));
}

async function waitForBlocked(fragment: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await query<{ blocked: number }>(
      "select count(*)::int blocked from pg_locks where not granted",
    );
    if (result.rows[0].blocked > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${fragment} to block.`);
}

describe.sequential(
  "Stage 12 authorization and exact-history acceptance",
  () => {
    beforeAll(setup);
    afterAll(async () => {
      await query(
        "insert into public.role_permissions(role,permission) values('SCHOOL_ADMIN','REPORTS_GENERATE') on conflict (role,permission) do nothing",
      );
      await db.end();
    });

    it("REPORTS_GENERATE actor completes readiness, batch, detail, and history", async () => {
      const client = clients.get("generatorAdmin")!;
      const readiness = await client.rpc("get_report_generation_readiness", {
        target_calculation_run_id: ids.runA,
      });
      expect(readiness.error).toBeNull();
      expect(readiness.data?.[0]).toMatchObject({
        student_population: 2,
        missing_report_snapshots: 2,
        ready: true,
      });
      const generated = await client.rpc("generate_grade_report_snapshots", {
        target_calculation_run_id: ids.runA,
      });
      expect(generated.error).toBeNull();
      expect(generated.data?.[0]).toMatchObject({
        generated_count: 2,
        reused_count: 0,
        failed_count: 0,
      });
      const listed = await client.rpc("list_generated_reports", {
        target_calculation_run_id: ids.runA,
      });
      const listedRows = (listed.data ?? []) as ReportListRow[];
      expect(listed.data).toHaveLength(2);
      const detail = await client.rpc("get_generated_report", {
        target_report_id: listedRows.find(
          (row) => row.enrollment_id === ids.enrollmentA,
        )?.report_id,
      });
      const history = await client.rpc("get_student_report_history", {
        target_enrollment_id: ids.enrollmentA,
        target_term_id: ids.termA,
      });
      expect(detail.error).toBeNull();
      expect(history.data).toHaveLength(1);
    });

    it("REPORTS_VIEW_ALL-only actor reads every report API but cannot generate", async () => {
      const client = clients.get("viewOnlyActor")!;
      await query(
        "delete from public.role_permissions where role='SCHOOL_ADMIN' and permission='REPORTS_GENERATE'",
      );
      const listed = await client.rpc("list_generated_reports", {
        target_calculation_run_id: ids.runA,
      });
      const reportId = listed.data?.[0]?.report_id;
      expect(listed.error).toBeNull();
      expect(listed.data).toHaveLength(2);
      expect(
        (
          await client.rpc("get_generated_report", {
            target_report_id: reportId,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await client.rpc("get_report_snapshot", {
            target_report_id: reportId,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await client.rpc("get_report_subject_results", {
            target_report_id: reportId,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await client.rpc("get_student_report_history", {
            target_enrollment_id: ids.enrollmentA,
            target_term_id: ids.termA,
          })
        ).error,
      ).toBeNull();
      const before = await query<{ reports: number; audits: number }>(
        "select (select count(*) from public.reports)::int reports,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED')::int audits",
      );
      expect(
        (
          await client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          })
        ).error?.code,
      ).toBe("42501");
      expect(
        (
          await client.rpc("generate_grade_report_snapshots", {
            target_calculation_run_id: ids.runA,
          })
        ).error?.code,
      ).toBe("42501");
      const after = await query<{ reports: number; audits: number }>(
        "select (select count(*) from public.reports)::int reports,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED')::int audits",
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
      await query(
        "insert into public.role_permissions(role,permission) values('SCHOOL_ADMIN','REPORTS_GENERATE') on conflict (role,permission) do nothing",
      );
    });

    it("class teacher reads assigned child snapshots through parent report RLS only", async () => {
      const client = clients.get("classTeacher")!;
      const assigned = await client.rpc("list_generated_reports", {
        target_calculation_run_id: ids.runA,
      });
      const assignedRows = (assigned.data ?? []) as ReportListRow[];
      expect(assigned.error).toBeNull();
      expect(assignedRows.map((row) => row.enrollment_id)).toEqual([
        ids.enrollmentA,
      ]);
      const foreign = await query<{ report_id: string }>(
        "select id report_id from public.reports where enrollment_id=$1",
        [ids.enrollmentB],
      );
      const reportId = assignedRows[0]?.report_id;
      expect(
        (
          await client.rpc("get_generated_report", {
            target_report_id: reportId,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await client.rpc("get_report_snapshot", {
            target_report_id: reportId,
          })
        ).data,
      ).toHaveLength(1);
      expect(
        (
          await client.rpc("get_report_subject_results", {
            target_report_id: reportId,
          })
        ).data,
      ).toHaveLength(1);
      expect(
        (
          await client.rpc("get_student_report_history", {
            target_enrollment_id: ids.enrollmentA,
            target_term_id: ids.termA,
          })
        ).data,
      ).toHaveLength(1);
      expect(
        (
          await client.rpc("get_generated_report", {
            target_report_id: foreign.rows[0].report_id,
          })
        ).data ?? [],
      ).toEqual([]);
    });

    it("subject teacher cannot turn marks assignment into report access", async () => {
      const client = clients.get("subjectTeacher")!;
      expect(
        (
          await client.rpc("list_generated_reports", {
            target_calculation_run_id: ids.runA,
          })
        ).data ?? [],
      ).toEqual([]);
      expect(
        (
          await client.rpc("get_generated_report", {
            target_report_id: (
              await query<{ id: string }>(
                "select id from public.reports where enrollment_id=$1",
                [ids.enrollmentA],
              )
            ).rows[0].id,
          })
        ).data ?? [],
      ).toEqual([]);
      expect(
        (await client.from("report_snapshot_sources").select("report_id"))
          .data ?? [],
      ).toEqual([]);
      expect(
        (
          await client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          })
        ).error?.code,
      ).toBe("42501");
    });

    it("cross-school staff cannot enumerate, open, or generate School A reports", async () => {
      const client = clients.get("schoolBAdmin")!;
      expect(
        (
          await client.rpc("list_generated_reports", {
            target_calculation_run_id: ids.runA,
          })
        ).data,
      ).toEqual([]);
      const aReport = await query<{ id: string }>(
        "select id from public.reports where enrollment_id=$1",
        [ids.enrollmentA],
      );
      const detail = await client.rpc("get_generated_report", {
        target_report_id: aReport.rows[0].id,
      });
      expect(detail.data).toEqual([]);
      expect(
        (
          await client.rpc("get_report_snapshot", {
            target_report_id: aReport.rows[0].id,
          })
        ).data,
      ).toEqual([]);
      expect(
        (
          await client.rpc("get_report_subject_results", {
            target_report_id: aReport.rows[0].id,
          })
        ).data,
      ).toEqual([]);
      expect(
        (
          await client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          })
        ).error?.message,
      ).not.toContain(ids.schoolA);
    });

    it("one multi-school profile switches selected membership without permission union", async () => {
      const actor = actors.get("multiSchoolUser")!;
      const client = clients.get("multiSchoolUser")!;
      expect(
        (
          await client.rpc("set_my_active_membership", {
            target_membership_id: actor.membershipIds[0],
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await client.rpc("list_generated_reports", {
            target_calculation_run_id: ids.runA,
          })
        ).data,
      ).toHaveLength(2);
      expect(
        (
          await client.rpc("list_generated_reports", {
            target_calculation_run_id: ids.bRun,
          })
        ).data,
      ).toEqual([]);
      expect(
        (
          await client.rpc("set_my_active_membership", {
            target_membership_id: actor.membershipIds[1],
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.bRun,
            target_enrollment_id: ids.bEnrollment,
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await client.rpc("list_generated_reports", {
            target_calculation_run_id: ids.bRun,
          })
        ).data ?? [],
      ).toHaveLength(1);
      expect(
        (
          await client.rpc("list_generated_reports", {
            target_calculation_run_id: ids.runA,
          })
        ).data,
      ).toEqual([]);
      expect(
        (
          await client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          })
        ).error?.code,
      ).toBe("42501");
    });

    it("same-run A to B to A repeats content checksum but appends history identity", async () => {
      const client = clients.get("generatorAdmin")!;
      const first = await client.rpc("list_generated_reports", {
        target_calculation_run_id: ids.runA,
      });
      const firstRows = (first.data ?? []) as ReportListRow[];
      const firstRow = firstRows.find(
        (row) => row.enrollment_id === ids.enrollmentA,
      )!;
      const firstDetail = await client.rpc("get_generated_report", {
        target_report_id: firstRow.report_id,
      });
      v1 = {
        reportId: firstRow.report_id,
        snapshotId: firstDetail.data?.[0]?.snapshot_id,
        context: firstDetail.data?.[0]?.snapshot_checksum,
        checksum: firstDetail.data?.[0]?.snapshot_checksum,
        data: firstDetail.data?.[0]?.snapshot_data,
      };
      await query(
        "update public.student_term_comments set class_teacher_comment='B' where id=$1",
        [ids.commentA],
      );
      const second = await client.rpc("generate_student_report_snapshot", {
        target_calculation_run_id: ids.runA,
        target_enrollment_id: ids.enrollmentA,
      });
      const secondDetail = await client.rpc("get_generated_report", {
        target_report_id: second.data?.[0]?.report_id,
      });
      v2 = {
        reportId: second.data?.[0]?.report_id,
        snapshotId: secondDetail.data?.[0]?.snapshot_id,
        context: secondDetail.data?.[0]?.snapshot_checksum,
        checksum: secondDetail.data?.[0]?.snapshot_checksum,
        data: secondDetail.data?.[0]?.snapshot_data,
      };
      await query(
        "update public.student_term_comments set class_teacher_comment='A' where id=$1",
        [ids.commentA],
      );
      const third = await client.rpc("generate_student_report_snapshot", {
        target_calculation_run_id: ids.runA,
        target_enrollment_id: ids.enrollmentA,
      });
      const thirdDetail = await client.rpc("get_generated_report", {
        target_report_id: third.data?.[0]?.report_id,
      });
      v3 = {
        reportId: third.data?.[0]?.report_id,
        snapshotId: thirdDetail.data?.[0]?.snapshot_id,
        context: thirdDetail.data?.[0]?.snapshot_checksum,
        checksum: thirdDetail.data?.[0]?.snapshot_checksum,
        data: thirdDetail.data?.[0]?.snapshot_data,
      };
      const reused = await client.rpc("generate_student_report_snapshot", {
        target_calculation_run_id: ids.runA,
        target_enrollment_id: ids.enrollmentA,
      });
      expect(second.data?.[0]).toMatchObject({
        report_version: 2,
        reused: false,
      });
      expect(third.data?.[0]).toMatchObject({
        report_version: 3,
        reused: false,
      });
      expect(reused.data?.[0]).toMatchObject({
        report_id: v3.reportId,
        report_version: 3,
        reused: true,
      });
      expect(v1.reportId).not.toBe(v3.reportId);
      expect(v1.checksum).toBe(v3.checksum);
      expect(v1.checksum).not.toBe(v2.checksum);
      expect(
        (
          (
            await client.rpc("get_student_report_history", {
              target_enrollment_id: ids.enrollmentA,
              target_term_id: ids.termA,
            })
          ).data as { report_id: string }[]
        ).map((row) => row.report_id),
      ).toEqual([v1.reportId, v2.reportId, v3.reportId]);
      expect(
        (
          await query<{ count: number }>(
            "select count(*)::int count from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'enrollment_id'=$1::text",
            [ids.enrollmentA],
          )
        ).rows[0].count,
      ).toBe(3);
    });

    it("historical A and B rows remain frozen after the A-B-A transition", async () => {
      const client = clients.get("generatorAdmin")!;
      const old = await client.rpc("get_generated_report", {
        target_report_id: v1.reportId,
      });
      const middle = await client.rpc("get_generated_report", {
        target_report_id: v2.reportId,
      });
      expect(old.data?.[0]).toMatchObject({
        snapshot_id: v1.snapshotId,
        snapshot_checksum: v1.checksum,
        snapshot_data: v1.data,
      });
      expect(middle.data?.[0]).toMatchObject({
        snapshot_id: v2.snapshotId,
        snapshot_checksum: v2.checksum,
        snapshot_data: v2.data,
      });
      expect(
        (
          await client.rpc("get_report_subject_results", {
            target_report_id: v1.reportId,
          })
        ).data,
      ).toHaveLength(1);
      expect(
        (
          await client.rpc("get_report_subject_results", {
            target_report_id: v2.reportId,
          })
        ).data,
      ).toHaveLength(1);
    });

    it("readiness counts only the requested grade's student population", async () => {
      const client = clients.get("generatorAdmin")!;
      const readiness = await client.rpc("get_report_generation_readiness", {
        target_calculation_run_id: ids.runA,
      });
      expect(readiness.data?.[0]?.student_population).toBe(2);
      expect(
        Object.keys(readiness.data?.[0]?.latest_report_versions ?? {}),
      ).toEqual(expect.arrayContaining([ids.enrollmentA, ids.enrollmentB]));
      expect(
        Object.keys(readiness.data?.[0]?.latest_report_versions ?? {}),
      ).not.toContain(ids.enrollmentOtherGrade);
    });

    it("next-term preview selects the next chronological term and remains safe when absent", async () => {
      const client = clients.get("generatorAdmin")!;
      const detail = await client.rpc("get_generated_report", {
        target_report_id: v3.reportId,
      });
      expect(detail.data?.[0]?.snapshot_data).toMatchObject({
        next_term: { term_name: "Next Term A" },
      });
      await query("delete from public.terms where id=$1", [ids.nextTermA]);

      const crossYearId = randomUUID();
      const crossYearTermId = randomUUID();
      await query(
        "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Stage 12 Following Year',current_date+301,current_date+665,'DRAFT')",
        [crossYearId, ids.schoolA],
      );
      await query(
        "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Following Year Term 1',1,current_date+401,current_date+480,'MARKS_ENTRY')",
        [crossYearTermId, crossYearId],
      );
      const crossYearGeneration = await client.rpc(
        "generate_student_report_snapshot",
        {
          target_calculation_run_id: ids.runA,
          target_enrollment_id: ids.enrollmentA,
        },
      );
      expect(crossYearGeneration.error).toBeNull();
      const crossYearDetail = await client.rpc("get_generated_report", {
        target_report_id: crossYearGeneration.data?.[0]?.report_id,
      });
      expect(crossYearDetail.data?.[0]?.snapshot_data).toMatchObject({
        next_term: { term_name: "Following Year Term 1" },
      });
      await query("delete from public.terms where id=$1", [crossYearTermId]);
      const absentGeneration = await client.rpc(
        "generate_student_report_snapshot",
        {
          target_calculation_run_id: ids.runA,
          target_enrollment_id: ids.enrollmentA,
        },
      );
      expect(absentGeneration.error).toBeNull();
      const absentDetail = await client.rpc("get_generated_report", {
        target_report_id: absentGeneration.data?.[0]?.report_id,
      });
      expect(absentDetail.data?.[0]?.snapshot_data).toMatchObject({
        next_term: null,
      });
    });

    it("fresh duplicate-first-generation race leaves one report, snapshot, subject set, lineage, and audit", async () => {
      const first = await signedIn("schoolBAdmin");
      const second = await signedIn("schoolBAdmin");
      const before = await query<{ audits: number }>(
        "select count(*)::int audits from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$1::text",
        [ids.bRun],
      );
      const results = await Promise.all([
        first.rpc("generate_student_report_snapshot", {
          target_calculation_run_id: ids.bRun,
          target_enrollment_id: ids.bEnrollment,
        }),
        second.rpc("generate_student_report_snapshot", {
          target_calculation_run_id: ids.bRun,
          target_enrollment_id: ids.bEnrollment,
        }),
      ]);
      const after = await query<{
        reports: number;
        snapshots: number;
        subjects: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports where calculation_run_id=$1)::int reports,(select count(*) from public.report_snapshots snapshot join public.reports report on report.id=snapshot.report_id where report.calculation_run_id=$1)::int snapshots,(select count(*) from public.report_subject_results subject join public.reports report on report.id=subject.report_id where report.calculation_run_id=$1)::int subjects,(select count(*) from public.report_snapshot_sources where calculation_run_id=$1)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$1::text)::int audits",
        [ids.bRun],
      );
      expect(results.every((result) => result.error === null)).toBe(true);
      expect(after.rows[0]).toEqual({
        reports: 1,
        snapshots: 1,
        subjects: 1,
        lineage: 1,
        audits: before.rows[0].audits + 1,
      });
    });

    it("fresh single-versus-batch first-generation race completes one current report atomically", async () => {
      const run = randomUUID();
      const source = randomUUID();
      const result = randomUUID();
      const subjectResult = randomUUID();
      const checksum = await query<{ checksum: string }>(
        "select input_checksum checksum from public.result_calculation_runs where id=$1",
        [ids.bRun],
      );
      await query(
        "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,supersedes_run_id,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,2,$4,$5,$6,$7,repeat('d',64),$8)",
        [
          run,
          ids.bTerm,
          ids.bGrade,
          ids.bRun,
          ids.bScale,
          ids.bRule,
          checksum.rows[0].checksum,
          actors.get("schoolBAdmin")!.membershipIds[0],
        ],
      );
      await query(
        "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values($1,$2,$3,$4,$5,1,$6,$7,true,true,1)",
        [
          source,
          run,
          ids.bSheet,
          ids.bSection,
          ids.bSubject,
          ids.bScheme,
          ids.bMapping,
        ],
      );
      await query(
        "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) select $1,$2,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied from public.calculated_student_results where id=$3",
        [result, run, ids.bResult],
      );
      await query(
        "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) select $1,$2,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied from public.calculated_subject_results where id=$3",
        [subjectResult, run, ids.bSubjectResult],
      );
      const results = await Promise.all([
        signedIn("schoolBAdmin").then((client) =>
          client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: run,
            target_enrollment_id: ids.bEnrollment,
          }),
        ),
        signedIn("schoolBAdmin").then((client) =>
          client.rpc("generate_grade_report_snapshots", {
            target_calculation_run_id: run,
          }),
        ),
      ]);
      const batch = await query<{
        total_reports: number;
        completed_reports: number;
        failed_reports: number;
        status: string;
      }>(
        "select total_reports,completed_reports,failed_reports,status::text from public.report_batches where calculation_run_id=$1",
        [run],
      );
      const counts = await query<{
        reports: number;
        snapshots: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports where calculation_run_id=$1)::int reports,(select count(*) from public.report_snapshots snapshot join public.reports report on report.id=snapshot.report_id where report.calculation_run_id=$1)::int snapshots,(select count(*) from public.report_snapshot_sources where calculation_run_id=$1)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$1::text)::int audits",
        [run],
      );
      expect(results[0].error).toBeNull();
      expect(results[1].error).toBeNull();
      expect(counts.rows[0]).toEqual({
        reports: 1,
        snapshots: 1,
        lineage: 1,
        audits: 1,
      });
      expect(batch.rows[0]).toEqual({
        total_reports: 1,
        completed_reports: 1,
        failed_reports: 0,
        status: "COMPLETED",
      });
    });

    it("changed-context race creates exactly one successor and one creation audit", async () => {
      const before = await query<{ reports: number; audits: number }>(
        "select (select count(*) from public.reports where term_id=$1 and enrollment_id=$2)::int reports,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'enrollment_id'=$2::text)::int audits",
        [ids.termA, ids.enrollmentA],
      );
      await query(
        "update public.student_term_comments set class_teacher_comment='Concurrent B' where id=$1",
        [ids.commentA],
      );
      const results = await Promise.all([
        signedIn("generatorAdmin").then((client) =>
          client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          }),
        ),
        signedIn("generatorAdmin").then((client) =>
          client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          }),
        ),
      ]);
      await query(
        "update public.student_term_comments set class_teacher_comment='A' where id=$1",
        [ids.commentA],
      );
      const after = await query<{ reports: number; audits: number }>(
        "select (select count(*) from public.reports where term_id=$1 and enrollment_id=$2)::int reports,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'enrollment_id'=$2::text)::int audits",
        [ids.termA, ids.enrollmentA],
      );
      expect(results.every((result) => result.error === null)).toBe(true);
      expect(after.rows[0]).toEqual({
        reports: before.rows[0].reports + 1,
        audits: before.rows[0].audits + 1,
      });
    });

    it("A-B-A race appends one checksum-repeating successor rather than reusing v1", async () => {
      const client = clients.get("generatorAdmin")!;
      const current = await client.rpc("get_generated_report", {
        target_report_id: (
          await query<{ id: string }>(
            "select id from public.reports where term_id=$1 and enrollment_id=$2 and superseded_by is null",
            [ids.termA, ids.enrollmentA],
          )
        ).rows[0].id,
      });
      const aReportId = current.data?.[0]?.report_id;
      const aChecksum = current.data?.[0]?.snapshot_checksum;
      await query(
        "update public.student_term_comments set class_teacher_comment='Concurrent B' where id=$1",
        [ids.commentA],
      );
      const b = await client.rpc("generate_student_report_snapshot", {
        target_calculation_run_id: ids.runA,
        target_enrollment_id: ids.enrollmentA,
      });
      const beforeRace = await query<{ reports: number }>(
        "select count(*)::int reports from public.reports where term_id=$1 and enrollment_id=$2",
        [ids.termA, ids.enrollmentA],
      );
      await query(
        "update public.student_term_comments set class_teacher_comment='A' where id=$1",
        [ids.commentA],
      );
      const results = await Promise.all([
        signedIn("generatorAdmin").then((client) =>
          client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          }),
        ),
        signedIn("generatorAdmin").then((client) =>
          client.rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          }),
        ),
      ]);
      const history = await clients
        .get("generatorAdmin")!
        .rpc("get_student_report_history", {
          target_enrollment_id: ids.enrollmentA,
          target_term_id: ids.termA,
        });
      const rows = history.data as {
        report_id: string;
        snapshot_checksum: string;
        superseded_by: string | null;
      }[];
      expect(results.every((result) => result.error === null)).toBe(true);
      expect(b.error).toBeNull();
      expect(rows).toHaveLength(beforeRace.rows[0].reports + 1);
      expect(rows.at(-1)?.snapshot_checksum).toBe(aChecksum);
      expect(rows.at(-1)?.report_id).not.toBe(aReportId);
      expect(rows.at(-1)?.report_id).not.toBe(b.data?.[0]?.report_id);
      expect(
        rows.find((row) => row.report_id === b.data?.[0]?.report_id)
          ?.superseded_by,
      ).toBe(rows.at(-1)?.report_id);
    });

    it("role revocation wins the authority lock and fails generation closed", async () => {
      const membershipId = actors.get("generatorAdmin")!.membershipIds[0];
      const blocker = new Client({ connectionString: databaseUrl! });
      await blocker.connect();
      await blocker.query("begin");
      await blocker.query(
        "select id from public.staff_role_assignments where membership_id=$1 for update",
        [membershipId],
      );
      const pending = clients
        .get("generatorAdmin")!
        .rpc("generate_student_report_snapshot", {
          target_calculation_run_id: ids.runA,
          target_enrollment_id: ids.enrollmentA,
        });
      let result: Awaited<typeof pending>;
      try {
        await waitForBlocked("generate_student_report_snapshot");
        await blocker.query(
          "update public.staff_role_assignments set revoked_at=now() where membership_id=$1",
          [membershipId],
        );
        await blocker.query("commit");
        result = await pending;
      } finally {
        await blocker.query("rollback").catch(() => undefined);
        await Promise.allSettled([pending]);
        await query(
          "update public.staff_role_assignments set revoked_at=null where membership_id=$1",
          [membershipId],
        );
        await blocker.end().catch(() => undefined);
      }
      expect(result.error?.code).toBe("42501");
    });

    it("membership suspension wins the authority lock and leaves no partial report", async () => {
      const membershipId = actors.get("generatorAdmin")!.membershipIds[0];
      const before = await query<{
        reports: number;
        snapshots: number;
        subjects: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports)::int reports,(select count(*) from public.report_snapshots)::int snapshots,(select count(*) from public.report_subject_results)::int subjects,(select count(*) from public.report_snapshot_sources)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED')::int audits",
      );
      const blocker = new Client({ connectionString: databaseUrl! });
      await blocker.connect();
      await blocker.query("begin");
      await blocker.query(
        "select id from public.school_staff_memberships where id=$1 for update",
        [membershipId],
      );
      const pending = clients
        .get("generatorAdmin")!
        .rpc("generate_student_report_snapshot", {
          target_calculation_run_id: ids.runA,
          target_enrollment_id: ids.enrollmentA,
        });
      let result: Awaited<typeof pending>;
      try {
        await waitForBlocked("generate_student_report_snapshot");
        await blocker.query(
          "update public.school_staff_memberships set status='SUSPENDED' where id=$1",
          [membershipId],
        );
        await blocker.query("commit");
        result = await pending;
      } finally {
        await blocker.query("rollback").catch(() => undefined);
        await Promise.allSettled([pending]);
        await query(
          "update public.school_staff_memberships set status='ACTIVE' where id=$1",
          [membershipId],
        );
        await blocker.end().catch(() => undefined);
      }
      const after = await query<{
        reports: number;
        snapshots: number;
        subjects: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports)::int reports,(select count(*) from public.report_snapshots)::int snapshots,(select count(*) from public.report_subject_results)::int subjects,(select count(*) from public.report_snapshot_sources)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED')::int audits",
      );
      expect(result.error?.code).toBe("42501");
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("selected-membership switch wins before generation and prevents School A creation", async () => {
      const actor = actors.get("multiSchoolUser")!;
      const client = clients.get("multiSchoolUser")!;
      await client.rpc("set_my_active_membership", {
        target_membership_id: actor.membershipIds[0],
      });
      const selection = await query<{ session_id: string }>(
        "select session_id from internal.staff_session_active_memberships where profile_id=$1 and membership_id=$2",
        [actor.userId, actor.membershipIds[0]],
      );
      const blocker = new Client({ connectionString: databaseUrl! });
      await blocker.connect();
      await blocker.query("begin");
      await blocker.query(
        "select session_id from internal.staff_session_active_memberships where session_id=$1 for update",
        [selection.rows[0].session_id],
      );
      const switching = client.rpc("set_my_active_membership", {
        target_membership_id: actor.membershipIds[1],
      });
      const generating = client.rpc("generate_student_report_snapshot", {
        target_calculation_run_id: ids.runA,
        target_enrollment_id: ids.enrollmentA,
      });
      let result: Awaited<typeof generating> | null = null;
      try {
        await waitForBlocked("set_my_active_membership");
        await waitForBlocked("generate_student_report_snapshot");
        await blocker.query("commit");
        await switching;
        result = await generating;
      } finally {
        await blocker.query("rollback").catch(() => undefined);
        await Promise.allSettled([switching, generating]);
        await client.rpc("set_my_active_membership", {
          target_membership_id: actor.membershipIds[0],
        });
        await blocker.end().catch(() => undefined);
      }
      expect(result?.error).not.toBeNull();
      expect(result?.error?.message).not.toContain(ids.schoolA);
    });

    it("generation owns authority first, then a waiting revocation commits and the next request is denied", async () => {
      const membershipId = actors.get("generatorAdmin")!.membershipIds[0];
      const sourceBlocker = new Client({ connectionString: databaseUrl! });
      const revoker = new Client({ connectionString: databaseUrl! });
      await sourceBlocker.connect();
      await revoker.connect();
      await sourceBlocker.query("begin");
      await sourceBlocker.query(
        "select id from public.mark_sheets where id=$1 for update",
        [ids.sheetA],
      );
      const generation = clients
        .get("generatorAdmin")!
        .rpc("generate_student_report_snapshot", {
          target_calculation_run_id: ids.runA,
          target_enrollment_id: ids.enrollmentA,
        });
      let succeeded: Awaited<typeof generation> | null = null;
      let revocation: Promise<unknown> | null = null;
      let denied: Awaited<ReturnType<SupabaseClient["rpc"]>> | null = null;
      try {
        await waitForBlocked("generate_student_report_snapshot");
        await revoker.query("begin");
        await revoker.query(
          "select set_config('application_name','stage12-generation-wins-revoker',false)",
        );
        revocation = revoker.query(
          "update public.staff_role_assignments set revoked_at=now() where membership_id=$1",
          [membershipId],
        );
        await waitForBlocked("stage12-generation-wins-revoker");
        await sourceBlocker.query("commit");
        succeeded = await generation;
        await revocation;
        await revoker.query("commit");
        await query(
          "update public.staff_role_assignments set revoked_at=null where membership_id=$1",
          [membershipId],
        );
        denied = await clients
          .get("generatorAdmin")!
          .rpc("generate_student_report_snapshot", {
            target_calculation_run_id: ids.runA,
            target_enrollment_id: ids.enrollmentA,
          });
      } finally {
        await sourceBlocker.query("rollback").catch(() => undefined);
        await revoker.query("rollback").catch(() => undefined);
        await Promise.allSettled([generation, revocation ?? Promise.resolve()]);
        await query(
          "update public.staff_role_assignments set revoked_at=null where membership_id=$1",
          [membershipId],
        );
        await sourceBlocker.end().catch(() => undefined);
        await revoker.end().catch(() => undefined);
      }
      expect(succeeded.error).toBeNull();
      expect(denied.error?.code).toBe("42501");
    });

    it("batch generation rolls back every earlier learner when a later source is invalid", async () => {
      const run = randomUUID();
      const sourceA = randomUUID();
      const sourceB = randomUUID();
      const resultA = randomUUID();
      const resultB = randomUUID();
      const subjectA = randomUUID();
      const subjectB = randomUUID();
      const checksum = await query<{ checksum: string }>(
        "select internal.results_input_checksum($1,$2,$3,$4,null) checksum",
        [ids.termA, ids.gradeA, ids.scaleA, ids.ruleA],
      );
      await query(
        "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,supersedes_run_id,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,9,$4,$5,$6,$7,repeat('e',64),$8)",
        [
          run,
          ids.termA,
          ids.gradeA,
          ids.runA,
          ids.scaleA,
          ids.ruleA,
          checksum.rows[0].checksum,
          actors.get("generatorAdmin")!.membershipIds[0],
        ],
      );
      await query(
        "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) select $1,$2,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order from public.result_calculation_sources where id=$3",
        [sourceA, run, ids.sourceA],
      );
      await query(
        "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) select $1,$2,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order from public.result_calculation_sources where id=$3",
        [sourceB, run, ids.sourceB],
      );
      await query(
        "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) select $1,$2,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied from public.calculated_student_results where id=$3",
        [resultA, run, ids.resultA],
      );
      await query(
        "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) select $1,$2,enrollment_id,class_section_id,2,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied from public.calculated_student_results where id=$3",
        [resultB, run, ids.resultB],
      );
      await query(
        "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) select $1,$2,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied from public.calculated_subject_results where id=$3",
        [subjectA, run, ids.subjectResultA],
      );
      await query(
        "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) select $1,$2,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied from public.calculated_subject_results where id=$3",
        [subjectB, run, ids.subjectResultB],
      );
      const before = await query<{
        reports: number;
        snapshots: number;
        subjects: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports where term_id=$1 and enrollment_id in ($2,$3))::int reports,(select count(*) from public.report_snapshots snapshot join public.reports report on report.id=snapshot.report_id where report.term_id=$1)::int snapshots,(select count(*) from public.report_subject_results subject join public.reports report on report.id=subject.report_id where report.term_id=$1)::int subjects,(select count(*) from public.report_snapshot_sources source join public.reports report on report.id=source.report_id where report.term_id=$1)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$4::text)::int audits",
        [ids.termA, ids.enrollmentA, ids.enrollmentB, run],
      );
      const generation = await clients
        .get("generatorAdmin")!
        .rpc("generate_grade_report_snapshots", {
          target_calculation_run_id: run,
        });
      const after = await query<{
        reports: number;
        snapshots: number;
        subjects: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports where term_id=$1 and enrollment_id in ($2,$3))::int reports,(select count(*) from public.report_snapshots snapshot join public.reports report on report.id=snapshot.report_id where report.term_id=$1)::int snapshots,(select count(*) from public.report_subject_results subject join public.reports report on report.id=subject.report_id where report.term_id=$1)::int subjects,(select count(*) from public.report_snapshot_sources source join public.reports report on report.id=source.report_id where report.term_id=$1)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED' and new_values->>'calculation_run_id'=$4::text)::int audits",
        [ids.termA, ids.enrollmentA, ids.enrollmentB, run],
      );
      expect(generation.error?.message).toContain(
        "REPORT_SNAPSHOT_SCHEMA_ERROR",
      );
      expect(after.rows[0]).toEqual({ ...before.rows[0], audits: 0 });
      expect(
        (
          await query<{ count: number }>(
            "select count(*)::int count from public.report_batches where calculation_run_id=$1",
            [run],
          )
        ).rows[0].count,
      ).toBe(0);
    });

    it("failed authorization creates no report, snapshot, subject, lineage, or success audit", async () => {
      const before = await query<{
        reports: number;
        snapshots: number;
        subjects: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports)::int reports,(select count(*) from public.report_snapshots)::int snapshots,(select count(*) from public.report_subject_results)::int subjects,(select count(*) from public.report_snapshot_sources)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED')::int audits",
      );
      const denied = await clients
        .get("subjectTeacher")!
        .rpc("generate_grade_report_snapshots", {
          target_calculation_run_id: ids.runA,
        });
      expect(denied.error?.code).toBe("42501");
      const after = await query<{
        reports: number;
        snapshots: number;
        subjects: number;
        lineage: number;
        audits: number;
      }>(
        "select (select count(*) from public.reports)::int reports,(select count(*) from public.report_snapshots)::int snapshots,(select count(*) from public.report_subject_results)::int subjects,(select count(*) from public.report_snapshot_sources)::int lineage,(select count(*) from public.audit_logs where action='REPORT_SNAPSHOT_CREATED')::int audits",
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    });

    it("reports the Stage 12 boundary without PDF, publication, parent access, or promotion", async () => {
      const report = await query<{
        published_at: unknown;
        pdf_storage_path: unknown;
        published_by: unknown;
      }>(
        "select published_at,pdf_storage_path,published_by from public.reports where id=$1",
        [v3.reportId],
      );
      expect(report.rows[0]).toEqual({
        published_at: null,
        pdf_storage_path: null,
        published_by: null,
      });
    });
  },
);
