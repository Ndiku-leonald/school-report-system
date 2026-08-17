import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.MARKS_WORKFLOW_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-stage-ten-browser-password";
const nonce = Date.now();
const ids = Object.fromEntries(
  [
    "school",
    "year",
    "term",
    "grade",
    "class",
    "subject",
    "scheme",
    "component",
    "student",
    "guardian",
    "enrollment",
    "assignment",
  ].map((key) => [key, randomUUID()]),
) as Record<string, string>;
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
const people = new Map<string, { email: string; membershipId: string }>();
let sheetId = "";
let correctionId = "";

async function provision(
  key: string,
  role: Database["public"]["Enums"]["staff_role"],
) {
  const email = `workflow.e2e.${key}.${nonce}@example.invalid`;
  const created = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Browser')",
    [created.data.user.id, key],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [membershipId, ids.school, created.data.user.id, `WF-E2E-${key}-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,$2,now()-interval '1 day')",
    [membershipId, role],
  );
  people.set(key, { email, membershipId });
}

async function login(page: Page, key: string) {
  await page.context().clearCookies();
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(people.get(key)!.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
  if (new URL(page.url()).pathname === "/select-school") {
    await page
      .getByText(`Workflow Browser School ${nonce}`, { exact: true })
      .click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((location) => location.pathname !== "/select-school");
  }
}

async function confirmClick(page: Page, name: string) {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name }).click();
}

async function openTeacherSheet(page: Page, id: string) {
  await page.goto("/teacher/marks");
  await page.locator(`a[href="/teacher/marks/${id}"]`).click();
}

async function openReviewSheet(page: Page, id: string) {
  await page.goto("/dashboard/marks/review");
  await page.locator(`a[href="/dashboard/marks/review/${id}"]`).click();
}

test.describe.serial("marks workflow", () => {
  test.skip(!enabled, "requires the local marks-workflow E2E runner");
  test.beforeAll(async () => {
    await database.connect();
    await database.query(
      "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
      [
        ids.school,
        `Workflow Browser School ${nonce}`,
        `workflow-browser-${nonce}`,
        `WFB-${nonce}`,
      ],
    );
    await provision("teacher", "SUBJECT_TEACHER");
    await provision("reviewer", "HEAD_TEACHER");
    await provision("unauthorized", "SUBJECT_TEACHER");
    await database.query(
      "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Workflow browser year',current_date-90,current_date+90,'ACTIVE')",
      [ids.year, ids.school],
    );
    await database.query(
      "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Workflow browser term',1,current_date-30,current_date+30,'MARKS_ENTRY')",
      [ids.term, ids.year],
    );
    await database.query(
      "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'WB1','Workflow Browser One',1)",
      [ids.grade, ids.school],
    );
    await database.query(
      "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Workflow Browser Class','WFB-C')",
      [ids.class, ids.year, ids.grade],
    );
    await database.query(
      "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'WBS','Workflow Browser Subject',1)",
      [ids.subject, ids.school],
    );
    await database.query(
      "insert into public.grade_level_subjects(grade_level_id,subject_id,sort_order) values($1,$2,1)",
      [ids.grade, ids.subject],
    );
    await database.query(
      "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,version,status,effective_from) values($1,$2,$3,$4,'Workflow Browser Scheme',1,'DRAFT',current_date-30)",
      [ids.scheme, ids.term, ids.grade, ids.subject],
    );
    await database.query(
      "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Assessment','ASS',100,100,1)",
      [ids.component, ids.scheme],
    );
    await database.query(
      "update public.assessment_schemes set status='ACTIVE' where id=$1",
      [ids.scheme],
    );
    await database.query(
      "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,$3,'Workflow','Browser Learner',current_date-90)",
      [ids.student, ids.school, `WF-E2E-${nonce}`],
    );
    await database.query(
      "insert into public.guardians(id,school_id,first_name,last_name,phone,email) values($1,$2,'Private','Guardian',$3,$4)",
      [
        ids.guardian,
        ids.school,
        `+256700${String(nonce).slice(-6)}`,
        `private.workflow.${nonce}@example.invalid`,
      ],
    );
    await database.query(
      "insert into public.student_guardians(student_id,guardian_id,relationship,is_primary) values($1,$2,'Parent',true)",
      [ids.student, ids.guardian],
    );
    await database.query(
      "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values($1,$2,$3,$4,'1','ACTIVE',current_date-30)",
      [ids.enrollment, ids.student, ids.year, ids.class],
    );
    await database.query(
      "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,current_date-30)",
      [
        ids.assignment,
        ids.term,
        ids.class,
        ids.subject,
        people.get("teacher")!.membershipId,
      ],
    );
    const client = createClient<Database>(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    await client.auth.signInWithPassword({
      email: people.get("teacher")!.email,
      password,
    });
    await client.rpc("set_my_active_membership", {
      target_membership_id: people.get("teacher")!.membershipId,
    });
    const opened = await client.rpc("get_or_create_draft_mark_sheet", {
      target_teaching_assignment_id: ids.assignment,
    });
    if (opened.error) throw opened.error;
    sheetId = opened.data![0].mark_sheet_id;
  });
  test.afterAll(async () => database.end());

  test("1. teacher sees authoritative incomplete state and no submit control", async ({
    page,
  }) => {
    await login(page, "teacher");
    await page.goto("/teacher/marks");
    await expect(
      page.getByText("Workflow Browser Subject", { exact: true }),
    ).toBeVisible();
    await page.locator(`a[href="/teacher/marks/${sheetId}"]`).click();
    await expect(page.getByText("0 / 1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toHaveCount(0);
    await expect(page.getByText(/private\.workflow|\+256700/i)).toHaveCount(0);
  });

  test("2. complete draft submits and immediately becomes read-only", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await page
      .getByLabel("Workflow Browser Learner Assessment score")
      .fill("76");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.reload();
    await confirmClick(page, "Submit for review");
    await expect(
      page.getByText("Mark sheet submitted for review."),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("SUBMITTED", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByLabel("Workflow Browser Learner Assessment score"),
    ).toBeDisabled();
  });

  test("3. unauthorized reviewer route is forbidden", async ({ page }) => {
    await login(page, "unauthorized");
    await page.goto("/dashboard/marks/review");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("4. reviewer sees queue, starts review, and returns with a reason", async ({
    page,
  }) => {
    await login(page, "reviewer");
    await page.goto("/dashboard/marks/review");
    await expect(
      page.getByText("Workflow Browser Subject", { exact: false }),
    ).toBeVisible();
    await page
      .getByText("Workflow Browser Subject", { exact: false })
      .first()
      .click();
    await confirmClick(page, "Start review");
    await page.reload();
    await page.getByLabel("Return reason").fill("Check the source register");
    await page.getByRole("button", { name: "Return for correction" }).click();
    await expect(
      page.getByText("Mark sheet returned for correction."),
    ).toBeVisible();
  });

  test("5. teacher sees return reason, edits, and resubmits", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByText("Check the source register", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Workflow Browser Learner Assessment score"),
    ).toBeEnabled();
    await page
      .getByLabel("Workflow Browser Learner Assessment score")
      .fill("78");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await confirmClick(page, "Resubmit");
    await expect(
      page.getByText("Corrected mark sheet resubmitted."),
    ).toBeVisible();
  });

  test("6. reviewer approves, advances review, and locks sheet and term", async ({
    page,
  }) => {
    await login(page, "reviewer");
    await openReviewSheet(page, sheetId);
    await confirmClick(page, "Start review");
    await page.reload();
    await confirmClick(page, "Approve");
    await page.goto("/dashboard/marks/terms");
    await page.getByRole("button", { name: "Advance to review" }).click();
    await expect(
      page.getByText("Term advanced to marks review."),
    ).toBeVisible();
    await openReviewSheet(page, sheetId);
    await confirmClick(page, "Lock sheet");
    await page.goto("/dashboard/marks/terms");
    await page.getByRole("button", { name: "Lock term" }).click();
    await expect(page.getByText("Term marks locked.")).toBeVisible();
  });

  test("7. exceptional correction creates a new revision without unlocking history", async ({
    page,
  }) => {
    await login(page, "reviewer");
    await page.goto("/dashboard/marks/terms");
    await page
      .getByLabel("Controlled correction reason")
      .fill("Approved correction request");
    await page.getByRole("button", { name: "Reopen for correction" }).click();
    await expect(
      page.getByText("Term reopened for controlled correction."),
    ).toBeVisible();
    await openReviewSheet(page, sheetId);
    await page
      .getByLabel("Correction reason")
      .fill("Correct source transcription");
    await page
      .getByRole("button", { name: "Create correction revision" })
      .click();
    await page.waitForURL(
      (location) =>
        /\/dashboard\/marks\/review\/[0-9a-f-]+$/.test(location.pathname) &&
        !location.pathname.endsWith(sheetId),
    );
    correctionId = page.url().split("/").at(-1)!;
    expect(correctionId).not.toBe(sheetId);
    await expect(page.getByText(/Revision 2/)).toBeVisible();
    const source = await database.query(
      "select workflow_status,version from public.mark_sheets where id=$1",
      [sheetId],
    );
    expect(source.rows[0]).toMatchObject({
      workflow_status: "LOCKED",
      version: 1,
    });
  });

  test("8. correction remains bound-teacher editable and Stage 11 outputs are absent", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, correctionId);
    await expect(
      page.getByLabel("Workflow Browser Learner Assessment score"),
    ).toBeEnabled();
    await expect(page.getByText(/grade|average|position|ranking/i)).toHaveCount(
      0,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("region", { name: "Marks entry grid" }),
    ).toBeVisible();
  });
});
