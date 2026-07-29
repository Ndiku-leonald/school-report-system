import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createRecoveryProof,
  createRecoveryState,
  hashRecoveryEmail,
  RECOVERY_PROOF_PURPOSE,
  RECOVERY_STATE_PURPOSE,
  verifyAuthenticationFlowToken,
} from "@/lib/auth/flow-token";

const secret = "synthetic-auth-flow-secret-used-only-by-unit-tests-0123456789";
const now = 1_800_000_000;

describe("signed authentication flow tokens", () => {
  it("creates a recovery state with a one-way normalized email hash", () => {
    const token = createRecoveryState(" Staff@Example.Invalid ", secret, {
      now,
      ttlSeconds: 600,
    });
    const payload = verifyAuthenticationFlowToken(
      token,
      RECOVERY_STATE_PURPOSE,
      secret,
      now,
    );

    expect(payload?.emailHash).toBe(
      hashRecoveryEmail("staff@example.invalid", secret),
    );
    expect(token).not.toContain("Staff@Example.Invalid");
  });

  it("creates a short-lived recovery proof bound to a user", () => {
    const token = createRecoveryProof("synthetic-user-id", secret, {
      now,
      ttlSeconds: 900,
    });
    const payload = verifyAuthenticationFlowToken(
      token,
      RECOVERY_PROOF_PURPOSE,
      secret,
      now + 899,
    );

    expect(payload?.userId).toBe("synthetic-user-id");
    expect(payload?.expiresAt).toBe(now + 900);
  });

  it("rejects a modified token", () => {
    const token = createRecoveryProof("synthetic-user-id", secret, { now });
    const modified = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    expect(
      verifyAuthenticationFlowToken(
        modified,
        RECOVERY_PROOF_PURPOSE,
        secret,
        now,
      ),
    ).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = createRecoveryProof("synthetic-user-id", secret, {
      now,
      ttlSeconds: 60,
    });

    expect(
      verifyAuthenticationFlowToken(
        token,
        RECOVERY_PROOF_PURPOSE,
        secret,
        now + 60,
      ),
    ).toBeNull();
  });

  it("rejects a token for another purpose", () => {
    const token = createRecoveryState("staff@example.invalid", secret, {
      now,
    });

    expect(
      verifyAuthenticationFlowToken(token, RECOVERY_PROOF_PURPOSE, secret, now),
    ).toBeNull();
  });

  it("rejects a secret shorter than 32 bytes", () => {
    expect(() =>
      createRecoveryProof("synthetic-user-id", "undersized-secret", { now }),
    ).toThrow(/too short/);
  });
});
