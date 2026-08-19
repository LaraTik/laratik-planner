import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/unit/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "tests/e2e/**", "playwright-report"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/lib/db/migrations/**",
        "src/app/**/route.ts",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
      ],
      // Per-glob thresholds per PRODUCTION_READINESS_TRACKER.md QA-003:
      //   - critical domains (auth, security, content, deliveries,
      //     publishing, observability) → 95% statements / 90% branches
      //   - other application services (channels, dashboard,
      //     workspaces, ai) → 85% statements / 80% branches
      //   - everything else under src/ → 60% statements / 50% branches
      //     (UI primitives + DB schema — exercised through integration
      //     tests, not the unit suite)
      thresholds: {
        "src/lib/auth/**/*.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "src/lib/security/**/*.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "src/lib/content/**/*.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "src/lib/deliveries/**/*.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "src/lib/publishing/**/*.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "src/lib/observability/**/*.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
        "src/lib/channels/**/*.ts": { statements: 85, branches: 80, functions: 85, lines: 85 },
        "src/lib/dashboard/**/*.ts": { statements: 85, branches: 80, functions: 85, lines: 85 },
        "src/lib/workspaces/**/*.ts": { statements: 85, branches: 80, functions: 85, lines: 85 },
        "src/lib/ai/**/*.ts": { statements: 85, branches: 80, functions: 85, lines: 85 },
        "src/lib/email/**/*.ts": { statements: 85, branches: 80, functions: 85, lines: 85 },
        "src/lib/validation/**/*.ts": { statements: 85, branches: 80, functions: 85, lines: 85 },
        "src/**/*.ts": { statements: 60, branches: 50, functions: 60, lines: 60 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // "server-only" is a Next.js convention that throws if imported
      // into a client bundle. For Vitest we just want it to be a no-op
      // so server-only service files can be imported in tests.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
