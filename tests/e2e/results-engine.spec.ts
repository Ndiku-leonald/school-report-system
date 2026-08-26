import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const enabled = process.env.RESULTS_ENGINE_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const nonce = Date.now();
const password = "synthetic-results-browser-password";
const ids = Object.fromEntries(
  [
    "school",
    "year",
    "term",
    "grade",
    "class",
    "subject",
    "student",
    "studentTwo",
    "enrollment",
    "enrollmentTwo",
    "membership",
    "assignment",
    "scheme",
    "component",
    "sheet",
    "scale",
    "schoolScale",
    "rule",
    "schoolRule",
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
let runPath = "/dashboard/results";

async function setup() {
  await database.connect();
  email = `results.browser.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  await database.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      ids.school,
      `Results Browser School ${nonce}`,
      `results-browser-${nonce}`,
      `RB-${nonce}`,
    ],
  );
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Browser','Results')",
    [auth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [ids.membership, ids.school, auth.data.user.id, `RB-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [ids.membership],
  );
  await database.query(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,$3,'2041-01-01','2041-12-31','ACTIVE')",
    [ids.year, ids.school, `Results Browser Year ${nonce}`],
  );
  await database.query(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Results Browser Term',1,'2041-01-01','2041-06-30','MARKS_ENTRY')",
    [ids.term, ids.year],
  );
  await database.query(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'RBE','Results Browser Grade',1)",
    [ids.grade, ids.school],
  );
  await database.query(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Results Browser Class','RB-C')",
    [ids.class, ids.year, ids.grade],
  );
  await database.query(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'RBS','Results Browser Subject',1)",
    [ids.subject, ids.school],
  );
  await database.query(
    "insert into public.grade_level_subjects(grade_level_id,subject_id,sort_order) values($1,$2,1)",
    [ids.grade, ids.subject],
  );
  await database.query(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$3,'RB-001','Browser','Learner','2041-01-02'),($2,$3,'RB-002','Browser','Tie','2041-01-02')",
    [ids.student, ids.studentTwo, ids.school],
  );
  await database.query(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,enrolled_on) values($1,$2,$3,$4,'2041-01-02'),($5,$6,$3,$4,'2041-01-02')",
    [
      ids.enrollment,
      ids.student,
      ids.year,
      ids.class,
      ids.enrollmentTwo,
      ids.studentTwo,
    ],
  );
  await database.query(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2041-01-02')",
    [ids.assignment, ids.term, ids.class, ids.subject, ids.membership],
  );
  await database.query(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Browser Scheme','DRAFT','2041-01-02',$5)",
    [ids.scheme, ids.term, ids.grade, ids.subject, ids.membership],
  );
  await database.query(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Browser Exam','RB',100,100,1)",
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
    "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,88,'PRESENT',$5,$5),($1,$2,$4,88,'PRESENT',$5,$5)",
    [
      ids.sheet,
      ids.component,
      ids.enrollment,
      ids.enrollmentTwo,
      ids.membership,
    ],
  );
  await database.query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Browser Scale',1,false,'2041-01-02',$5)",
    [ids.scale, ids.school, ids.year, ids.grade, ids.membership],
  );
  await database.query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,80,'C',2,true,2),($1,80,100,'A',3,true,3)",
    [ids.scale],
  );
  await database.query(
    "update public.grading_scales set is_active=true where id=$1",
    [ids.scale],
  );
  await database.query(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,null,null,'Browser School Scale',1,false,'2041-01-02',$3)",
    [ids.schoolScale, ids.school, ids.membership],
  );
  await database.query(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,80,'C',2,true,2),($1,80,100,'A',3,true,3)",
    [ids.schoolScale],
  );
  await database.query(
    "update public.grading_scales set is_active=true where id=$1",
    [ids.schoolScale],
  );
  await database.query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Browser Ranking',1,'AVERAGE','DENSE',$5,true,$6)",
    [
      ids.rule,
      ids.school,
      ids.year,
      ids.grade,
      JSON.stringify({
        direction: "DESC",
        minimum_subjects: 1,
        include_incomplete: false,
      }),
      ids.membership,
    ],
  );
  await database.query(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,null,null,'Browser School Ranking',1,'AVERAGE','DENSE',$3,true,$4)",
    [
      ids.schoolRule,
      ids.school,
      JSON.stringify({
        direction: "DESC",
        minimum_subjects: 1,
        include_incomplete: false,
      }),
      ids.membership,
    ],
  );
  await database.query(
    "insert into public.aggregate_classification_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,created_by) values($1,$2,$3,$4,'Browser Classification',1,false,$5)",
    [ids.classification, ids.school, ids.year, ids.grade, ids.membership],
  );
  await database.query(
    "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,0,2,'Needs support',1),($1,3,3,'On track',2),($1,4,10,'Advanced',3)",
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
}

