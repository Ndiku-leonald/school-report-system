import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/proxy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase/proxy")>(
    "@/lib/supabase/proxy",
  );
  return {
    ...actual,
    refreshSupabaseSession: mocks.refresh,
  };
});

import { proxy } from "@/proxy";

function refreshedResponse(cookieValue: string, maxAge?: number) {
  const response = NextResponse.next();
  response.cookies.set("sb-synthetic-auth", cookieValue, {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
  });
  return response;
}

describe("application proxy cookie propagation", () => {
  beforeEach(() => mocks.refresh.mockReset());

  it("keeps rotated cookies on an unauthenticated protected redirect", async () => {
    mocks.refresh.mockResolvedValue({
      isAuthenticated: false,
      response: refreshedResponse("rotated"),
    });
    const response = await proxy(
      new NextRequest("https://application.example.invalid/dashboard"),
    );

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-synthetic-auth")?.value).toBe("rotated");
  });

  it("keeps rotated cookies on an authenticated login redirect", async () => {
    mocks.refresh.mockResolvedValue({
      isAuthenticated: true,
      response: refreshedResponse("rotated"),
    });
    const response = await proxy(
      new NextRequest("https://application.example.invalid/staff-login"),
    );

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-synthetic-auth")?.value).toBe("rotated");
  });

  it("keeps cleared cookies on redirects", async () => {
    mocks.refresh.mockResolvedValue({
      isAuthenticated: false,
      response: refreshedResponse("", 0),
    });
    const response = await proxy(
      new NextRequest("https://application.example.invalid/dashboard"),
    );

    expect(response.cookies.get("sb-synthetic-auth")).toMatchObject({
      value: "",
      maxAge: 0,
    });
  });

  it("returns the original refresh response when no redirect is needed", async () => {
    const refreshed = refreshedResponse("unchanged");
    mocks.refresh.mockResolvedValue({
      isAuthenticated: true,
      response: refreshed,
    });

    expect(
      await proxy(
        new NextRequest("https://application.example.invalid/dashboard"),
      ),
    ).toBe(refreshed);
  });
});
