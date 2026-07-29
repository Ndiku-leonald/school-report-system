import { describe, expect, it } from "vitest";

import { sanitizeNextPath } from "@/lib/auth/safe-redirect";

describe("sanitizeNextPath", () => {
  it("keeps an internal path with query parameters", () => {
    expect(sanitizeNextPath("/teacher?term=one")).toBe("/teacher?term=one");
  });

  it.each([
    "https://attacker.example/path",
    "//attacker.example/path",
    "javascript:alert(1)",
    undefined,
  ])("rejects an unsafe next destination", (value) => {
    expect(sanitizeNextPath(value)).toBe("/dashboard");
  });
});
