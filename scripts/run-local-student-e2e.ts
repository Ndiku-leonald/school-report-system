import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const supabaseCli = join(
  process.cwd(),
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const playwrightCli = join(
  process.cwd(),
  "node_modules",
  "playwright",
  "cli.js",
);
function parseEnvironment(output: string) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].replace(/"$/, "")]),
  );
}
const local = parseEnvironment(
  execFileSync(process.execPath, [supabaseCli, "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (
  !local.API_URL ||
  !local.ANON_KEY ||
  !local.SERVICE_ROLE_KEY ||
  !local.DB_URL ||
  !local.API_URL.includes("127.0.0.1")
)
  throw new Error(
    "A local Supabase stack is required for student browser tests.",
  );
const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "tests/e2e/student-management.spec.ts",
    ...process.argv.slice(2),
  ],
  {
    env: {
      ...process.env,
      STUDENT_E2E: "1",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
      SUPABASE_LOCAL_DB_URL: local.DB_URL,
      AUTH_FLOW_SIGNING_SECRET:
        "synthetic-student-e2e-secret-for-local-tests-0123456789",
    },
    stdio: "inherit",
  },
);
process.exitCode = result.status ?? 1;
