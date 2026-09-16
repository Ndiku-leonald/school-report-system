import { describe, expect, it } from "vitest";

import {
  EnvironmentConfigurationError,
  parseAuthenticationFlowEnvironment,
  parseAdministrativeEnvironment,
  parseDatabaseEnvironment,
  parsePublicEnvironment,
  parseServerEnvironment,
} from "@/lib/env/schema";

const validPublicEnvironment = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-anon-key-for-tests",
};

describe("environment validation", () => {
  it("accepts a complete browser-safe environment", () => {
    expect(parsePublicEnvironment(validPublicEnvironment)).toEqual({
      ...validPublicEnvironment,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("reports missing browser-safe variables by name", () => {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      }),
    ).toThrowError(
      new EnvironmentConfigurationError([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ]),
    );
  });

  it("accepts a complete server environment without returning extra values", () => {
    const serverEnvironment = {
      ...validPublicEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key-for-tests",
    };

    expect(parseServerEnvironment(serverEnvironment)).toEqual(
      serverEnvironment,
    );
  });

  it("validates the narrow administrative environment without database URLs", () => {
    const administrativeEnvironment = {
      ...validPublicEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key-for-tests",
    };

    expect(parseAdministrativeEnvironment(administrativeEnvironment)).toEqual(
      administrativeEnvironment,
    );
  });

  it("accepts a server-only authentication flow secret of at least 32 bytes", () => {
    expect(
      parseAuthenticationFlowEnvironment({
        AUTH_FLOW_SIGNING_SECRET:
          "synthetic-auth-flow-secret-with-more-than-thirty-two-bytes",
      }),
    ).toEqual({
      AUTH_FLOW_SIGNING_SECRET:
        "synthetic-auth-flow-secret-with-more-than-thirty-two-bytes",
    });
  });

  it("rejects an undersized authentication flow secret", () => {
    expect(() =>
      parseAuthenticationFlowEnvironment({
        AUTH_FLOW_SIGNING_SECRET: "too-short",
      }),
    ).toThrow(/AUTH_FLOW_SIGNING_SECRET/);
  });

  it("validates database URLs separately from web runtime configuration", () => {
    expect(() =>
      parseDatabaseEnvironment({
        DATABASE_URL: "not-a-database-url",
        DIRECT_URL: "not-a-database-url",
      }),
    ).toThrow(/DATABASE_URL, DIRECT_URL/);
  });

  it("normalizes a trailing application slash", () => {
    expect(
      parsePublicEnvironment(
        {
          ...validPublicEnvironment,
          NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
        },
        { mode: "development" },
      ).NEXT_PUBLIC_APP_URL,
    ).toBe("http://localhost:3000");
  });

  it("requires HTTPS for production application URLs", () => {
    expect(() =>
      parsePublicEnvironment(validPublicEnvironment, { mode: "production" }),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("rejects non-loopback HTTP application URLs outside production", () => {
    expect(() =>
      parsePublicEnvironment(
        {
          ...validPublicEnvironment,
          NEXT_PUBLIC_APP_URL: "http://school.example",
        },
        { mode: "development" },
      ),
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("rejects placeholder secrets in production without exposing values", () => {
    expect(() =>
      parseAdministrativeEnvironment(
        {
          ...validPublicEnvironment,
          NEXT_PUBLIC_APP_URL: "https://school.example",
          SUPABASE_SERVICE_ROLE_KEY: "development-secret",
        },
        { mode: "production" },
      ),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("rejects reused public and privileged Supabase keys", () => {
    expect(() =>
      parseAdministrativeEnvironment({
        ...validPublicEnvironment,
        SUPABASE_SERVICE_ROLE_KEY:
          validPublicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("rejects privileged variables with NEXT_PUBLIC names", () => {
    expect(() =>
      parsePublicEnvironment({
        ...validPublicEnvironment,
        NEXT_PUBLIC_AUTH_FLOW_SIGNING_SECRET: "synthetic-secret",
      }),
    ).toThrow(/NEXT_PUBLIC_AUTH_FLOW_SIGNING_SECRET/);
  });

  it("rejects an auth secret reused as a Supabase key", () => {
    expect(() =>
      parseAuthenticationFlowEnvironment({
        AUTH_FLOW_SIGNING_SECRET:
          validPublicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          validPublicEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }),
    ).toThrow(/AUTH_FLOW_SIGNING_SECRET/);
  });

  it("does not include secret values in configuration errors", () => {
    const secret = "synthetic-auth-secret-that-must-not-be-printed";

    try {
      parseAuthenticationFlowEnvironment({
        AUTH_FLOW_SIGNING_SECRET: secret.slice(0, 5),
      });
      throw new Error("expected configuration validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect(String(error)).toContain("AUTH_FLOW_SIGNING_SECRET");
      expect(String(error)).not.toContain(secret);
    }
  });
});
