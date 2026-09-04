import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/integration/setup.ts"],
    include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    // Integration files share one disposable database. The integration
    // runner launches one Vitest process per file; this keeps the config
    // safe for direct single-file runs while the runner owns file ordering.
    fileParallelism: false,
    // Keep hooks and tests in strict order as well. Several integration
    // suites reset the same database in beforeEach; parallel hooks can
    // deadlock TRUNCATE against fixture inserts even with one worker.
    maxConcurrency: 1,
    sequence: { concurrent: false, hooks: "list" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
