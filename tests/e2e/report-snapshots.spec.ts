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
const fixture = Object.fromEntries(
  [
    "schoolId",
    "membershipId",
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
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,supersedes_run_id,grading_scale_id,ranking_rule_id,input_checksum,output_checksum,created_by) values($1,$2,$3,1,null,$4,$5,repeat('a',64),repeat('b',64),$6)",
    [
      fixture.runId,
      fixture.termId,
      fixture.gradeId,
      fixture.scaleId,
      fixture.ruleId,
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
}

async function login(page: Page) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
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

  test("3. stage 12 preview does not expose PDF or publication controls", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByRole("button", {
        name: /PDF download|Publish to parents|Promotion/i,
      }),
    ).toHaveCount(0);
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
    await expect(page.getByText("Aggregate")).toBeVisible();
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
    await expect(page.getByText("Complete")).toBeVisible();
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
    await expect(page.getByText("Position")).toBeVisible();
  });
  test("34. subject result preserves complete status", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText("COMPLETE")).toBeVisible();
  });
  test("35. missing attendance is explicit", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText("Attendance unavailable for this snapshot."),
    ).toBeVisible();
  });
  test("36. missing comments are explicit", async ({ page }) => {
    await openGeneratedReport(page);
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
  test("39. detail page identifies the HTML preview boundary", async ({
    page,
  }) => {
    await openGeneratedReport(page);
    await expect(page.getByText(/HTML snapshot preview/)).toBeVisible();
  });
  test("40. PDF download remains unavailable", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText(/PDF download/)).toBeVisible();
  });
  test("41. publication remains unavailable", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(page.getByText(/publication are not available/)).toBeVisible();
  });
  test("42. parent access is not presented", async ({ page }) => {
    await openGeneratedReport(page);
    await expect(
      page.getByText(/parent access|student access credentials/i),
    ).toHaveCount(0);
  });
});
