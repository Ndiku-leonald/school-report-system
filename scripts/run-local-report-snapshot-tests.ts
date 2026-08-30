import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const supabaseCli = join(
  process.cwd(),
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const vitestCli = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");

function parseEnvironment(output: string) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].replace(/"$/, "")]),
  );
}

function isLoopback(value: string | undefined, protocols: readonly string[]) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      protocols.includes(parsed.protocol) &&
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

const local = parseEnvironment(
  execFileSync(process.execPath, [supabaseCli, "status", "-o", "env"], {
    encoding: "utf8",
  }),
);
if (
  !local.API_URL ||
  !local.ANON_KEY ||
  !local.SERVICE_ROLE_KEY ||
  !local.DB_URL ||
  !isLoopback(local.API_URL, ["http:", "https:"]) ||
  !isLoopback(local.DB_URL, ["postgres:", "postgresql:"])
) {
  throw new Error(
    "A loopback-only local Supabase stack is required for report snapshot integration tests.",
  );
}

const result = spawnSync(
  process.execPath,
  [vitestCli, "run", "--config", "vitest.report-snapshots.config.ts"],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      SUPABASE_LOCAL_DB_URL: local.DB_URL,
    },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
