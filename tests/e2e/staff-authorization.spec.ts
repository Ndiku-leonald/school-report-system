import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.AUTHORIZATION_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const schoolA = "10000000-0000-4000-8000-000000000001";
const schoolB = "10000000-0000-4000-8000-000000000099";
const schoolBName = "Synthetic Multi-School Test Campus";
const password = "synthetic-authorization-password";
const nonce = Date.now();

type Role = Database["public"]["Enums"]["staff_role"];
type Status = Database["public"]["Enums"]["membership_status"];
type Identity = {
  email: string;
  membershipId: string;
  roleAssignmentId: string;
  userId: string;
};

const identities = new Map<string, Identity>();
const userIds: string[] = [];
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

async function provision(
  key: string,
  role: Role,
  status: Status = "ACTIVE",
  schoolId = schoolA,
) {
  const email = `authorization.e2e.${key}.${nonce}@example.invalid`;
  const auth = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auth.error) throw auth.error;
  const userId = auth.data.user.id;
  const membershipId = randomUUID();
  const roleAssignmentId = randomUUID();
  userIds.push(userId);
  membershipIds.push(membershipId);

  const profile = await admin!.from("profiles").insert({
    id: userId,
    first_name: "Synthetic",
    last_name: "Authorization E2E",
  });
  if (profile.error) throw profile.error;

  const membership = await admin!.from("school_staff_memberships").insert({
    id: membershipId,
    school_id: schoolId,
    profile_id: userId,
    employee_number: `AUTHZ-E2E-${key}-${nonce}`,
    status,
  });
  if (membership.error) throw membership.error;

  const assignment = await admin!.from("staff_role_assignments").insert({
    id: roleAssignmentId,
    membership_id: membershipId,
    role,
  });
  if (assignment.error) throw assignment.error;
  identities.set(key, {
    email,
    membershipId,
    roleAssignmentId,
    userId,
  });
}

async function login(page: Page, key: string, destination = "/staff-login") {
  await page.goto(destination);
  const identity = identities.get(key)!;
  await page.getByLabel("Email address").fill(identity.email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe.serial("staff authorization", () => {
  test.skip(!enabled, "requires the local Supabase authorization E2E runner");

  test.beforeAll(async () => {
    await provision("admin", "SCHOOL_ADMIN");
    await provision("subject", "SUBJECT_TEACHER");
    await provision("class", "CLASS_TEACHER");
    await provision("registrar", "ACADEMIC_REGISTRAR");
    await provision("suspended", "SCHOOL_ADMIN", "SUSPENDED");
    await provision("revocable", "SUBJECT_TEACHER");
    await provision("multi", "SCHOOL_ADMIN");

    const multi = identities.get("multi")!;
    const membershipId = randomUUID();
    membershipIds.push(membershipId);
    const membership = await admin!.from("school_staff_memberships").insert({
      id: membershipId,
      school_id: schoolB,
      profile_id: multi.userId,
      employee_number: `AUTHZ-E2E-MULTI-B-${nonce}`,
      status: "ACTIVE",
    });
    if (membership.error) throw membership.error;
    const role = await admin!.from("staff_role_assignments").insert({
      membership_id: membershipId,
      role: "SUBJECT_TEACHER",
    });
    if (role.error) throw role.error;
  });

  test.afterAll(async () => {
    await admin!
      .from("staff_role_assignments")
      .delete()
      .in("membership_id", membershipIds);
    await admin!
      .from("school_staff_memberships")
      .delete()
      .in("id", membershipIds);
    await admin!.from("profiles").delete().in("id", userIds);
    await Promise.all(userIds.map((id) => admin!.auth.admin.deleteUser(id)));
  });

  test("school administrator can open the dashboard", async ({ page }) => {
    await login(page, "admin");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Administration overview" }),
    ).toBeVisible();
  });

  test("subject teacher is denied the dashboard", async ({ page }) => {
    await login(page, "subject");
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("subject teacher can open the teacher workspace", async ({ page }) => {
    await login(page, "subject", "/teacher");
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("class teacher can open the teacher workspace", async ({ page }) => {
    await login(page, "class", "/teacher");
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("registrar can open the dashboard", async ({ page }) => {
    await login(page, "registrar");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("permission denial uses the generic forbidden page", async ({
    page,
  }) => {
    await login(page, "subject", "/dashboard");
    await expect(
      page.getByRole("heading", { name: "Access not permitted" }),
    ).toBeVisible();
    await expect(page.getByText(/role|policy|school id/i)).toHaveCount(0);
  });

  test("membership failure retains the unavailable-account route", async ({
    page,
  }) => {
    await login(page, "suspended");
    await expect(page).toHaveURL(/\/account-unavailable$/);
  });

  test("multi-school permissions follow only the selected membership", async ({
    page,
  }) => {
    await login(page, "multi");
    await expect(page).toHaveURL(/\/select-school/);
    await page.getByText(schoolBName, { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/forbidden$/);
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByText(schoolBName, { exact: true })).toBeVisible();
  });

  test("forged active membership does not elevate permissions", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        name: "staff-active-membership",
        value: randomUUID(),
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await login(page, "subject");
    await expect(page).toHaveURL(/\/forbidden$/);
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("permission-aware navigation excludes administrative areas", async ({
    page,
  }) => {
    await login(page, "subject", "/teacher");
    const navigation = page.getByRole("navigation", {
      name: "Workspace navigation",
    });
    await expect(navigation.getByText("Staff", { exact: true })).toHaveCount(0);
    await expect(
      navigation.getByText("Analytics", { exact: true }),
    ).toHaveCount(0);
    await expect(
      navigation.getByRole("link", { name: "Workspace" }),
    ).toBeVisible();
  });

  test("revoked role loses access on the next authoritative request", async ({
    page,
  }) => {
    await login(page, "revocable", "/teacher");
    await expect(page).toHaveURL(/\/teacher$/);
    const revoke = await admin!
      .from("staff_role_assignments")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", identities.get("revocable")!.roleAssignmentId);
    if (revoke.error) throw revoke.error;
    await page.reload();
    await expect(page).toHaveURL(/\/forbidden$/);
  });

  test("mobile navigation remains keyboard usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "subject", "/teacher");
    const summary = page
      .locator("summary")
      .filter({ hasText: "Workspace navigation" });
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("navigation", { name: "Mobile workspace navigation" })
        .getByRole("link", { name: "Workspace" }),
    ).toBeVisible();
  });
});
