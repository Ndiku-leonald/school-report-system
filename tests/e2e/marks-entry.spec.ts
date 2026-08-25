import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.MARKS_ENTRY_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-stage-nine-browser-password";
const nonce = Date.now();
const ids = Object.fromEntries(
  [
    "school",
    "otherSchool",
    "year",
    "term",
    "grade",
    "class",
    "subject",
    "scheme",
    "coursework",
    "exam",
    "student",
    "guardian",
    "studentGuardian",
    "enrollment",
    "assignment",
    "futureAssignment",
    "endedAssignment",
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
const people = new Map<
  string,
  { email: string; userId: string; membershipId: string }
>();
let markSheetId = "";

async function provision(
  key: string,
  role: Database["public"]["Enums"]["staff_role"],
) {
  const email = `marks.e2e.${key}.${nonce}@example.invalid`;
  const created = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const membershipId = randomUUID();
  await database.query(
    "insert into public.profiles (id,first_name,last_name) values ($1,$2,'Browser')",
    [created.data.user.id, key],
  );
  await database.query(
    "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')",
    [membershipId, ids.school, created.data.user.id, `BROWSER-${key}-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments (membership_id,role,granted_at) values ($1,$2,now()-interval '1 day')",
    [membershipId, role],
  );
  people.set(key, { email, userId: created.data.user.id, membershipId });
}

async function login(
  page: Page,
  key: string,
  selectedSchool = `Marks Browser School ${nonce}`,
) {
  await page.context().clearCookies();
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(people.get(key)!.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
  if (new URL(page.url()).pathname === "/select-school") {
    await page.getByText(selectedSchool, { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL((location) => location.pathname !== "/select-school");
  }
}

async function openEditor(page: Page) {
  await login(page, "teacher");
  await page.goto(`/teacher/marks/${markSheetId}`);
  await page.waitForLoadState("networkidle");
}

test.describe.serial("marks entry", () => {
  test.skip(!enabled, "requires the local marks-entry E2E runner");
  test.beforeAll(async () => {
    await database.connect();
    await database.query(
      "insert into public.schools (id,name,slug,school_code) values ($1,$2,$3,$4),($5,$6,$7,$8)",
      [
        ids.school,
        `Marks Browser School ${nonce}`,
        `marks-browser-${nonce}`,
        `MB-${nonce}`,
        ids.otherSchool,
        `Other Marks School ${nonce}`,
        `other-marks-browser-${nonce}`,
        `OMB-${nonce}`,
      ],
    );
    for (const [key, role] of [
      ["teacher", "SUBJECT_TEACHER"],
      ["other", "SUBJECT_TEACHER"],
      ["future", "SUBJECT_TEACHER"],
      ["ended", "SUBJECT_TEACHER"],
      ["viewer", "HEAD_TEACHER"],
    ] as const)
      await provision(key, role);
    const teacher = people.get("teacher")!;
    const otherMembershipId = randomUUID();
    await database.query(
      "insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')",
      [
        otherMembershipId,
        ids.otherSchool,
        teacher.userId,
        `BROWSER-teacher-other-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.staff_role_assignments (membership_id,role,granted_at) values ($1,'SUBJECT_TEACHER',now()-interval '1 day')",
      [otherMembershipId],
    );
    await database.query(
      "insert into public.academic_years (id,school_id,name,starts_on,ends_on,status) values ($1,$2,'Browser current window',current_date-180,current_date+180,'ACTIVE')",
      [ids.year, ids.school],
    );
    await database.query(
      "insert into public.terms (id,academic_year_id,name,term_number,starts_on,ends_on,status) values ($1,$2,'Browser current window',1,current_date-180,current_date+180,'MARKS_ENTRY')",
      [ids.term, ids.year],
    );
    await database.query(
      "insert into public.grade_levels (id,school_id,code,name,sort_order) values ($1,$2,'P1','Primary One',1)",
      [ids.grade, ids.school],
    );
    await database.query(
      "insert into public.class_sections (id,academic_year_id,grade_level_id,name,class_code) values ($1,$2,$3,'P1 North','P1-N')",
      [ids.class, ids.year, ids.grade],
    );
    await database.query(
      "insert into public.subjects (id,school_id,code,name,sort_order) values ($1,$2,'ENG','English',1)",
      [ids.subject, ids.school],
    );
    await database.query(
      "insert into public.grade_level_subjects (grade_level_id,subject_id,sort_order) values ($1,$2,1)",
      [ids.grade, ids.subject],
    );
    await database.query(
      "insert into public.assessment_schemes (id,term_id,grade_level_id,subject_id,name,version,status,effective_from) values ($1,$2,$3,$4,'Browser scheme',1,'DRAFT',current_date-180)",
      [ids.scheme, ids.term, ids.grade, ids.subject],
    );
    await database.query(
      "insert into public.assessment_components (id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values ($1,$2,'Coursework','CW',50,50,1),($3,$2,'Exam','EX',100,50,2)",
      [ids.coursework, ids.scheme, ids.exam],
    );
    await database.query(
      "update public.assessment_schemes set status='ACTIVE' where id=$1",
      [ids.scheme],
    );
    await database.query(
      "insert into public.students (id,school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,$3,'Ada','Browser Learner',current_date-180)",
      [ids.student, ids.school, `E2E-${nonce}`],
    );
    await database.query(
      "insert into public.guardians (id,school_id,first_name,last_name,phone,email) values ($1,$2,'Private','Guardian',$3,$4)",
      [
        ids.guardian,
        ids.school,
        `+256700${String(nonce).slice(-6)}`,
        `private.guardian.${nonce}@example.invalid`,
      ],
    );
    await database.query(
      "insert into public.student_guardians (id,student_id,guardian_id,relationship,is_primary) values ($1,$2,$3,'Parent',true)",
      [ids.studentGuardian, ids.student, ids.guardian],
    );
    await database.query(
      "insert into public.enrollments (id,student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,$4,'7','ACTIVE',current_date-180)",
      [ids.enrollment, ids.student, ids.year, ids.class],
    );
    await database.query(
      "insert into public.teaching_assignments (id,term_id,class_section_id,subject_id,staff_membership_id,starts_on,ends_on,is_active) values ($1,$2,$3,$4,$5,current_date-30,null,true),($6,$2,$3,$4,$7,current_date+30,null,true),($8,$2,$3,$4,$9,current_date-60,current_date-1,false)",
      [
        ids.assignment,
        ids.term,
        ids.class,
        ids.subject,
        people.get("teacher")!.membershipId,
        ids.futureAssignment,
        people.get("future")!.membershipId,
        ids.endedAssignment,
        people.get("ended")!.membershipId,
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
    const sheet = await client.rpc("get_or_create_draft_mark_sheet", {
      target_teaching_assignment_id: ids.assignment,
    });
    if (sheet.error) throw sheet.error;
    markSheetId = sheet.data![0].mark_sheet_id;
  });
  test.afterAll(async () => database.end());

  test("1. subject teacher opens the marks workspace", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/teacher/marks");
    await expect(
      page.getByRole("heading", { name: "Marks entry" }),
    ).toBeVisible();
  });
  test("2. only the selected membership assignment appears", async ({
    page,
  }) => {
    await login(page, "teacher");
    await page.goto("/teacher/marks");
    await expect(page.getByText("English", { exact: true })).toBeVisible();
    await expect(page.getByText("P1 North", { exact: false })).toBeVisible();
  });
  test("3. teacher opens the DRAFT mark sheet", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/teacher/marks");
    await page.getByRole("link", { name: "Enter marks" }).click();
    await expect(page).toHaveURL(new RegExp(`/teacher/marks/${markSheetId}$`));
  });
  test("4. component names and maxima display", async ({ page }) => {
    await openEditor(page);
    await expect(page.getByText("Coursework", { exact: true })).toBeVisible();
    await expect(page.getByText(/CW · max 50/)).toBeVisible();
  });
  test("5. eligible learner roster displays", async ({ page }) => {
    await openEditor(page);
    await expect(
      page.getByText("Ada Browser Learner", { exact: true }),
    ).toBeVisible();
  });
  test("6. a valid score saves", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Ada Browser Learner Coursework score").fill("40");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  });
  test("7. a decimal score saves", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Ada Browser Learner Coursework score").fill("40.5");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/1 cell saved/)).toBeVisible();
  });
  test("8. zero remains visibly zero", async ({ page }) => {
    await openEditor(page);
    const score = page.getByLabel("Ada Browser Learner Coursework score");
    await score.fill("0");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(score).toHaveValue("0");
  });
  test("9. above-maximum score shows an accessible error", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Ada Browser Learner Coursework score").fill("51");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByText("Draft not saved", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/exceeds.*maximum/i)).toBeVisible();
  });
  test("10. ABSENT clears the score", async ({ page }) => {
    await openEditor(page);
    const score = page.getByLabel("Ada Browser Learner Coursework score");
    await score.fill("12");
    await page
      .getByLabel("Ada Browser Learner Coursework attendance")
      .selectOption("ABSENT");
    await expect(score).toHaveValue("");
  });
  test("11. PRESENT requires a score", async ({ page }) => {
    await openEditor(page);
    await page
      .getByLabel("Ada Browser Learner Coursework attendance")
      .selectOption("PRESENT");
    await page.getByLabel("Ada Browser Learner Coursework score").fill("");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByText(/Present learners require a score/),
    ).toBeVisible();
  });
  test("12. teacher remark saves", async ({ page }) => {
    await openEditor(page);
    await page
      .getByLabel("Ada Browser Learner Coursework teacher remark")
      .fill("Improving steadily");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/1 cell saved/)).toBeVisible();
  });
  test("13. multiple dirty cells save together", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Ada Browser Learner Coursework score").fill("44");
    await page.getByLabel("Ada Browser Learner Exam score").fill("88");
    await expect(page.getByText("2 unsaved cells")).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/2 cells saved/)).toBeVisible();
  });
  test("14. reload preserves confirmed marks", async ({ page }) => {
    await openEditor(page);
    await expect(page.getByLabel("Ada Browser Learner Exam score")).toHaveValue(
      "88",
    );
    await page.reload();
    await expect(page.getByLabel("Ada Browser Learner Exam score")).toHaveValue(
      "88",
    );
  });
  test("15. another session produces conflict feedback", async ({ page }) => {
    await openEditor(page);
    const current = await database.query(
      "select row_version from public.marks where mark_sheet_id=$1 and assessment_component_id=$2 and enrollment_id=$3",
      [markSheetId, ids.coursework, ids.enrollment],
    );
    const second = createClient<Database>(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    await second.auth.signInWithPassword({
      email: people.get("teacher")!.email,
      password,
    });
    await second.rpc("set_my_active_membership", {
      target_membership_id: people.get("teacher")!.membershipId,
    });
    await second.rpc("save_mark_entry", {
      target_mark_sheet_id: markSheetId,
      target_assessment_component_id: ids.coursework,
      target_enrollment_id: ids.enrollment,
      expected_row_version: current.rows[0].row_version,
      entered_score: 45,
      entered_attendance_status: "PRESENT",
      entered_teacher_remark: null as unknown as string,
    });
    await page.getByLabel("Ada Browser Learner Coursework score").fill("46");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/Another session changed/)).toBeVisible();
    await expect(
      page.getByLabel("Ada Browser Learner Coursework score"),
    ).toHaveValue("46");
  });
  test("16. another teacher cannot inspect the sheet", async ({ page }) => {
    await login(page, "other");
    await page.goto(`/teacher/marks/${markSheetId}`);
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
  test("17. selected-school workspace never shows unrelated school data", async ({
    page,
  }) => {
    await login(page, "teacher", `Other Marks School ${nonce}`);
    await page.goto("/teacher/marks");
    await expect(
      page.getByText("No current subject assignments"),
    ).toBeVisible();
    await expect(page.getByText("English", { exact: true })).toHaveCount(0);
    await page.goto(`/teacher/marks/${markSheetId}`);
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
  test("18. future assignment has no editable sheet", async ({ page }) => {
    await login(page, "future");
    await page.goto("/teacher/marks");
    await expect(
      page.getByText("No current subject assignments"),
    ).toBeVisible();
  });
  test("19. ended assignment loses entry access", async ({ page }) => {
    await login(page, "ended");
    await page.goto("/teacher/marks");
    await expect(
      page.getByText("No current subject assignments"),
    ).toBeVisible();
  });
  test("20. schoolwide viewer sees read-only overview", async ({ page }) => {
    await login(page, "viewer");
    await page.goto("/dashboard/marks");
    await expect(
      page.getByRole("heading", { name: "Marks overview" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Review queue" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(
      0,
    );
  });
  test("21. mobile grid remains horizontally usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page);
    await expect(
      page.getByRole("region", { name: "Marks entry grid" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Ada Browser Learner Coursework score"),
    ).toBeVisible();
  });
  test("22. keyboard-only score entry works", async ({ page }) => {
    await openEditor(page);
    const score = page.getByLabel("Ada Browser Learner Coursework score");
    await score.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await expect(score).toHaveValue("");
    await page.keyboard.type("47");
    await expect(score).toHaveValue("47");
  });
  test("23. cell focus order is score then attendance", async ({ page }) => {
    await openEditor(page);
    await page.getByLabel("Ada Browser Learner Coursework score").focus();
    await page.keyboard.press("Tab");
    await expect(
      page.getByLabel("Ada Browser Learner Coursework attendance"),
    ).toBeFocused();
  });
  test("24. guardian contacts are never rendered", async ({ page }) => {
    await openEditor(page);
    await expect(page.locator("body")).not.toContainText(
      `+256700${String(nonce).slice(-6)}`,
    );
    await expect(page.locator("body")).not.toContainText(
      `private.guardian.${nonce}@example.invalid`,
    );
  });
  test("25. complete draft exposes submission but no reviewer controls", async ({
    page,
  }) => {
    await openEditor(page);
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /start review|approve|lock sheet/i }),
    ).toHaveCount(0);
  });
});
