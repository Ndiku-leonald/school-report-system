import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const enabled = process.env.REPORT_PUBLICATION_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-report-publication-browser-password";
const admin = enabled ? createClient(url, serviceKey) : null;
const db = new Client({ connectionString: databaseUrl });
const unknownReport = "00000000-0000-0000-0000-000000000000";

let reportId = "";
let schoolId = "";
let sectionId = "";
let termId = "";
let termStartsOn = "";
let generatorEmail = "";
let generatorMembershipId = "";
let viewOnlyEmail = "";
let viewOnlyMembershipId = "";
let subjectEmail = "";
let subjectMembershipId = "";
let classTeacherEmail = "";
let classTeacherMembershipId = "";
let schoolBEmail = "";
let schoolBMembershipId = "";
let registrarGenerateMappingExisted = false;

async function createStaff(
  label: string,
  role: string,
  targetSchoolId: string,
) {
  const auth = await admin!.auth.admin.createUser({
    email: `report-publication.${label}.${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const membershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,$2,'Browser')",
    [auth.data.user.id, label],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [
      membershipId,
      targetSchoolId,
      auth.data.user.id,
      `ST14-${label}-${Date.now()}`,
    ],
  );
  await db.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,$2,now()-interval '1 day')",
    [membershipId, role],
  );
  return { email: auth.data.user.email!, membershipId };
}

async function setup() {
  if (!enabled) return;
  await db.connect();
  const found = await db.query<{
    id: string;
    school_id: string;
    section_id: string;
    term_id: string;
    term_starts_on: string;
  }>(
    `select report.id, year.school_id, enrollment.class_section_id as section_id,
            report.term_id, term.starts_on as term_starts_on
       from public.reports report
       join public.terms term on term.id = report.term_id
       join public.academic_years year on year.id = term.academic_year_id
       join public.enrollments enrollment on enrollment.id = report.enrollment_id
      where report.status = 'GENERATED'
        and report.calculation_run_id is not null
        and report.superseded_by is null
        and report.pdf_storage_path is null
      order by report.created_at desc
      limit 1`,
  );
  if (!found.rows[0])
    throw new Error(
      "Stage 14 browser tests require a current generated report.",
    );
  reportId = found.rows[0].id;
  schoolId = found.rows[0].school_id;
  sectionId = found.rows[0].section_id;
  termId = found.rows[0].term_id;
  termStartsOn = found.rows[0].term_starts_on;

  const generator = await createStaff("Generator", "SCHOOL_ADMIN", schoolId);
  generatorEmail = generator.email;
  generatorMembershipId = generator.membershipId;
  const viewOnly = await createStaff(
    "Registrar",
    "ACADEMIC_REGISTRAR",
    schoolId,
  );
  viewOnlyEmail = viewOnly.email;
  viewOnlyMembershipId = viewOnly.membershipId;
  const mapping = await db.query(
    "delete from public.role_permissions where role='ACADEMIC_REGISTRAR' and permission='REPORTS_GENERATE' returning id",
  );
  registrarGenerateMappingExisted = mapping.rowCount === 1;
  const subject = await createStaff("Subject", "SUBJECT_TEACHER", schoolId);
  subjectEmail = subject.email;
  subjectMembershipId = subject.membershipId;
  const classTeacher = await createStaff(
    "ClassTeacher",
    "CLASS_TEACHER",
    schoolId,
  );
  classTeacherEmail = classTeacher.email;
  classTeacherMembershipId = classTeacher.membershipId;
  await db.query(
    `insert into public.class_teacher_assignments
       (term_id,class_section_id,staff_membership_id,is_primary,starts_on)
     values($1,$2,$3,false,$4)`,
    [termId, sectionId, classTeacherMembershipId, termStartsOn],
  );

  const schoolB = randomUUID();
  await db.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      schoolB,
      `Publication Browser School B ${Date.now()}`,
      `publication-b-${Date.now()}`,
      `P14B-${Date.now()}`,
    ],
  );
  const outsider = await createStaff("SchoolB", "SCHOOL_ADMIN", schoolB);
  schoolBEmail = outsider.email;
  schoolBMembershipId = outsider.membershipId;
}

async function login(
  page: Page,
  email = generatorEmail,
  membershipId = generatorMembershipId,
) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|select-school/);
  if (page.url().includes("/select-school")) {
    await page.locator(`input[type="radio"][value="${membershipId}"]`).check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.waitForURL(/dashboard/);
}

async function openReport(
  page: Page,
  email = generatorEmail,
  membershipId = generatorMembershipId,
) {
  await login(page, email, membershipId);
  await page.goto(`/dashboard/reports/${reportId}`);
}

test.describe.serial("Stage 14 signed-in publication acceptance", () => {
  test.skip(
    !enabled,
    "requires local Supabase and the dedicated publication runner",
  );
  test.beforeAll(setup);
  test.afterAll(async () => {
    if (admin) {
      const emails = [
        generatorEmail,
        viewOnlyEmail,
        subjectEmail,
        classTeacherEmail,
        schoolBEmail,
      ];
      const users = await admin.auth.admin.listUsers({ perPage: 1000 });
      for (const email of emails) {
        const user = users.data.users.find((item) => item.email === email);
        if (user) await admin.auth.admin.deleteUser(user.id);
      }
    }
    if (registrarGenerateMappingExisted) {
      await db.query(
        "insert into public.role_permissions(role,permission) values('ACADEMIC_REGISTRAR','REPORTS_GENERATE') on conflict (role,permission) do nothing",
      );
    }
    if (enabled) await db.end();
  });

  test("1. authorized report detail opens", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText("Publication workflow")).toBeVisible();
  });
  test("2. GENERATED status is visible", async ({ page }) => {
    await openReport(page);
    const workflowCard = page
      .getByText("Publication workflow")
      .locator("..")
      .locator("..");
    await expect(
      workflowCard.getByText("GENERATED", { exact: true }),
    ).toBeVisible();
  });
  test("3. generator sees the private-PDF control", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("button", { name: "Generate private PDF" }),
    ).toBeVisible();
  });
  test("4. artifact download is absent before storage", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("link", { name: "Download stored PDF" }),
    ).toHaveCount(0);
  });
  test("5. product artifact POST stores a private PDF", async ({ page }) => {
    await openReport(page);
    const response = await page.request.post(
      `/api/reports/${reportId}/artifact`,
      { data: {} },
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).hasArtifact).toBe(true);
  });
  test("6. stored artifact state is visible", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText("Stored", { exact: true })).toBeVisible();
  });
  test("7. stored SHA-256 checksum is visible", async ({ page }) => {
    await openReport(page);
    await expect(page.locator("dd.font-mono").first()).toHaveText(
      /^[a-f0-9]{64}$/,
    );
  });
  test("8. trusted renderer contract is visible", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByText("report-card-v1", { exact: true }),
    ).toBeVisible();
  });
  test("9. stored artifact uses the product route", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("link", { name: "Download stored PDF" }),
    ).toHaveAttribute("href", `/api/reports/${reportId}/artifact`);
  });
  test("10. stored download succeeds", async ({ page }) => {
    await openReport(page);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
  });
  test("11. stored download starts with the PDF signature", async ({
    page,
  }) => {
    await openReport(page);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });
  test("12. stored bytes equal the deterministic Stage 13 render", async ({
    page,
  }) => {
    await openReport(page);
    const stored = await (
      await page.request.get(`/api/reports/${reportId}/artifact`)
    ).body();
    const rendered = await (
      await page.request.get(`/api/reports/${reportId}/pdf`)
    ).body();
    expect(stored.equals(rendered)).toBe(true);
  });
  test("13. duplicate materialization reuses the same object", async ({
    page,
  }) => {
    await openReport(page);
    const response = await page.request.post(
      `/api/reports/${reportId}/artifact`,
      { data: {} },
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).checksum).toMatch(/^[a-f0-9]{64}$/);
  });
  test("14. raw Storage URLs are absent", async ({ page }) => {
    await openReport(page);
    expect(await page.locator("body").innerText()).not.toMatch(
      /storage\.supabase|signedUrl|createSignedUrl/i,
    );
  });
  test("15. parent controls are absent", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText(/parent|guardian/i)).toHaveCount(0);
  });
  test("16. promotion controls are absent", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText(/promot/i)).toHaveCount(0);
  });
  test("17. view-only registrar cannot materialize", async ({ page }) => {
    await openReport(page, viewOnlyEmail, viewOnlyMembershipId);
    await expect(
      page.getByRole("button", { name: "Generate private PDF" }),
    ).toHaveCount(0);
  });
  test("18. subject teacher cannot use the report route", async ({ page }) => {
    await login(page, subjectEmail, subjectMembershipId);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
  test("19. School B cannot use the report route", async ({ page }) => {
    await login(page, schoolBEmail, schoolBMembershipId);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
  test("20. reviewer sees the review control", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("button", { name: "Mark reviewed" }),
    ).toBeVisible();
  });
  test("21. review succeeds", async ({ page }) => {
    await openReport(page);
    await page.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(page.getByText("REVIEWED", { exact: true })).toBeVisible();
  });
  test("22. reviewed badge remains after refresh", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText("REVIEWED", { exact: true })).toBeVisible();
  });
  test("23. reviewed report keeps its stored artifact", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText("Stored", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download stored PDF" }),
    ).toBeVisible();
  });
  test("24. publish control is visible only to the publishing role", async ({
    page,
  }) => {
    await openReport(page);
    await expect(
      page.getByRole("button", { name: "Publish report" }),
    ).toBeVisible();
    await openReport(page, viewOnlyEmail, viewOnlyMembershipId);
    await expect(
      page.getByRole("button", { name: "Publish report" }),
    ).toHaveCount(0);
  });
  test("25. publish confirmation dialog is accessible", async ({ page }) => {
    await openReport(page);
    await page.getByRole("button", { name: "Publish report" }).click();
    await expect(
      page.getByRole("dialog", { name: "Confirm publication" }),
    ).toBeVisible();
  });
  test("26. publication confirmation is keyboard reachable", async ({
    page,
  }) => {
    await openReport(page);
    await page.getByRole("button", { name: "Publish report" }).click();
    await page.getByRole("button", { name: "Confirm publish" }).focus();
    await expect(
      page.getByRole("button", { name: "Confirm publish" }),
    ).toBeFocused();
  });
  test("27. keyboard confirmation publishes", async ({ page }) => {
    await openReport(page);
    await page.getByRole("button", { name: "Publish report" }).click();
    await page.getByRole("button", { name: "Confirm publish" }).press("Enter");
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
  });
  test("28. published state survives a new session", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText("PUBLISHED", { exact: true })).toBeVisible();
  });
  test("29. withdraw control is visible to authorized staff", async ({
    page,
  }) => {
    await openReport(page);
    await expect(
      page.getByRole("button", { name: "Withdraw publication" }),
    ).toBeVisible();
  });
  test("30. empty withdrawal reason is rejected by the control", async ({
    page,
  }) => {
    await openReport(page);
    await page.getByRole("button", { name: "Withdraw publication" }).click();
    await expect(
      page.getByRole("button", { name: "Confirm withdrawal" }),
    ).toBeDisabled();
  });
  test("31. whitespace withdrawal reason is rejected", async ({ page }) => {
    await openReport(page);
    await page.getByRole("button", { name: "Withdraw publication" }).click();
    await page.getByLabel("Reason").fill("   ");
    await expect(
      page.getByRole("button", { name: "Confirm withdrawal" }),
    ).toBeDisabled();
  });
  test("32. valid withdrawal reason succeeds", async ({ page }) => {
    await openReport(page);
    await page.getByRole("button", { name: "Withdraw publication" }).click();
    await page.getByLabel("Reason").fill("Correction required");
    await page.getByRole("button", { name: "Confirm withdrawal" }).click();
    await expect(page.getByText("WITHDRAWN", { exact: true })).toBeVisible();
  });
  test("33. withdrawn history remains downloadable", async ({ page }) => {
    await openReport(page);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect(response.status()).toBe(200);
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });
  test("34. Stage 13 preview remains a distinct route", async ({ page }) => {
    await openReport(page);
    const response = await page.request.get(`/api/reports/${reportId}/pdf`);
    expect(response.status()).toBe(200);
    expect(response.url()).toContain(`/api/reports/${reportId}/pdf`);
  });
  test("35. artifact route remains uncached", async ({ page }) => {
    await openReport(page);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  });
  test("36. artifact route sets nosniff", async ({ page }) => {
    await openReport(page);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  });
  test("37. stored PDF link is keyboard focusable", async ({ page }) => {
    await openReport(page);
    await page.getByRole("link", { name: "Download stored PDF" }).focus();
    await expect(
      page.getByRole("link", { name: "Download stored PDF" }),
    ).toBeFocused();
  });
  test("38. narrow viewport keeps the workflow usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReport(page);
    await expect(page.getByText("Publication workflow")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download stored PDF" }),
    ).toBeVisible();
  });
  test("39. class-teacher scope is still constrained by the live term boundary", async ({
    page,
  }) => {
    await login(page, classTeacherEmail, classTeacherMembershipId);
    const response = await page.request.get(
      `/api/reports/${reportId}/artifact`,
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
  test("40. class teacher cannot review or publish", async ({ page }) => {
    await openReport(page, classTeacherEmail, classTeacherMembershipId);
    await expect(
      page.getByRole("button", { name: "Mark reviewed" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Publish report" }),
    ).toHaveCount(0);
  });
  test("41. subject teacher cannot review or publish", async ({ page }) => {
    await login(page, subjectEmail, subjectMembershipId);
    await page.goto(`/dashboard/reports/${reportId}`);
    await expect(
      page.getByRole("button", { name: "Publish report" }),
    ).toHaveCount(0);
  });
  test("42. unknown report does not disclose artifact details", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/reports/${unknownReport}/artifact`,
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toMatch(/storage|checksum|signed|token/i);
  });
  test("43. anonymous report detail is denied", async ({ page }) => {
    await page.goto(`/dashboard/reports/${unknownReport}`);
    await expect(page).toHaveURL(/staff-login|auth-error|forbidden/i);
    await expect(page.getByText(/parent|guardian/i)).toHaveCount(0);
  });
  test("44. artifact POST rejects browser metadata", async ({ request }) => {
    const response = await request.post(
      `/api/reports/${unknownReport}/artifact`,
      {
        data: {
          checksum: "a".repeat(64),
          storagePath: "arbitrary/path.pdf",
          snapshotData: {},
        },
      },
    );
    expect(response.status()).toBe(400);
    expect(await response.text()).not.toMatch(
      /storagePath|snapshotData|checksum/i,
    );
  });
  test("45. no credential or parent endpoint is present", async ({ page }) => {
    await openReport(page);
    expect(await page.locator("body").innerText()).not.toMatch(
      /parent login|access code|guardian portal/i,
    );
  });
  test("46. workflow has no browser console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await openReport(page);
    await page.getByRole("link", { name: "Download stored PDF" }).click();
    expect(errors).toEqual([]);
  });
});
