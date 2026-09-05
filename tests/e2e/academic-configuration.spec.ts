import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.ACADEMIC_CONFIG_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const schoolId = "10000000-0000-4000-8000-000000000001";
const password = "synthetic-academic-e2e-password";
const nonce = Date.now();
const createdYearName = `E2E ${nonce}`;
const editedYearName = `E2E edited ${nonce}`;
const users: string[] = [];
const membershipIds: string[] = [];
const admin = enabled
  ? createClient<Database>(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
const database = new Client({ connectionString: databaseUrl });
const identities = new Map<string, { email: string; membershipId: string }>();
const editableClassId = randomUUID();
const lockedClassId = randomUUID();
const draftSchemeId = randomUUID();
const draftScaleId = randomUUID();
const draftRankingId = randomUUID();
const activeRankingId = randomUUID();
const draftPromotionId = randomUUID();
const activePromotionId = randomUUID();

async function provision(
  key: string,
  role: Database["public"]["Enums"]["staff_role"],
) {
  const email = `academic.e2e.${key}.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const userId = auth.data.user.id;
  const membershipId = randomUUID();
  users.push(userId);
  membershipIds.push(membershipId);
  const profile = await admin!.from("profiles").insert({
    id: userId,
    first_name: "Synthetic",
    last_name: "Academic E2E",
  });
  if (profile.error) throw profile.error;
  const membership = await admin!.from("school_staff_memberships").insert({
    id: membershipId,
    school_id: schoolId,
    profile_id: userId,
    employee_number: `ACADEMIC-E2E-${key}-${nonce}`,
    status: "ACTIVE",
  });
  if (membership.error) throw membership.error;
  const assignment = await admin!.from("staff_role_assignments").insert({
    membership_id: membershipId,
    role,
  });
  if (assignment.error) throw assignment.error;
  identities.set(key, { email, membershipId });
}

async function signedClient(key: string) {
  const identity = identities.get(key)!;
  const client = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const login = await client.auth.signInWithPassword({
    email: identity.email,
    password,
  });
  if (login.error) throw login.error;
  const selection = await client.rpc("set_my_active_membership", {
    target_membership_id: identity.membershipId,
  });
  if (selection.error) throw selection.error;
  return client;
}

async function login(page: Page, key: string) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(identities.get(key)!.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
}

test.describe.serial("academic configuration", () => {
  test.skip(!enabled, "requires the local academic-configuration E2E runner");

  test.beforeAll(async () => {
    await database.connect();
    await provision("admin", "SCHOOL_ADMIN");
    await provision("registrar", "ACADEMIC_REGISTRAR");
    await provision("head", "HEAD_TEACHER");
    await provision("subject", "SUBJECT_TEACHER");

    await database.query(
      `insert into public.class_sections
         (id, academic_year_id, grade_level_id, name, class_code, capacity)
       values
         ($1, '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', $2, $3, 35),
         ($4, '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', $5, $6, 40)`,
      [
        editableClassId,
        `Editable E2E class ${nonce}`,
        `EDIT-${nonce}`,
        lockedClassId,
        `Referenced E2E class ${nonce}`,
        `LOCK-${nonce}`,
      ],
    );
    await database.query(
      `insert into public.teaching_assignments
         (term_id, class_section_id, subject_id, staff_membership_id, starts_on)
       values ('21000000-0000-4000-8000-000000000001', $1,
         '40000000-0000-4000-8000-000000000001', $2, '2026-02-02')`,
      [lockedClassId, membershipIds.at(-1)!],
    );
    await database.query(
      `insert into public.assessment_schemes
         (id, term_id, grade_level_id, subject_id, name, version, status, effective_from)
       values ($1, '21000000-0000-4000-8000-000000000002',
         '30000000-0000-4000-8000-000000000002',
         '40000000-0000-4000-8000-000000000002',
         'Editable E2E assessment', 1, 'DRAFT', '2026-05-25')`,
      [draftSchemeId],
    );
    await database.query(
      `insert into public.assessment_components
         (assessment_scheme_id, name, component_code, maximum_score,
          weight_percentage, sort_order)
       values ($1, 'Assessment', 'ASSESS', 100, 100, 1)`,
      [draftSchemeId],
    );
    await database.query(
      `insert into public.grading_scales
         (id, school_id, academic_year_id, grade_level_id, name, version,
          is_active, effective_from)
       values ($1, $2, '20000000-0000-4000-8000-000000000001',
         '30000000-0000-4000-8000-000000000002',
         'Editable E2E grading', 1, false, '2026-02-02')`,
      [draftScaleId, schoolId],
    );
    await database.query(
      `insert into public.grading_bands
         (grading_scale_id, minimum_score, maximum_score, grade,
          aggregate_points, description, is_pass, sort_order)
       values ($1, 0, 100, 'P', 1, 'Pass', true, 1)`,
      [draftScaleId],
    );
    const rankingConfiguration = JSON.stringify({
      schema_version: 1,
      direction: "DESC",
      include_incomplete: false,
      minimum_subjects: 1,
    });
    await database.query(
      `insert into public.ranking_rules
         (id, school_id, academic_year_id, grade_level_id, name, version,
          is_active, ranking_basis, tie_method, configuration)
       values
         ($1, $3, '20000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          'Editable E2E ranking', 1, false, 'AVERAGE', 'DENSE', $4::jsonb),
         ($2, $3, null, null, 'Active E2E ranking', 1, true,
          'AVERAGE', 'DENSE', $4::jsonb)`,
      [draftRankingId, activeRankingId, schoolId, rankingConfiguration],
    );
    const promotionConfiguration = JSON.stringify({
      schema_version: 1,
      require_complete_result: true,
      success_outcome: "PROMOTED",
      failure_outcome: "ACADEMIC_REVIEW",
      incomplete_outcome: "ACADEMIC_REVIEW",
    });
    await database.query(
      `insert into public.promotion_rules
         (id, school_id, academic_year_id, grade_level_id, name, version,
          is_active, minimum_average, required_subject_rules, additional_rules)
       values
         ($1, $3, '20000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          'Editable E2E promotion', 1, false, 50, '{}'::jsonb, $4::jsonb),
         ($2, $3, null, null, 'Active E2E promotion', 1, true, 50,
          '{}'::jsonb, $4::jsonb)`,
      [draftPromotionId, activePromotionId, schoolId, promotionConfiguration],
    );
  });

  test.afterAll(async () => {
    // Successful configuration audits intentionally retain actor references.
    // The disposable local reset owns fixture cleanup.
    await database.end();
  });

  test("registrar creates a draft year from the accessible form", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/years");
    await expect(
      page.getByRole("heading", { name: "Academic years and terms" }),
    ).toBeVisible();
    await page.getByLabel("Academic year name").fill(createdYearName);
    await page.getByLabel("Starts on").fill("2032-01-01");
    await page.getByLabel("Ends on").fill("2032-12-31");
    await page.getByRole("button", { name: "Create draft year" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Draft academic year created.",
    );
    await expect(
      page.getByText(createdYearName, { exact: true }),
    ).toBeVisible();
  });

  for (const key of ["head", "subject"]) {
    test(`${key} receives a read-only academic workspace`, async ({ page }) => {
      await login(page, key);
      await page.goto("/dashboard/academic");
      await expect(
        page.getByRole("heading", { name: "Academic configuration" }),
      ).toBeVisible();
      await expect(page.getByText("Read-only configuration")).toBeVisible();
      await page.goto("/dashboard/academic/years");
      await expect(
        page.getByRole("button", { name: "Create draft year" }),
      ).toHaveCount(0);
    });
  }

  test("invalid year dates show an accessible validation error", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/years");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create draft year" }),
    });
    await form.getByLabel("Academic year name").fill(`E2E ${nonce} invalid`);
    await form.getByLabel("Starts on").fill("2033-12-31");
    await form.getByLabel("Ends on").fill("2033-01-01");
    await form.getByRole("button", { name: "Create draft year" }).click();
    await expect(
      form.getByText("The end date must be after the start date."),
    ).toBeVisible();
  });

  test("registrar edits a draft year", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/years");
    const card = page.locator("li").filter({ hasText: createdYearName });
    await card.getByText("Edit draft year").click();
    await card.getByLabel("Academic year name").fill(editedYearName);
    await card.getByRole("button", { name: "Save year changes" }).click();
    await expect(card.getByRole("status")).toContainText(
      "Draft academic year updated.",
    );
    await expect(page.getByText(editedYearName, { exact: true })).toBeVisible();
  });

  test("registrar creates and edits a draft term", async ({ page }) => {
    const year = await database.query<{ id: string }>(
      "select id from public.academic_years where name = $1",
      [editedYearName],
    );
    const yearId = year.rows[0]!.id;
    await login(page, "registrar");
    await page.goto(`/dashboard/academic/years/${yearId}`);
    const create = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create draft" }),
    });
    await create.getByLabel("Academic year").selectOption(yearId);
    await create.getByLabel("Term name").fill(`E2E Term ${nonce}`);
    await create.getByLabel("Term number").fill("1");
    await create.getByLabel("Starts on").fill("2032-01-01");
    await create.getByLabel("Ends on").fill("2032-04-30");
    await create.getByRole("button", { name: "Create draft" }).click();
    await expect(create.getByRole("status")).toContainText(
      "Draft term created.",
    );

    const card = page.locator("li").filter({ hasText: `E2E Term ${nonce}` });
    await card.getByText("Edit draft term").click();
    await card.getByLabel("Term name").fill(`E2E Term edited ${nonce}`);
    await card.getByRole("button", { name: "Save term changes" }).click();
    await expect(card.getByRole("status")).toContainText("Draft term updated.");
  });

  test("administrator edits and reorders grade levels", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/grade-levels");
    const card = page.locator("li").filter({ hasText: "Primary One" }).first();
    await card.getByText("Edit grade").click();
    await card.getByLabel("Name").fill(`Primary One E2E ${nonce}`);
    await card.getByRole("button", { name: "Save grade changes" }).click();
    await expect(card.getByRole("status")).toContainText(
      "Grade level updated.",
    );
    await page.reload();
    const move = page.getByRole("button", {
      name: /Move .*Primary Two up/,
    });
    await move.click();
    await page.getByRole("button", { name: "Save grades order" }).click();
    await expect(page.getByRole("status").last()).toContainText(
      "Grade levels reordered.",
    );
  });

  test("administrator edits and reorders subjects", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/subjects");
    const card = page.locator("li").filter({ hasText: "English" }).first();
    await card.getByText("Edit subject").click();
    await card.getByLabel("Description").fill("Edited through Playwright");
    await card.getByRole("button", { name: "Save subject changes" }).click();
    await expect(card.getByRole("status")).toContainText("Subject updated.");
    await page.reload();
    await page.getByRole("button", { name: /Move .*Mathematics up/ }).click();
    await page.getByRole("button", { name: "Save subjects order" }).click();
    await expect(page.getByRole("status").last()).toContainText(
      "Subjects reordered.",
    );
  });

  test("administrator edits an unused class", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/classes");
    const card = page.locator("li").filter({ hasText: "Editable E2E class" });
    await card.getByText("Edit class").click();
    await card.getByLabel("Section name").fill("Editable E2E class changed");
    await card.getByLabel("Capacity").fill("38");
    await card.getByRole("button", { name: "Save class changes" }).click();
    await expect(card.getByRole("status")).toContainText(
      "Class section updated.",
    );
  });

  test("moving a referenced class is rejected with a useful message", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/classes");
    const card = page.locator("li").filter({ hasText: "Referenced E2E class" });
    await card.getByText("Edit class").click();
    await expect(card.getByText(/Year and grade are locked/)).toBeVisible();
    await expect(card.getByLabel("Academic year")).toHaveCount(0);
    await expect(card.getByLabel("Grade level")).toHaveCount(0);

    const client = await signedClient("admin");
    const current = await client
      .from("class_sections")
      .select("updated_at")
      .eq("id", lockedClassId)
      .single();
    if (current.error) throw current.error;
    const forged = await client.rpc("update_class_section", {
      target_class_section_id: lockedClassId,
      expected_updated_at: current.data.updated_at,
      target_academic_year_id: "20000000-0000-4000-8000-000000000001",
      target_grade_level_id: "30000000-0000-4000-8000-000000000002",
      section_name: "Forbidden browser move",
      section_code: `LOCK-${nonce}`,
      section_capacity: 40,
    });
    expect(forged.error?.message).toContain(
      "ACADEMIC_CONFIGURATION_CLASS_SCOPE_IN_USE",
    );
  });

  test("administrator edits curriculum flags", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/curriculum");
    const card = page.locator("li").filter({ hasText: "English" }).first();
    await card.getByText("Edit mapping").click();
    await card.getByLabel("Required subject").uncheck();
    await card.getByRole("button", { name: "Save mapping flags" }).click();
    await expect(card.getByRole("status")).toContainText(
      "Curriculum mapping updated.",
    );
  });

  test("mapping repoint controls are not offered", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/curriculum");
    const card = page.locator("li").filter({ hasText: "English" }).first();
    await card.getByText("Edit mapping").click();
    await expect(card.getByText(/Pair identity:/)).toBeVisible();
    await expect(card.locator("select")).toHaveCount(0);
  });

  test("assessment components add and remove through structured controls", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/assessment-schemes");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create draft scheme" }),
    });
    await form.getByRole("button", { name: "Add component" }).click();
    await expect(form.getByText("Component 2")).toBeVisible();
    await form.getByRole("button", { name: "Remove component 2" }).click();
    await expect(form.getByText("Component 2")).toHaveCount(0);
  });

  test("invalid assessment totals are clearly displayed", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/assessment-schemes");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create draft scheme" }),
    });
    await form.getByLabel("Weight percentage").fill("90");
    await expect(form.getByRole("status")).toContainText("90.00%");
    await expect(form.getByRole("status")).toContainText(
      "requires exactly 100%",
    );
  });

  test("grading bands add and remove through structured controls", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/grading");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create draft scale" }),
    });
    await form.getByRole("button", { name: "Add band" }).click();
    await expect(form.getByText("Band 2")).toBeVisible();
    await form.getByRole("button", { name: "Remove band 2" }).click();
    await expect(form.getByText("Band 2")).toHaveCount(0);
  });

  test("grading gaps and overlaps expose accessible errors", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/grading");
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create draft scale" }),
    });
    await form.getByRole("button", { name: "Add band" }).click();
    await expect(form.getByRole("alert")).toContainText("overlaps");
    const minimums = form.getByLabel("Minimum score");
    await minimums.nth(1).fill("101");
    await expect(form.getByRole("alert")).toContainText("Gap");
  });

  test("a draft assessment scheme can be edited", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/assessment-schemes");
    const card = page
      .locator("li")
      .filter({ hasText: "Editable E2E assessment" });
    await card.getByText("Edit draft").click();
    await card.getByLabel("Scheme name").fill("Editable E2E assessment saved");
    await card.getByRole("button", { name: "Save draft changes" }).click();
    await expect(
      card.getByRole("status").filter({
        hasText: "Draft assessment scheme updated.",
      }),
    ).toBeVisible();
  });

  test("assessment component arrow order persists after saving and reload", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/assessment-schemes");
    const card = page
      .locator("li")
      .filter({ hasText: "Editable E2E assessment saved" });
    await card.getByText("Edit draft").click();

    await card
      .getByRole("group", { name: "Component 1" })
      .getByLabel("Name")
      .fill("A");
    await card
      .getByRole("group", { name: "Component 1" })
      .getByLabel("Component code")
      .fill("A");
    await card
      .getByRole("group", { name: "Component 1" })
      .getByLabel("Weight percentage")
      .fill("34");
    await card.getByRole("button", { name: "Add component" }).click();
    await card.getByRole("button", { name: "Add component" }).click();

    for (const [position, name, code, weight] of [
      ["2", "B", "B", "33"],
      ["3", "C", "C", "33"],
    ] as const) {
      const component = card.getByRole("group", {
        name: `Component ${position}`,
      });
      await component.getByLabel("Name").fill(name);
      await component.getByLabel("Component code").fill(code);
      await component.getByLabel("Weight percentage").fill(weight);
    }

    await card.getByRole("button", { name: "Move component 3 up" }).click();
    await card.getByRole("button", { name: "Move component 2 up" }).click();
    await card.getByRole("button", { name: "Save draft changes" }).click();
    await expect(
      card
        .getByRole("status")
        .filter({ hasText: "Draft assessment scheme updated." }),
    ).toBeVisible();

    await page.reload();
    const reloaded = page
      .locator("li")
      .filter({ hasText: "Editable E2E assessment saved" });
    await reloaded.getByText("Edit draft").click();
    await expect(
      reloaded.getByRole("group", { name: "Component 1" }).getByLabel("Name"),
    ).toHaveValue("C");
  });

  test("an active assessment offers explicit new-version creation", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/assessment-schemes");
    const card = page
      .locator("li")
      .filter({ hasText: "Standard Term Assessment" });
    await card
      .locator("summary")
      .filter({ hasText: "Create new version" })
      .click();
    await expect(card.getByText(/source remains unchanged/i)).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Create new version" }),
    ).toBeVisible();
  });

  test("grading drafts edit while active scales version", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/grading");
    const draft = page
      .locator("li")
      .filter({ hasText: "Editable E2E grading" });
    await expect(draft.getByText("Edit draft")).toBeVisible();
    const active = page
      .locator("li")
      .filter({ hasText: "Standard Percentage Scale" });
    await expect(
      active.locator("summary").filter({ hasText: "Create new version" }),
    ).toBeVisible();
  });

  test("grading band arrow order persists after saving and reload", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/grading");
    const card = page.locator("li").filter({ hasText: "Editable E2E grading" });
    await card.getByText("Edit draft").click();

    const first = card.getByRole("group", { name: "Band 1" });
    await first.getByLabel("Minimum score").fill("0");
    await first.getByLabel("Maximum score").fill("34");
    await first.getByLabel("Grade").fill("A");
    await card.getByRole("button", { name: "Add band" }).click();
    await card.getByRole("button", { name: "Add band" }).click();

    for (const [position, minimum, maximum, grade, points] of [
      ["2", "34", "67", "B", "2"],
      ["3", "67", "100", "C", "3"],
    ] as const) {
      const band = card.getByRole("group", { name: `Band ${position}` });
      await band.getByLabel("Minimum score").fill(minimum);
      await band.getByLabel("Maximum score").fill(maximum);
      await band.getByLabel("Grade").fill(grade);
      await band.getByLabel("Aggregate points").fill(points);
    }

    await card.getByRole("button", { name: "Move band 3 up" }).click();
    await card.getByRole("button", { name: "Move band 2 up" }).click();
    await card.getByRole("button", { name: "Save draft changes" }).click();
    await expect(
      card
        .getByRole("status")
        .filter({ hasText: "Draft grading scale updated." }),
    ).toBeVisible();

    await page.reload();
    const reloaded = page
      .locator("li")
      .filter({ hasText: "Editable E2E grading" });
    await reloaded.getByText("Edit draft").click();
    await expect(
      reloaded.getByRole("group", { name: "Band 1" }).getByLabel("Grade"),
    ).toHaveValue("C");
  });

  test("ranking drafts edit while active rules version", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/ranking");
    await expect(
      page
        .locator("li")
        .filter({ hasText: "Editable E2E ranking" })
        .getByText("Edit draft"),
    ).toBeVisible();
    await expect(
      page
        .locator("li")
        .filter({ hasText: "Active E2E ranking" })
        .locator("summary")
        .filter({ hasText: "Create new version" }),
    ).toBeVisible();
  });

  test("promotion drafts edit while active rules version", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/dashboard/academic/promotion");
    await expect(
      page
        .locator("li")
        .filter({ hasText: "Editable E2E promotion" })
        .getByText("Edit draft"),
    ).toBeVisible();
    await expect(
      page
        .locator("li")
        .filter({ hasText: "Active E2E promotion" })
        .locator("summary")
        .filter({ hasText: "Create new version" }),
    ).toBeVisible();
  });

  test("stale edits display a concurrency conflict", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/years");
    const card = page.locator("li").filter({ hasText: editedYearName });
    await card.getByText("Edit draft year").click();
    await database.query(
      `update public.academic_years
       set name = $1
       where name = $2`,
      [`External E2E update ${nonce}`, editedYearName],
    );
    await card.getByLabel("Academic year name").fill("Stale browser edit");
    await card.getByRole("button", { name: "Save year changes" }).click();
    await expect(card.getByRole("alert")).toContainText("changed elsewhere");
  });

  test("view-only roles cannot forge mutation controls", async ({ page }) => {
    await login(page, "head");
    await page.goto("/dashboard/academic/classes");
    await expect(page.getByText("Edit class")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Create draft" }),
    ).toHaveCount(0);
  });

  test("mobile and keyboard reorder interactions work", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "admin");
    await page.goto("/dashboard/academic/grade-levels");
    const move = page.getByRole("button", { name: /Move .*Primary Two up/ });
    await move.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Save grades order" }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  });
});
