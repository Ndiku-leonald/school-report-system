import { expect, test } from "@playwright/test";

const unknownReport = "00000000-0000-0000-0000-000000000000";

test.describe("report publication boundary", () => {
  test("anonymous users cannot enumerate stored artifacts", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/reports/${unknownReport}/artifact`,
    );
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toMatch(/storage|checksum|signed|token/i);
  });

  test("anonymous users cannot reach staff report workflow", async ({
    page,
  }) => {
    await page.goto(`/dashboard/reports/${unknownReport}`);
    await expect(page).toHaveURL(/staff-login|auth-error|forbidden/i);
    await expect(page.getByText(/parent|guardian/i)).toHaveCount(0);
  });

  test("artifact POST accepts no client-controlled artifact metadata", async ({
    request,
  }) => {
    const response = await request.post(
      `/api/reports/${unknownReport}/artifact`,
      {
        data: {
          checksum: "a".repeat(64),
          storagePath: "arbitrary/path.pdf",
          snapshotData: { student: "synthetic" },
        },
      },
    );
    expect(response.status()).toBe(400);
    expect(await response.text()).not.toMatch(
      /storagePath|snapshotData|checksum/i,
    );
  });
});
