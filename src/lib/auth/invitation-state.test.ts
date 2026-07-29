import { describe, expect, it, vi } from "vitest";

const secret =
  "synthetic-auth-flow-secret-used-only-by-invitation-tests-012345";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/authentication-flow", () => ({
  getAuthenticationFlowEnvironment: () => ({
    AUTH_FLOW_SIGNING_SECRET: secret,
  }),
}));

import {
  createInvitationState,
  createRecoveryState,
} from "@/lib/auth/flow-token";
import {
  createStaffInvitationState,
  invitationStateMatchesUserEmail,
  verifyStaffInvitationState,
} from "@/lib/auth/invitation-state";

describe("signed staff invitation state", () => {
  it("binds a valid state to the normalized invited email", () => {
    const state = createStaffInvitationState(" Staff@Example.Invalid ");
    const payload = verifyStaffInvitationState(state);

    expect(payload).not.toBeNull();
    expect(
      invitationStateMatchesUserEmail(
        "staff@example.invalid",
        payload!.emailHash,
      ),
    ).toBe(true);
    expect(
      invitationStateMatchesUserEmail(
        "different@example.invalid",
        payload!.emailHash,
      ),
    ).toBe(false);
    expect(state).not.toContain("Staff@Example.Invalid");
  });

  it("rejects a modified invitation state", () => {
    const state = createStaffInvitationState("staff@example.invalid");
    const modified = `${state.slice(0, -1)}${state.endsWith("a") ? "b" : "a"}`;

    expect(verifyStaffInvitationState(modified)).toBeNull();
  });

  it("rejects an expired invitation state", () => {
    const now = Math.floor(Date.now() / 1000);
    const state = createInvitationState("staff@example.invalid", secret, {
      now: now - 901,
      ttlSeconds: 900,
    });

    expect(verifyStaffInvitationState(state)).toBeNull();
  });

  it("rejects a recovery state as invitation state", () => {
    const state = createRecoveryState("staff@example.invalid", secret);

    expect(verifyStaffInvitationState(state)).toBeNull();
  });
});
