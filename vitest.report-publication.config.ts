import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: "node",
    include: [
      "tests/report-publication/report-publication.integration.test.ts",
      "tests/report-publication/report-publication.trust.integration.test.ts",
      "tests/report-publication/report-publication.lifecycle.integration.test.ts",
    ],
    fileParallelism: false,
  },
});
