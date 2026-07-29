import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

import type { Database } from "../../src/types/database.generated";

const enabled = process.env.AUTH_E2E === "1";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const schoolId = "10000000-0000-4000-8000-000000000001";
const initialPassword = "synthetic-e2e-password";
const replacementPassword = "synthetic-e2e-password-updated";
const nonce = Date.now();
const activeEmail = `synthetic.e2e.active.${nonce}@example.invalid`;
const suspendedEmail = `synthetic.e2e.suspended.${nonce}@example.invalid`;
const disabledEmail = `synthetic.e2e.disabled.${nonce}@example.invalid`;
const noMembershipEmail = `synthetic.e2e.no-membership.${nonce}@example.invalid`;
const invitedEmail = `synthetic.e2e.invited.${nonce}@example.invalid`;
const multipleEmail = `synthetic.e2e.multiple.${nonce}@example.invalid`;
const secondSchoolId = "10000000-0000-4000-8000-000000000099";
const secondSchoolName = "Synthetic Multi-School Test Campus";

const admin = enabled
  ? createClient<Database>(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    })
  : null;

async function createStaff(
  email: string,
  status: "ACTIVE" | "DISABLED" | "SUSPENDED",
) {
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
  });
  if (error) throw error;

  const { error: profileError } = await admin!.from("profiles").insert({
    id: data.user.id,
    first_name: "Synthetic",
    last_name: `${status} E2E`,
  });
  if (profileError) throw profileError;

  const { error: membershipError } = await admin!
    .from("school_staff_memberships")
    .insert({
      employee_number: `E2E-${status}-${nonce}`,
      profile_id: data.user.id,
      school_id: schoolId,
      status,
    });
  if (membershipError) throw membershipError;
}

async function createStaffWithoutMembership() {
  const { data, error } = await admin!.auth.admin.createUser({
    email: noMembershipEmail,
    password: initialPassword,
    email_confirm: true,
  });
  if (error) throw error;

  const { error: profileError } = await admin!.from("profiles").insert({
    id: data.user.id,
    first_name: "Synthetic",
    last_name: "No Membership E2E",
  });
  if (profileError) throw profileError;
}

async function createInvitation() {
  const { data, error } = await admin!.auth.admin.generateLink({
    type: "invite",
    email: invitedEmail,
    options: {
      redirectTo:
        "http://127.0.0.1:3100/auth/callback?next=/complete-invitation",
    },
  });
  if (error) throw error;

  const { error: profileError } = await admin!.from("profiles").insert({
    id: data.user.id,
    first_name: "Synthetic",
    last_name: "Invited E2E",
  });
  if (profileError) throw profileError;

  const { error: membershipError } = await admin!
    .from("school_staff_memberships")
    .insert({
      employee_number: `E2E-INVITED-${nonce}`,
      profile_id: data.user.id,
      school_id: schoolId,
      status: "INVITED",
    });
  if (membershipError) throw membershipError;

  return data.properties.hashed_token;
}

async function createMultiSchoolStaff() {
  const { data, error } = await admin!.auth.admin.createUser({
    email: multipleEmail,
    password: initialPassword,
    email_confirm: true,
  });
  if (error) throw error;

  const { error: profileError } = await admin!.from("profiles").insert({
    id: data.user.id,
    first_name: "Synthetic",
    last_name: "Multi School E2E",
  });
  if (profileError) throw profileError;

  const { error: membershipError } = await admin!
    .from("school_staff_memberships")
    .insert([
      {
        employee_number: `E2E-MULTI-A-${nonce}`,
        profile_id: data.user.id,
        school_id: schoolId,
        status: "ACTIVE",
      },
      {
        employee_number: `E2E-MULTI-B-${nonce}`,
        profile_id: data.user.id,
        school_id: secondSchoolId,
        status: "ACTIVE",
      },
    ]);
  if (membershipError) throw membershipError;
}

