import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const enabled = process.env.REPORT_PDF_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const password = "synthetic-report-pdf-browser-password";
const admin = enabled ? createClient(url, serviceKey) : null;
const db = new Client({ connectionString: databaseUrl });
let reportId = "";
let membershipId = "";
let schoolId = "";
let email = "";
let subjectEmail = "";
let subjectMembershipId = "";
let schoolBEmail = "";
let schoolBMembershipId = "";
let snapshot: {
  student: { display_name: string; admission_number: string };
  academic_period: { academic_year_name: string; term_name: string };
  placement: { class_name: string };
  academic_summary: {
    class_position: number | null;
    grade_level_position: number | null;
  };
};

async function setup() {
  await db.connect();
  const found = await db.query<{ id: string; snapshot_data: typeof snapshot }>(
    "select r.id, rs.snapshot_data from public.reports r join public.report_snapshots rs on rs.report_id=r.id where r.status='GENERATED' order by r.created_at desc limit 1",
  );
  if (!found.rows[0])
    throw new Error("dedicated PDF E2E requires a generated report fixture");
  reportId = found.rows[0].id;
  snapshot = found.rows[0].snapshot_data;
  schoolId = (snapshot as typeof snapshot & { school: { id: string } }).school
    .id;
  const staff = await admin!.auth.admin.createUser({
    email: `report-pdf.browser.${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (staff.error) throw staff.error;
  email = staff.data.user.email!;
  membershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'PDF','Browser')",
    [staff.data.user.id],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [membershipId, schoolId, staff.data.user.id, `PDF-${Date.now()}`],
  );
  await db.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now())",
    [membershipId],
  );

  const subject = await admin!.auth.admin.createUser({
    email: `report-pdf.subject.${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (subject.error) throw subject.error;
  subjectEmail = subject.data.user.email!;
  subjectMembershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'PDF','Subject')",
    [subject.data.user.id],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [
      subjectMembershipId,
      schoolId,
      subject.data.user.id,
      `PDF-S-${Date.now()}`,
    ],
  );
  await db.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SUBJECT_TEACHER',now())",
    [subjectMembershipId],
  );

  const schoolB = randomUUID();
  await db.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      schoolB,
      `PDF Browser School B ${Date.now()}`,
      `pdf-browser-b-${Date.now()}`,
      `PBR-${Date.now()}`,
    ],
  );
  const outsider = await admin!.auth.admin.createUser({
    email: `report-pdf.school-b.${Date.now()}@example.invalid`,
    password,
    email_confirm: true,
  });
  if (outsider.error) throw outsider.error;
  schoolBEmail = outsider.data.user.email!;
  schoolBMembershipId = randomUUID();
  await db.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'PDF','School B')",
    [outsider.data.user.id],
  );
  await db.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [
      schoolBMembershipId,
      schoolB,
      outsider.data.user.id,
      `PDF-B-${Date.now()}`,
    ],
  );
  await db.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now())",
    [schoolBMembershipId],
  );
}

async function login(page: Page, actor = email, membership = membershipId) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(actor);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard|select-school/);
  if (page.url().includes("/select-school")) {
    await page.locator(`input[type="radio"][value="${membership}"]`).check();
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.waitForURL(/dashboard/);
}

async function openReport(page: Page) {
  await login(page);
  await page.goto(`/dashboard/reports/${reportId}`);
}

async function pdfResponse(page: Page) {
  return page.request.get(`/api/reports/${reportId}/pdf`);
}

async function extractedPdf(page: Page) {
  const response = await pdfResponse(page);
  expect(response.status()).toBe(200);
  const bytes = await response.body();
  const directory = mkdtempSync(join(tmpdir(), "report-pdf-e2e-"));
  const path = join(directory, "report.pdf");
  writeFileSync(path, bytes);
  return execFileSync("pdftotext", [path, "-"], { encoding: "utf8" }).replace(
    /\s+/g,
    " ",
  );
}

