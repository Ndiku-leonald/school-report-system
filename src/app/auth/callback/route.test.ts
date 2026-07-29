import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  matchesEmail: vi.fn(),
  setRecoveryProofCookie: vi.fn(),
  signOut: vi.fn(),
  verifyState: vi.fn(),
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://application.example.invalid",
  }),
}));
vi.mock("@/lib/auth/recovery", () => ({
  recoveryStateMatchesUserEmail: mocks.matchesEmail,
  setRecoveryProofCookie: mocks.setRecoveryProofCookie,
  verifyPasswordRecoveryState: mocks.verifyState,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
      signOut: mocks.signOut,
    },
  }),
}));

import { GET } from "@/app/auth/callback/route";

function request(query: string) {
  return new NextRequest(
    `https://application.example.invalid/auth/callback?${query}`,
  );
}

describe("PKCE authentication callback", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("does not accept next=/reset-password as recovery proof", async () => {
    const response = await GET(
      request("code=synthetic-code&next=/reset-password"),
    );

    expect(response.headers.get("location")).toBe(
      "https://application.example.invalid/auth-error",
    );
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each(["missing", "modified", "expired"])(
    "rejects a %s recovery state before consuming the code",
    async () => {
      mocks.verifyState.mockReturnValue(null);
      const response = await GET(
        request("code=synthetic-code&recovery_state=invalid"),
      );

      expect(response.headers.get("location")).toContain("/auth-error");
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it("binds a valid recovery state to the authoritative user email", async () => {
    mocks.verifyState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "synthetic-user-id",
          email: "staff@example.invalid",
        },
      },
      error: null,
    });
    mocks.matchesEmail.mockReturnValue(true);

    const response = await GET(
      request("code=synthetic-code&recovery_state=valid"),
    );

    expect(mocks.matchesEmail).toHaveBeenCalledWith(
      "staff@example.invalid",
      "synthetic-email-hash",
    );
    expect(mocks.setRecoveryProofCookie).toHaveBeenCalledWith(
      response.cookies,
      "synthetic-user-id",
    );
    expect(response.headers.get("location")).toContain("/reset-password");
  });

  it("rejects recovery when the authoritative user does not match state", async () => {
    mocks.verifyState.mockReturnValue({
      emailHash: "synthetic-email-hash",
    });
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "another-synthetic-user",
          email: "other@example.invalid",
        },
      },
      error: null,
    });
    mocks.matchesEmail.mockReturnValue(false);

    const response = await GET(
      request("code=synthetic-code&recovery_state=valid"),
    );

    expect(response.headers.get("location")).toContain("/auth-error");
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.setRecoveryProofCookie).not.toHaveBeenCalled();
  });

  it("retains only the fixed invitation completion callback", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(
      request("code=synthetic-code&next=/complete-invitation"),
    );

    expect(response.headers.get("location")).toBe(
      "https://application.example.invalid/complete-invitation",
    );
  });
});
