import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pages = [
  "src/app/dashboard/analytics/[calculationRunId]/page.tsx",
  "src/app/dashboard/analytics/[calculationRunId]/classes/[classSectionId]/page.tsx",
  "src/app/dashboard/analytics/[calculationRunId]/students/[enrollmentId]/page.tsx",
];

describe("analytics page authorization boundaries", () => {
  it.each(pages)("%s explicitly requires ANALYTICS_VIEW", (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    expect(source).toMatch(/await requirePermission\("ANALYTICS_VIEW"\)/);
  });
});
