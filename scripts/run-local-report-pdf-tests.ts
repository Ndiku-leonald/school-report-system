import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");

const unit = spawnSync(
  process.execPath,
  [
    tsx,
    "--conditions=react-server",
    join(root, "scripts", "test-report-pdf.ts"),
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);
if ((unit.status ?? 1) !== 0) process.exit(unit.status ?? 1);

let envOutput = "";
try {
  envOutput = execFileSync(
    process.execPath,
    [
      join(root, "node_modules", "supabase", "dist", "supabase.js"),
      "status",
      "-o",
      "env",
    ],
    { encoding: "utf8" },
  );
} catch {
  console.log(
    "report-pdf integration tests skipped (no local Supabase stack; renderer tests passed)",
  );
  process.exit(0);
}
const local = Object.fromEntries(
  envOutput
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1], match[2].replace(/"$/, "")]),
);
if (
  !local.API_URL ||
  !local.ANON_KEY ||
  !local.SERVICE_ROLE_KEY ||
  !local.DB_URL
) {
  console.log(
    "report-pdf integration tests skipped (local Supabase is incomplete; renderer tests passed)",
  );
  process.exit(0);
}
const integration = spawnSync(
  process.execPath,
  [vitest, "run", "--config", join(root, "vitest.report-pdf.config.ts")],
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
process.exit(integration.status ?? 1);
