import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["test/integration/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
