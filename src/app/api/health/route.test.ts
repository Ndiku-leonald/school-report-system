import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("health endpoint", () => {
  it("returns a cache-disabled liveness response without touching application data", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
