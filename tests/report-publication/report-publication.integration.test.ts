import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

describe("report publication integration boundary", () => {
  it("does not expose artifact metadata or storage to an anonymous client", async () => {
    if (!url || !anonKey) return;
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const descriptor = await client.rpc("get_report_artifact_descriptor", {
      target_report_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(descriptor.data).toBeNull();
    expect(descriptor.error).not.toBeNull();
    const download = await client.storage
      .from("report-artifacts")
      .download(
        `${"00000000-0000-0000-0000-000000000000"}/${"a".repeat(64)}.pdf`,
      );
    expect(download.data).toBeNull();
    expect(download.error).not.toBeNull();
  });
});
