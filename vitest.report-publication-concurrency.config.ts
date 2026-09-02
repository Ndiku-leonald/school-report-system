import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "node",
    include: [
      "tests/report-publication/report-publication.concurrency.integration.test.ts",
    ],
    fileParallelism: false,
  },
});
