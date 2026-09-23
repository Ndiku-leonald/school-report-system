// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const revokeParentSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/parent-portal/server", () => ({
  revokeParentSession,
}));

vi.mock("@/lib/env/public", () => ({
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://school.example",
  }),
}));

import { GET, POST } from "@/app/parent/api/logout/route";

describe("parent logout route", () => {
  it("rejects GET requests", async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("rejects cross-origin POST requests before revocation", async () => {
    const response = await POST(
      new Request("https://school.example/parent/api/logout", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    );

    expect(response.status).toBe(403);
    expect(revokeParentSession).not.toHaveBeenCalled();
  });

  it("redirects to the configured application origin", async () => {
    revokeParentSession.mockResolvedValueOnce(undefined);

    const response = await POST(
      new Request("https://attacker.example/parent/api/logout", {
        method: "POST",
        headers: { origin: "https://school.example" },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://school.example/parent/login",
    );
    expect(revokeParentSession).toHaveBeenCalledOnce();
  });
});
