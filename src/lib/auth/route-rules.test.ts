import { describe, expect, it } from "vitest";

import { getProxyRedirect } from "@/lib/auth/route-rules";

describe("proxy route rules", () => {
  it("sends an unauthenticated protected request to sign in", () => {
    expect(
      getProxyRedirect({
        isAuthenticated: false,
        pathname: "/dashboard",
        search: "?view=ready",
      }),
    ).toBe("/staff-login?next=%2Fdashboard%3Fview%3Dready");
  });

  it("does not treat a similarly prefixed public route as protected", () => {
    expect(
      getProxyRedirect({
        isAuthenticated: false,
        pathname: "/dashboard-public",
      }),
    ).toBeNull();
  });

  it("sends an authenticated user away from the login route", () => {
    expect(
      getProxyRedirect({
        isAuthenticated: true,
        pathname: "/staff-login",
      }),
    ).toBe("/dashboard");
  });
});
