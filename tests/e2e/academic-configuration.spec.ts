import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.ACADEMIC_CONFIG_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const schoolId = "10000000-0000-4000-8000-000000000001";
const password = "synthetic-academic-e2e-password";
const nonce = Date.now();
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
const identities = new Map<string, { email: string }>();

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
  identities.set(key, { email });
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
    await provision("registrar", "ACADEMIC_REGISTRAR");
    await provision("head", "HEAD_TEACHER");
    await provision("subject", "SUBJECT_TEACHER");
  });

  test.afterAll(() => {
    // Successful configuration audits intentionally retain actor references.
    // The disposable local reset owns fixture cleanup.
  });

  test("registrar creates a draft year from the accessible form", async ({
    page,
  }) => {
    await login(page, "registrar");
    await page.goto("/dashboard/academic/years");
    await expect(
      page.getByRole("heading", { name: "Academic years and terms" }),
    ).toBeVisible();
    await page.getByLabel("Academic year name").fill(`E2E ${nonce}`);
    await page.getByLabel("Starts on").fill("2032-01-01");
    await page.getByLabel("Ends on").fill("2032-12-31");
    await page.getByRole("button", { name: "Create draft year" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Draft academic year created.",
    );
    await expect(page.getByText(`E2E ${nonce}`, { exact: true })).toBeVisible();
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
    await page.getByLabel("Academic year name").fill(`E2E ${nonce} invalid`);
    await page.getByLabel("Starts on").fill("2033-12-31");
    await page.getByLabel("Ends on").fill("2033-01-01");
    await page.getByRole("button", { name: "Create draft year" }).click();
    await expect(
      page.getByText("The end date must be after the start date."),
    ).toBeVisible();
  });
});
