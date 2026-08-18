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
const guardianPhone = `+256700${String(nonce).slice(-6)}`;
const guardianEmail = `private.workflow.${nonce}@example.invalid`;
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
    "otherSchool",
    "otherYear",
    "otherTerm",
    "otherGrade",
    "otherClass",
    "otherSubject",
    "otherScheme",
    "otherComponent",
    "otherStudent",
    "otherEnrollment",
    "otherAssignment",
    "otherSheet",
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
  { email: string; membershipId: string; userId: string }
>();
let sheetId = "";
let correctionId = "";
let duplicateKeyMessages: string[] = [];

async function provision(
  key: string,
  roles: Database["public"]["Enums"]["staff_role"][],
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
  for (const role of roles) {
    await database.query(
      "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,$2,now()-interval '1 day')",
      [membershipId, role],
    );
  }
  people.set(key, { email, membershipId, userId: created.data.user.id });
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
      "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4),($5,$6,$7,$8)",
      [
        ids.school,
        `Workflow Browser School ${nonce}`,
        `workflow-browser-${nonce}`,
        `WFB-${nonce}`,
        ids.otherSchool,
        `Other Workflow Browser School ${nonce}`,
        `other-workflow-browser-${nonce}`,
        `OWFB-${nonce}`,
      ],
    );
    await provision("teacher", ["SUBJECT_TEACHER", "SCHOOL_ADMIN"]);
    await provision("reviewer", ["ACADEMIC_REGISTRAR"]);
    await provision("head", ["HEAD_TEACHER"]);
    await provision("unauthorized", ["SUBJECT_TEACHER"]);
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
      [ids.guardian, ids.school, guardianPhone, guardianEmail],
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
    const otherReviewerMembership = randomUUID();
    await database.query(
      "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
      [
        otherReviewerMembership,
        ids.otherSchool,
        people.get("reviewer")!.userId,
        `OWF-E2E-REVIEWER-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'ACADEMIC_REGISTRAR',now()-interval '1 day')",
      [otherReviewerMembership],
    );
    const otherUnauthorizedMembership = randomUUID();
    await database.query(
      "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
      [
        otherUnauthorizedMembership,
        ids.otherSchool,
        people.get("unauthorized")!.userId,
        `OWF-E2E-UNAUTHORIZED-${nonce}`,
      ],
    );
    await database.query(
      "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'ACADEMIC_REGISTRAR',now()-interval '1 day')",
      [otherUnauthorizedMembership],
    );
    await database.query(
      "insert into public.academic_years(id,school_id,name,starts_on,ends_on,status) values($1,$2,'Other workflow browser year',current_date-90,current_date+90,'ACTIVE')",
      [ids.otherYear, ids.otherSchool],
    );
    await database.query(
      "insert into public.terms(id,academic_year_id,name,term_number,starts_on,ends_on,status) values($1,$2,'Other workflow browser term',1,current_date-30,current_date+30,'MARKS_ENTRY')",
      [ids.otherTerm, ids.otherYear],
    );
    await database.query(
      "insert into public.grade_levels(id,school_id,code,name,sort_order) values($1,$2,'OWB','Other Workflow Grade',1)",
      [ids.otherGrade, ids.otherSchool],
    );
    await database.query(
      "insert into public.class_sections(id,academic_year_id,grade_level_id,name,class_code) values($1,$2,$3,'Other Workflow Class','OWB-C')",
      [ids.otherClass, ids.otherYear, ids.otherGrade],
    );
    await database.query(
      "insert into public.subjects(id,school_id,code,name,sort_order) values($1,$2,'OWS','Other Workflow Subject',1)",
      [ids.otherSubject, ids.otherSchool],
    );
    await database.query(
      "insert into public.grade_level_subjects(grade_level_id,subject_id,sort_order) values($1,$2,1)",
      [ids.otherGrade, ids.otherSubject],
    );
    await database.query(
      "insert into public.assessment_schemes(id,term_id,grade_level_id,subject_id,name,version,status,effective_from) values($1,$2,$3,$4,'Other Workflow Scheme',1,'DRAFT',current_date-30)",
      [ids.otherScheme, ids.otherTerm, ids.otherGrade, ids.otherSubject],
    );
    await database.query(
      "insert into public.assessment_components(id,assessment_scheme_id,name,component_code,maximum_score,weight_percentage,sort_order) values($1,$2,'Other Assessment','OASS',100,100,1)",
      [ids.otherComponent, ids.otherScheme],
    );
    await database.query(
      "update public.assessment_schemes set status='ACTIVE' where id=$1",
      [ids.otherScheme],
    );
    await database.query(
      "insert into public.students(id,school_id,admission_number,first_name,last_name,admission_date) values($1,$2,$3,'Other','Workflow Learner',current_date-90)",
      [ids.otherStudent, ids.otherSchool, `OWF-E2E-${nonce}`],
    );
    await database.query(
      "insert into public.enrollments(id,student_id,academic_year_id,class_section_id,status,enrolled_on) values($1,$2,$3,$4,'ACTIVE',current_date-30)",
      [ids.otherEnrollment, ids.otherStudent, ids.otherYear, ids.otherClass],
    );
    await database.query(
      "insert into public.teaching_assignments(id,term_id,class_section_id,subject_id,staff_membership_id,starts_on) values($1,$2,$3,$4,$5,current_date-30)",
      [
        ids.otherAssignment,
        ids.otherTerm,
        ids.otherClass,
        ids.otherSubject,
        otherReviewerMembership,
      ],
    );
    await database.query(
      "insert into public.mark_sheets(id,term_id,class_section_id,subject_id,assessment_scheme_id,teaching_assignment_id) values($1,$2,$3,$4,$5,$6)",
      [
        ids.otherSheet,
        ids.otherTerm,
        ids.otherClass,
        ids.otherSubject,
        ids.otherScheme,
        ids.otherAssignment,
      ],
    );
    await database.query(
      "insert into public.marks(mark_sheet_id,assessment_component_id,enrollment_id,score,attendance_status,created_by,updated_by) values($1,$2,$3,80,'PRESENT',$4,$4)",
      [
        ids.otherSheet,
        ids.otherComponent,
        ids.otherEnrollment,
        otherReviewerMembership,
      ],
    );
    await database.query("begin");
    await database.query(
      "select set_config('app.marks_workflow_transition','allowed',true)",
    );
    await database.query(
      "update public.mark_sheets set workflow_status='SUBMITTED',submitted_by=$2,submitted_at=now() where id=$1",
      [ids.otherSheet, otherReviewerMembership],
    );
    await database.query("commit");
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

  test("1. teacher list identifies the current revision", async ({ page }) => {
    await login(page, "teacher");
    await page.goto("/teacher/marks");
    await expect(
      page.getByText("Workflow Browser Subject", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Revision 1 · Current revision")).toBeVisible();
  });

  test("2. teacher sees authoritative incomplete completion", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(page.getByText("0 / 1")).toBeVisible();
  });

  test("3. incomplete sheet cannot submit", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toHaveCount(0);
  });

  test("4. guardian contacts never render in teacher workflow", async ({
    page,
  }) => {
    const responsePayloads: Promise<string>[] = [];
    page.on("response", (response) => {
      const contentType = response.headers()["content-type"] ?? "";
      const pathname = new URL(response.url()).pathname;
      if (
        pathname.startsWith("/teacher/marks") &&
        /text\/html|text\/x-component|application\/json/i.test(contentType)
      ) {
        responsePayloads.push(response.text().catch(() => ""));
      }
    });
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(page.getByText(/private\.workflow|\+256700/i)).toHaveCount(0);
    const serializedPage = await page.content();
    expect(serializedPage).not.toContain(guardianPhone);
    expect(serializedPage).not.toContain(guardianEmail);
    const serializedResponses = (await Promise.all(responsePayloads)).join(
      "\n",
    );
    expect(serializedResponses).not.toContain(guardianPhone);
    expect(serializedResponses).not.toContain(guardianEmail);
  });

  test("5. Stage 11 calculations remain absent", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByText(/weighted total|average|grade|position|ranking/i),
    ).toHaveCount(0);
  });

  test("6. a review role from the non-selected school cannot authorize the route", async ({
    page,
  }) => {
    await login(page, "unauthorized");
    await page.goto("/dashboard/marks/review");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("7. selected main-school membership isolates the review queue", async ({
    page,
  }) => {
    await login(page, "reviewer");
    await page.goto("/dashboard/marks/review");
    await expect(page.getByText("Other Workflow Subject")).toHaveCount(0);
  });

  test("8. term readiness displays blocked work", async ({ page }) => {
    await login(page, "reviewer");
    await page.goto("/dashboard/marks/terms");
    await expect(page.getByText("Review blocked")).toBeVisible();
  });

  test("9. term cannot advance before authoritative readiness", async ({
    page,
  }) => {
    await login(page, "reviewer");
    await page.goto("/dashboard/marks/terms");
    await expect(
      page.getByRole("button", { name: "Advance to review" }),
    ).toHaveCount(0);
  });

  test("10. teacher records every required cell", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await page
      .getByLabel("Workflow Browser Learner Assessment score")
      .fill("76");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
  });

  test("11. complete sheet exposes submission capability", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(page.getByText("1 / 1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeVisible();
  });

  test("12. stale workflow action shows safe conflict feedback", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByRole("button", { name: "Submit for review" }),
    ).toBeVisible();
    await database.query(
      "update public.mark_sheets set updated_at=updated_at+interval '1 second' where id=$1",
      [sheetId],
    );
    await confirmClick(page, "Submit for review");
    await expect(
      page.getByText("This workflow changed elsewhere. Reload and try again."),
    ).toBeVisible();
  });

  test("13. complete sheet can submit", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await confirmClick(page, "Submit for review");
    await expect(
      page.getByText("Mark sheet submitted for review."),
    ).toBeVisible();
  });

  test("14. submitted grid becomes read-only", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByLabel("Workflow Browser Learner Assessment score"),
    ).toBeDisabled();
  });

  test("15. submitting SCHOOL_ADMIN receives no review controls", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    for (const name of [
      "Start review",
      "Return for correction",
      "Approve",
      "Lock sheet",
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
  });

  test("16. Academic Registrar sees the submitted queue", async ({ page }) => {
    await login(page, "reviewer");
    await page.goto("/dashboard/marks/review");
    await expect(
      page.getByText("Workflow Browser Subject", { exact: false }),
    ).toBeVisible();
  });

  test("17. Academic Registrar starts review", async ({ page }) => {
    await login(page, "reviewer");
    await openReviewSheet(page, sheetId);
    await confirmClick(page, "Start review");
    await expect(page.getByText("Review started.")).toBeVisible();
  });

  test("18. return form is keyboard accessible and accepts a reason", async ({
    page,
  }) => {
    await login(page, "reviewer");
    await openReviewSheet(page, sheetId);
    const reason = page.getByLabel("Return reason");
    await reason.focus();
    await reason.fill("Check the source register");
    await reason.press("Tab");
    await expect(
      page.getByRole("button", { name: "Return for correction" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Mark sheet returned for correction."),
    ).toBeVisible();
  });

  test("19. teacher sees the return reason", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByText("Check the source register", { exact: true }),
    ).toBeVisible();
  });

  test("20. returned sheet becomes editable", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByLabel("Workflow Browser Learner Assessment score"),
    ).toBeEnabled();
  });

  test("21. teacher corrects and resubmits", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await page
      .getByLabel("Workflow Browser Learner Assessment score")
      .fill("78");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.reload();
    await confirmClick(page, "Resubmit");
    await expect(
      page.getByText("Corrected mark sheet resubmitted."),
    ).toBeVisible();
  });

  test("22. Academic Registrar starts the resubmission review", async ({
    page,
  }) => {
    await login(page, "reviewer");
    await openReviewSheet(page, sheetId);
    await confirmClick(page, "Start review");
    await expect(page.getByText("Review started.")).toBeVisible();
  });

  test("23. Academic Registrar approval UI approves", async ({ page }) => {
    await login(page, "reviewer");
    await openReviewSheet(page, sheetId);
    await confirmClick(page, "Approve");
    await expect(page.getByText("Mark sheet approved.")).toBeVisible();
  });

  test("24. ready term advances to REVIEW", async ({ page }) => {
    await login(page, "reviewer");
    await page.goto("/dashboard/marks/terms");
    await expect(page.getByText("Ready for review")).toBeVisible();
    await page.getByRole("button", { name: "Advance to review" }).click();
    await expect(
      page.getByText("Term advanced to marks review."),
    ).toBeVisible();
  });

  test("25. term refuses LOCKED while latest sheet is not locked", async ({
    page,
  }) => {
    await login(page, "head");
    await page.goto("/dashboard/marks/terms");
    await expect(page.getByText("Lock blocked")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lock term" })).toHaveCount(
      0,
    );
  });

  test("26. Head Teacher lock UI locks the approved sheet", async ({
    page,
  }) => {
    await login(page, "head");
    await openReviewSheet(page, sheetId);
    await confirmClick(page, "Lock sheet");
    await expect(page.getByText("Mark sheet locked.")).toBeVisible();
  });

  test("27. locked grid remains read-only", async ({ page }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(
      page.getByLabel("Workflow Browser Learner Assessment score"),
    ).toBeDisabled();
  });

  test("28. Head Teacher locks the ready term", async ({ page }) => {
    await login(page, "head");
    await page.goto("/dashboard/marks/terms");
    await page.getByRole("button", { name: "Lock term" }).click();
    await expect(page.getByText("Term marks locked.")).toBeVisible();
  });

  test("29. exceptional term correction requires a reason", async ({
    page,
  }) => {
    await login(page, "head");
    await page.goto("/dashboard/marks/terms");
    const button = page.getByRole("button", { name: "Reopen for correction" });
    await expect(button).toBeDisabled();
    await page
      .getByLabel("Controlled correction reason")
      .fill("Approved correction request");
    await expect(button).toBeEnabled();
    await button.click();
    await expect(
      page.getByText("Term reopened for controlled correction."),
    ).toBeVisible();
  });

  test("30. exceptional correction creates revision 2 instead of unlocking revision 1", async ({
    page,
  }) => {
    await login(page, "head");
    await openReviewSheet(page, sheetId);
    const button = page.getByRole("button", {
      name: "Create correction revision",
    });
    await expect(button).toBeDisabled();
    await page
      .getByLabel("Correction reason")
      .fill("Correct source transcription");
    await button.click();
    await page.waitForURL(
      (location) =>
        /\/dashboard\/marks\/review\/[0-9a-f-]+$/.test(location.pathname) &&
        !location.pathname.endsWith(sheetId),
    );
    correctionId = page.url().split("/").at(-1)!;
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

  test("31. historical locked revision remains navigable with its history", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, sheetId);
    await expect(page.getByText("Revision 1 · Term REVIEW")).toBeVisible();
    await expect(page.getByText("MARK SHEET LOCKED")).toBeVisible();
  });

  test("32. original and correction revisions use stable unique links", async ({
    page,
  }) => {
    duplicateKeyMessages = [];
    page.on("console", (message) => {
      if (
        /Encountered two children with the same key|Each child in a list should have a unique ["']key["']/i.test(
          message.text(),
        )
      ) {
        duplicateKeyMessages.push(message.text());
      }
    });
    await login(page, "teacher");
    await page.goto("/teacher/marks");
    await expect(
      page.getByText("Revision 1 · Historical revision"),
    ).toBeVisible();
    await expect(page.getByText("Revision 2 · Current revision")).toBeVisible();
    await expect(
      page.locator(`a[href="/teacher/marks/${sheetId}"]`),
    ).toHaveCount(1);
    await expect(
      page.locator(`a[href="/teacher/marks/${correctionId}"]`),
    ).toHaveCount(1);
  });

  test("33. revision-list navigation emits no duplicate-key warning", async () => {
    expect(duplicateKeyMessages).toEqual([]);
  });

  test("34. correction revision is editable only by its bound teacher", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, correctionId);
    await expect(
      page.getByLabel("Workflow Browser Learner Assessment score"),
    ).toBeEnabled();
  });

  test("35. unrelated teacher cannot open the correction revision", async ({
    page,
  }) => {
    await login(page, "unauthorized");
    await page.goto(`/teacher/marks/${correctionId}`);
    await expect(page.getByText("Page not found")).toBeVisible();
    await expect(
      page.getByText("Workflow Browser Learner", { exact: true }),
    ).toHaveCount(0);
  });

  test("36. corrected revision completes submit, review, approve, and lock", async ({
    page,
  }) => {
    await login(page, "teacher");
    await openTeacherSheet(page, correctionId);
    await page
      .getByLabel("Workflow Browser Learner Assessment score")
      .fill("79");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.reload();
    await confirmClick(page, "Submit for review");
    await login(page, "reviewer");
    await openReviewSheet(page, correctionId);
    await confirmClick(page, "Start review");
    await page.reload();
    await confirmClick(page, "Approve");
    await login(page, "head");
    await openReviewSheet(page, correctionId);
    await confirmClick(page, "Lock sheet");
    await expect(page.getByText("Mark sheet locked.")).toBeVisible();
  });

  test("37. term locks again after correction revision is locked", async ({
    page,
  }) => {
    await login(page, "head");
    await page.goto("/dashboard/marks/terms");
    await page.getByRole("button", { name: "Lock term" }).click();
    await expect(page.getByText("Term marks locked.")).toBeVisible();
  });

  test("38. final revision list distinguishes historical and latest LOCKED revisions", async ({
    page,
  }) => {
    await login(page, "teacher");
    await page.goto("/teacher/marks");
    await expect(
      page.getByText("Revision 1 · Historical revision"),
    ).toBeVisible();
    await expect(page.getByText("Revision 2 · Current revision")).toBeVisible();
    await expect(page.getByText("LOCKED", { exact: true })).toHaveCount(2);
  });

  test("39. review and marks workflow remain usable at mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "teacher");
    await openTeacherSheet(page, correctionId);
    await expect(
      page.getByRole("region", { name: "Marks entry grid" }),
    ).toBeVisible();
  });
});
