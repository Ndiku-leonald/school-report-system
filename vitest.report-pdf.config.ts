import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

import baseConfig from "./vitest.config";

export default defineConfig({
  ...baseConfig,
  resolve: {
    ...baseConfig.resolve,
    alias: {
      ...baseConfig.resolve?.alias,
      pdfkit: fileURLToPath(
        new URL("./node_modules/pdfkit/js/pdfkit.node.mjs", import.meta.url),
      ),
    },
    conditions: ["node"],
  },
  ssr: {
    noExternal: ["pdfkit"],
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
