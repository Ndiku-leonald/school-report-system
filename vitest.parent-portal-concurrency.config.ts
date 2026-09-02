import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "node",
    include: [
      "tests/parent-portal/parent-portal.concurrency.integration.test.ts",
    ],
    fileParallelism: false,
  },
});
