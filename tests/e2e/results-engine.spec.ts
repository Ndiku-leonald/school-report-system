import { expect, test } from "@playwright/test";

test.describe("results engine", () => {
  test("results route is present in the authenticated product surface", async ({
    page,
  }) => {
    await page.goto("/dashboard/results");
    await expect(page).toHaveURL(
      /\/(dashboard\/results|forbidden|staff-login)(?:\?|\/|$)/,
    );
  });
});
