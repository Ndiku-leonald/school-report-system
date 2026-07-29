import { describe, expect, it } from "vitest";

import { loginSchema, passwordSchema } from "@/lib/auth/schemas";

describe("staff authentication schemas", () => {
  it("normalizes and accepts a valid login", () => {
    expect(
      loginSchema.parse({
        email: " STAFF@example.invalid ",
        password: "synthetic-password",
      }).email,
    ).toBe("STAFF@example.invalid");
  });

  it("rejects short and mismatched replacement passwords", () => {
    expect(
      passwordSchema.safeParse({
        password: "too-short",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
  });

  it("accepts a matching replacement password", () => {
    expect(
      passwordSchema.safeParse({
        password: "synthetic-long-password",
        confirmPassword: "synthetic-long-password",
      }).success,
    ).toBe(true);
  });
});
