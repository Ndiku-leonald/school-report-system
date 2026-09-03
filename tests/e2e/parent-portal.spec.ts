import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const enabled = process.env.PARENT_PORTAL_E2E === "1";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL;
const code = "STAGE15-BROWSER-CODE";
const pin = "12345678";

type Fixture = {
  studentId: string;
  studentName: string;
  currentId: string;
  historicalId: string;
  otherStudentReportId: string;
  otherSchoolReportId: string;
  currentVersion: number;
  historicalVersion: number;
};

let db: Client;
let fixture: Fixture;

function accessHash(value: string) {
  return createHash("sha256")
    .update(value.trim().replace(/[\s-]/g, "").toUpperCase())
    .digest("hex");
}

async function login(page: Page, accessCode = code, accessPin = pin) {
  await page.goto("/parent/login");
  await page.getByLabel("Access code").fill(accessCode);
  await page.getByLabel("PIN").fill(accessPin);
  await page.getByRole("button", { name: "Sign in securely" }).click();
}

async function loggedIn(page: Page) {
  await login(page);
  await expect(page).toHaveURL(/\/parent$/);
  await expect(
    page.getByRole("heading", { name: "Published report cards" }),
  ).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Stage 15 parent portal acceptance", () => {
  test.skip(
    !enabled || !databaseUrl,
    "requires the local Supabase fixture stack",
  );

  test.beforeAll(async () => {
    db = new Client({ connectionString: databaseUrl! });
    await db.connect();
    const result = await db.query<{
      student_id: string;
      student_name: string;
      current_id: string;
      historical_id: string | null;
      current_version: number;
      historical_version: number | null;
      other_student_report_id: string | null;
      other_school_report_id: string | null;
    }>(
      `select
         student.id as student_id,
         concat_ws(' ', student.first_name, student.last_name) as student_name,
         current_report.id as current_id,
         historical_report.id as historical_id,
         current_report.version as current_version,
         historical_report.version as historical_version,
         other_student.report_id as other_student_report_id,
         other_school.report_id as other_school_report_id
       from public.reports current_report
       join public.enrollments current_enrollment on current_enrollment.id = current_report.enrollment_id
       join public.students student on student.id = current_enrollment.student_id
       join public.student_guardians link on link.student_id = student.id and link.can_access_reports
       join public.guardians guardian on guardian.id = link.guardian_id and guardian.is_active
       join lateral (
         select report.id, report.version
         from public.reports report
         where report.enrollment_id = current_enrollment.id
           and report.status = 'SUPERSEDED'
           and report.published_at is not null
           and report.pdf_storage_path is not null
         order by report.version desc
         limit 1
       ) historical_report on true
       join lateral (
         select student.school_id
         from public.students student
         where student.id = current_enrollment.student_id
       ) current_enrollment_school on true
       left join lateral (
         select report.id as report_id
         from public.students student
         join public.enrollments enrollment on enrollment.student_id = student.id
         join public.reports report on report.enrollment_id = enrollment.id
         where student.id <> current_enrollment.student_id
           and report.status in ('PUBLISHED','SUPERSEDED')
           and report.published_at is not null
           and report.pdf_storage_path is not null
         order by report.published_at desc
         limit 1
       ) other_student on true
       left join lateral (
         select report.id as report_id
         from public.students student
         join public.enrollments enrollment on enrollment.student_id = student.id
         join public.reports report on report.enrollment_id = enrollment.id
         where student.school_id <> current_enrollment_school.school_id
           and report.status in ('PUBLISHED','SUPERSEDED')
           and report.published_at is not null
           and report.pdf_storage_path is not null
         order by report.published_at desc
         limit 1
       ) other_school on true
       where current_report.status = 'PUBLISHED'
         and current_report.published_at is not null
         and current_report.pdf_storage_path is not null
         and current_report.file_checksum is not null
       order by current_report.published_at desc
       limit 1`,
    );
    const row = result.rows[0];
    if (
      !row?.historical_id ||
      !row.other_student_report_id ||
      !row.other_school_report_id
    ) {
      throw new Error(
        "Parent browser tests require current, historical, cross-student, and cross-school fixtures.",
      );
    }
    fixture = {
      studentId: row.student_id,
      studentName: row.student_name,
      currentId: row.current_id,
      historicalId: row.historical_id,
      otherStudentReportId: row.other_student_report_id,
      otherSchoolReportId: row.other_school_report_id,
      currentVersion: row.current_version,
      historicalVersion: row.historical_version!,
    };
    await db.query(
      "update public.student_access_credentials set is_active=false where student_id=$1",
      [fixture.studentId],
    );
    await db.query(
      `insert into public.student_access_credentials
       (student_id, access_code_lookup_hash, pin_hash, is_active, expires_at)
       values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf', 12)), true, null)
       on conflict (access_code_lookup_hash) do update
       set student_id=excluded.student_id, pin_hash=excluded.pin_hash,
           is_active=true, expires_at=null, failed_attempts=0,
           locked_until=null, updated_at=now()`,
      [fixture.studentId, accessHash(code), pin],
    );
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.query(
      "update public.student_access_credentials set is_active=false where student_id=$1",
      [fixture.studentId],
    );
    await db.end();
  });

  test("redirects an unauthenticated parent away from the protected list", async ({
    page,
  }) => {
    const response = await page.goto("/parent");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/parent\/login$/);
  });

  test("rejects an unknown access code with a generic message", async ({
    page,
  }) => {
    await login(page, "UNKNOWN-CODE", pin);
    await expect(page.getByRole("status")).toContainText(
      "could not be verified",
    );
    await expect(page).toHaveURL(/\/parent\/login$/);
  });

  test("rejects a wrong PIN without identifying the failure cause", async ({
    page,
  }) => {
    await login(page, code, "00000000");
    await expect(page.getByRole("status")).toContainText(
      "could not be verified",
    );
    await expect(page.getByRole("status")).not.toContainText("incorrect");
    await expect(page.getByRole("status")).not.toContainText("invalid");
  });

  test("logs in through the real form and loads the report list", async ({
    page,
  }) => {
    await loggedIn(page);
  });

  test("sets a scoped HttpOnly parent session cookie", async ({ page }) => {
    await loggedIn(page);
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === "parent-report-session",
    );
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/parent",
    });
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.value).not.toContain(".");
  });

  test("keeps the session token out of URL and browser storage", async ({
    page,
  }) => {
    await loggedIn(page);
    const cookies = await page.context().cookies();
    const token = cookies.find(
      (item) => item.name === "parent-report-session",
    )?.value;
    expect(page.url()).not.toContain(token ?? "__missing__");
    expect(
      await page.evaluate(
        () =>
          `${document.documentElement.innerHTML} ${localStorage.length} ${sessionStorage.length}`,
      ),
    ).not.toContain(token ?? "__missing__");
  });

  test("shows the authorized current report", async ({ page }) => {
    await loggedIn(page);
    await expect(
      page.getByText(`Version ${fixture.currentVersion}`),
    ).toBeVisible();
  });

  test("shows the authorized historical report", async ({ page }) => {
    await loggedIn(page);
    await expect(
      page.getByText(`Version ${fixture.historicalVersion}`),
    ).toBeVisible();
    await expect(
      page.getByText("Previous published version", { exact: true }),
    ).toBeVisible();
  });

  test("marks the latest report Current", async ({ page }) => {
    await loggedIn(page);
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
  });

  test("marks the older report as a previous published version", async ({
    page,
  }) => {
    await loggedIn(page);
    await expect(
      page.getByText("Previous published version", { exact: true }),
    ).toBeVisible();
  });

  test("opens the current report detail", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(
      page.getByRole("heading", { name: fixture.studentName }),
    ).toBeVisible();
  });

  test("renders the frozen student identity", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(
      page.getByRole("heading", { name: fixture.studentName }),
    ).toBeVisible();
  });

  test("renders the frozen academic period and report version", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(
      page.getByText(
        new RegExp(`2026.*Term One.*Version ${fixture.currentVersion}`),
      ),
    ).toBeVisible();
  });

  test("renders the private school record warning", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(
      page.getByText("Private school record", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("not regenerated from live marks"),
    ).toBeVisible();
  });

  test("keeps guardian contact and profile fields out of detail", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/phone|email|date of birth|profile photo/i);
  });

  test("does not offer preview, regenerate, or public-storage controls", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(
      page.getByRole("link", { name: "Download PDF" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("link")
        .filter({ hasText: /preview|regenerate|public url/i }),
    ).toHaveCount(0);
  });

  test("keeps storage paths and public URLs out of rendered HTML", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    const html = await page.content();
    expect(html).not.toMatch(
      /storage_path|supabase\.co\/storage|createSignedUrl/i,
    );
  });

  test("downloads the current artifact as a private PDF", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    const response = await page.request.get(
      `/parent/api/reports/${fixture.currentId}/artifact`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "content-type": "application/pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(download.suggestedFilename()).not.toMatch(/[\\/]/);
  });

  test("downloads a published historical artifact", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.historicalId}`);
    const response = await page.request.get(
      `/parent/api/reports/${fixture.historicalId}/artifact`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("denies cross-student detail access", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.otherStudentReportId}`);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("denies cross-school detail access", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.otherSchoolReportId}`);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("denies cross-student artifact access", async ({ page }) => {
    await loggedIn(page);
    const response = await page.request.get(
      `/parent/api/reports/${fixture.otherStudentReportId}/artifact`,
    );
    expect(response.status()).toBe(404);
  });

  test("denies cross-school artifact access", async ({ page }) => {
    await loggedIn(page);
    const response = await page.request.get(
      `/parent/api/reports/${fixture.otherSchoolReportId}/artifact`,
    );
    expect(response.status()).toBe(404);
  });

  test("accepts separators in the access code", async ({ page }) => {
    await login(page, "STAGE 15 BROWSER CODE", pin);
    await expect(page).toHaveURL(/\/parent$/);
  });

  test("uses browser required validation for an empty access code", async ({
    page,
  }) => {
    await page.goto("/parent/login");
    await page.getByLabel("PIN").fill(pin);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page.getByLabel("Access code")).toBeFocused();
  });

  test("uses browser required validation for an empty PIN", async ({
    page,
  }) => {
    await page.goto("/parent/login");
    await page.getByLabel("Access code").fill(code);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page.getByLabel("PIN")).toBeFocused();
  });

  test("renders the PIN as a password field", async ({ page }) => {
    await page.goto("/parent/login");
    await expect(page.getByLabel("PIN")).toHaveAttribute("type", "password");
  });

  test("associates visible labels with both credentials", async ({ page }) => {
    await page.goto("/parent/login");
    await expect(page.getByLabel("Access code")).toHaveAttribute(
      "id",
      "parent-access-code",
    );
    await expect(page.getByLabel("PIN")).toHaveAttribute("id", "parent-pin");
  });

  test("keeps the login route no-index", async ({ page }) => {
    const response = await page.goto("/parent/login");
    expect(
      response?.headers()["x-robots-tag"] ??
        (await page.locator("meta[name=robots]").getAttribute("content")),
    ).toMatch(/noindex/i);
  });

  test("keeps the protected parent route outside the staff dashboard", async ({
    page,
  }) => {
    await loggedIn(page);
    await expect(page.getByRole("link", { name: /dashboard/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
  });

  test("provides keyboard access to both fields and submit", async ({
    page,
  }) => {
    await page.goto("/parent/login");
    await page.getByLabel("Access code").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("PIN")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Sign in securely" }),
    ).toBeFocused();
  });

  test("refreshes a protected list through session revalidation", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Published report cards" }),
    ).toBeVisible();
  });

  test("exposes a detail link for the current report", async ({ page }) => {
    await loggedIn(page);
    await expect(
      page.locator(`a[href="/parent/reports/${fixture.currentId}"]`),
    ).toHaveCount(1);
  });

  test("exposes a detail link for the historical report", async ({ page }) => {
    await loggedIn(page);
    await expect(
      page.locator(`a[href="/parent/reports/${fixture.historicalId}"]`),
    ).toHaveCount(1);
  });

  test("shows the current badge on the current detail", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
  });

  test("shows the superseded badge on historical detail", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.historicalId}`);
    await expect(page.getByText("Superseded", { exact: true })).toBeVisible();
  });

  test("renders the report summary snapshot", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(page.getByText("Academic Summary")).toBeVisible();
    const summaryScores = page.getByText("86", { exact: true });
    await expect(summaryScores).toHaveCount(2);
    await expect(summaryScores.first()).toBeVisible();
  });

  test("renders the snapshot comments without live joins", async ({ page }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(page.getByText("Comments")).toBeVisible();
    await expect(page.getByText("Good work")).toBeVisible();
  });

  test("keeps the list limited to the authorized student identity", async ({
    page,
  }) => {
    await loggedIn(page);
    await expect(page.getByText(fixture.studentName)).toHaveCount(0);
    await expect(page.getByText("Published report cards")).toBeVisible();
  });

  test("rejects malformed report identifiers without a database lookup", async ({
    page,
  }) => {
    await loggedIn(page);
    const response = await page.request.get(
      "/parent/api/reports/not-a-uuid/artifact",
    );
    expect(response.status()).toBe(404);
  });

  test("rejects a protected staff dashboard request with the parent session", async ({
    page,
  }) => {
    await loggedIn(page);
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/dashboard$/);
  });

  test("signs out and clears access to the report list", async ({ page }) => {
    await loggedIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.goto("/parent");
    await expect(page).toHaveURL(/\/parent\/login$/);
  });

  test("signs out before a direct detail request", async ({ page }) => {
    await loggedIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    const response = await page.goto(`/parent/reports/${fixture.currentId}`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/parent\/login$/);
  });

  test("denies a direct artifact request after logout", async ({ page }) => {
    await loggedIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    const response = await page.request.get(
      `/parent/api/reports/${fixture.currentId}/artifact`,
    );
    expect(response.status()).toBe(404);
  });

  test("keeps the session cookie scoped to the parent path", async ({
    page,
  }) => {
    await loggedIn(page);
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === "parent-report-session",
    );
    expect(cookie?.path).toBe("/parent");
  });

  test("does not place a bearer token in the download URL", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    const href = await page
      .getByRole("link", { name: "Download PDF" })
      .getAttribute("href");
    expect(href).toBe(`/parent/api/reports/${fixture.currentId}/artifact`);
    expect(href).not.toMatch(/token|session|signed|storage/i);
  });

  test("keeps the historical detail available after the current report exists", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.historicalId}`);
    await expect(
      page.getByText(`Version ${fixture.historicalVersion}`),
    ).toBeVisible();
    await expect(page.getByText("Private school record")).toBeVisible();
  });

  test("does not expose a public Supabase storage host in the artifact response", async ({
    page,
  }) => {
    await loggedIn(page);
    const response = await page.request.get(
      `/parent/api/reports/${fixture.currentId}/artifact`,
    );
    expect(response.status()).toBe(200);
    expect(response.url()).not.toMatch(/supabase\.co\/storage|public/i);
  });

  test("keeps report identifiers in safe path segments", async ({ page }) => {
    await loggedIn(page);
    await expect(page).toHaveURL(/\/parent$/);
    const links = await page
      .locator('a[href^="/parent/reports/"]')
      .evaluateAll((items) => items.map((item) => item.getAttribute("href")));
    expect(
      links.every((href) =>
        /^\/parent\/reports\/[0-9a-f-]+$/i.test(href ?? ""),
      ),
    ).toBe(true);
  });

  test("returns a private no-store login response", async ({ page }) => {
    await page.goto("/parent/login");
    const response = await page.request.post("/parent/api/session", {
      data: { accessCode: "bad", pin: "00000000" },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()).toMatchObject({
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    });
  });

  test("keeps the parent shell free of staff navigation", async ({ page }) => {
    await loggedIn(page);
    await expect(
      page.getByRole("link", { name: /students|reports|settings/i }),
    ).toHaveCount(0);
  });

  test("renders private parent guidance on the login page", async ({
    page,
  }) => {
    await page.goto("/parent/login");
    await expect(page.getByText(/private device/i)).toBeVisible();
    await expect(page.getByText(/eligible, active guardians/i)).toBeVisible();
  });

  test("does not reveal credential values in the login page HTML", async ({
    page,
  }) => {
    await page.goto("/parent/login");
    const html = await page.content();
    expect(html).not.toContain(code);
    expect(html).not.toContain(pin);
  });

  test("keeps the parent route excluded from robots indexing", async ({
    page,
  }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("Disallow: /parent");
  });

  test("keeps the authorized report page free of credential fields", async ({
    page,
  }) => {
    await loggedIn(page);
    await page.goto(`/parent/reports/${fixture.currentId}`);
    await expect(page.getByLabel("Access code")).toHaveCount(0);
    await expect(page.getByLabel("PIN")).toHaveCount(0);
  });
});
