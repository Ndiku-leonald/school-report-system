import { describe, expect, it } from "vitest";

import { getInvitationRedirectUrl } from "@/lib/auth/invitation-redirect";

const localCallback =
  "http://127.0.0.1:3100/auth/callback?next=/complete-invitation";
const productionCallback =
  "https://school.example.invalid/auth/callback?next=/complete-invitation";

describe("staff invitation redirect validation", () => {
  it("constructs the approved localhost callback", () => {
    expect(
      getInvitationRedirectUrl("http://127.0.0.1:3100", localCallback),
    ).toBe(localCallback);
  });

  it("constructs the approved production callback", () => {
    expect(
      getInvitationRedirectUrl(
        "https://school.example.invalid",
        productionCallback,
      ),
    ).toBe(productionCallback);
  });

  it.each([
    "https://external.example.invalid/auth/callback?next=/complete-invitation",
    "//external.example.invalid/auth/callback?next=/complete-invitation",
    "https://school.example.invalid.attacker.invalid/auth/callback?next=/complete-invitation",
    "https://school.example.invalid/dashboard",
    "https://school.example.invalid/auth/callback?next=/dashboard",
    "https://user:pass@school.example.invalid/auth/callback?next=/complete-invitation",
    "https://school.example.invalid/auth/callback?next=/complete-invitation#fragment",
  ])("rejects an unsafe redirect: %s", (redirectUrl) => {
    expect(() =>
      getInvitationRedirectUrl("https://school.example.invalid", redirectUrl),
    ).toThrow();
  });

  it("rejects insecure non-local application origins", () => {
    expect(() =>
      getInvitationRedirectUrl("http://school.example.invalid"),
    ).toThrow(/HTTPS/);
  });
});
