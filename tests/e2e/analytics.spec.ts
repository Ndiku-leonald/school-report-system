import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const enabled = process.env.ANALYTICS_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-stage-sixteen-browser-password";
const nonce = Date.now();
const ids = Object.fromEntries(
  [
    "school",
    "year",
    "term",
    "grade",
    "unusedGrade",
    "class",
    "subject",
    "mapping",
    "student1",
    "student2",
    "student3",
    "student4",
    "student5",
    "enrollment1",
    "enrollment2",
    "enrollment3",
    "enrollment4",
    "enrollment5",
    "membership",
    "assignment",
    "scheme",
    "component",
    "sheet",
    "scale",
    "rule",
    "classification",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;
const admin = enabled
  ? createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
const database = new Client({ connectionString: databaseUrl });
let email = "";
let runId = "";
const deniedActors: { email: string; userId: string }[] = [];
const fixtureUserIds: string[] = [];

async function setup() {
  await database.connect();
  email = `analytics.browser.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  fixtureUserIds.push(auth.data.user.id);
  await database.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      ids.school,
      `Analytics Browser School ${nonce}`,
      `analytics-browser-${nonce}`,
      `AB-${nonce}`,
    ],
  );
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Browser','Analytics')",
    [auth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [ids.membership, ids.school, auth.data.user.id, `AB-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [ids.membership],
  );
  for (const role of ["CLASS_TEACHER", "SUBJECT_TEACHER"]) {
    const deniedEmail = `analytics.browser.${role.toLowerCase()}.${nonce}@example.invalid`;
    const deniedAuth = await admin!.auth.admin.createUser({
      email: deniedEmail,
      password,
      email_confirm: true,
    });
    if (deniedAuth.error) throw deniedAuth.error;
    fixtureUserIds.push(deniedAuth.data.user.id);
    const deniedMembership = randomUUID();
    await database.query(
      "insert into public.profiles(id,first_name,last_name) values($1,'Browser',$2)",
      [deniedAuth.data.user.id, role],
    );
    await database.query(
      "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
      [
        deniedMembership,
        ids.school,
        deniedAuth.data.user.id,
        `AB-${role}-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,$2,now()-interval '1 day')",
      [deniedMembership, role],
    );
    deniedActors.push({ email: deniedEmail, userId: deniedAuth.data.user.id });
  }
  await database.query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,$3,'2044-01-01','2044-12-31','ACTIVE')",
    [ids.year, ids.school, `Analytics Browser Year ${nonce}`],
  );
  await database.query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Analytics Browser Term',1,'2044-01-01','2044-06-30','MARKS_ENTRY')",
    [ids.term, ids.year],
  );
  await database.query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'ABA','Analytics Browser Grade',1),($3,$2,'UNU','Unused Browser Grade',2)",
    [ids.grade, ids.school, ids.unusedGrade],
  );
  await database.query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Analytics Browser Class','ABA-A')",
    [ids.class, ids.year, ids.grade],
  );
  await database.query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'AB-SUB','Analytics Browser Subject',1)",
    [ids.subject, ids.school],
  );
  await database.query(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,$3,true,true,1)",
    [ids.mapping, ids.grade, ids.subject],
  );
  await database.query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,date_of_birth,photo_storage_path) values($1,$6,'AB-002','Tie','Two','2044-01-02','2034-02-03','browser-privacy-canary-photo'),($2,$6,'AB-001','Tie','One','2044-01-02','2034-02-03','browser-privacy-canary-photo'),($3,$6,'AB-010','Cutoff','Three','2044-01-02','2034-02-03','browser-privacy-canary-photo'),($4,$6,'AB-011','Cutoff','Four','2044-01-02','2034-02-03','browser-privacy-canary-photo'),($5,$6,'AB-099','Incomplete','Five','2044-01-02','2034-02-03','browser-privacy-canary-photo')",
    [
      ids.student1,
      ids.student2,
      ids.student3,
      ids.student4,
      ids.student5,
      ids.school,
    ],
  );
  await database.query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$6,$7,$8,'2044-01-02'),($2,$9,$7,$8,'2044-01-02'),($3,$10,$7,$8,'2044-01-02'),($4,$11,$7,$8,'2044-01-02'),($5,$12,$7,$8,'2044-01-02')",
    [
      ids.enrollment1,
      ids.enrollment2,
      ids.enrollment3,
      ids.enrollment4,
      ids.enrollment5,
      ids.student1,
      ids.year,
      ids.class,
      ids.student2,
      ids.student3,
      ids.student4,
      ids.student5,
    ],
  );
  await database.query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2044-01-02')",
    [ids.assignment, ids.term, ids.class, ids.subject, ids.membership],
  );
  await database.query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Browser Analytics Scheme','DRAFT','2044-01-02',$5)",
    [ids.scheme, ids.term, ids.grade, ids.subject, ids.membership],
  );
  await database.query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Browser Analytics Exam','BA-EXAM',100,100,1)",
    [ids.component, ids.scheme],
  );
  await database.query(
    "update public.assessment_schemes set status='ACTIVE' where id=$1",
    [ids.scheme],
  );
  await database.query(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values($1,$2,$3,$4,$5,$6)",
    [ids.sheet, ids.term, ids.class, ids.subject, ids.scheme, ids.assignment],
  );
  await database.query(
    "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,95,'PRESENT',$6,$6),($1,$2,$4,95,'PRESENT',$6,$6),($1,$2,$5,70,'PRESENT',$6,$6),($1,$2,$7,70,'PRESENT',$6,$6)",
    [
      ids.sheet,
      ids.component,
      ids.enrollment1,
      ids.enrollment2,
      ids.enrollment3,
      ids.membership,
      ids.enrollment4,
    ],
  );
  await database.query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Browser Duplicate Grades',1,false,'2044-01-02',$5)",
    [ids.scale, ids.school, ids.year, ids.grade, ids.membership],
  );
  await database.query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,49,'B',1,false,1),($1,50,79,'A',2,true,2),($1,80,100,'A',3,true,3)",
    [ids.scale],
  );
  await database.query(
    "update public.grading_scales set is_active=true where id=$1",
    [ids.scale],
  );
  await database.query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Browser Ranking',1,'AVERAGE','DENSE',$5,false,$6)",
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
      ids.membership,
    ],
  );
  await database.query(
    "update public.ranking_rules set is_active=true where id=$1",
    [ids.rule],
  );
  await database.query(
    "insert into public.aggregate_classification_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,created_by) values($1,$2,$3,$4,'Browser Duplicate Classifications',1,false,$5)",
    [ids.classification, ids.school, ids.year, ids.grade, ids.membership],
  );
  await database.query(
    "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,0,2,'Good',1),($1,3,5,'Good',2),($1,6,10,'Needs support',3)",
    [ids.classification],
  );
  await database.query(
    "update public.aggregate_classification_scales set is_active=true where id=$1",
    [ids.classification],
  );
  await database.query(
    "select set_config('app.marks_workflow_transition','allowed',false)",
  );
  await database.query(
    "update public.mark_sheets set workflow_status='LOCKED',locked_by=$2,locked_at=now() where id=$1",
    [ids.sheet, ids.membership],
  );
  await database.query(
    "select set_config('app.term_marks_workflow_transition','allowed',false)",
  );
  await database.query("update public.terms set status='LOCKED' where id=$1", [
    ids.term,
  ]);
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const selection = await client.rpc("set_my_active_membership", {
    target_membership_id: ids.membership,
  });
  if (selection.error) throw selection.error;
  const calculation = await client.rpc("calculate_grade_results", {
    target_term_id: ids.term,
    target_grade_level_id: ids.grade,
    target_grading_scale_id: ids.scale,
    target_ranking_rule_id: ids.rule,
    target_aggregate_classification_scale_id: ids.classification,
  });
  if (calculation.error) throw calculation.error;
  runId =
    (calculation.data as { calculation_run_id: string }[])[0]
      ?.calculation_run_id ?? "";
}

async function login(page: Page, credentials = email) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(credentials);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
  if (new URL(page.url()).pathname === "/select-school") {
    await page
      .getByText(new RegExp(`Analytics Browser School ${nonce}`))
      .click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((location) => location.pathname !== "/select-school");
  }
}

const landing = "/dashboard/analytics";
const gradePath = () => `/dashboard/analytics/${runId}`;
const classPath = () => `${gradePath()}/classes/${ids.class}`;
const studentPath = () => `${gradePath()}/students/${ids.enrollment1}`;

test.describe
  .serial("Stage 16 fixture-backed analytics browser acceptance", () => {
  test.skip(!enabled, "requires the local analytics runner");
  test.beforeAll(setup);
  test.afterAll(async () => {
    if (!enabled) return;
    const cleanup: Array<[string, unknown[]]> = [
      [
        "delete from public.calculated_subject_results where calculation_run_id in (select id from public.result_calculation_runs where term_id=$1)",
        [ids.term],
      ],
      [
        "delete from public.calculated_student_results where calculation_run_id in (select id from public.result_calculation_runs where term_id=$1)",
        [ids.term],
      ],
      [
        "delete from public.calculated_component_explanations where calculation_run_id in (select id from public.result_calculation_runs where term_id=$1)",
        [ids.term],
      ],
      [
        "delete from public.calculated_subject_performance where calculation_run_id in (select id from public.result_calculation_runs where term_id=$1)",
        [ids.term],
      ],
      [
        "delete from public.calculated_grade_subject_performance where calculation_run_id in (select id from public.result_calculation_runs where term_id=$1)",
        [ids.term],
      ],
      [
        "delete from public.result_calculation_sources where calculation_run_id in (select id from public.result_calculation_runs where term_id=$1)",
        [ids.term],
      ],
      [
        "delete from public.result_calculation_runs where term_id=$1",
        [ids.term],
      ],
      [
        "delete from public.marks where mark_sheet_id in (select id from public.mark_sheets where term_id=$1)",
        [ids.term],
      ],
      ["delete from public.mark_sheets where term_id=$1", [ids.term]],
      [
        "delete from public.assessment_components where assessment_scheme_id in (select id from public.assessment_schemes where term_id=$1)",
        [ids.term],
      ],
      ["delete from public.assessment_schemes where term_id=$1", [ids.term]],
      ["delete from public.teaching_assignments where term_id=$1", [ids.term]],
      [
        "delete from public.aggregate_classification_bands where scale_id=$1",
        [ids.classification],
      ],
      [
        "delete from public.aggregate_classification_scales where id=$1",
        [ids.classification],
      ],
      [
        "delete from public.grading_bands where grading_scale_id=$1",
        [ids.scale],
      ],
      ["delete from public.grading_scales where id=$1", [ids.scale]],
      ["delete from public.ranking_rules where id=$1", [ids.rule]],
      [
        "delete from public.grade_level_subjects where grade_level_id=$1",
        [ids.grade],
      ],
      ["delete from public.enrollments where academic_year_id=$1", [ids.year]],
      ["delete from public.students where school_id=$1", [ids.school]],
      [
        "delete from public.class_sections where academic_year_id=$1",
        [ids.year],
      ],
      ["delete from public.subjects where id=$1", [ids.subject]],
      ["delete from public.grade_levels where school_id=$1", [ids.school]],
      ["delete from public.terms where academic_year_id=$1", [ids.year]],
      ["delete from public.academic_years where id=$1", [ids.year]],
      [
        "delete from internal.staff_session_active_memberships where profile_id = any($1::uuid[])",
        [fixtureUserIds],
      ],
      [
        "delete from public.staff_role_assignments where membership_id in (select id from public.school_staff_memberships where school_id=$1)",
        [ids.school],
      ],
      [
        "delete from public.school_staff_memberships where school_id=$1",
        [ids.school],
      ],
      [
        "delete from public.profiles where id = any($1::uuid[])",
        [fixtureUserIds],
      ],
      ["delete from public.schools where id=$1", [ids.school]],
    ];
    const immutableFixtureRows =
      /public\.(student_guardians|guardians|enrollments|students|class_sections|subjects|grade_levels|terms|academic_years|schools|profiles|teaching_assignments)\b/;
    for (const [statement, values] of cleanup) {
      if (immutableFixtureRows.test(statement)) continue;
      await database.query(statement, values);
    }
    for (const userId of fixtureUserIds) {
      await admin!.auth.admin.deleteUser(userId);
    }
    await database.end();
  });
  test.beforeEach(async ({ page }, info) => {
    if (/^(01|02|50|51|52|53)\./.test(info.title)) return;
    await login(page);
  });

  test("01. signed-out analytics redirects to staff login", async ({
    page,
  }) => {
    await page.goto(landing);
    await expect(page).toHaveURL(/staff-login/);
  });
  test("02. parent route does not expose staff analytics", async ({ page }) => {
    await page.goto("/parent");
    await expect(page).not.toHaveURL(/dashboard\/analytics/);
  });
  test("03. authorized user opens the analytics landing page", async ({
    page,
  }) => {
    await page.goto(landing);
    await expect(page).toHaveURL(/dashboard\/analytics$/);
  });
  test("04. analytics navigation is visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
  });
  test("05. confidential-data notice is visible", async ({ page }) => {
    await page.goto(landing);
    await expect(page.getByText(/guardian, parent credential/i)).toBeVisible();
  });
  test("06. academic term filter is visible", async ({ page }) => {
    await page.goto(landing);
    await expect(page.getByLabel("Academic term")).toBeVisible();
  });
  test("07. grade filter is visible", async ({ page }) => {
    await page.goto(landing);
    await expect(page.getByLabel("Grade")).toBeVisible();
  });
  test("08. school overview is rendered", async ({ page }) => {
    await page.goto(landing);
    await expect(
      page.getByRole("heading", { name: "School overview" }),
    ).toBeVisible();
  });
  test("09. coverage counts only the real grade scope", async ({ page }) => {
    await page.goto(landing);
    await expect(
      page.getByText("1 of 1 grades", { exact: false }),
    ).toBeVisible();
  });
  test("10. included learner count is displayed", async ({ page }) => {
    await page.goto(landing);
    await expect(
      page.getByText("source population 5", { exact: true }),
    ).toBeVisible();
  });
  test("11. complete count is displayed", async ({ page }) => {
    await page.goto(landing);
    await expect(page.getByText("1 incomplete", { exact: true })).toBeVisible();
  });
  test("12. mean average and denominator are displayed", async ({ page }) => {
    await page.goto(landing);
    await expect(
      page.getByText("of 4 averages", { exact: true }),
    ).toBeVisible();
  });
  test("13. ranking and grade counts are displayed", async ({ page }) => {
    await page.goto(landing);
    await expect(
      page.getByText("4 graded · 4 classified", { exact: true }),
    ).toBeVisible();
  });
  test("14. current grade scope is labeled", async ({ page }) => {
    await page.goto(landing);
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
  });
  test("15. unused active grade is not a bogus scope", async ({ page }) => {
    await page.goto(landing);
    await expect(
      page.getByText("Unused Browser Grade", { exact: true }),
    ).toHaveCount(0);
  });
  test("16. open grade analytics link is present", async ({ page }) => {
    await page.goto(landing);
    await expect(
      page.getByRole("link", { name: /Open grade analytics/ }),
    ).toBeVisible();
  });
  test("17. filter URL survives reload", async ({ page }) => {
    await page.goto(`${landing}?term=${ids.term}&grade=${ids.grade}`);
    await page.reload();
    await expect(page.getByLabel("Grade")).toHaveValue(ids.grade);
  });
  test("18. grade drill-down opens from landing", async ({ page }) => {
    await page.goto(landing);
    await page.getByRole("link", { name: /Open grade analytics/ }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/analytics/${runId}$`));
  });
  test("19. grade context is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByText(
        /Analytics Browser Year .* Analytics Browser Term .* Analytics Browser Grade/,
      ),
    ).toBeVisible();
  });
  test("20. authoritative current badge is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByText("Current authoritative", { exact: true }),
    ).toBeVisible();
  });
  test("21. calculation version is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(page.getByText("Run v1", { exact: true })).toBeVisible();
  });
  test("22. grade population is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByText(/5 learners in this grade scope/),
    ).toBeVisible();
  });
  test("23. grade complete metric is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(page.getByText("1 incomplete", { exact: true })).toBeVisible();
  });
  test("24. grade mean metric is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByText("4 non-null averages", { exact: true }),
    ).toBeVisible();
  });
  test("25. grade ranking metric is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByText("4 graded · 4 classified", { exact: true }),
    ).toBeVisible();
  });
  test("26. overall grade distribution is rendered", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByRole("heading", { name: "Overall grade distribution" }),
    ).toBeVisible();
  });
  test("27. duplicate grade label is displayed once", async ({ page }) => {
    await page.goto(gradePath());
    await expect(page.getByText("A", { exact: true })).toHaveCount(1);
  });
  test("28. grade distribution count is exact", async ({ page }) => {
    await page.goto(gradePath());
    await expect(page.getByText(/4 · 100%/)).toBeVisible();
  });
  test("29. ungraded count is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(page.getByText("Ungraded: 1", { exact: true })).toBeVisible();
  });
  test("30. classification distribution is rendered", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByRole("heading", { name: "Aggregate classification" }),
    ).toBeVisible();
  });
  test("31. duplicate classification label is displayed once", async ({
    page,
  }) => {
    await page.goto(gradePath());
    await expect(page.getByText("Good", { exact: true })).toHaveCount(1);
  });
  test("32. unclassified count is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByText("Unclassified: 1", { exact: true }),
    ).toBeVisible();
  });
  test("33. promotion language is absent", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByText(/promotion recommendation|PROMOTE|REPEAT|RETAIN/i),
    ).toHaveCount(0);
  });
  test("34. class summaries table is rendered", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page.getByRole("heading", { name: "Class summaries" }),
    ).toBeVisible();
  });
  test("35. class population is displayed", async ({ page }) => {
    await page.goto(gradePath());
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "Analytics Browser Class" })
        .getByText("5", { exact: true }),
    ).toBeVisible();
  });
  test("36. class drill-down link is keyboard reachable", async ({ page }) => {
    await page.goto(gradePath());
    const link = page.getByRole("link", { name: "View class" });
    await link.focus();
    await expect(link).toBeFocused();
  });
  test("37. class drill-down opens", async ({ page }) => {
    await page.goto(gradePath());
    await page.getByRole("link", { name: "View class" }).click();
    await expect(page).toHaveURL(new RegExp(`/classes/${ids.class}$`));
  });
  test("38. class title is displayed", async ({ page }) => {
    await page.goto(classPath());
    await expect(
      page.getByRole("heading", { name: "Analytics Browser Class" }),
    ).toBeVisible();
  });
  test("39. class subject is displayed", async ({ page }) => {
    await page.goto(classPath());
    await expect(
      page.getByText("Analytics Browser Subject", { exact: true }),
    ).toBeVisible();
  });
  test("40. class subject mean is displayed", async ({ page }) => {
    await page.goto(classPath());
    await expect(page.getByText("82.5", { exact: true })).toBeVisible();
  });
  test("41. class top learners are displayed", async ({ page }) => {
    await page.goto(classPath());
    await expect(
      page.getByRole("heading", { name: "Top class learners" }),
    ).toBeVisible();
  });
  test("42. tie labels are displayed", async ({ page }) => {
    await page.goto(classPath());
    await expect(page.getByText(/tie of/)).toBeVisible();
  });
  test("43. incomplete learner appears in attention", async ({ page }) => {
    await page.goto(classPath());
    await expect(
      page.getByText("Incomplete Five", { exact: true }),
    ).toBeVisible();
  });
  test("44. student drill-down opens", async ({ page }) => {
    await page.goto(classPath());
    await page.getByRole("link", { name: "Tie Two" }).click();
    await expect(page).toHaveURL(new RegExp(`/students/${ids.enrollment1}$`));
  });
  test("45. student academic fields are rendered", async ({ page }) => {
    await page.goto(studentPath());
    await expect(page.getByText("AB-002", { exact: true })).toBeVisible();
  });
  test("46. student overall average is rendered", async ({ page }) => {
    await page.goto(studentPath());
    await expect(page.getByText("95", { exact: true })).toBeVisible();
  });
  test("47. student subject row is rendered", async ({ page }) => {
    await page.goto(studentPath());
    await expect(
      page.getByRole("heading", { name: "Subject results" }),
    ).toBeVisible();
  });
  test("48. student privacy canary is absent", async ({ page }) => {
    await page.goto(studentPath());
    await expect(
      page.getByText(/browser-privacy-canary|2034-02-03/),
    ).toHaveCount(0);
  });
  test("49. summary CSV endpoint returns safe private response", async ({
    page,
  }) => {
    await page.goto(gradePath());
    const response = await page.request.get(
      `/api/analytics/export?run=${runId}&type=summary`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect(response.headers()["cache-control"]).toContain("private");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(await response.text()).not.toContain("Tie Two");
  });
  test("50. class teacher has no analytics navigation", async ({ page }) => {
    await login(page, deniedActors[0].email);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Analytics" })).toHaveCount(0);
  });
  test("51. subject teacher has no analytics navigation", async ({ page }) => {
    await login(page, deniedActors[1].email);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Analytics" })).toHaveCount(0);
  });
  test("52. class teacher direct analytics URL is denied", async ({ page }) => {
    await login(page, deniedActors[0].email);
    await page.goto(landing);
    await expect(page).not.toHaveURL(/dashboard\/analytics$/);
  });
  test("53. subject teacher direct drill-down URL is denied", async ({
    page,
  }) => {
    await login(page, deniedActors[1].email);
    await page.goto(gradePath());
    await expect(page).not.toHaveURL(
      new RegExp(`/dashboard/analytics/${runId}$`),
    );
  });
});