test.describe.serial("staff authentication", () => {
  test.skip(!enabled, "requires the local Supabase auth test runner");

  let inviteToken = "";

  test.beforeAll(async () => {
    await createStaff(activeEmail, "ACTIVE");
    await createStaff(suspendedEmail, "SUSPENDED");
    await createStaff(disabledEmail, "DISABLED");
    await createStaffWithoutMembership();
    inviteToken = await createInvitation();
    await createMultiSchoolStaff();
  });

  test("protects staff routes and handles failed login generically", async ({
    page,
  }) => {
    await page.goto("/dashboard?view=ready");
    await expect(page).toHaveURL(
      /\/staff-login\?next=%2Fdashboard%3Fview%3Dready/,
    );

    await page.getByLabel("Email address").fill(activeEmail);
    await page.getByLabel("Password").fill("incorrect-synthetic-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/sign-in was unsuccessful/i)).toBeVisible();
  });

  test("signs active staff in and out using server-managed cookies", async ({
    page,
  }) => {
    await page.goto("/staff-login");
    await page.getByLabel("Email address").fill(activeEmail);
    await page.getByLabel("Password").fill(initialPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Demo Primary School")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/staff-login$/);

    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/staff-login\?next=%2Fteacher/);
  });

  test("routes a suspended membership to the unavailable state", async ({
    page,
  }) => {
    await page.goto("/staff-login");
    await page.getByLabel("Email address").fill(suspendedEmail);
    await page.getByLabel("Password").fill(initialPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/account-unavailable$/);
    await expect(
      page.getByRole("heading", { name: /staff access is unavailable/i }),
    ).toBeVisible();
  });

  for (const [state, email] of [
    ["disabled", disabledEmail],
    ["membership-free", noMembershipEmail],
  ] as const) {
    test(`denies a ${state} account`, async ({ page }) => {
      await page.goto("/staff-login");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password").fill(initialPassword);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL(/\/account-unavailable$/);
    });
  }

  test("completes an invitation and activates staff access", async ({
    page,
  }) => {
    await page.goto(
      `/auth/confirm?token_hash=${encodeURIComponent(inviteToken)}&type=invite&next=/complete-invitation`,
    );
    await expect(page).toHaveURL(/\/complete-invitation$/);
    await page
      .getByLabel("New password", { exact: true })
      .fill(initialPassword);
    await page.getByLabel("Confirm new password").fill(initialPassword);
    await page.getByRole("button", { name: "Activate staff account" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("requires and persists a revalidated multi-school selection", async ({
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
    await page.goto("/staff-login");
    await page.getByLabel("Email address").fill(multipleEmail);
    await page.getByLabel("Password").fill(initialPassword);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/select-school/);
    await page.getByText(secondSchoolName, { exact: true }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByText(secondSchoolName, { exact: true }),
    ).toBeVisible();
  });

  test("completes recovery and requires a fresh sign-in", async ({ page }) => {
    const { data, error } = await admin!.auth.admin.generateLink({
      type: "recovery",
      email: activeEmail,
      options: { redirectTo: "http://127.0.0.1:3100/reset-password" },
    });
    if (error) throw error;

    await page.goto(
      `/auth/confirm?token_hash=${encodeURIComponent(
        data.properties.hashed_token,
      )}&type=recovery&next=/reset-password`,
    );
    await page
      .getByLabel("New password", { exact: true })
      .fill(replacementPassword);
    await page.getByLabel("Confirm new password").fill(replacementPassword);
    await page.getByRole("button", { name: "Update password" }).click();

    await expect(page).toHaveURL(/\/staff-login\?message=password-updated/);
    await expect(
      page.getByText(/sign in with your new password/i),
    ).toBeVisible();
  });

  test("keeps recovery generic and the mobile form keyboard accessible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/staff-login");
    await page.getByRole("link", { name: "Back to home" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Email address")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();

    await page.goto("/forgot-password");
    await page
      .getByLabel("Email address")
      .fill(`unknown.synthetic.${nonce}@example.invalid`);
    await page.getByRole("button", { name: "Send reset instructions" }).click();
    await expect(
      page.getByText(/if an eligible staff account exists/i),
    ).toBeVisible();
  });
});