async function login(page: Page) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
  if (new URL(page.url()).pathname === "/select-school") {
    await page.getByText(new RegExp(`Results Browser School ${nonce}`)).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((location) => location.pathname !== "/select-school");
  }
}

async function openLatestCalculation(page: Page) {
  await page.goto("/dashboard/results");
  await page.getByText("Open latest calculation").click();
  await page.waitForURL(/dashboard\/results\/.+/);
  runPath = new URL(page.url()).pathname;
}

async function selectCalculationRules(page: Page) {
  const scale = await page
    .getByLabel("Grading scale")
    .locator("option", { hasText: "Browser Scale" })
    .getAttribute("value");
  const ranking = await page
    .getByLabel("Ranking rule")
    .locator("option", { hasText: "Browser Ranking" })
    .getAttribute("value");
  await page.getByLabel("Grading scale").selectOption(scale!);
  await page.getByLabel("Ranking rule").selectOption(ranking!);
}

async function selectClassificationScale(page: Page) {
  const classification = await page
    .getByLabel("Classification (optional)")
    .locator("option", { hasText: "Browser Classification" })
    .getAttribute("value");
  await page
    .getByLabel("Classification (optional)")
    .selectOption(classification!);
}

test.describe.serial("results engine dedicated browser verification", () => {
  test.skip(!enabled, "requires the local results-engine runner");
  test.beforeAll(setup);
  test.afterAll(async () => database.end());
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title.startsWith("1.")) return;
    await login(page);
    if (testInfo.title.startsWith("16.")) {
      await page.goto("/dashboard/results");
      await selectCalculationRules(page);
      await page
        .getByRole("button", { name: "Calculate locked results" })
        .click();
    } else if (
      /^(19\.|20\.|21\.|22\.|23\.|24\.|25\.|26\.|27\.|28\.|29\.|30\.|31\.|35\.|36\.|52\.)/.test(
        testInfo.title,
      )
    ) {
      await openLatestCalculation(page);
    } else if (/^(18|33|34|53)\./.test(testInfo.title)) {
      await page.goto("/dashboard/results");
    }
  });
  test("1. unauthenticated results route redirects to staff login", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await expect(page).toHaveURL(/staff-login|dashboard\/results/);
  });
  test("2. authenticated admin can sign in", async ({ page }) => {
    await expect(page).not.toHaveURL(/staff-login/);
  });
  test("3. results dashboard heading is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(
      page.getByRole("heading", { name: "Results calculations" }),
    ).toBeVisible();
  });
  test("4. synthetic term and grade scope is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByText("Results Browser Term")).toBeVisible();
    await expect(page.getByText("Results Browser Grade")).toBeVisible();
  });
  test("5. locked term badge is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
  });
  test("6. readiness panel is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByText("Calculation readiness")).toBeVisible();
  });
  test("7. readiness shows one source of one expected scope", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByText("1 / 1", { exact: true })).toBeVisible();
  });
  test("8. readiness shows a student population", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(
      page.getByRole("main").locator("dt").filter({ hasText: "Students" }),
    ).toBeVisible();
  });
  test("9. ready state is shown before the first run", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  });
  test("10. grading scale selector is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByLabel("Grading scale")).toBeVisible();
  });
  test("11. ranking selector is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByLabel("Ranking rule")).toBeVisible();
  });
  test("12. optional classification selector is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByLabel("Classification (optional)")).toBeVisible();
  });
  test("13. calculate action is visible", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(
      page.getByRole("button", { name: "Calculate locked results" }),
    ).toBeVisible();
  });
  test("14. calculate action is enabled when readiness is satisfied", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await selectCalculationRules(page);
    await expect(
      page.getByRole("button", { name: "Calculate locked results" }),
    ).toBeEnabled();
  });
  test("15. calculation action returns a success alert", async ({ page }) => {
    await page.goto("/dashboard/results");
    await selectCalculationRules(page);
    await selectClassificationScale(page);
    await page
      .getByRole("button", { name: "Calculate locked results" })
      .click();
    await expect(page.getByRole("status")).toContainText("Calculation result");
  });
  test("16. success alert reports version one", async ({ page }) => {
    await expect(page.getByRole("status")).toContainText("Version 1");
  });
  test("17. latest calculation link appears", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByText("Open latest calculation")).toBeVisible();
  });
  test("18. detail route opens from the latest link", async ({ page }) => {
    await page.getByText("Open latest calculation").click();
    await page.waitForURL(/dashboard\/results\/.+/);
    runPath = new URL(page.url()).pathname;
    await expect(page.getByText("Immutable calculation run")).toBeVisible();
  });
  test("19. detail page shows run version", async ({ page }) => {
    await expect(page.getByText("Run v1")).toBeVisible();
  });
  test("20. detail page shows input checksum", async ({ page }) => {
    await expect(page.getByText("Input checksum")).toBeVisible();
  });
  test("21. detail page shows output checksum", async ({ page }) => {
    await expect(page.getByText("Output checksum")).toBeVisible();
  });
  test("22. student results section is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Student results" }),
    ).toBeVisible();
  });
  test("23. student admission link is visible", async ({ page }) => {
    await expect(page.getByText("RB-001")).toBeVisible();
  });
  test("24. calculated student name is visible", async ({ page }) => {
    await expect(page.getByText("Browser Learner")).toBeVisible();
  });
  test("25. class performance section is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Subject performance review" }),
    ).toBeVisible();
  });
  test("26. class subject performance card is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", {
        name: "Results Browser Subject · Results Browser Class",
      }),
    ).toBeVisible();
  });
  test("27. grade-wide performance section is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Grade-wide subject performance" }),
    ).toBeVisible();
  });
  test("28. grade-wide performance table includes the subject", async ({
    page,
  }) => {
    await expect(
      page.getByRole("table").last().getByText("Results Browser Subject"),
    ).toBeVisible();
  });
  test("29. detail page states academic-only scope", async ({ page }) => {
    await expect(page.getByText(/Academic values only/)).toBeVisible();
  });
  test("30. detail page does not expose publication controls", async ({
    page,
  }) => {
    await expect(
      page.getByRole("main").getByText(/^(Publish|Withdraw|Promotion)$/),
    ).toHaveCount(0);
  });
  test("31. detail page does not expose guardian contacts", async ({
    page,
  }) => {
    await expect(
      page.getByRole("main").getByText(/^(Guardian|Phone|Email|Contact)$/i),
    ).toHaveCount(0);
  });
  test("32. dashboard marks the run current", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
  });
  test("33. dashboard retains calculate access after a run", async ({
    page,
  }) => {
    await selectCalculationRules(page);
    await expect(
      page.getByRole("button", { name: "Calculate locked results" }),
    ).toBeEnabled();
  });
  test("34. dashboard refresh retains the latest version", async ({ page }) => {
    await page.reload();
    await expect(page.getByText("Latest version")).toBeVisible();
  });
  test("35. detail route remains directly addressable", async ({ page }) => {
    await page.goto(runPath);
    await expect(
      page.getByRole("heading", { name: "Student results" }),
    ).toBeVisible();
  });
  test("36. source and student counts remain visible on detail", async ({
    page,
  }) => {
    await expect(page.getByText("Sources / students")).toBeVisible();
  });
  test("37. calculation remains disabled until a grading scale is chosen", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await expect(
      page.getByRole("button", { name: "Calculate locked results" }),
    ).toBeDisabled();
  });
  test("38. calculation remains disabled until a ranking rule is chosen", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await page.getByLabel("Grading scale").selectOption({ index: 1 });
    await expect(
      page.getByRole("button", { name: "Calculate locked results" }),
    ).toBeDisabled();
  });
  test("39. explicit rule selections enable calculation", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(
      page.getByLabel("Grading scale").locator("option"),
    ).toHaveCount(3);
    await expect(page.getByLabel("Ranking rule").locator("option")).toHaveCount(
      3,
    );
    await selectCalculationRules(page);
    await expect(
      page.getByRole("button", { name: "Calculate locked results" }),
    ).toBeEnabled();
  });
  test("40. student detail route is reachable from the result table", async ({
    page,
  }) => {
    await openLatestCalculation(page);
    await page.getByText("RB-001").click();
    await page.waitForURL(/dashboard\/results\/.*\/students\/.+/);
    await expect(
      page.getByRole("heading", { name: "Subject results" }),
    ).toBeVisible();
  });
  test("41. student detail exposes subject score and grade columns", async ({
    page,
  }) => {
    await openLatestCalculation(page);
    await page.getByText("RB-001").click();
    await expect(
      page.getByRole("columnheader", { name: "Score" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Grade" }),
    ).toBeVisible();
  });
  test("42. component explanation is visible on student detail", async ({
    page,
  }) => {
    await openLatestCalculation(page);
    await page.getByText("RB-001").click();
    await expect(
      page.getByRole("heading", { name: "Calculation explanation" }),
    ).toBeVisible();
  });
  test("43. student detail exposes class and grade positions", async ({
    page,
  }) => {
    await openLatestCalculation(page);
    await page.getByText("RB-001").click();
    await expect(
      page.getByText("Class position", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Grade position", { exact: true }),
    ).toBeVisible();
  });
  test("44. student detail shows academic attendance semantics", async ({
    page,
  }) => {
    await openLatestCalculation(page);
    await page.getByText("RB-001").click();
    await expect(
      page.getByText(/ABSENT retains component weight/),
    ).toBeVisible();
    await expect(
      page.getByText(/EXEMPTED and optional missing inputs/),
    ).toBeVisible();
  });
  test("45. result tables retain horizontal overflow on a narrow viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLatestCalculation(page);
    const table = page.getByRole("table").first();
    await expect(table).toBeVisible();
    await expect(table).toHaveCSS("min-width", "900px");
  });
  test("46. result detail has semantic table headers", async ({ page }) => {
    await openLatestCalculation(page);
    await expect(
      page.getByRole("columnheader", { name: "Admission" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Positions" }),
    ).toBeVisible();
  });
  test("47. result detail can receive keyboard focus", async ({ page }) => {
    await openLatestCalculation(page);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });
  test("48. classification remains explicitly optional", async ({ page }) => {
    await page.goto("/dashboard/results");
    await expect(page.getByLabel("Classification (optional)")).toHaveValue("");
  });
  test("49. calculation detail preserves the selected rule identity", async ({
    page,
  }) => {
    await openLatestCalculation(page);
    await expect(page.getByText("Browser Ranking")).toBeVisible();
  });
  test("50. calculation detail remains academic-only", async ({ page }) => {
    await openLatestCalculation(page);
    await expect(
      page.getByText(/publication.*promotion controls/i),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("button", { name: /PDF|Publish|Promotion/i }),
    ).toHaveCount(0);
  });
  test("51. selected calculation controls remain available after navigation", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await selectCalculationRules(page);
    await page.reload();
    await expect(page.getByLabel("Grading scale")).toBeVisible();
    await expect(page.getByLabel("Ranking rule")).toBeVisible();
  });
  test("52. browser detail renders a deterministic tie marker", async ({
    page,
  }) => {
    await openLatestCalculation(page);
    await expect(page.getByText("tied", { exact: true })).toHaveCount(2);
  });
  test("53. browser calculation preserves an explicit classification scale", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await selectCalculationRules(page);
    await selectClassificationScale(page);
    await page
      .getByRole("button", { name: "Calculate locked results" })
      .click();
    await expect(page.getByRole("status")).toContainText("Version 1");
    await expect(page.getByRole("status")).toContainText(
      "identical calculation",
    );
  });
});
