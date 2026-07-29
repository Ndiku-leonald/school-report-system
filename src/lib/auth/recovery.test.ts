import { describe, expect, it, vi } from "vitest";

const secret = "synthetic-auth-flow-secret-used-only-by-recovery-tests-012345";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/authentication-flow", () => ({
  getAuthenticationFlowEnvironment: () => ({
    AUTH_FLOW_SIGNING_SECRET: secret,
  }),
}));

import { createRecoveryProof } from "@/lib/auth/flow-token";
import { verifyRecoveryProof } from "@/lib/auth/recovery";

describe("user-bound recovery proof validation", () => {
  it("accepts a valid proof only for its user", () => {
    const proof = createRecoveryProof("synthetic-user-one", secret);

    expect(verifyRecoveryProof(proof, "synthetic-user-one")).not.toBeNull();
    expect(verifyRecoveryProof(proof, "synthetic-user-two")).toBeNull();
  });

  it("rejects a forged proof", () => {
    expect(
      verifyRecoveryProof(
        "forged.synthetic.recovery-proof",
        "synthetic-user-one",
      ),
    ).toBeNull();
  });

  it("rejects an expired proof", () => {
    const proof = createRecoveryProof("synthetic-user-one", secret, {
      now: Math.floor(Date.now() / 1000) - 901,
      ttlSeconds: 900,
    });

    expect(verifyRecoveryProof(proof, "synthetic-user-one")).toBeNull();
  });
});
