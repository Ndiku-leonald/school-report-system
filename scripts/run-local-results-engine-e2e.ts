import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["playwright", "test", "tests/e2e/results-engine.spec.ts"],
  { stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
