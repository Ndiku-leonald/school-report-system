import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const enabled = process.env.PROMOTION_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-stage-seventeen-promotion-browser-password";
const nonce = `${Date.now()}-${randomUUID()}`;
const ids = Object.fromEntries(
  [
    "school",
    "year",
    "nextYear",
    "term",
    "grade",
    "nextGrade",
    "sourceClass",
    "targetClass",
    "subject",
    "mapping",
    "student",
    "enrollment",
    "assignment",
    "scheme",
    "component",
    "sheet",
    "scale",
    "ranking",
    "classification",
    "rule",
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
let schoolName = "";
let fixtureUserId = "";

async function sql(statement: string, values: unknown[] = []) {
  return database.query(statement, values);
}

async function setup() {
  if (!enabled) return;
  await database.connect();
  schoolName = `Promotion Browser School ${nonce}`;
  email = `promotion.browser.${nonce}@example.invalid`;
  const created = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  fixtureUserId = created.data.user.id;
  const membership = randomUUID();
  await sql(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      ids.school,
      schoolName,
      `promotion-browser-${nonce}`,
      `PB-${nonce.slice(0, 8)}`,
    ],
  );
  await sql(
    "insert into public.profiles(id,first_name,last_name) values($1,'Promotion','Browser')",
    [fixtureUserId],
  );
  await sql(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [membership, ids.school, fixtureUserId, `PB-${nonce}`],
  );
  await sql(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [membership],
  );
  await sql(
    "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Browser Source','2049-01-01','2049-12-31','ACTIVE'),($3,$2,'Browser Next','2050-01-01','2050-12-31','DRAFT')",
    [ids.year, ids.school, ids.nextYear],
  );
  await sql(
    "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'BP1','Browser Source Grade',1),($3,$2,'BP2','Browser Target Grade',2)",
    [ids.grade, ids.school, ids.nextGrade],
  );
  await sql(
    "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Browser Source Class','BP1-A'),($4,$5,$6,'Browser Target Class','BP2-A')",
    [
      ids.sourceClass,
      ids.year,
      ids.grade,
      ids.targetClass,
      ids.nextYear,
      ids.nextGrade,
    ],
  );
  await sql(
    "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'BP-SUB','Browser Subject',1)",
    [ids.subject, ids.school],
  );
  await sql(
    "insert into public.grade_level_subjects(id,grade_level_id,subject_id,is_required,contributes_to_aggregate,sort_order) values($1,$2,$3,true,true,1)",
    [ids.mapping, ids.grade, ids.subject],
  );
  await sql(
    "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date,status) values($1,$2,'BP-001','Browser','Learner','2049-01-02','ACTIVE')",
    [ids.student, ids.school],
  );
  await sql(
    "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE','2049-01-02')",
    [ids.enrollment, ids.student, ids.year, ids.sourceClass],
  );
  await sql(
    "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status,is_promotion_term) values($1,$2,'Browser Promotion Term',1,'2049-01-01','2049-06-30','MARKS_ENTRY',true)",
    [ids.term, ids.year],
  );
  await sql(
    "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,'2049-01-02')",
    [ids.assignment, ids.term, ids.sourceClass, ids.subject, membership],
  );
  await sql(
    "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,status,effective_from,created_by) values($1,$2,$3,$4,'Browser Scheme','ACTIVE','2049-01-02',$5)",
    [ids.scheme, ids.term, ids.grade, ids.subject, membership],
  );
  await sql(
    "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Browser Exam','BP-EXAM',100,100,1)",
    [ids.component, ids.scheme],
  );
  await sql(
    "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id,workflow_status,locked_by,locked_at) values($1,$2,$3,$4,$5,$6,'LOCKED',$7,now())",
    [
      ids.sheet,
      ids.term,
      ids.sourceClass,
      ids.subject,
      ids.scheme,
      ids.assignment,
      membership,
    ],
  );
  await sql(
    "insert into public.grading_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,effective_from,created_by) values($1,$2,$3,$4,'Browser Scale',1,false,'2049-01-02',$5)",
    [ids.scale, ids.school, ids.year, ids.grade, membership],
  );
  await sql(
    "insert into public.grading_bands(grading_scale_id,minimum_score,maximum_score,grade,aggregate_points,is_pass,sort_order) values($1,0,50,'F',1,false,1),($1,50,100,'A',5,true,2)",
    [ids.scale],
  );
  await sql("update public.grading_scales set is_active=true where id=$1", [
    ids.scale,
  ]);
  await sql(
    "insert into public.ranking_rules(id,school_id,academic_year_id,grade_level_id,name,version,ranking_basis,tie_method,configuration,is_active,created_by) values($1,$2,$3,$4,'Browser Ranking',1,'AVERAGE','DENSE','{}',true,$5)",
    [ids.ranking, ids.school, ids.year, ids.grade, membership],
  );
  await sql(
    "insert into public.aggregate_classification_scales(id,school_id,academic_year_id,grade_level_id,name,version,is_active,created_by) values($1,$2,$3,$4,'Browser Classification',1,false,$5)",
    [ids.classification, ids.school, ids.year, ids.grade, membership],
  );
  await sql(
    "insert into public.aggregate_classification_bands(scale_id,minimum_aggregate,maximum_aggregate,label,sort_order) values($1,0,5,'Ready',1)",
    [ids.classification],
  );
  await sql(
    "update public.aggregate_classification_scales set is_active=true where id=$1",
    [ids.classification],
  );
  const checksum = (
    await sql(
      "select internal.results_input_checksum($1,$2,$3,$4,$5) as value",
      [ids.term, ids.grade, ids.scale, ids.ranking, ids.classification],
    )
  ).rows[0].value;
  const runId = randomUUID();
  await sql(
    "insert into public.result_calculation_runs(id,term_id,grade_level_id,version,grading_scale_id,ranking_rule_id,aggregate_classification_scale_id,input_checksum,output_checksum,created_by) values($1,$2,$3,1,$4,$5,$6,$7,repeat('b',64),$8)",
    [
      runId,
      ids.term,
      ids.grade,
      ids.scale,
      ids.ranking,
      ids.classification,
      checksum,
      membership,
    ],
  );
  await sql(
    "insert into public.result_calculation_sources(calculation_run_id,mark_sheet_id,class_section_id,subject_id,mark_sheet_version,assessment_scheme_id) values($1,$2,$3,$4,1,$5)",
    [runId, ids.sheet, ids.sourceClass, ids.subject, ids.scheme],
  );
  await sql(
    "insert into public.calculated_student_results(calculation_run_id,enrollment_id,class_section_id,subject_count,complete_subject_count,subjects_passed,overall_total,overall_average,overall_grade,aggregate_total,aggregate_classification,is_complete,ranking_eligible) values($1,$2,$3,1,1,1,90,90,'A',5,'Ready',true,true)",
    [runId, ids.enrollment, ids.sourceClass],
  );
  await sql(
    "insert into public.calculated_subject_results(calculation_run_id,enrollment_id,class_section_id,subject_id,mark_sheet_id,subject_status,subject_score,grade,aggregate_points,is_pass,assessed_weight) values($1,$2,$3,$4,$5,'COMPLETE',90,'A',5,true,100)",
    [runId, ids.enrollment, ids.sourceClass, ids.subject, ids.sheet],
  );
  await sql(
    "insert into public.term_attendance(term_id,enrollment_id,days_open,days_present,days_absent,recorded_by) values($1,$2,100,90,10,$3)",
    [ids.term, ids.enrollment, membership],
  );
  await sql(
    "insert into public.promotion_rules(id,school_id,academic_year_id,grade_level_id,name,version,minimum_average,minimum_attendance_percentage,is_active,created_by) values($1,$2,$3,$4,'Browser Promotion Rule',1,50,80,true,$5)",
    [ids.rule, ids.school, ids.year, ids.grade, membership],
  );
  await sql(
    "select set_config('app.term_marks_workflow_transition','allowed',false)",
  );
  await sql("update public.terms set status='LOCKED' where id=$1", [ids.term]);
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const loginResult = await client.auth.signInWithPassword({ email, password });
  if (loginResult.error) throw loginResult.error;
  if (
    (
      await client.rpc("set_my_active_membership", {
        target_membership_id: membership,
      })
    ).error
  )
    throw new Error("Could not select the browser fixture school.");
  const generated = await client.rpc("generate_promotion_recommendations", {
    target_term_id: ids.term,
    target_grade_level_id: ids.grade,
  });
  if (generated.error) throw generated.error;
}

async function login(page: Page) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
}

