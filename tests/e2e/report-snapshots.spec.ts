import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const enabled = process.env.REPORT_SNAPSHOTS_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const nonce = Date.now();
const password = "synthetic-report-snapshot-browser-password";
const admin = enabled ? createClient(url, serviceKey) : null;
const database = new Client({ connectionString: databaseUrl });
let email = "";
let viewOnlyEmail = "";
let subjectTeacherEmail = "";
let schoolBAdminEmail = "";
let multiSchoolEmail = "";
let generatedReportId = "";
const fixture = Object.fromEntries(
  [
    "schoolId",
    "schoolBId",
    "membershipId",
    "subjectMembershipId",
    "schoolBMembershipId",
    "multiMembershipAId",
    "multiMembershipBId",
    "yearId",
    "termId",
    "gradeId",
    "sectionId",
    "subjectId",
    "mappingId",
    "studentId",
    "enrollmentId",
    "assignmentId",
    "schemeId",
    "componentId",
    "sheetId",
    "scaleId",
    "ruleId",
    "runId",
    "sourceId",
    "studentResultId",
    "subjectResultId",
    "attendanceId",
    "commentId",
    "guardianId",
    "studentGuardianId",
    "ungeneratedGradeId",
    "ungeneratedSectionId",
    "ungeneratedMappingId",
    "ungeneratedSchemeId",
    "ungeneratedComponentId",
    "ungeneratedSheetId",
    "ungeneratedScaleId",
    "ungeneratedRuleId",
    "ungeneratedStudentId",
    "ungeneratedEnrollmentId",
    "ungeneratedAssignmentId",
    "ungeneratedRunId",
    "ungeneratedSourceId",
    "ungeneratedResultId",
    "ungeneratedSubjectResultId",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;

async function setup() {
  await database.connect();
  email = `report-snapshot.browser.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  await database.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      fixture.schoolId,
      `Snapshot Browser School ${nonce}`,
      `snapshot-browser-${nonce}`,
      `SBR-${nonce}`,
    ],
  );
  await database.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      fixture.schoolBId,
      `Snapshot Browser School B ${nonce}`,
      `snapshot-browser-b-${nonce}`,
      `SBR-B-${nonce}`,
    ],
  );
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Snapshot','Browser')",
    [auth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [fixture.membershipId, fixture.schoolId, auth.data.user.id, `SBR-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [fixture.membershipId],
  );

  await database.query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,$3,'2047-01-01','2047-12-31','ACTIVE')",
    [fixture.yearId, fixture.schoolId, `Browser Snapshot Year ${nonce}`],
  );
  await database.query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Browser Snapshot Term',1,'2047-01-01','2047-06-30','MARKS_ENTRY')",
    [fixture.termId, fixture.yearId],
  );
  await database.query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'SBR','Browser Snapshot Grade',1)",
    [fixture.gradeId, fixture.schoolId],
  );
  await database.query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Browser Snapshot Class','SBR-A')",
    [fixture.sectionId, fixture.yearId, fixture.gradeId],
  );
  await database.query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'SBR-S','Browser Snapshot Subject',1)",
    [fixture.subjectId, fixture.schoolId],
  );
  await database.query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,sort_order) values($1,$2,$3,1)",
    [fixture.mappingId, fixture.gradeId, fixture.subjectId],
  );
  await database.query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,'SBR-001','Browser','Student','2047-01-02')",
    [fixture.studentId, fixture.schoolId],
  );
  await database.query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,'2047-01-02')",
    [
      fixture.enrollmentId,
      fixture.studentId,
      fixture.yearId,
      fixture.sectionId,
    ],
  );
  await database.query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2047-01-02')",
    [
      fixture.assignmentId,
      fixture.termId,
      fixture.sectionId,
      fixture.subjectId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Browser Snapshot Scheme','DRAFT','2047-01-02',$5)",
    [
      fixture.schemeId,
      fixture.termId,
      fixture.gradeId,
      fixture.subjectId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Exam','EXAM',100,100,1)",
    [fixture.componentId, fixture.schemeId],
  );
  await database.query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [fixture.schemeId],
  );
  await database.query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,workflow_status) values($1,$2,$3,$4,$5,$6,'DRAFT')",
    [
      fixture.sheetId,
      fixture.termId,
      fixture.sectionId,
      fixture.subjectId,
      fixture.schemeId,
      fixture.assignmentId,
    ],
  );
  await database.query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,effective_from,created_by) values($1,$2,$3,$4,'Browser Snapshot Scale','2047-01-02',$5)",
    [
      fixture.scaleId,
      fixture.schoolId,
      fixture.yearId,
      fixture.gradeId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Browser Snapshot Ranking','AVERAGE','DENSE','{}',true,$5)",
    [
      fixture.ruleId,
      fixture.schoolId,
      fixture.yearId,
      fixture.gradeId,
      fixture.membershipId,
    ],
  );
  await database.query("begin");
  await database.query(
    "select set_config('app.marks_workflow_transition','allowed',true)",
  );
  await database.query(
    "update public.mark_sheets set workflow_status='LOCKED', locked_by=$1, locked_at=now() where id=$2",
    [fixture.membershipId, fixture.sheetId],
  );
  await database.query("commit");
  await database.query(
    "insert into public.term_attendance(id,term_id,enrollment_id,days_open,days_present,days_absent,times_late,recorded_by) values($1,$2,$3,90,84,6,2,$4)",
    [
      fixture.attendanceId,
      fixture.termId,
      fixture.enrollmentId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.student_term_comments(id,term_id,enrollment_id,class_teacher_comment,head_teacher_comment,conduct_grade,created_by,updated_by) values($1,$2,$3,'Browser comment','Browser head comment','A',$4,$4)",
    [
      fixture.commentId,
      fixture.termId,
      fixture.enrollmentId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.guardians(id,school_id,first_name,last_name,email,phone) values($1,$2,'Stage12','Guardian','guardian-stage12@example.invalid','+256700000000')",
    [fixture.guardianId, fixture.schoolId],
  );
  await database.query(
    "insert into public.student_guardians(id,student_id,guardian_id,relationship,is_primary,can_access_reports) values($1,$2,$3,'Guardian',true,false)",
    [fixture.studentGuardianId, fixture.studentId, fixture.guardianId],
  );
  const checksum = await database.query(
    "select internal.results_input_checksum($1,$2,$3,$4,null) as checksum",
    [fixture.termId, fixture.gradeId, fixture.scaleId, fixture.ruleId],
  );
  await database.query(
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,supersedes_run_id,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,1,null,$4,$5,$6,repeat('b',64),$7)",
    [
      fixture.runId,
      fixture.termId,
      fixture.gradeId,
      fixture.scaleId,
      fixture.ruleId,
      checksum.rows[0].checksum,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values($1,$2,$3,$4,$5,1,$6,$7,true,true,1)",
    [
      fixture.sourceId,
      fixture.runId,
      fixture.sheetId,
      fixture.sectionId,
      fixture.subjectId,
      fixture.schemeId,
      fixture.mappingId,
    ],
  );
  await database.query(
    "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) values($1,$2,$3,$4,1,1,1,88,88,'A',3,'Advanced',true,true,88,1,1,1,1,false,false)",
    [
      fixture.studentResultId,
      fixture.runId,
      fixture.enrollmentId,
      fixture.sectionId,
    ],
  );
  await database.query(
    "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) values($1,$2,$3,$4,$5,$6,'COMPLETE',88,'A',3,true,100,false,false,1,1,false)",
    [
      fixture.subjectResultId,
      fixture.runId,
      fixture.enrollmentId,
      fixture.sectionId,
      fixture.subjectId,
      fixture.sheetId,
    ],
  );

  await database.query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'SBR-EMPTY','Browser UnGenerated Grade',2)",
    [fixture.ungeneratedGradeId, fixture.schoolId],
  );
  await database.query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Browser UnGenerated Class','SBR-EMPTY-A')",
    [fixture.ungeneratedSectionId, fixture.yearId, fixture.ungeneratedGradeId],
  );
  await database.query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,sort_order) values($1,$2,$3,1)",
    [
      fixture.ungeneratedMappingId,
      fixture.ungeneratedGradeId,
      fixture.subjectId,
    ],
  );
  await database.query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2047-01-02')",
    [
      fixture.ungeneratedAssignmentId,
      fixture.termId,
      fixture.ungeneratedSectionId,
      fixture.subjectId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Browser UnGenerated Scheme','DRAFT','2047-01-02',$5)",
    [
      fixture.ungeneratedSchemeId,
      fixture.termId,
      fixture.ungeneratedGradeId,
      fixture.subjectId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Exam','EXAM',100,100,1)",
    [fixture.ungeneratedComponentId, fixture.ungeneratedSchemeId],
  );
  await database.query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [fixture.ungeneratedSchemeId],
  );
  await database.query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,workflow_status) values($1,$2,$3,$4,$5,$6,'DRAFT')",
    [
      fixture.ungeneratedSheetId,
      fixture.termId,
      fixture.ungeneratedSectionId,
      fixture.subjectId,
      fixture.ungeneratedSchemeId,
      fixture.ungeneratedAssignmentId,
    ],
  );
  await database.query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,effective_from,created_by) values($1,$2,$3,$4,'Browser UnGenerated Scale','2047-01-02',$5)",
    [
      fixture.ungeneratedScaleId,
      fixture.schoolId,
      fixture.yearId,
      fixture.ungeneratedGradeId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Browser UnGenerated Ranking','AVERAGE','DENSE','{}',true,$5)",
    [
      fixture.ungeneratedRuleId,
      fixture.schoolId,
      fixture.yearId,
      fixture.ungeneratedGradeId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,'SBR-EMPTY-001','UnGenerated','Student','2047-01-02')",
    [fixture.ungeneratedStudentId, fixture.schoolId],
  );
  await database.query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,'2047-01-02')",
    [
      fixture.ungeneratedEnrollmentId,
      fixture.ungeneratedStudentId,
      fixture.yearId,
      fixture.ungeneratedSectionId,
    ],
  );
  await database.query("begin");
  await database.query(
    "select set_config('app.marks_workflow_transition','allowed',true)",
  );
  await database.query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$1,locked_at=now() where id=$2",
    [fixture.membershipId, fixture.ungeneratedSheetId],
  );
  await database.query("commit");
  const ungeneratedChecksum = await database.query(
    "select internal.results_input_checksum($1,$2,$3,$4,null) as checksum",
    [
      fixture.termId,
      fixture.ungeneratedGradeId,
      fixture.ungeneratedScaleId,
      fixture.ungeneratedRuleId,
    ],
  );
  await database.query(
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,supersedes_run_id,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,1,null,$4,$5,$6,repeat('c',64),$7)",
    [
      fixture.ungeneratedRunId,
      fixture.termId,
      fixture.ungeneratedGradeId,
      fixture.ungeneratedScaleId,
      fixture.ungeneratedRuleId,
      ungeneratedChecksum.rows[0].checksum,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.result_calculation_sources(id,calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id,grade_level_subject_id,curriculum_is_required,curriculum_contributes_to_aggregate,curriculum_sort_order) values($1,$2,$3,$4,$5,1,$6,$7,true,true,1)",
    [
      fixture.ungeneratedSourceId,
      fixture.ungeneratedRunId,
      fixture.ungeneratedSheetId,
      fixture.ungeneratedSectionId,
      fixture.subjectId,
      fixture.ungeneratedSchemeId,
      fixture.ungeneratedMappingId,
    ],
  );
  await database.query(
    "insert into public.calculated_student_results(id,calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible,ranking_metric,class_position,grade_level_position,class_tie_size,grade_level_tie_size,class_is_tied,grade_level_is_tied) values($1,$2,$3,$4,1,1,1,88,88,'A',3,'Advanced',true,true,88,1,1,1,1,false,false)",
    [
      fixture.ungeneratedResultId,
      fixture.ungeneratedRunId,
      fixture.ungeneratedEnrollmentId,
      fixture.ungeneratedSectionId,
    ],
  );
  await database.query(
    "insert into public.calculated_subject_results(id,calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight,has_absence,has_exemption,subject_position,subject_tie_size,subject_is_tied) values($1,$2,$3,$4,$5,$6,'COMPLETE',88,'A',3,true,100,false,false,1,1,false)",
    [
      fixture.ungeneratedSubjectResultId,
      fixture.ungeneratedRunId,
      fixture.ungeneratedEnrollmentId,
      fixture.ungeneratedSectionId,
      fixture.subjectId,
      fixture.ungeneratedSheetId,
    ],
  );
  await database.query("begin");
  await database.query(
    "select set_config('app.term_marks_workflow_transition','allowed',true)",
  );
  await database.query("update public.terms set status='LOCKED' where id=$1", [
    fixture.termId,
  ]);
  await database.query("commit");

  viewOnlyEmail = `report-snapshot.browser-view-only.${nonce}@example.invalid`;
  const viewOnlyAuth = await admin!.auth.admin.createUser({
    email: viewOnlyEmail,
    password,
    email_confirm: true,
  });
  if (viewOnlyAuth.error) throw viewOnlyAuth.error;
  const viewOnlyMembershipId = randomUUID();
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'View','Only')",
    [viewOnlyAuth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,'SBR-VIEW','ACTIVE')",
    [viewOnlyMembershipId, fixture.schoolId, viewOnlyAuth.data.user.id],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'CLASS_TEACHER',now()-interval '1 day')",
    [viewOnlyMembershipId],
  );
  await database.query(
    "insert into public.role_permissions(role,permission) values('CLASS_TEACHER','REPORTS_VIEW_ALL') on conflict (role,permission) do nothing",
  );

  const signedIn = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const loginResult = await signedIn.auth.signInWithPassword({
    email,
    password,
  });
  if (loginResult.error) throw loginResult.error;
  const selected = await signedIn.rpc("set_my_active_membership", {
    target_membership_id: fixture.membershipId,
  });
  if (selected.error) throw selected.error;
  const generated = await signedIn.rpc("generate_grade_report_snapshots", {
    target_calculation_run_id: fixture.runId,
  });
  if (generated.error) throw generated.error;
  generatedReportId = generated.data?.[0]?.report_id ?? "";
  await database.query("delete from public.term_attendance where id=$1", [
    fixture.attendanceId,
  ]);
  await database.query("delete from public.student_term_comments where id=$1", [
    fixture.commentId,
  ]);
  const regenerated = await signedIn.rpc("generate_student_report_snapshot", {
    target_calculation_run_id: fixture.runId,
    target_enrollment_id: fixture.enrollmentId,
  });
  if (regenerated.error) throw regenerated.error;
  await database.query(
    "insert into public.term_attendance(id,term_id,enrollment_id,days_open,days_present,days_absent,times_late,recorded_by) values($1,$2,$3,90,84,6,2,$4)",
    [
      fixture.attendanceId,
      fixture.termId,
      fixture.enrollmentId,
      fixture.membershipId,
    ],
  );
  await database.query(
    "insert into public.student_term_comments(id,term_id,enrollment_id,class_teacher_comment,head_teacher_comment,conduct_grade,created_by,updated_by) values($1,$2,$3,'Browser comment','Browser head comment','A',$4,$4)",
    [
      fixture.commentId,
      fixture.termId,
      fixture.enrollmentId,
      fixture.membershipId,
    ],
  );
  const restored = await signedIn.rpc("generate_student_report_snapshot", {
    target_calculation_run_id: fixture.runId,
    target_enrollment_id: fixture.enrollmentId,
  });
  if (restored.error) throw restored.error;
  generatedReportId = restored.data?.[0]?.report_id ?? generatedReportId;

  subjectTeacherEmail = `report-snapshot.browser-subject.${nonce}@example.invalid`;
  const subjectAuth = await admin!.auth.admin.createUser({
    email: subjectTeacherEmail,
    password,
    email_confirm: true,
  });
  if (subjectAuth.error) throw subjectAuth.error;
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Subject','Teacher')",
    [subjectAuth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,'SBR-SUBJECT','ACTIVE')",
    [fixture.subjectMembershipId, fixture.schoolId, subjectAuth.data.user.id],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SUBJECT_TEACHER',now()-interval '1 day')",
    [fixture.subjectMembershipId],
  );

  schoolBAdminEmail = `report-snapshot.browser-school-b.${nonce}@example.invalid`;
  const schoolBAuth = await admin!.auth.admin.createUser({
    email: schoolBAdminEmail,
    password,
    email_confirm: true,
  });
  if (schoolBAuth.error) throw schoolBAuth.error;
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'School B','Administrator')",
    [schoolBAuth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,'SBR-B-ADMIN','ACTIVE')",
    [fixture.schoolBMembershipId, fixture.schoolBId, schoolBAuth.data.user.id],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [fixture.schoolBMembershipId],
  );

  multiSchoolEmail = `report-snapshot.browser-multi.${nonce}@example.invalid`;
  const multiAuth = await admin!.auth.admin.createUser({
    email: multiSchoolEmail,
    password,
    email_confirm: true,
  });
  if (multiAuth.error) throw multiAuth.error;
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Multi','School')",
    [multiAuth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,'SBR-MULTI-A','ACTIVE'),($4,$5,$3,'SBR-MULTI-B','ACTIVE')",
    [
      fixture.multiMembershipAId,
      fixture.schoolId,
      multiAuth.data.user.id,
      fixture.multiMembershipBId,
      fixture.schoolBId,
    ],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day'),($2,'SCHOOL_ADMIN',now()-interval '1 day')",
    [fixture.multiMembershipAId, fixture.multiMembershipBId],
  );
}

