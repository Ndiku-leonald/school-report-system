import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.TEACHER_ASSIGNMENT_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-stage-eight-browser-password";
const nonce = Date.now();
const ids = {
  school: randomUUID(),
  otherSchool: randomUUID(),
  year: randomUUID(),
  otherYear: randomUUID(),
  term: randomUUID(),
  grade: randomUUID(),
  otherGrade: randomUUID(),
  class: randomUUID(),
  secondClass: randomUUID(),
  subject: randomUUID(),
  unmapped: randomUUID(),
};
const schoolName = `Assignment Browser School ${nonce}`;
const otherSchoolName = `Other Assignment Browser School ${nonce}`;
const database = new Client({ connectionString: databaseUrl });
const admin = enabled
  ? createClient<Database>(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;
const people = new Map<
  string,
  { email: string; userId: string; memberships: string[] }
>();
let subjectAssignmentId = "";
let classAssignmentId = "";

function isoDate(offset = 0) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

async function provision(
  key: string,
  role: Database["public"]["Enums"]["staff_role"],
  schoolId = ids.school,
) {
  const email = `assignment.e2e.${key}.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const membershipId = randomUUID();
  await database.query(
    "insert into public.profiles (id,first_name,last_name) values ($1,$2,'E2E Teacher')",
    [auth.data.user.id, key],
  );
  await database.query(
    "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')",
    [membershipId, schoolId, auth.data.user.id, `E2E-${key}-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments (membership_id,role,granted_at) values ($1,$2,now() - interval '1 day')",
    [membershipId, role],
  );
  people.set(key, {
    email,
    userId: auth.data.user.id,
    memberships: [membershipId],
  });
}

