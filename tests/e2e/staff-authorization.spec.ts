import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.AUTHORIZATION_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const schoolA = "10000000-0000-4000-8000-000000000001";
const schoolB = "10000000-0000-4000-8000-000000000099";
const schoolAName = "Demo Primary School";
const schoolBName = "Synthetic Multi-School Test Campus";
const schoolAAcademicYear = "20000000-0000-4000-8000-000000000001";
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

async function selectSchool(page: Page, schoolName: string) {
  await page.getByText(schoolName, { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

async function getBrowserAccessToken(context: BrowserContext) {
  const authCookies = (await context.cookies())
    .filter(({ name }) => name.includes("-auth-token"))
    .sort(({ name: left }, { name: right }) => left.localeCompare(right));
  const encoded = authCookies.map(({ value }) => value).join("");
  if (!encoded) throw new Error("The authenticated browser cookie is missing.");

  const value = decodeURIComponent(encoded);
  const json = value.startsWith("base64-")
    ? Buffer.from(value.slice("base64-".length), "base64url").toString("utf8")
    : value;
  const session = JSON.parse(json) as
    | { access_token?: string }
    | [string, string | null, string | null, string | null];
  const accessToken = Array.isArray(session)
    ? session[0]
    : session.access_token;
  if (!accessToken) {
    throw new Error("The authenticated browser access token is unavailable.");
  }

  return accessToken;
}

async function directSupabaseRequest(
  page: Page,
  accessToken: string,
  path: string,
) {
  return page.evaluate(
    async ({ anonKey, path, token, url }) => {
      const response = await fetch(`${url}${path}`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      });
      return {
        data: (await response.json()) as unknown,
        status: response.status,
      };
    },
    {
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      path,
      token: accessToken,
      url,
    },
  );
}

async function directActiveMembership(page: Page, accessToken: string) {
  const response = await directSupabaseRequest(
    page,
    accessToken,
    "/rest/v1/rpc/get_my_active_membership",
  );
  expect(response.status).toBe(200);
  return response.data as string | null;
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
    const roleAssignmentId = randomUUID();
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
      id: roleAssignmentId,
      membership_id: membershipId,
      role: "SUBJECT_TEACHER",
    });
    if (role.error) throw role.error;
    identities.set("multi-school-b", {
      ...multi,
      membershipId,
      roleAssignmentId,
    });
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
    context,
    page,
  }) => {
    await login(page, "multi");
    await expect(page).toHaveURL(/\/select-school/);
    await selectSchool(page, schoolBName);
    await expect(page).toHaveURL(/\/forbidden$/);
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher$/);
    await expect(page.getByText(schoolBName, { exact: true })).toBeVisible();

    const accessToken = await getBrowserAccessToken(context);
    expect(await directActiveMembership(page, accessToken)).toBe(
      identities.get("multi-school-b")!.membershipId,
    );
    const directYears = await directSupabaseRequest(
      page,
      accessToken,
      "/rest/v1/academic_years?select=id,school_id",
    );
    expect(directYears.status).toBe(200);
    expect(directYears.data).toEqual([]);
    const schoolAPermissions = await directSupabaseRequest(
      page,
      accessToken,
      `/rest/v1/rpc/get_my_effective_permissions?target_membership_id=${identities.get("multi")!.membershipId}`,
    );
    expect(schoolAPermissions.status).toBe(200);
    expect(schoolAPermissions.data).toEqual([]);
  });

  test("switching schools updates the cookie and database session selection", async ({
    context,
    page,
  }) => {
    await login(page, "multi");
    await selectSchool(page, schoolBName);
    await page.goto("/select-school");
    await selectSchool(page, schoolAName);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(schoolAName, { exact: true })).toBeVisible();

    const accessToken = await getBrowserAccessToken(context);
    expect(await directActiveMembership(page, accessToken)).toBe(
      identities.get("multi")!.membershipId,
    );
    const years = await directSupabaseRequest(
      page,
      accessToken,
      "/rest/v1/academic_years?select=id,school_id",
    );
    expect(years.status).toBe(200);
    expect(years.data).toEqual([
      { id: schoolAAcademicYear, school_id: schoolA },
    ]);
    const schoolBPermissions = await directSupabaseRequest(
      page,
      accessToken,
      `/rest/v1/rpc/get_my_effective_permissions?target_membership_id=${identities.get("multi-school-b")!.membershipId}`,
    );
    expect(schoolBPermissions.data).toEqual([]);
    await expect(
      page
        .getByRole("navigation", { name: "Workspace navigation" })
        .getByText("Staff", { exact: true }),
    ).toBeVisible();
  });

  test("a forged membership cookie cannot change the database selection", async ({
    context,
    page,
  }) => {
    await login(page, "multi");
    await selectSchool(page, schoolBName);
    const accessToken = await getBrowserAccessToken(context);

    await context.addCookies([
      {
        name: "staff-active-membership",
        value: identities.get("multi")!.membershipId,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth-error$/);
    expect(await directActiveMembership(page, accessToken)).toBe(
      identities.get("multi-school-b")!.membershipId,
    );
    const schoolAYears = await directSupabaseRequest(
      page,
      accessToken,
      `/rest/v1/academic_years?select=id&school_id=eq.${schoolA}`,
    );
    expect(schoolAYears.data).toEqual([]);
  });

  test("separate browser sessions retain independent school selections", async ({
    browser,
  }) => {
    const schoolAContext = await browser.newContext();
    const schoolBContext = await browser.newContext();
    const schoolAPage = await schoolAContext.newPage();
    const schoolBPage = await schoolBContext.newPage();

    try {
      await login(schoolAPage, "multi");
      await login(schoolBPage, "multi");
      await selectSchool(schoolAPage, schoolAName);
      await expect(schoolAPage).toHaveURL(/\/dashboard$/);
      await selectSchool(schoolBPage, schoolBName);
      await expect(schoolBPage).toHaveURL(/\/forbidden$/);

      const schoolAToken = await getBrowserAccessToken(schoolAContext);
      const schoolBToken = await getBrowserAccessToken(schoolBContext);
      expect(await directActiveMembership(schoolAPage, schoolAToken)).toBe(
        identities.get("multi")!.membershipId,
      );
      expect(await directActiveMembership(schoolBPage, schoolBToken)).toBe(
        identities.get("multi-school-b")!.membershipId,
      );

      await schoolAPage.goto("/select-school");
      await selectSchool(schoolAPage, schoolBName);
      await expect(schoolAPage).toHaveURL(/\/forbidden$/);
      await schoolAPage.goto("/select-school");
      await selectSchool(schoolAPage, schoolAName);
      await expect(schoolAPage).toHaveURL(/\/dashboard$/);

      expect(await directActiveMembership(schoolAPage, schoolAToken)).toBe(
        identities.get("multi")!.membershipId,
      );
      expect(await directActiveMembership(schoolBPage, schoolBToken)).toBe(
        identities.get("multi-school-b")!.membershipId,
      );
    } finally {
      await schoolAContext.close();
      await schoolBContext.close();
    }
  });

  test("sign-out clears the current database session selection", async ({
    context,
    page,
  }) => {
    await login(page, "subject", "/teacher");
    await expect(page).toHaveURL(/\/teacher$/);
    const accessToken = await getBrowserAccessToken(context);
    expect(await directActiveMembership(page, accessToken)).toBe(
      identities.get("subject")!.membershipId,
    );

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/staff-login$/);
    expect(await directActiveMembership(page, accessToken)).toBeNull();
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