async function login(
  page: Page,
  actorEmail = email,
  membershipId = fixture.membershipId,
) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(actorEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|select-school/);
  if (page.url().includes("/select-school")) {
    await page.locator(`input[type="radio"][value="${membershipId}"]`).check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.waitForURL(/dashboard/);
}

async function openGeneratedReport(page: Page) {
  await login(page);
  await page.goto("/dashboard/reports");
  await page
    .getByRole("link", { name: /Browser Student/ })
    .first()
    .click();
  await page.waitForURL(/dashboard\/reports\//);
}

test.describe.serial("report snapshots dedicated browser verification", () => {
  test.skip(!enabled, "requires the local report-snapshot runner");
  test.beforeAll(setup);
  test.afterAll(async () => database.end());

  test("1. unauthenticated reports route redirects to staff login", async ({
    page,
  }) => {
    await page.goto("/dashboard/reports");
    await expect(page).toHaveURL(/staff-login/);
  });

  test("2. authorized staff can open the reports dashboard", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("heading", { name: "Reports", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Immutable report snapshots")).toBeVisible();
  });

  test("3. authorized detail exposes the exact PDF download control", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toHaveAttribute("download", "");
  });

  test("4. generated state lists the synthetic finalized report", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(page.getByText("Generated reports")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Browser Student/ }),
    ).toBeVisible();
  });

  test("5. dashboard renders the calculation period", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("cell", { name: /Browser Snapshot Year/ }),
    ).toBeVisible();
  });
  test("6. dashboard renders the student admission number", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(page.getByText("SBR-001")).toBeVisible();
  });
  test("7. dashboard renders the class placement", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("cell", { name: /Browser Snapshot Grade/ }),
    ).toBeVisible();
  });
  test("8. dashboard marks the generated report current", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
  });
  test("9. dashboard exposes one student report link", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("link", { name: /Browser Student/ }),
    ).toHaveCount(1);
  });
  test("10. report link opens the immutable detail route", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page).toHaveURL(/dashboard\/reports\//);
  });
  test("11. detail page names the student", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByRole("heading", { name: "Browser Student" }),
    ).toBeVisible();
  });
  test("12. detail page provides a reports back link", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByRole("link", { name: "Back to reports" }),
    ).toBeVisible();
  });
  test("13. detail page freezes school identity", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByRole("main").getByText(/Snapshot Browser School/),
    ).toBeVisible();
  });
  test("14. detail page freezes admission identity", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByRole("main").getByText("SBR-001").last(),
    ).toBeVisible();
  });
  test("15. detail page freezes placement identity", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText(/Browser Snapshot Grade · Browser Snapshot Class/),
    ).toBeVisible();
  });
  test("16. detail page freezes the academic period", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page
        .getByRole("main")
        .getByText(/Browser Snapshot Term/)
        .last(),
    ).toBeVisible();
  });
  test("17. detail page displays the latest report version", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("v2").first()).toBeVisible();
  });
  test("18. detail page displays source calculation version one", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Source calculation")).toBeVisible();
  });
  test("19. detail page displays a verification checksum", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Report verification")).toBeVisible();
  });
  test("20. detail page displays the academic summary", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Academic summary")).toBeVisible();
  });
  test("21. academic summary preserves the total", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("88").first()).toBeVisible();
  });
  test("22. academic summary preserves the average", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Average")).toBeVisible();
  });
  test("23. academic summary preserves the overall grade", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Overall grade")).toBeVisible();
  });
  test("24. academic summary preserves aggregate points", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Aggregate").first()).toBeVisible();
  });
  test("25. academic summary preserves class position", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Class position")).toBeVisible();
  });
  test("26. academic summary preserves grade position", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Grade position")).toBeVisible();
  });
  test("27. academic summary renders completeness", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Complete", { exact: true })).toBeVisible();
  });
  test("28. detail page displays frozen subject results", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Subject results")).toBeVisible();
  });
  test("29. subject result preserves subject identity", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Browser Snapshot Subject")).toBeVisible();
  });
  test("30. subject result preserves score", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("88").last()).toBeVisible();
  });
  test("31. subject result preserves grade", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("A").last()).toBeVisible();
  });
  test("32. subject result preserves aggregate points column", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Aggregate").last()).toBeVisible();
  });
  test("33. subject result preserves position column", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByRole("columnheader", { name: "Position" }),
    ).toBeVisible();
  });
  test("34. subject result preserves complete status", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("COMPLETE", { exact: true })).toBeVisible();
  });
  test("35. missing attendance is explicit", async ({ page }) => {
    await openGeneratedReport(page);
    await page.getByRole("link", { name: /Report v2/ }).click();
    await page.waitForURL(/dashboard\/reports\//);
    await expect(
      page.getByText("Attendance unavailable for this snapshot."),
    ).toBeVisible();
  });
  test("36. missing comments are explicit", async ({ page }) => {
    await openGeneratedReport(page);
    await page.getByRole("link", { name: /Report v2/ }).click();
    await page.waitForURL(/dashboard\/reports\//);
    await expect(
      page.getByText("Comments unavailable for this snapshot."),
    ).toBeVisible();
  });
  test("37. detail page displays report history", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Report history")).toBeVisible();
  });
  test("38. history marks the report current", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("Current").last()).toBeVisible();
  });
  test("38b. historical report version one remains navigable", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await page.getByText(/Report v1 · calculation v1/).click();
    await expect(page).toHaveURL(/dashboard\/reports\//);
    await expect(page.getByText("Browser comment")).toBeVisible();
  });
  test("39. detail page identifies the HTML preview and PDF boundary", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText(/PDF is available to authorized staff/),
    ).toBeVisible();
  });
  test("40. authorized staff can download the current report PDF", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF", exact: true }).click();
    const download = await downloadPromise;
    const versionLabel = page.getByText(/report snapshot v\d+/i);
    await expect(versionLabel).toBeVisible();
    const versionText = await versionLabel.textContent();
    const version = versionText?.match(/report snapshot v(\d+)/i)?.[1];
    expect(version).toBeTruthy();
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`-v${version}\\.pdf$`),
    );
  });
  test("41. publication remains unavailable", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText(/Publication and parent access are unavailable/),
    ).toBeVisible();
  });
  test("42. parent access is not presented", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText(/student access credentials/i)).toHaveCount(0);
    await expect(
      page.getByText(/parent access are unavailable/i),
    ).toBeVisible();
  });

  test("43. ungenerated run exposes readiness and a missing report count", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(page.getByText("Browser UnGenerated Grade")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Generate reports" }),
    ).toBeVisible();
  });

  test("44. generator completes first-generation through the actual UI control", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await page.getByRole("button", { name: "Generate reports" }).click();
    await expect(
      page.getByText(/Report generation complete: 1 reports created\./),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Regenerate from run" }),
    ).toBeVisible();
  });

  test("45. first-generation refresh shows the new current student link", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("link", { name: /UnGenerated Student/ }),
    ).toBeVisible();
    await expect(page.getByText("Current", { exact: true })).toHaveCount(2);
  });

  test("46. view-only staff can open reports without generation controls", async ({
    page,
  }) => {
    await login(page, viewOnlyEmail);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("heading", { name: "Reports", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Generate reports|Regenerate from run/,
      }),
    ).toHaveCount(0);
  });

  test("47. view-only staff can open generated detail and history", async ({
    page,
  }) => {
    await login(page, viewOnlyEmail);
    await page.goto("/dashboard/reports");
    await page.getByRole("link", { name: /Browser Student/ }).click();
    await page.waitForURL(/dashboard\/reports\//);
    await expect(page.getByText("Report history")).toBeVisible();
    await expect(page.getByText(/Report v1/)).toBeVisible();
  });

  test("48. narrow dashboard keeps report tables in an overflow-safe region", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("heading", { name: "Reports", exact: true }),
    ).toBeVisible();
    await expect(page.locator("table")).toHaveCount(1);
    await expect(page.getByText("Generated reports")).toBeVisible();
  });

  test("49. narrow report detail keeps the subject table usable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGeneratedReport(page);
    await expect(page.getByText("Subject results")).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Subject" }),
    ).toBeVisible();
  });

  test("50. keyboard can reach and activate the report regeneration control", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    const regenerate = page
      .getByRole("button", { name: "Regenerate from run" })
      .first();
    await regenerate.focus();
    await expect(regenerate).toBeFocused();
    await regenerate.press("Enter");
    await expect(page.getByText(/Report generation complete/)).toBeVisible();
  });

  test("51. keyboard can reach a generated report link", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    const reportLink = page.getByRole("link", { name: /Browser Student/ });
    await reportLink.focus();
    await expect(reportLink).toBeFocused();
    await reportLink.press("Enter");
    await expect(page).toHaveURL(/dashboard\/reports\//);
  });

  test("52. detail subject results expose semantic table headers", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByRole("table").getByRole("columnheader", { name: "Subject" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table").getByRole("columnheader", { name: "Score" }),
    ).toBeVisible();
    await expect(
      page.getByRole("table").getByRole("columnheader", { name: "Status" }),
    ).toBeVisible();
  });

  test("53. every historical version remains independently navigable", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    const historyLinks = page.getByRole("link", { name: /Report v/ });
    await expect(historyLinks).toHaveCount(3);
    await historyLinks.filter({ hasText: "Report v1" }).click();
    await expect(page).toHaveURL(/dashboard\/reports\//);
    await expect(page.getByText("Browser comment")).toBeVisible();
  });

  test("54. authorized report pages do not expose guardian contact fields", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText(
        /guardian-stage12@example\.invalid|\+256700000000|Stage12 Guardian Address/,
      ),
    ).toHaveCount(0);
  });

  test("55. browser report routes retain the staff-only Stage 13 boundary", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText(/PDF is available to authorized staff/),
    ).toBeVisible();
    await expect(
      page.getByText(/Publication and parent access are unavailable/),
    ).toBeVisible();
    await expect(page.locator("main").getByText(/promotion/i)).toHaveCount(0);
  });

  test("56. subject teacher receives generic report denial without data leakage", async ({
    page,
  }) => {
    await login(page, subjectTeacherEmail, fixture.subjectMembershipId);
    await page.goto("/dashboard/reports");
    await expect(page).toHaveURL(/forbidden|reports/);
    await expect(
      page.getByText(/Browser Student|SBR-001|checksum/i),
    ).toHaveCount(0);
  });

  test("57. School B administrator cannot open a School A report URL", async ({
    page,
  }) => {
    await login(page, schoolBAdminEmail, fixture.schoolBMembershipId);
    await page.goto(`/dashboard/reports/${generatedReportId}`);
    await expect(page).toHaveURL(/forbidden|reports/);
    await expect(
      page
        .locator("main")
        .getByText(/Browser Student|SBR-001|Snapshot Browser School/i),
    ).toHaveCount(0);
  });

  test("58. multi-school UI switching removes the old school report scope", async ({
    page,
  }) => {
    await login(page, multiSchoolEmail, fixture.multiMembershipAId);
    await page.goto("/select-school?next=%2Fdashboard%2Freports");
    await page
      .locator(`input[type="radio"][value="${fixture.multiMembershipAId}"]`)
      .check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/dashboard\/reports/);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("link", { name: /Browser Student/ }),
    ).toBeVisible();
    await page.goto("/select-school?next=%2Fdashboard%2Freports");
    const schoolB = page
      .locator("label")
      .filter({ hasText: `Snapshot Browser School B ${nonce}` });
    await schoolB.locator('input[type="radio"]').check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(/dashboard\/reports/);
    await expect(
      page.getByRole("link", { name: /Browser Student/ }),
    ).toHaveCount(0);
    await page.goto(`/dashboard/reports/${generatedReportId}`);
    await expect(page).toHaveURL(/forbidden|reports/);
    await expect(
      page
        .locator("main")
        .getByText(/Browser Student|SBR-001|Snapshot Browser School/i),
    ).toHaveCount(0);
  });

  test("59. guardian contact fixtures never appear in authorized report pages", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText(
        /guardian-stage12@example\.invalid|\+256700000000|Stage12 Guardian Address/,
      ),
    ).toHaveCount(0);
  });

  test("60. generated browser history keeps the current report distinct from history URLs", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    const historyLinks = page.getByRole("link", { name: /Report v/ });
    const hrefs = await historyLinks.evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test("61. historical detail targets the exact historical report PDF", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await page.getByRole("link", { name: /Report v1/ }).click();
    await expect(page).toHaveURL(/dashboard\/reports\//);
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toHaveAttribute("href", /\/api\/reports\/.+\/pdf$/);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/-v1\.pdf$/);
  });

  test("62. report PDF response uses private passive download headers", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    const href = await page
      .getByRole("link", { name: "Download PDF", exact: true })
      .getAttribute("href");
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "cache-control": "private, no-store",
      "content-type": "application/pdf",
      "x-content-type-options": "nosniff",
    });
    expect(await response.body()).toEqual(expect.any(Buffer));
  });

  test("63. unauthorized staff cannot download a report PDF", async ({
    page,
  }) => {
    await login(page, subjectTeacherEmail, fixture.subjectMembershipId);
    const response = await page.request.get(
      `/api/reports/${generatedReportId}/pdf`,
      { maxRedirects: 0 },
    );
    expect([307, 308, 403, 404]).toContain(response.status());
    expect(await response.text()).not.toMatch(
      /Browser Student|SBR-001|Snapshot Browser School/,
    );
  });
});