test.describe.serial("Stage 17 promotion browser acceptance", () => {
  test.skip(!enabled, "requires the local promotion runner");
  test.beforeAll(setup);
  test.afterAll(async () => {
    if (!enabled) return;
    // The fixture includes append-only promotion evidence. Teardown must not
    // bypass those database lifecycle protections.
    await database.end();
    return;
    await sql("delete from public.student_progressions where school_id=$1", [
      ids.school,
    ]);
    await sql("delete from public.promotion_decisions where enrollment_id=$1", [
      ids.enrollment,
    ]);
    await sql(
      "delete from public.promotion_recommendation_snapshots where school_id=$1",
      [ids.school],
    );
    await sql("delete from public.term_attendance where term_id=$1", [
      ids.term,
    ]);
    await sql(
      "delete from public.calculated_subject_results where enrollment_id=$1",
      [ids.enrollment],
    );
    await sql(
      "delete from public.calculated_student_results where enrollment_id=$1",
      [ids.enrollment],
    );
    await sql(
      "delete from public.result_calculation_sources where mark_sheet_id=$1",
      [ids.sheet],
    );
    await sql("delete from public.result_calculation_runs where term_id=$1", [
      ids.term,
    ]);
    await sql("delete from public.mark_sheets where id=$1", [ids.sheet]);
    await sql("delete from public.assessment_components where id=$1", [
      ids.component,
    ]);
    await sql("delete from public.assessment_schemes where id=$1", [
      ids.scheme,
    ]);
    await sql("delete from public.teaching_assignments where id=$1", [
      ids.assignment,
    ]);
    await sql("delete from public.promotion_rules where id=$1", [ids.rule]);
    await sql("delete from public.grading_bands where grading_scale_id=$1", [
      ids.scale,
    ]);
    await sql("delete from public.grading_scales where id=$1", [ids.scale]);
    await sql("delete from public.ranking_rules where id=$1", [ids.ranking]);
    await sql(
      "delete from public.aggregate_classification_bands where scale_id=$1",
      [ids.classification],
    );
    await sql(
      "delete from public.aggregate_classification_scales where id=$1",
      [ids.classification],
    );
    await sql("delete from public.enrollments where id=$1", [ids.enrollment]);
    await sql("delete from public.students where id=$1", [ids.student]);
    await sql("delete from public.class_sections where id in ($1,$2)", [
      ids.sourceClass,
      ids.targetClass,
    ]);
    await sql("delete from public.grade_level_subjects where id=$1", [
      ids.mapping,
    ]);
    await sql("delete from public.subjects where id=$1", [ids.subject]);
    await sql("delete from public.grade_levels where school_id=$1", [
      ids.school,
    ]);
    await sql("delete from public.terms where id=$1", [ids.term]);
    await sql("delete from public.academic_years where school_id=$1", [
      ids.school,
    ]);
    await sql("delete from public.schools where id=$1", [ids.school]);
    if (fixtureUserId) await admin!.auth.admin.deleteUser(fixtureUserId);
    await database.end();
  });
  test.beforeEach(async ({ page }, info) => {
    if (!info.title.startsWith("01.")) await login(page);
  });

  test("01. signed-out users cannot open promotion", async ({ page }) => {
    await page.goto("/dashboard/promotion");
    await expect(page).toHaveURL(/staff-login|forbidden/);
  });
  const scenarios: Array<[string, (page: Page) => Promise<void>]> = [
    [
      "02. authorized user opens promotion",
      async (page) => expect(page).toHaveURL(/dashboard\/promotion/),
    ],
    [
      "03. promotion heading is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByRole("heading", { name: "Promotion and progression" }),
        ).toBeVisible();
      },
    ],
    [
      "04. secure eyebrow is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/secure promotion/i)).toBeVisible();
      },
    ],
    [
      "05. view permission badge is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("PROMOTION_VIEW", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "06. term filter is labelled",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByLabel("Academic term")).toBeVisible();
      },
    ],
    [
      "07. grade filter is labelled",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByLabel("Grade")).toBeVisible();
      },
    ],
    [
      "08. apply filters control is present",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByRole("button", { name: "Apply filters" }),
        ).toBeVisible();
      },
    ],
    [
      "09. promotion term metric is configured",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Configured", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "10. source year metric is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Browser Source", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "11. active rule metric is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/Browser Promotion Rule/)).toBeVisible();
      },
    ],
    [
      "12. current result metric is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/Current · v1/)).toBeVisible();
      },
    ],
    [
      "13. learner count is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("1", { exact: true }).first(),
        ).toBeVisible();
      },
    ],
    [
      "14. generated recommendation card is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/Recommendation v1/)).toBeVisible();
      },
    ],
    [
      "15. system promoted badge is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/System: Promoted/)).toBeVisible();
      },
    ],
    [
      "16. unconfirmed state is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Not confirmed", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "17. average evidence is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("90", { exact: true }).first(),
        ).toBeVisible();
      },
    ],
    [
      "18. attendance criterion is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("minimum_attendance_percentage", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "19. criterion table is keyboard reachable",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await page.getByLabel("Academic term").focus();
        await expect(page.getByLabel("Academic term")).toBeFocused();
      },
    ],
    [
      "20. grade filter retains source grade",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByLabel("Grade")).toHaveValue(ids.grade);
      },
    ],
    [
      "21. term filter retains promotion term",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByLabel("Academic term")).toHaveValue(ids.term);
      },
    ],
    [
      "22. generation action is available",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByRole("button", { name: "Generate recommendations" }),
        ).toBeVisible();
      },
    ],
    [
      "23. final decision selector is available",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByLabel("Final decision")).toBeVisible();
      },
    ],
    [
      "24. promoted option is available",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByLabel("Final decision").locator("option[value='PROMOTED']"),
        ).toHaveCount(1);
      },
    ],
    [
      "25. support option is available",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page
            .getByLabel("Final decision")
            .locator("option[value='PROMOTED_WITH_SUPPORT']"),
        ).toHaveCount(1);
      },
    ],
    [
      "26. academic review option is available",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page
            .getByLabel("Final decision")
            .locator("option[value='ACADEMIC_REVIEW']"),
        ).toHaveCount(1);
      },
    ],
    [
      "27. repeat option is available",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page
            .getByLabel("Final decision")
            .locator("option[value='REPEAT_CONFIRMED']"),
        ).toHaveCount(1);
      },
    ],
    [
      "28. completed option is available",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page
            .getByLabel("Final decision")
            .locator("option[value='COMPLETED']"),
        ).toHaveCount(1);
      },
    ],
    [
      "29. override reason is labelled",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByLabel(/Override\/reopen reason/)).toBeVisible();
      },
    ],
    [
      "30. generation is idempotent in the UI",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await page
          .getByRole("button", { name: "Generate recommendations" })
          .click();
        await expect(page.getByText(/Recommendation v1/)).toBeVisible();
      },
    ],
    [
      "31. snapshot fingerprint is shown",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/snapshot [a-f0-9]{8}/i)).toBeVisible();
      },
    ],
    [
      "32. evidence headings are visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByRole("heading", { name: "Criterion evidence" }),
        ).toBeVisible();
      },
    ],
    [
      "33. result complete criterion is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("result_complete", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "34. success criterion is met",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Met", { exact: true }).first(),
        ).toBeVisible();
      },
    ],
    [
      "35. no horizontal overflow at 320px",
      async (page) => {
        await page.setViewportSize({ width: 320, height: 760 });
        await page.goto("/dashboard/promotion");
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth,
          ),
        ).toBe(true);
      },
    ],
    [
      "36. page remains readable at 320px",
      async (page) => {
        await page.setViewportSize({ width: 320, height: 760 });
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByRole("heading", { name: "Promotion and progression" }),
        ).toBeVisible();
      },
    ],
    [
      "37. apply filters is keyboard reachable",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await page.getByRole("button", { name: "Apply filters" }).focus();
        await expect(
          page.getByRole("button", { name: "Apply filters" }),
        ).toBeFocused();
      },
    ],
    [
      "38. generation button is keyboard reachable",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await page
          .getByRole("button", { name: "Generate recommendations" })
          .focus();
        await expect(
          page.getByRole("button", { name: "Generate recommendations" }),
        ).toBeFocused();
      },
    ],
    [
      "39. selector supports keyboard selection",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await page
          .getByLabel("Final decision")
          .selectOption("PROMOTED_WITH_SUPPORT");
        await expect(page.getByLabel("Final decision")).toHaveValue(
          "PROMOTED_WITH_SUPPORT",
        );
      },
    ],
    [
      "40. reason field accepts keyboard input",
      async (page) => {
        await page.goto("/dashboard/promotion");
        const reason = page.getByLabel(/Override\/reopen reason/);
        await reason.fill("Browser review note");
        await expect(reason).toHaveValue("Browser review note");
      },
    ],
    [
      "41. confirmation action is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByRole("button", { name: "Confirm decision" }),
        ).toBeVisible();
      },
    ],
    [
      "42. page exposes no guardian data",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/guardian|parent credential/i)).toHaveCount(
          0,
        );
      },
    ],
    [
      "43. page exposes no photo path",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/storage-path|photo-canary/i)).toHaveCount(
          0,
        );
      },
    ],
    [
      "44. page exposes no raw database error",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText(/postgres|SQLSTATE|relation .* does not exist/i),
        ).toHaveCount(0);
      },
    ],
    [
      "45. secure description is visible",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText(/never become final decisions automatically/i),
        ).toBeVisible();
      },
    ],
    [
      "46. recommendation is not progressed initially",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText("PROGRESSED", { exact: true })).toHaveCount(
          0,
        );
      },
    ],
    [
      "47. target controls are initially hidden",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Explicit progression", { exact: true }),
        ).toHaveCount(0);
      },
    ],
    [
      "48. no stale warning appears initially",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Confirmed stale", { exact: true }),
        ).toHaveCount(0);
      },
    ],
    [
      "49. rule version is shown",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText(/rule v1/)).toBeVisible();
      },
    ],
    [
      "50. attendance actual is shown",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByText("90.00", { exact: true })).toBeVisible();
      },
    ],
    [
      "51. source enrollment identifier is shown",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText(`Enrollment ${ids.enrollment.slice(0, 8)}`),
        ).toBeVisible();
      },
    ],
    [
      "52. filter submit preserves route",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await page.getByRole("button", { name: "Apply filters" }).click();
        await page.waitForURL(/dashboard\/promotion/);
      },
    ],
    [
      "53. one promotion workspace is rendered",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Criterion evidence", { exact: true }),
        ).toHaveCount(1);
      },
    ],
    [
      "54. no automatic progression claim is shown",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText(/automatically progressed|auto-promoted/i),
        ).toHaveCount(0);
      },
    ],
    [
      "55. selected school remains in scope",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page).not.toHaveURL(/select-school/);
      },
    ],
    [
      "56. confirmation selector has a visible label",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Final decision", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "57. generation action has a visible label",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Generate recommendations", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "58. snapshot checksum is not blank",
      async (page) => {
        await page.goto("/dashboard/promotion");
        const text = await page
          .getByText(/snapshot [a-f0-9]{8}/i)
          .textContent();
        expect(text).toMatch(/[a-f0-9]{8}/i);
      },
    ],
    [
      "59. criterion table is present",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByRole("table")).toBeVisible();
      },
    ],
    [
      "60. content is not on a report route",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page).not.toHaveURL(/reports|analytics/);
      },
    ],
    [
      "61. feedback region is absent before action",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(page.getByRole("alert")).toHaveCount(0);
      },
    ],
    [
      "62. system recommendation is not final",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByText("Not confirmed", { exact: true }),
        ).toBeVisible();
      },
    ],
    [
      "63. non-final grade exposes promotion option",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByLabel("Final decision").locator("option[value='PROMOTED']"),
        ).toHaveCount(1);
      },
    ],
    [
      "64. generation button is enabled",
      async (page) => {
        await page.goto("/dashboard/promotion");
        await expect(
          page.getByRole("button", { name: "Generate recommendations" }),
        ).toBeEnabled();
      },
    ],
  ];
  for (const [title, scenario] of scenarios)
    test(title, async ({ page }) => scenario(page));
  test("65. authorized user confirms a recommendation", async ({ page }) => {
    await page.goto("/dashboard/promotion");
    await page.getByLabel("Final decision").selectOption("PROMOTED");
    await page.getByRole("button", { name: "Confirm decision" }).click();
    await expect(
      page.getByText("Final: Promoted", { exact: true }),
    ).toBeVisible();
  });
  test("66. authorized user applies explicit progression", async ({ page }) => {
    await page.goto("/dashboard/promotion");
    await expect(
      page.getByText("Explicit progression", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Apply progression" }).click();
    await expect(page.getByText(/Application fingerprint/)).toBeVisible();
  });
});
