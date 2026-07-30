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

const status = execFileSync(
  process.execPath,
  [supabaseCli, "status", "-o", "env"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
const local = parseEnvironment(status);

if (
  !local.API_URL ||
  !local.ANON_KEY ||
  !local.SERVICE_ROLE_KEY ||
  !local.DB_URL
) {
  throw new Error(
    "The local Supabase stack is unavailable or returned incomplete configuration.",
  );
}

const result = spawnSync(
  process.execPath,
  [vitestCli, "run", "--config", "vitest.authorization.config.ts"],
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

process.exitCode = result.status ?? 1;
