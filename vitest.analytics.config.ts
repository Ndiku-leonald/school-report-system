import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "node",
    include: ["tests/analytics/analytics.integration.test.ts"],
    fileParallelism: false,
  },
});
