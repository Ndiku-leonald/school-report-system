import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = url && serviceKey ? createClient(url, serviceKey) : null;
const db = process.env.SUPABASE_LOCAL_DB_URL
  ? new Client({ connectionString: process.env.SUPABASE_LOCAL_DB_URL })
  : null;

describe("parent portal deterministic concurrency", () => {
  beforeAll(async () => {
    if (db) await db.connect();
  });
  afterAll(async () => {
    if (db) await db.end();
  });

  it.each(Array.from({ length: 8 }, (_, index) => index + 1))(
    "serializes shared rate-limit row race %s",
    async (race) => {
      if (!admin) return;
      const clientKey = createHash("sha256")
        .update(`stage15-race-${race}-${randomUUID()}`)
        .digest("hex");
      const calls = await Promise.all(
        Array.from({ length: 8 }, () =>
          admin.rpc(
            "verify_parent_access" as never,
            {
              access_code_lookup_hash: "0".repeat(64),
              pin_text: "00000000",
              client_key_hash: clientKey,
            } as never,
          ),
        ),
      );
      expect(calls).toHaveLength(8);
      expect(
        calls.every(
          (call) => call.error === null && call.data?.[0]?.ok === false,
        ),
      ).toBe(true);
      const row = await db?.query<{ request_count: number }>(
        "select request_count from public.parent_access_rate_limits where client_key_hash=$1",
        [clientKey],
      );
      expect(row?.rows[0]?.request_count).toBe(8);
    },
  );
});