test.describe
  .serial("dedicated Stage 13 report-card PDF browser acceptance", () => {
  test.skip(!enabled, "requires local Supabase and the dedicated PDF runner");
  test.beforeAll(setup);
  test.afterAll(async () => db.end());

  test("1. authorized detail displays Download PDF", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toBeVisible();
  });
  test("2. Download PDF has an accessible name", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toHaveAccessibleName("Download PDF");
  });
  test("3. Download PDF has the exact report endpoint", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toHaveAttribute("href", `/api/reports/${reportId}/pdf`);
  });
  test("4. Download PDF is keyboard reachable", async ({ page }) => {
    await openReport(page);
    await page.getByRole("link", { name: "Download PDF", exact: true }).focus();
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toBeFocused();
  });
  test("5. keyboard activation initiates download", async ({ page }) => {
    await openReport(page);
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download PDF", exact: true })
      .press("Enter");
    await expect(await download).toBeTruthy();
  });
  test("6. current report downloads", async ({ page }) => {
    await openReport(page);
    const response = await pdfResponse(page);
    expect(response.status()).toBe(200);
  });
  test("7. current filename identifies its version", async ({ page }) => {
    await openReport(page);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF", exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/-v\d+\.pdf$/);
  });
  test("8. download begins with PDF signature", async ({ page }) => {
    await openReport(page);
    expect(
      (await (await pdfResponse(page)).body()).subarray(0, 5).toString(),
    ).toBe("%PDF-");
  });
  test("9. PDF is non-empty", async ({ page }) => {
    await openReport(page);
    expect((await (await pdfResponse(page)).body()).length).toBeGreaterThan(
      3000,
    );
  });
  test("10. response uses application/pdf", async ({ page }) => {
    await openReport(page);
    expect((await pdfResponse(page)).headers()["content-type"]).toBe(
      "application/pdf",
    );
  });
  test("11. response disposition is safe attachment", async ({ page }) => {
    await openReport(page);
    expect((await pdfResponse(page)).headers()["content-disposition"]).toMatch(
      /^attachment; filename="[A-Za-z0-9._-]+"$/,
    );
  });
  test("12. response is private and uncached", async ({ page }) => {
    await openReport(page);
    expect((await pdfResponse(page)).headers()["cache-control"]).toBe(
      "private, no-store",
    );
  });
  test("13. response sets nosniff", async ({ page }) => {
    await openReport(page);
    expect((await pdfResponse(page)).headers()["x-content-type-options"]).toBe(
      "nosniff",
    );
  });
  test("14. extracted PDF contains the frozen learner", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain(snapshot.student.display_name);
  });
  test("15. extracted PDF contains the admission number", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain(
      snapshot.student.admission_number,
    );
  });
  test("16. extracted PDF contains the academic year", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain(
      snapshot.academic_period.academic_year_name,
    );
  });
  test("17. extracted PDF contains the term", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain(
      snapshot.academic_period.term_name,
    );
  });
  test("18. extracted PDF contains the class", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain(snapshot.placement.class_name);
  });
  test("19. extracted PDF contains class position", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain("Class position");
  });
  test("20. extracted PDF contains grade position", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain("Grade-level position");
  });
  test("21. extracted PDF contains subjects", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain("Subject results");
  });
  test("22. extracted PDF contains attendance", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain("Attendance and comments");
  });
  test("23. extracted PDF contains comments", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain("comment");
  });
  test("24. extracted PDF contains next-term data", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain("Next term");
  });
  test("25. extracted PDF contains snapshot fingerprint", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).toContain("Snapshot fingerprint");
  });
  test("26. report version is visible", async ({ page }) => {
    await openReport(page);
    await expect(page.getByText(/report snapshot v\d+/i)).toBeVisible();
  });
  test("27. mobile report page keeps the control usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openReport(page);
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toBeVisible();
  });
  test("28. visible focus is retained on the control", async ({ page }) => {
    await openReport(page);
    const control = page.getByRole("link", {
      name: "Download PDF",
      exact: true,
    });
    await control.focus();
    await expect(control).toBeFocused();
  });
  test("29. no Publish control is shown", async ({ page }) => {
    await openReport(page);
    await expect(page.getByRole("button", { name: /Publish/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Publish/i })).toHaveCount(0);
  });
  test("30. no Withdraw control is shown", async ({ page }) => {
    await openReport(page);
    await expect(page.getByRole("button", { name: /Withdraw/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /Withdraw/i })).toHaveCount(0);
  });
  test("31. no parent-access control is shown", async ({ page }) => {
    await openReport(page);
    await expect(
      page.getByRole("button", { name: /parent access/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /parent access/i }),
    ).toHaveCount(0);
  });
  test("32. no promotion control is shown", async ({ page }) => {
    await openReport(page);
    await expect(page.getByRole("button", { name: /Promot/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Promot/i })).toHaveCount(0);
  });
  test("33. subject teacher direct URL is denied", async ({ page }) => {
    await login(page, subjectEmail, subjectMembershipId);
    const response = await page.request.get(`/api/reports/${reportId}/pdf`, {
      maxRedirects: 0,
    });
    expect([307, 308, 403, 404]).toContain(response.status());
    expect(await response.text()).not.toMatch(
      /student|school|admission|checksum/i,
    );
  });
  test("34. School B direct URL is denied", async ({ page }) => {
    await login(page, schoolBEmail, schoolBMembershipId);
    const response = await page.request.get(`/api/reports/${reportId}/pdf`, {
      maxRedirects: 0,
    });
    expect([307, 308, 403, 404]).toContain(response.status());
  });
  test("35. invalid report UUID is rejected generically", async ({ page }) => {
    await login(page);
    const response = await page.request.get("/api/reports/not-a-uuid/pdf");
    expect(response.status()).toBe(400);
    expect(await response.text()).not.toMatch(/student|school|checksum|stack/i);
  });
  test("36. unknown report UUID is not disclosed", async ({ page }) => {
    await login(page);
    const response = await page.request.get(
      `/api/reports/${randomUUID()}/pdf`,
      { maxRedirects: 0 },
    );
    expect([307, 404, 500]).toContain(response.status());
    expect(await response.text()).not.toMatch(/student|school|checksum|stack/i);
  });
  test("37. historical detail remains independently linked", async ({
    page,
  }) => {
    await openReport(page);
    await expect(
      page.getByRole("link", { name: /Report v\d+/ }).first(),
    ).toBeVisible();
  });
  test("38. current PDF remains tied to the exact report ID", async ({
    page,
  }) => {
    await openReport(page);
    await expect(
      page.getByRole("link", { name: "Download PDF", exact: true }),
    ).toHaveAttribute("href", `/api/reports/${reportId}/pdf`);
  });
  test("39. guardian values are absent", async ({ page }) => {
    await openReport(page);
    expect(await extractedPdf(page)).not.toMatch(
      /guardian|@example\.invalid|\+256/i,
    );
  });
  test("40. browser console has no PDF errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /pdf/i.test(message.text()))
        errors.push(message.text());
    });
    await openReport(page);
    expect(errors).toEqual([]);
  });
});
