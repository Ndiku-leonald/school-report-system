import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["vitest", "run", "--config", "vitest.results-engine.config.ts"],
  { stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
