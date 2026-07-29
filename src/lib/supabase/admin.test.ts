// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn(() => ({ kind: "admin" })));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/env/administrative", () => ({
  getAdministrativeEnvironment: () => ({
    NEXT_PUBLIC_APP_URL: "https://application.example.invalid",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.example.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-public-key",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-role-key",
  }),
}));

import { createAdministrativeSupabaseClient } from "@/lib/supabase/admin";

describe("administrative Supabase client", () => {
  it("disables browser-session behavior", () => {
    expect(createAdministrativeSupabaseClient()).toEqual({ kind: "admin" });
    expect(createClient).toHaveBeenCalledWith(
      "https://project.example.invalid",
      "synthetic-service-role-key",
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });

  it("is not imported by the browser client", () => {
    const browserSource = readFileSync(
      join(process.cwd(), "src/lib/supabase/browser.ts"),
      "utf8",
    );

    expect(browserSource).not.toContain("supabase/admin");
    expect(browserSource).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
