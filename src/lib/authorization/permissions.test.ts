import { describe, expect, it } from "vitest";

import {
  hasAnyPermission,
  hasPermission,
  type AppPermission,
} from "./permissions";

function context(...permissions: AppPermission[]) {
  return { permissions: new Set(permissions) };
}

describe("permission predicates", () => {
  it("denies absent permissions by default", () => {
    expect(hasPermission(context(), "DASHBOARD_VIEW")).toBe(false);
  });

  it("matches typed effective permissions", () => {
    expect(
      hasPermission(
        context("TEACHER_WORKSPACE_VIEW"),
        "TEACHER_WORKSPACE_VIEW",
      ),
    ).toBe(true);
  });

  it("accepts any one of several required permissions", () => {
    expect(
      hasAnyPermission(context("STUDENTS_VIEW_ASSIGNED"), [
        "STUDENTS_VIEW_ALL",
        "STUDENTS_VIEW_ASSIGNED",
      ]),
    ).toBe(true);
  });
});
