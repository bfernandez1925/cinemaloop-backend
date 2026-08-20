import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["test/integration/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Los archivos de test comparten el mismo Firebase Emulator Suite
    // (mismo Firestore); en paralelo, dos archivos escribiendo el mismo
    // documento (p. ej. tmdbPool/current) pueden pisarse entre sí.
    fileParallelism: false,
  },
});
