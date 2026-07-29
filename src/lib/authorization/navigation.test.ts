import { LayoutDashboard } from "lucide-react";
import { describe, expect, it } from "vitest";

import { filterNavigation } from "./navigation";

const navigation = [
  {
    label: "Administration",
    href: "/dashboard",
    icon: LayoutDashboard,
    permissions: ["DASHBOARD_VIEW"] as const,
  },
  {
    label: "Teacher workspace",
    href: "/teacher",
    icon: LayoutDashboard,
    permissions: ["TEACHER_WORKSPACE_VIEW"] as const,
  },
  {
    label: "Students",
    icon: LayoutDashboard,
    permissions: ["STUDENTS_VIEW_ALL", "STUDENTS_VIEW_ASSIGNED"] as const,
    unavailable: true,
  },
];

describe("server navigation filtering", () => {
  it("does not return unauthorized destinations", () => {
    const result = filterNavigation(navigation, {
      permissions: new Set(["TEACHER_WORKSPACE_VIEW"]),
    });

    expect(result.map(({ href }) => href).filter(Boolean)).toEqual([
      "/teacher",
    ]);
  });

  it("supports any-permission navigation entries", () => {
    const result = filterNavigation(navigation, {
      permissions: new Set(["STUDENTS_VIEW_ASSIGNED"]),
    });

    expect(result.map(({ label }) => label)).toEqual(["Students"]);
  });

  it("returns no entries when no permission is effective", () => {
    expect(filterNavigation(navigation, { permissions: new Set() })).toEqual(
      [],
    );
  });
});
