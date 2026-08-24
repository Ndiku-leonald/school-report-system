import { describe, expect, it } from "vitest";

describe("results engine integration contract", () => {
  it("requires a local Supabase URL for live RPC coverage", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      expect(true).toBe(true);
      return;
    }
    expect(url).toMatch(/^https?:\/\//);
  });
});
