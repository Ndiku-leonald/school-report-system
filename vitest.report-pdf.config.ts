import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  resolve: {
    ...baseConfig.resolve,
    conditions: ["node"],
  },
  ssr: {
    resolve: {
      conditions: ["node"],
    },
  },
  test: {
    ...baseConfig.test,
    include: ["tests/report-pdf/**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
