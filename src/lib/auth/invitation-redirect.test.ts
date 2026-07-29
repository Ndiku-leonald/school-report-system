import { describe, expect, it } from "vitest";

import { getInvitationRedirectUrl } from "@/lib/auth/invitation-redirect";

const invitationState = "signed.invitation-state";
const localCallback = `http://127.0.0.1:3100/auth/callback?invitation_state=${invitationState}`;
const productionCallback = `https://school.example.invalid/auth/callback?invitation_state=${invitationState}`;

describe("staff invitation redirect validation", () => {
  it("constructs the approved localhost callback", () => {
    expect(
      getInvitationRedirectUrl(
        "http://127.0.0.1:3100",
        invitationState,
        "http://127.0.0.1:3100/auth/callback",
      ),
    ).toBe(localCallback);
  });

  it("constructs the approved production callback", () => {
    expect(
      getInvitationRedirectUrl(
        "https://school.example.invalid",
        invitationState,
      ),
    ).toBe(productionCallback);
  });

  it.each([
    "https://external.example.invalid/auth/callback",
    "//external.example.invalid/auth/callback",
    "https://school.example.invalid.attacker.invalid/auth/callback",
    "https://school.example.invalid/dashboard",
    "https://school.example.invalid/auth/callback?invitation_state=attacker",
    "https://school.example.invalid/auth/callback?next=/dashboard",
    "https://user:pass@school.example.invalid/auth/callback",
    "https://school.example.invalid/auth/callback#fragment",
  ])("rejects an unsafe redirect: %s", (redirectUrl) => {
    expect(() =>
      getInvitationRedirectUrl(
        "https://school.example.invalid",
        invitationState,
        redirectUrl,
      ),
    ).toThrow();
  });

  it("rejects insecure non-local application origins", () => {
    expect(() =>
      getInvitationRedirectUrl(
        "http://school.example.invalid",
        invitationState,
      ),
    ).toThrow(/HTTPS/);
  });

  it("requires the signed invitation state", () => {
    expect(() =>
      getInvitationRedirectUrl("https://school.example.invalid", ""),
    ).toThrow(/state/);
  });
});
