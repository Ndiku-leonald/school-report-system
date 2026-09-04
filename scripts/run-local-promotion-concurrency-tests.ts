import { spawnSync } from "node:child_process";

const result = spawnSync("tsx", ["scripts/run-local-promotion-tests.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PROMOTION_CONCURRENCY: "1" },
});
process.exit(result.status ?? 1);
