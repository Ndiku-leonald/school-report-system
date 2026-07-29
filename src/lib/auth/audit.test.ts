import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getForwardedIpAddress } from "@/lib/auth/audit";

describe("authentication audit client IP parsing", () => {
  it("trims and accepts the first IPv4 address", () => {
    expect(getForwardedIpAddress(" 192.0.2.10, 198.51.100.5")).toBe(
      "192.0.2.10",
    );
  });

  it("accepts an IPv6 address", () => {
    expect(getForwardedIpAddress("2001:db8::5")).toBe("2001:db8::5");
  });

  it.each([null, "", "not-an-ip", "192.0.2.999"])(
    "returns null for malformed forwarded input",
    (value) => {
      expect(getForwardedIpAddress(value)).toBeNull();
    },
  );
});
