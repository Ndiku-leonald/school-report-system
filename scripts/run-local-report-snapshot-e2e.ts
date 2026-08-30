import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const supabaseCli = join(
  process.cwd(),
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const local = Object.fromEntries(
  execFileSync(process.execPath, [supabaseCli, "status", "-o", "env"], {
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1], match[2].replace(/"$/, "")]),
);
if (
  !local.API_URL ||
  !local.ANON_KEY ||
  !local.SERVICE_ROLE_KEY ||
  !local.DB_URL ||
  !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(
    local.API_URL,
  ) ||
  !/^postgres(ql)?:\/\//.test(local.DB_URL)
) {
  throw new Error(
    "A loopback-only local Supabase stack is required for report snapshot E2E tests.",
  );
}

const result = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/report-snapshots.spec.ts"],
  {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      SUPABASE_LOCAL_DB_URL: local.DB_URL,
      REPORT_SNAPSHOTS_E2E: "1",
    },
    stdio: "inherit",
    shell: true,
  },
);
process.exit(result.status ?? 1);
