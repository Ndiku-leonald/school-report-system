import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.STUDENT_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-student-browser-password";
const nonce = Date.now();
const schoolId = randomUUID();
const otherSchoolId = randomUUID();
const yearId = randomUUID();
const laterYearId = randomUUID();
const otherYearId = randomUUID();
const gradeId = randomUUID();
const otherGradeId = randomUUID();
const classId = randomUUID();
const secondClassId = randomUUID();
const fullClassId = randomUUID();
const laterClassId = randomUUID();
const otherClassId = randomUUID();
const termId = randomUUID();
const subjectId = randomUUID();
const admissionNumber = `E2E-STU-${nonce}`;
const schoolName = `Synthetic Student Browser School ${nonce}`;
const otherSchoolName = `Synthetic Other Student Browser School ${nonce}`;
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
const identities = new Map<
  string,
  { email: string; membershipId: string; userId: string }
>();
let studentId = "";
let assignedStudentId = "";
let unassignedStudentId = "";

async function provision(
  key: string,
  role: Database["public"]["Enums"]["staff_role"],
  targetSchoolId = schoolId,
) {
  const email = `student.e2e.${key}.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const membershipId = randomUUID();
  await database.query(
    `insert into public.profiles (id,first_name,last_name) values ($1,'Synthetic','Student E2E')`,
    [auth.data.user.id],
  );
  await database.query(
    `insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')`,
    [
      membershipId,
      targetSchoolId,
      auth.data.user.id,
      `STU-E2E-${key}-${nonce}`,
    ],
  );
  await database.query(
    `insert into public.staff_role_assignments (membership_id,role) values ($1,$2)`,
    [membershipId, role],
  );
  identities.set(key, { email, membershipId, userId: auth.data.user.id });
}

async function login(page: Page, key: string) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(identities.get(key)!.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((location) => location.pathname !== "/staff-login");
}

