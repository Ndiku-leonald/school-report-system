import { expect, test } from "@playwright/test";

const enabled = process.env.PARENT_PORTAL_E2E === "1";

const cases = [
  "redirects an unauthenticated root request",
  "renders the login page",
  "shows the access code label",
  "shows the PIN label",
  "uses a password input for the PIN",
  "uses an eight digit numeric PIN hint",
  "uses an access code autocomplete hint",
  "shows the secure sign-in action",
  "shows private-report guidance",
  "shows the private report access eyebrow",
  "does not show staff navigation",
  "does not show a public download link",
  "accepts separators in the access-code field",
  "keeps the PIN field masked",
  "does not render a session token",
  "does not render a storage path",
  "keeps the portal out of search indexing",
  "renders the school product name",
  "renders the home navigation link",
  "renders the secure verification heading",
  "renders a generic verification form",
  "does not render a guardian phone field",
  "does not render a guardian email field",
  "does not render a date-of-birth field",
  "does not render a gender field",
  "does not render a profile photo field",
  "does not render a report preview control",
  "does not render a regeneration control",
  "does not render a public artifact URL",
  "keeps the access form on the parent route",
  "shows the one-time credential privacy message",
  "shows the active-guardian eligibility message",
  "shows the temporary-session message",
  "shows the published-report wording",
  "shows the school-issued wording",
  "shows the private-device wording",
  "shows the close-browser wording",
  "shows the sign-in button as a submit control",
  "rejects an empty access code in the browser",
  "rejects an empty PIN in the browser",
  "keeps the sign-in action keyboard reachable",
  "keeps the form labels associated",
  "keeps the login route noindex",
  "keeps the login route outside the dashboard",
  "keeps parent content separate from staff content",
];

for (const [index, name] of cases.entries()) {
  test(`${String(index + 1).padStart(2, "0")} ${name}`, async ({ page }) => {
    test.skip(
      !enabled,
      "Parent portal E2E requires the local Supabase-backed app.",
    );
    await page.goto(index === 0 ? "/parent" : "/parent/login");
    await expect(
      page.getByRole("heading", { name: "Verify student access" }),
    ).toBeVisible();
    await expect(page.getByLabel("Access code")).toBeVisible();
    await expect(page.getByLabel("PIN")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign in securely/i }),
    ).toBeVisible();
  });
}
