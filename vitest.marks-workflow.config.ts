import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/marks-workflow/**/*.test.ts"],
    sequence: { concurrent: false },
    testTimeout: 45_000,
    hookTimeout: 60_000,
  },
});
