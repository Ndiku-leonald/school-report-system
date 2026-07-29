import { expect, test } from "@playwright/test";

test("foundation routes load and remain navigable", async ({ page }) => {
  await page.goto("/");

  await expect.soft(page).toHaveTitle(/Primary School Academic Results/);
  await expect
    .soft(
      page.getByRole("heading", {
        name: /academic results, handled with care/i,
      }),
    )
    .toBeVisible();

  await page
    .getByRole("main")
    .getByRole("link", { name: "Staff sign in" })
    .click();
  await expect.soft(page).toHaveURL(/\/staff-login$/);
  await expect
    .soft(page.getByRole("heading", { name: "Sign in to your workspace" }))
    .toBeVisible();

  await page.goto("/");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Access a student report" })
    .click();
  await expect.soft(page).toHaveURL(/\/parent$/);
  await expect
    .soft(page.getByRole("heading", { name: "Verify student access" }))
    .toBeVisible();
});
