import { expect, test } from "@playwright/test";

test.describe("promotion authorization boundary", () => {
  test("signed-out users cannot open promotion", async ({ page }) => {
    await page.goto("/dashboard/promotion");
    await expect(page).toHaveURL(/staff-login|forbidden/);
  });

  test("signed-out users cannot invoke a promotion decision URL", async ({
    page,
  }) => {
    await page.goto(
      "/dashboard/promotion?term=00000000-0000-4000-8000-000000000001&grade=00000000-0000-4000-8000-000000000002",
    );
    await expect(page).toHaveURL(/staff-login|forbidden/);
  });
});
