import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const enabled = process.env.REPORT_SNAPSHOTS_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const databaseUrl = process.env.SUPABASE_LOCAL_DB_URL ?? "";
const nonce = Date.now();
const password = "synthetic-report-snapshot-browser-password";
const admin = enabled ? createClient(url, serviceKey) : null;
const database = new Client({ connectionString: databaseUrl });
let email = "";

async function setup() {
  await database.connect();
  const schoolId = randomUUID();
  const membershipId = randomUUID();
  email = `report-snapshot.browser.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  await database.query(
    "insert into public.schools(id,name,slug,school_code) values($1,$2,$3,$4)",
    [
      schoolId,
      `Snapshot Browser School ${nonce}`,
      `snapshot-browser-${nonce}`,
      `SBR-${nonce}`,
    ],
  );
  await database.query(
    "insert into public.profiles(id,first_name,last_name) values($1,'Snapshot','Browser')",
    [auth.data.user.id],
  );
  await database.query(
    "insert into public.school_staff_memberships(id,school_id,profile_id,employee_number,status) values($1,$2,$3,$4,'ACTIVE')",
    [membershipId, schoolId, auth.data.user.id, `SBR-${nonce}`],
  );
  await database.query(
    "insert into public.staff_role_assignments(membership_id,role,granted_at) values($1,'SCHOOL_ADMIN',now()-interval '1 day')",
    [membershipId],
  );
}

async function login(page: Page) {
  await page.goto("/staff-login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/dashboard/);
}

test.describe.serial("report snapshots dedicated browser verification", () => {
  test.skip(!enabled, "requires the local report-snapshot runner");
  test.beforeAll(setup);
  test.afterAll(async () => database.end());

  test("1. unauthenticated reports route redirects to staff login", async ({
    page,
  }) => {
    await page.goto("/dashboard/reports");
    await expect(page).toHaveURL(/staff-login/);
  });

  test("2. authorized staff can open the reports dashboard", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Immutable report snapshots")).toBeVisible();
  });

  test("3. stage 12 preview does not expose PDF or publication controls", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByText(/PDF download|Publish to parents|Promotion/i),
    ).toHaveCount(0);
  });

  test("4. empty state explains that finalized calculation results are required", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/dashboard/reports");
    await expect(
      page.getByText("No finalized calculation runs yet."),
    ).toBeVisible();
  });
});
