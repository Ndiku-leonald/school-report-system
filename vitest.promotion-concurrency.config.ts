import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "node",
    include: ["tests/promotion/promotion.concurrency.integration.test.ts"],
    testNamePattern: /C\d{2}\./,
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