async function chooseSchool(page: Page, name: string) {
  await page.getByText(name, { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((location) => location.pathname !== "/select-school");
}

test.describe.serial("student management", () => {
  test.skip(!enabled, "requires the local student E2E runner");

  test.beforeAll(async () => {
    await database.connect();
    await database.query(
      `insert into public.schools (id,name,slug,school_code) values ($1,$2,$3,$4),($5,$6,$7,$8)`,
      [
        schoolId,
        schoolName,
        `student-e2e-${nonce}`,
        `SE2E-${nonce}`,
        otherSchoolId,
        otherSchoolName,
        `student-other-e2e-${nonce}`,
        `SOE2E-${nonce}`,
      ],
    );
    await database.query(
      `insert into public.academic_years (id,school_id,name,starts_on,ends_on,status) values ($1,$2,'2026 Browser','2026-01-01','2026-12-31','ACTIVE'),($3,$2,'2027 Browser','2027-01-01','2027-12-31','DRAFT'),($4,$5,'2026 Other Browser','2026-01-01','2026-12-31','ACTIVE')`,
      [yearId, schoolId, laterYearId, otherYearId, otherSchoolId],
    );
    await database.query(
      `insert into public.grade_levels (id,school_id,code,name,sort_order) values ($1,$2,'P1','Primary One',1),($3,$4,'P1','Other Primary One',1)`,
      [gradeId, schoolId, otherGradeId, otherSchoolId],
    );
    await database.query(
      `insert into public.class_sections (id,academic_year_id,grade_level_id,name,class_code,capacity) values ($1,$2,$3,'P1 North','P1-N',20),($4,$2,$3,'P1 South','P1-S',20),($5,$2,$3,'P1 Full','P1-F',1),($6,$7,$3,'P1 2027','P1-27',20),($8,$9,$10,'Other P1','O-P1',20)`,
      [
        classId,
        yearId,
        gradeId,
        secondClassId,
        fullClassId,
        laterClassId,
        laterYearId,
        otherClassId,
        otherYearId,
        otherGradeId,
      ],
    );
    await database.query(
      `insert into public.terms (id,academic_year_id,name,term_number,starts_on,ends_on,status) values ($1,$2,'Browser Year',1,'2026-01-01','2026-12-31','OPEN')`,
      [termId, yearId],
    );
    await database.query(
      `insert into public.subjects (id,school_id,code,name,sort_order) values ($1,$2,'ENG','English',1)`,
      [subjectId, schoolId],
    );
    for (const [key, role] of [
      ["admin", "SCHOOL_ADMIN"],
      ["registrar", "ACADEMIC_REGISTRAR"],
      ["head", "HEAD_TEACHER"],
      ["class", "CLASS_TEACHER"],
      ["subject", "SUBJECT_TEACHER"],
    ] as const)
      await provision(key, role);
    await provision("multi", "HEAD_TEACHER");
    const multi = identities.get("multi")!;
    const otherMembershipId = randomUUID();
    await database.query(
      `insert into public.school_staff_memberships (id,school_id,profile_id,employee_number,status) values ($1,$2,$3,$4,'ACTIVE')`,
      [
        otherMembershipId,
        otherSchoolId,
        multi.userId,
        `STU-E2E-MULTI-O-${nonce}`,
      ],
    );
    await database.query(
      `insert into public.staff_role_assignments (membership_id,role) values ($1,'ACADEMIC_REGISTRAR')`,
      [otherMembershipId],
    );
    await database.query(
      `insert into public.class_teacher_assignments (term_id,class_section_id,staff_membership_id,starts_on,is_active) values ($1,$2,$3,'2026-01-01',true)`,
      [termId, classId, identities.get("class")!.membershipId],
    );
    await database.query(
      `insert into public.teaching_assignments (term_id,class_section_id,subject_id,staff_membership_id,starts_on,is_active) values ($1,$2,$3,$4,'2026-01-01',true)`,
      [termId, classId, subjectId, identities.get("subject")!.membershipId],
    );
    const assigned = await database.query<{ id: string }>(
      `insert into public.students (school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,'Assigned','Browser Learner','2026-02-01') returning id`,
      [schoolId, `ASSIGNED-E2E-${nonce}`],
    );
    assignedStudentId = assigned.rows[0]!.id;
    await database.query(
      `insert into public.enrollments (student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,'11','ACTIVE','2026-02-01')`,
      [assignedStudentId, yearId, classId],
    );
    const unassigned = await database.query<{ id: string }>(
      `insert into public.students (school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,'Unassigned','Browser Learner','2026-02-01') returning id`,
      [schoolId, `UNASSIGNED-E2E-${nonce}`],
    );
    unassignedStudentId = unassigned.rows[0]!.id;
    await database.query(
      `insert into public.enrollments (student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,'12','ACTIVE','2026-02-01')`,
      [unassignedStudentId, yearId, secondClassId],
    );
    const full = await database.query<{ id: string }>(
      `insert into public.students (school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,'Full','Browser Learner','2026-02-01') returning id`,
      [schoolId, `FULL-E2E-${nonce}`],
    );
    await database.query(
      `insert into public.enrollments (student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,'1','ACTIVE','2026-02-01')`,
      [full.rows[0]!.id, yearId, fullClassId],
    );
    const other = await database.query<{ id: string }>(
      `insert into public.students (school_id,admission_number,first_name,last_name,admission_date) values ($1,$2,'Other','School Learner','2026-02-01') returning id`,
      [otherSchoolId, `OTHER-E2E-${nonce}`],
    );
    await database.query(
      `insert into public.enrollments (student_id,academic_year_id,class_section_id,class_number,status,enrolled_on) values ($1,$2,$3,'1','ACTIVE','2026-02-01')`,
      [other.rows[0]!.id, otherYearId, otherClassId],
    );
  });

  test.afterAll(async () => {
    await database.end();
  });

  test("1. registrar opens the student directory", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/students");
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Admit student" }),
    ).toBeVisible();
  });

  test("2. registrar admits a student", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/students/new");
    await page.getByLabel("Admission number").fill(admissionNumber);
    await page.getByLabel("First name", { exact: true }).first().fill("Ada");
    await page
      .getByLabel("Last name", { exact: true })
      .first()
      .fill("Lovelace");
    await page.getByLabel("Date of birth").fill("2018-01-01");
    await page.getByLabel("Academic year").selectOption(yearId);
    await page.getByLabel("Class", { exact: true }).selectOption(classId);
    await page.getByLabel("Class number").fill("22");
    await page.getByRole("button", { name: "Admit student" }).click();
    await page.waitForURL(/\/dashboard\/students\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { name: /Ada.*Lovelace/ }),
    ).toBeVisible();
    studentId = page.url().split("/").at(-1)!;
  });

  test("3. initial class enrolment succeeds", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    await expect(
      page.getByText("Primary One · P1 North").first(),
    ).toBeVisible();
    await expect(
      page.getByText(/Class number 22|No\. 22/).first(),
    ).toBeVisible();
  });

  test("4. duplicate admission number is rejected", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/students/new");
    await page
      .getByLabel("Admission number")
      .fill(` ${admissionNumber.toLowerCase()} `);
    await page
      .getByLabel("First name", { exact: true })
      .first()
      .fill("Duplicate");
    await page.getByLabel("Last name", { exact: true }).first().fill("Learner");
    await page.getByRole("button", { name: "Admit student" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Not saved" }),
    ).toContainText("admission number is already in use");
  });

  test("5. registrar edits the student profile", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}/edit`);
    await page.getByLabel("First name").fill("Augusta Ada");
    await page.getByRole("button", { name: "Save profile" }).click();
    await page.waitForURL(`/dashboard/students/${studentId}`);
    await expect(
      page.getByRole("heading", { name: /Augusta Ada.*Lovelace/ }),
    ).toBeVisible();
  });

  test("6. registrar adds a primary guardian", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    const add = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Add a guardian" }) });
    await add.getByLabel("First name").fill("Mary");
    await add.getByLabel("Last name").fill("Jackson");
    await add.getByLabel("Phone (E.164)").fill("+14155550111");
    await add.getByLabel("Primary guardian").check();
    await add.getByRole("button", { name: "Add guardian" }).click();
    await expect(page.getByText("Mary Jackson")).toBeVisible();
    await expect(page.getByText("Primary", { exact: true })).toBeVisible();
  });

  test("7. registrar adds a second guardian", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    const add = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "Add a guardian" }) });
    await add.getByLabel("First name").fill("Dorothy");
    await add.getByLabel("Last name").fill("Vaughan");
    await add.getByRole("button", { name: "Add guardian" }).click();
    await expect(page.getByText("Dorothy Vaughan")).toBeVisible();
  });

  test("8. changing the primary guardian is atomic", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    const second = page
      .getByText("Dorothy Vaughan", { exact: true })
      .locator("../..");
    await second.getByLabel("Primary guardian").check();
    await second.getByRole("button", { name: "Save relationship" }).click();
    await expect(second.getByText("Primary")).toBeVisible();
    const count = await database.query<{ count: string }>(
      `select count(*) from public.student_guardians where student_id=$1 and is_primary`,
      [studentId],
    );
    expect(count.rows[0]!.count).toBe("1");
  });

  test("9. registrar views enrolment history", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    await expect(
      page.getByRole("heading", { name: "Enrolment history" }),
    ).toBeVisible();
    await expect(
      page.getByText(/2026 Browser.*Primary One.*P1 North/),
    ).toBeVisible();
  });

  test("10. registrar creates a later-year enrolment", async ({ page }) => {
    await database.query(
      `update public.enrollments set status='COMPLETED',exited_on='2026-12-31' where student_id=$1 and status in ('ACTIVE','REPEATING')`,
      [studentId],
    );
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}/enrollment`);
    await page.getByLabel("Academic year").selectOption(laterYearId);
    await page.getByLabel("Class", { exact: true }).selectOption(laterClassId);
    await page.getByLabel("Enrolled on").fill("2027-01-05");
    await page.getByRole("button", { name: "Create enrolment" }).click();
    await expect(page.getByRole("status")).toContainText("Enrolment created");
  });

  test("11. capacity warning is visible", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/students/new");
    await page.getByLabel("Academic year").selectOption(yearId);
    await page.getByLabel("Class", { exact: true }).selectOption(fullClassId);
    await expect(page.getByRole("status")).toContainText("at capacity");
  });

  test("12. registrar cannot bypass capacity", async ({ page }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/students/new");
    await page.getByLabel("Admission number").fill(`CAP-DENY-${nonce}`);
    await page
      .getByLabel("First name", { exact: true })
      .first()
      .fill("Capacity");
    await page.getByLabel("Last name", { exact: true }).first().fill("Denied");
    await page.getByLabel("Academic year").selectOption(yearId);
    await page.getByLabel("Class", { exact: true }).selectOption(fullClassId);
    await expect(page.getByLabel("Approve capacity override")).toHaveCount(0);
    await page.getByRole("button", { name: "Admit student" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Not saved" }),
    ).toContainText("at capacity");
  });

  test("13. administrator capacity override requires a reason", async ({
    page,
  }) => {
    await login(page, "admin");
    await page.goto("/dashboard/students/new");
    await page.getByLabel("Admission number").fill(`CAP-ADMIN-${nonce}`);
    await page.getByLabel("First name", { exact: true }).first().fill("Admin");
    await page
      .getByLabel("Last name", { exact: true })
      .first()
      .fill("Override");
    await page.getByLabel("Academic year").selectOption(yearId);
    await page.getByLabel("Class", { exact: true }).selectOption(fullClassId);
    await page.getByLabel("Approve capacity override").check();
    await page.getByRole("button", { name: "Admit student" }).click();
    await expect(
      page.getByText("Explain why capacity must be overridden"),
    ).toBeVisible();
    await page
      .getByLabel("Override reason")
      .fill("Synthetic reviewed overflow");
    await page.getByRole("button", { name: "Admit student" }).click();
    await page.waitForURL(/\/dashboard\/students\/[0-9a-f-]+$/);
  });

  test("14. head teacher sees schoolwide read-only information", async ({
    page,
  }) => {
    await login(page, "head");
    await page.goto(`/dashboard/students/${studentId}`);
    await expect(page.getByText("View-only access")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit profile" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Mary Jackson")).toBeVisible();
  });

  test("15. class teacher sees assigned students only", async ({ page }) => {
    await login(page, "class");
    await page.goto("/dashboard/students");
    await expect(
      page.getByRole("link", { name: /Browser Learner, Assigned/ }),
    ).toBeVisible();
    await expect(page.getByText("Unassigned Browser Learner")).toHaveCount(0);
  });

  test("16. subject teacher sees assigned students only", async ({ page }) => {
    await login(page, "subject");
    await page.goto("/dashboard/students");
    await expect(
      page.getByRole("link", { name: /Browser Learner, Assigned/ }),
    ).toBeVisible();
    await expect(page.getByText("Unassigned Browser Learner")).toHaveCount(0);
  });

  test("17. assigned teachers do not see guardian contacts", async ({
    page,
  }) => {
    await login(page, "class");
    await page.goto(`/dashboard/students/${assignedStudentId}`);
    await expect(page.getByText("Guardian details protected")).toBeVisible();
    await expect(page.getByText(/\+14155550111/)).toHaveCount(0);
  });

  test("18. direct navigation to an unassigned student fails generically", async ({
    page,
  }) => {
    await login(page, "class");
    await page.goto(`/dashboard/students/${unassignedStudentId}`);
    await expect(page).toHaveURL(/\/not-found|\/dashboard\/students\//);
    await expect(page.getByText("Unassigned Browser Learner")).toHaveCount(0);
  });

  test("19. multi-school results follow the selected membership", async ({
    page,
  }) => {
    await login(page, "multi");
    await expect(page).toHaveURL(/\/select-school/);
    await chooseSchool(page, schoolName);
    await page.goto("/dashboard/students");
    await expect(
      page.getByRole("link", { name: /Browser Learner, Assigned/ }),
    ).toBeVisible();
    await expect(page.getByText("Other School Learner")).toHaveCount(0);
    await page.goto("/select-school");
    await chooseSchool(page, otherSchoolName);
    await page.goto("/dashboard/students");
    await expect(
      page.getByRole("link", { name: /School Learner, Other/ }),
    ).toBeVisible();
    await expect(page.getByText("Assigned Browser Learner")).toHaveCount(0);
  });

  test("20. student status changes require a reason", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${assignedStudentId}`);
    await page.getByLabel("New status").selectOption("INACTIVE");
    await page.getByRole("button", { name: "Confirm status change" }).click();
    await expect(page.getByLabel("Reason")).toHaveAttribute("required", "");
    await page.getByLabel("Reason").fill("Synthetic temporary pause");
    await page.getByRole("button", { name: "Confirm status change" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Student status updated",
    );
  });

  test("21. stale profile edits display a conflict", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}/edit`);
    await database.query(
      `update public.students set gender='Updated elsewhere' where id=$1`,
      [studentId],
    );
    await page.getByLabel("Gender").fill("Stale edit");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Refresh required")).toBeVisible();
  });

  test("22. photo upload rejects an invalid type", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    await page.getByLabel("Private student photo").setInputFiles({
      name: "not-image.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("synthetic"),
    });
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Not saved" }),
    ).toContainText("JPEG, PNG, or WebP");
  });

  test("23. photo upload rejects oversized files", async ({ page }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    await page.getByLabel("Private student photo").setInputFiles({
      name: "large.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0xff),
    });
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Not saved" }),
    ).toContainText("no larger than 5 MB");
  });

  test("24. mobile student list and forms remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "registrar");
    await page.goto("/dashboard/students");
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible();
    await page.getByRole("link", { name: "Admit student" }).click();
    await expect(page.getByLabel("Admission number")).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  });

  test("25. keyboard navigation and labels are accessible", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/students/new");
    const admission = page.getByLabel("Admission number");
    await admission.focus();
    await expect(admission).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Gender")).toBeFocused();
    for (const label of [
      "Admission number",
      "First name",
      "Last name",
      "Admission date",
      "Academic year",
      "Class",
    ])
      await expect(
        page.getByLabel(label, { exact: true }).first(),
      ).toBeVisible();
  });

  test("26. Stage 8 and later functionality is not active", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto(`/dashboard/students/${studentId}`);
    await expect(
      page.getByRole("button", {
        name: /enter marks|generate report|parent login|assign teacher/i,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/automatic promotion|analytics dashboard/i),
    ).toHaveCount(0);
  });
});
