import { describe, expect, it } from "vitest";

import { resolveMembershipAccess } from "@/lib/auth/membership-rules";

describe("staff membership routing", () => {
  it.each([
    [
      "missing session",
      {
        hasSession: false,
        activeCount: 0,
        invitedCount: 0,
        hasSelectedActiveMembership: false,
      },
      "/staff-login",
    ],
    [
      "one active membership",
      {
        hasSession: true,
        activeCount: 1,
        invitedCount: 0,
        hasSelectedActiveMembership: false,
      },
      "active",
    ],
    [
      "multiple active memberships",
      {
        hasSession: true,
        activeCount: 2,
        invitedCount: 0,
        hasSelectedActiveMembership: false,
      },
      "/select-school",
    ],
    [
      "pending invitation",
      {
        hasSession: true,
        activeCount: 0,
        invitedCount: 1,
        hasSelectedActiveMembership: false,
      },
      "/complete-invitation",
    ],
    [
      "suspended, disabled, or missing membership",
      {
        hasSession: true,
        activeCount: 0,
        invitedCount: 0,
        hasSelectedActiveMembership: false,
      },
      "/account-unavailable",
    ],
  ])("handles %s", (_label, input, expected) => {
    expect(resolveMembershipAccess(input)).toBe(expected);
  });

  it("accepts only a revalidated active-school selection", () => {
    expect(
      resolveMembershipAccess({
        hasSession: true,
        activeCount: 2,
        invitedCount: 0,
        hasSelectedActiveMembership: true,
      }),
    ).toBe("active");
  });
});
