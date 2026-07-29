import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  setRecoveryProofCookie: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://application.example.invalid",
  }),
}));
vi.mock("@/lib/auth/recovery", () => ({
  setRecoveryProofCookie: mocks.setRecoveryProofCookie,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      verifyOtp: mocks.verifyOtp,
    },
  }),
}));

import { GET } from "@/app/auth/confirm/route";

function request(type: string) {
  return new NextRequest(
    `https://application.example.invalid/auth/confirm?token_hash=synthetic-token-hash&type=${type}&next=/reset-password`,
  );
}

describe("authentication token-hash confirmation", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.setRecoveryProofCookie.mockReset();
    mocks.verifyOtp.mockReset();
  });

  it.each(["signup", "magiclink"])(
    "rejects unsupported %s confirmation without creating a session or proof",
    async (type) => {
      const response = await GET(request(type));

      expect(response.headers.get("location")).toBe(
        "https://application.example.invalid/auth-error",
      );
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expect(mocks.setRecoveryProofCookie).not.toHaveBeenCalled();
      expect(response.cookies.getAll()).toEqual([]);
    },
  );

  it("accepts an invitation only into invitation completion", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(request("invite"));

    expect(response.headers.get("location")).toBe(
      "https://application.example.invalid/complete-invitation",
    );
    expect(mocks.setRecoveryProofCookie).not.toHaveBeenCalled();
  });

  it("issues a user-bound proof after recovery confirmation", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "synthetic-user-id" } },
      error: null,
    });
    const response = await GET(request("recovery"));

    expect(response.headers.get("location")).toBe(
      "https://application.example.invalid/reset-password",
    );
    expect(mocks.setRecoveryProofCookie).toHaveBeenCalledWith(
      response.cookies,
      "synthetic-user-id",
    );
  });
});
