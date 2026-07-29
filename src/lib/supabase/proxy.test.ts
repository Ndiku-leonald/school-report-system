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

import {
  copySupabaseResponseCookies,
  refreshSupabaseSession,
} from "@/lib/supabase/proxy";
import { NextResponse } from "next/server";

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

  it("copies rotated and cleared cookies with their attributes", () => {
    const source = NextResponse.next();
    source.cookies.set("sb-rotated", "synthetic-value", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    source.cookies.set("sb-cleared", "", {
      maxAge: 0,
      path: "/",
      secure: true,
    });
    source.headers.set("x-sensitive-synthetic-header", "do-not-copy");
    const target = copySupabaseResponseCookies(
      source,
      NextResponse.redirect("https://application.example.invalid/dashboard"),
    );

    expect(target.cookies.get("sb-rotated")).toMatchObject({
      value: "synthetic-value",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    expect(target.cookies.get("sb-cleared")).toMatchObject({
      value: "",
      path: "/",
      secure: true,
    });
    expect(target.headers.get("x-sensitive-synthetic-header")).toBeNull();
  });
});
