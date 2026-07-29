import { describe, expect, it } from "vitest";

import {
  EnvironmentConfigurationError,
  parseAuthenticationFlowEnvironment,
  parseAdministrativeEnvironment,
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
    expect(parsePublicEnvironment(validPublicEnvironment)).toEqual(
      validPublicEnvironment,
    );
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
      DATABASE_URL: "postgresql://example.test:5432/results",
      DIRECT_URL: "postgresql://example.test:5432/results",
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

  it("rejects invalid URLs with a useful configuration error", () => {
    expect(() =>
      parseServerEnvironment({
        ...validPublicEnvironment,
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key-for-tests",
        DATABASE_URL: "not-a-database-url",
        DIRECT_URL: "not-a-database-url",
      }),
    ).toThrow(/DATABASE_URL, DIRECT_URL/);
  });
});
