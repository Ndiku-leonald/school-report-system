import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "node",
    include: [
      "tests/parent-portal/parent-portal.integration.test.ts",
      "tests/parent-portal/parent-portal.behavior.integration.test.ts",
    ],
    fileParallelism: false,
  },
});
