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
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
