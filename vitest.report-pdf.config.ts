import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ["tests/report-pdf/**/*.integration.test.ts"],
    fileParallelism: false,
  },
});
