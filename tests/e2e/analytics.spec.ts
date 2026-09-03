import { expect, test } from "@playwright/test";

test.describe("Stage 16 analytics boundary", () => {
  test("signed-out users cannot open the analytics workspace", async ({
    page,
  }) => {
    await page.goto("/dashboard/analytics");
    await expect(page).toHaveURL(
      /staff-login|select-school|forbidden|account-unavailable/,
    );
  });

  test("analytics is not exposed through the parent route", async ({
    page,
  }) => {
    await page.goto("/parent");
    await expect(page).not.toHaveURL(/dashboard\/analytics/);
  });
});
