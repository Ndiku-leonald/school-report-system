import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://project.example.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-public-key",
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          values: {
            name: string;
            value: string;
            options: { httpOnly: boolean };
          }[],
        ) => void;
      };
    },
  ) => ({
    auth: {
      getClaims: async () => {
        options.cookies.setAll([
          {
            name: "sb-refresh",
            value: "rotated-cookie-value",
            options: { httpOnly: true },
          },
        ]);
        return mocks.getClaims();
      },
    },
  }),
}));

import { refreshSupabaseSession } from "@/lib/supabase/proxy";

describe("Supabase proxy session refresh", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
  });

  it("propagates refreshed cookies and trusts validated claims", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "synthetic-user-id" } },
      error: null,
    });

    const result = await refreshSupabaseSession(
      new NextRequest("https://application.example.invalid/dashboard"),
    );

    expect(result.isAuthenticated).toBe(true);
    expect(result.response.cookies.get("sb-refresh")?.value).toBe(
      "rotated-cookie-value",
    );
  });

  it("treats failed claim validation as unauthenticated", async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: new Error("invalid"),
    });

    const result = await refreshSupabaseSession(
      new NextRequest("https://application.example.invalid/dashboard"),
    );

    expect(result.isAuthenticated).toBe(false);
  });
});