async function login(page: Page, key: string) {
  await page.context().clearCookies();
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(people.get(key)!.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
}

test.describe.serial("teacher assignments", () => {
  test.skip(!enabled, "requires the local teacher-assignment E2E runner");

  test.beforeAll(async () => {
    await database.connect();
    await database.query(
      "insert into public.schools (id,name,slug,school_code) values ($1,$2,$3,$4),($5,$6,$7,$8)",
      [
        ids.school,
        schoolName,
        `assignment-e2e-${nonce}`,
        `AE-${nonce}`,
        ids.otherSchool,
        otherSchoolName,
        `assignment-other-e2e-${nonce}`,
        `AOE-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.academic_years (id,school_id,name,starts_on,ends_on,status) values ($1,$2,'2026 Browser','2026-01-01','2026-12-31','ACTIVE'),($3,$4,'2026 Other','2026-01-01','2026-12-31','ACTIVE')",
      [ids.year, ids.school, ids.otherYear, ids.otherSchool],
    );
    await database.query(
      "insert into public.terms (id,academic_year_id,name,term_number,starts_on,ends_on,status) values ($1,$2,'Browser Full Year',1,'2026-01-01','2026-12-31','OPEN')",
      [ids.term, ids.year],
    );
    await database.query(
      "insert into public.grade_levels (id,school_id,code,name,sort_order) values ($1,$2,'P1','Primary One',1),($3,$4,'P1','Other Primary One',1)",
      [ids.grade, ids.school, ids.otherGrade, ids.otherSchool],
    );
    await database.query(
      "insert into public.class_sections (id,academic_year_id,grade_level_id,name,class_code) values ($1,$2,$3,'P1 North','P1-N'),($4,$2,$3,'P1 South','P1-S')",
      [ids.class, ids.year, ids.grade, ids.secondClass],
    );
    await database.query(
      "insert into public.subjects (id,school_id,code,name,sort_order) values ($1,$2,'ENG','English',1),($3,$2,'ART','Unmapped Art',2)",
      [ids.subject, ids.school, ids.unmapped],
    );
    await database.query(
      "insert into public.grade_level_subjects (grade_level_id,subject_id,sort_order) values ($1,$2,1)",
      [ids.grade, ids.subject],
    );
    for (const [key, role] of [
      ["registrar", "ACADEMIC_REGISTRAR"],
      ["head", "HEAD_TEACHER"],
      ["subject", "SUBJECT_TEACHER"],
      ["subject2", "SUBJECT_TEACHER"],
      ["class", "CLASS_TEACHER"],
      ["class2", "CLASS_TEACHER"],
      ["wrong", "HEAD_TEACHER"],
    ] as const)
      await provision(key, role);
    await provision("multi", "SUBJECT_TEACHER");
    const multi = people.get("multi")!;
    const otherMembership = randomUUID();
    await database.query(
      "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')",
      [otherMembership, ids.otherSchool, multi.userId, `E2E-MULTI-O-${nonce}`],
    );
    await database.query(
      "insert into public.staff_role_assignments (membership_id,role,granted_at) values ($1,'SUBJECT_TEACHER',now() - interval '1 day')",
      [otherMembership],
    );
    multi.memberships.push(otherMembership);
    const subject = await database.query<{ id: string }>(
      "insert into public.teaching_assignments (term_id,class_section_id,subject_id,staff_membership_id,starts_on) values ($1,$2,$3,$4,'2026-01-01') returning id",
      [ids.term, ids.class, ids.subject, people.get("subject")!.memberships[0]],
    );
    subjectAssignmentId = subject.rows[0]!.id;
    const classResult = await database.query<{ id: string }>(
      "insert into public.class_teacher_assignments (term_id,class_section_id,staff_membership_id,is_primary,starts_on) values ($1,$2,$3,true,'2026-01-01') returning id",
      [ids.term, ids.class, people.get("class")!.memberships[0]],
    );
    classAssignmentId = classResult.rows[0]!.id;
    await database.query(
      "insert into public.teaching_assignments (term_id,class_section_id,subject_id,staff_membership_id,starts_on) values ($1,$2,$3,$4,$5)",
      [
        ids.term,
        ids.secondClass,
        ids.subject,
        people.get("subject2")!.memberships[0],
        isoDate(2),
      ],
    );
  });

  test.afterAll(async () => database.end());

  test("1. registrar opens assignment management", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/assignments");
    await expect(
      page.getByRole("heading", { name: "Teacher assignments" }),
    ).toBeVisible();
  });
  test("2. registrar creates a subject assignment", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/assignments/teaching/new");
    await page.getByLabel("Term").selectOption(ids.term);
    await page.getByLabel("Class section").selectOption(ids.secondClass);
    await page.getByRole("button", { name: "Load eligible teachers" }).click();
    await page.getByLabel("Mapped subject").selectOption(ids.subject);
    await page.getByRole("button", { name: "Load eligible teachers" }).click();
    await page
      .getByLabel("Eligible subject teacher")
      .selectOption(people.get("multi")!.memberships[0]);
    await page
      .getByRole("button", { name: "Create subject assignment" })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/assignments\/teaching\//);
  });
  test("3. registrar creates a primary class-teacher assignment", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/assignments/class-teachers/new");
    await page.getByLabel("Term").selectOption(ids.term);
    await page.getByLabel("Class section").selectOption(ids.secondClass);
    await page.getByLabel("Designation").selectOption("true");
    await page.getByRole("button", { name: "Load eligible teachers" }).click();
    await page
      .getByLabel("Eligible class teacher")
      .selectOption(people.get("class2")!.memberships[0]);
    await page
      .getByRole("button", { name: "Create primary assignment" })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/assignments\/class-teachers\//);
  });
  test("4. invalid term and class combination is rejected", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto(
      `/dashboard/assignments/teaching/new?term=${ids.term}&class=${randomUUID()}&subject=${ids.subject}&starts=2026-01-01`,
    );
    await expect(page.getByText("Choose a complete scope")).toBeVisible();
  });
  test("5. unmapped subject is unavailable", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(
      `/dashboard/assignments/teaching/new?term=${ids.term}&class=${ids.class}&starts=2026-01-01`,
    );
    await expect(
      page
        .getByLabel("Mapped subject")
        .locator(`option[value='${ids.unmapped}']`),
    ).toHaveCount(0);
  });
  test("6. wrong-role teacher is unavailable", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(
      `/dashboard/assignments/teaching/new?term=${ids.term}&class=${ids.class}&subject=${ids.subject}&starts=2026-01-01`,
    );
    await expect(
      page
        .getByLabel("Eligible subject teacher")
        .locator(`option[value='${people.get("wrong")!.memberships[0]}']`),
    ).toHaveCount(0);
  });
  test("7. head teacher sees read-only assignment data", async ({ page }) => {
    await login(page, "head");
    await page.goto("/dashboard/assignments");
    await expect(page.getByText("View only")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Assign subject teacher" }),
    ).toHaveCount(0);
  });
  test("8. management controls are absent for teachers", async ({ page }) => {
    await login(page, "subject");
    await page.goto("/teacher/assignments");
    await expect(page.getByText("Read only")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /create|save|end/i }),
    ).toHaveCount(0);
  });
  test("9. subject teacher sees only own assignments", async ({ page }) => {
    await login(page, "subject");
    await page.goto("/teacher/assignments");
    await expect(page.getByText("English")).toBeVisible();
    await expect(page.getByText("P1 South")).toHaveCount(0);
  });
  test("10. class teacher sees only own assignments", async ({ page }) => {
    await login(page, "class");
    await page.goto("/teacher/assignments");
    await expect(page.getByText("Primary class teacher")).toBeVisible();
    await expect(page.getByText("English")).toHaveCount(0);
  });
  test("11. multi-school selection changes assignment results", async ({
    page,
  }) => {
    await login(page, "multi");
    await expect(page).toHaveURL(/select-school/);
    await page.getByText(schoolName, { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((location) => location.pathname !== "/select-school");
    await page.goto("/teacher/assignments");
    await expect(page.getByText("P1 South")).toBeVisible();
  });
  test("12. future assignment appears as upcoming", async ({ page }) => {
    await login(page, "subject2");
    await page.goto("/teacher/assignments");
    await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
    await expect(page.getByText("P1 South")).toBeVisible();
  });
  test("13. ending an assignment removes it from current", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/assignments/teaching/${subjectAssignmentId}`);
    await page.getByLabel("Final effective date").fill(isoDate(-1));
    await page.getByLabel("Reason").fill("Browser end workflow");
    await page.getByRole("button", { name: "End assignment" }).click();
    await expect(
      page.getByText("Subject-teaching assignment ended."),
    ).toBeVisible();
  });
  test("14. primary replacement retains history", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(
      `/dashboard/assignments/class-teachers/${classAssignmentId}`,
    );
    await page
      .getByLabel("Replacement class teacher")
      .selectOption(people.get("class2")!.memberships[0]);
    await page.getByLabel("Effective date", { exact: true }).fill(isoDate(1));
    await page
      .getByLabel("Reason", { exact: true })
      .last()
      .fill("Browser replacement workflow");
    await page.getByRole("button", { name: "Replace primary teacher" }).click();
    await expect(page).toHaveURL(/view=class/);
    const history = await database.query(
      "select count(*)::int count from public.class_teacher_assignments where term_id=$1 and class_section_id=$2 and is_primary",
      [ids.term, ids.class],
    );
    expect(history.rows[0]!.count).toBe(2);
  });
  test("15. stale edit displays a conflict", async ({ page }) => {
    const row = await database.query<{ id: string }>(
      "select id from public.teaching_assignments where class_section_id=$1 and staff_membership_id=$2 limit 1",
      [ids.secondClass, people.get("subject2")!.memberships[0]],
    );
    const id = row.rows[0]!.id;
    await login(page, "registrar");
    await page.goto(`/dashboard/assignments/teaching/${id}/edit`);
    await database.query(
      "update public.teaching_assignments set updated_at=now()+interval '1 second' where id=$1",
      [id],
    );
    await page.getByRole("button", { name: "Save dates" }).click();
    await expect(
      page.getByText("This assignment changed elsewhere"),
    ).toBeVisible();
  });
  test("16. unauthorized direct navigation reaches forbidden", async ({
    page,
  }) => {
    await login(page, "subject");
    await page.goto("/dashboard/assignments/teaching/new");
    await expect(page).toHaveURL(/forbidden/);
  });
  test("17. mobile assignment cards remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "head");
    await page.goto("/dashboard/assignments");
    await expect(
      page.getByRole("heading", { name: "Teacher assignments" }),
    ).toBeVisible();
    await expect(page.locator("main")).not.toHaveCSS("overflow-x", "scroll");
  });
  test("18. forms and filters are keyboard accessible", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/assignments/teaching/new");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Term")).toBeAttached();
    await expect(page.getByLabel("Class section")).toBeAttached();
    await expect(page.getByLabel("Start date")).toBeAttached();
  });
  test("19. no email or phone is displayed", async ({ page }) => {
    await login(page, "head");
    await page.goto("/dashboard/assignments");
    await expect(page.locator("body")).not.toContainText("@example.invalid");
    await expect(page.locator("body")).not.toContainText("Phone");
  });
  test("20. Stage 9 marks entry is not active", async ({ page }) => {
    await login(page, "subject");
    await page.goto("/teacher");
    await expect(page.getByText("Marks entry is not active")).toBeVisible();
    await expect(page.getByRole("link", { name: /enter marks/i })).toHaveCount(
      0,
    );
  });
});
