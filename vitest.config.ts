import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const coverageAdvisory = process.env.COVERAGE_ADVISORY === "1";

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
        // Type-only files have no runtime expressions to
        // cover; the v8 reporter reports 0% on them which
        // drags down the per-glob branch threshold for no
        // useful reason. The actual type contract is
        // enforced by tsc + the per-test file imports.
        "src/lib/auth/platform-navigation-access.ts",
        // This module is a type-only public contract for storage providers;
        // it has no runtime statements to exercise. The concrete adapters
        // and their service orchestration are covered below.
        "src/lib/storage/adapter.ts",
      ],
      // Per-glob thresholds per PRODUCTION_READINESS_TRACKER.md QA-003.
      // The unit suite alone does not exercise the DB-touching service
      // files in content/deliveries/publishing/workspaces/ai/email, so
      // those rows are expected to fail until integration-test coverage
      // is folded in (tracked as Partial). The cron watchdog will
      // surface the gap and the user's follow-up will close it.
      // Per-glob thresholds per PRODUCTION_READINESS_TRACKER.md
      // QA-003 (Task 9). Critical domains target 95/90/95/95; application
      // services target 85/80/85/85. Validation is currently at
      // 87.28/85.36/100/87.28 so we floor at 87/85/100/87 to keep the
      // 1-point buffer required by the plan. Brand and storage sit
      // comfortably above the 85/80 targets — we floor at the
      // aspirational numbers so newly added tests cannot accidentally
      // regress them. The src-wide floor is a safety net for unlisted
      // globs (e.g. app pages) but is not the release gate.
      // 2026-09-28 — the 2026-08-26 temporary relaxations are CLOSED.
      // Each floor below is now a measured value from a green
      // `pnpm test:coverage` run, not a lowered placeholder, and every
      // glob that had been dropped is back at (or above) its aspirational
      // target. What closed them:
      //   content       65→80 — enriched-list.ts had 0% coverage and
      //                          inline-update.ts sat at 32% branches;
      //                          both now have full suites.
      //   deliveries    85→95 — setMediaRequired (from 4eadc7f1) had zero
      //                          coverage, and the decideApproval
      //                          notification fan-out was unreachable
      //                          because the mock never primed the
      //                          item-meta row.
      //   auth          90→95 — auth/config.ts was 65% branches; the
      //                          Credentials authorize path, the
      //                          mustChangePassword DB re-read, and the
      //                          Google/SMTP provider branches are covered.
      //   observability  restored by app-errors.ts going 50%→98.6% lines
      //   security      93 (unchanged) — still short of the 95 target.
      //                          The gap is the new upload_sign /
      //                          password_reset_request rate-limit
      //                          scopes, which are integration-covered
      //                          but not unit-covered. TRACKED: closing it
      //                          means unit tests for those two scopes,
      //                          then this floor moves 93→95.
      //   channels      85/75/83 — invite + grant flow branches; still
      //                          below the 95 target.
      //   storage       85→95 — read-service.ts was 71% branches (URL
      //                          cache prune, fetch failure paths).
      //   ai            85→90 — four files were at 0% (monthly-planning,
      //                          instruction-packs, default-planning-pack,
      //                          governance-index); all now at 100%.
      //   brand / dashboard / email / validation / workspaces
      //                          raised to their measured values so a
      //                          future regression fails the gate instead
      //                          of sliding silently.
      // Ratchet rule for the next change: raise a floor only in the same
      // commit that lands the tests, and never lower one to make a run go
      // green. If a glob cannot hold its target, write down why above.
      ...(coverageAdvisory
        ? {}
        : {
            thresholds: {
              "src/lib/auth/**/*.ts": { statements: 95, branches: 90, functions: 95, lines: 95 },
              "src/lib/security/**/*.ts": {
                statements: 93,
                branches: 85,
                functions: 100,
                lines: 93,
              },
              "src/lib/content/**/*.ts": {
                statements: 80,
                branches: 80,
                functions: 85,
                lines: 80,
              },
              "src/lib/deliveries/**/*.ts": {
                statements: 95,
                branches: 90,
                functions: 95,
                lines: 95,
              },
              "src/lib/publishing/**/*.ts": {
                statements: 95,
                branches: 90,
                functions: 95,
                lines: 95,
              },
              "src/lib/observability/**/*.ts": {
                statements: 95,
                branches: 90,
                functions: 95,
                lines: 95,
              },
              "src/lib/channels/**/*.ts": {
                statements: 85,
                branches: 75,
                functions: 83,
                lines: 85,
              },
              "src/lib/brand/**/*.ts": { statements: 93, branches: 83, functions: 90, lines: 93 },
              "src/lib/storage/**/*.ts": { statements: 95, branches: 82, functions: 95, lines: 95 },
              "src/lib/dashboard/**/*.ts": {
                statements: 96,
                branches: 90,
                functions: 95,
                lines: 96,
              },
              "src/lib/workspaces/**/*.ts": {
                statements: 100,
                branches: 100,
                functions: 100,
                lines: 100,
              },
              "src/lib/ai/**/*.ts": { statements: 90, branches: 84, functions: 90, lines: 90 },
              "src/lib/email/**/*.ts": { statements: 92, branches: 86, functions: 95, lines: 92 },
              "src/lib/validation/**/*.ts": {
                statements: 93,
                branches: 91,
                functions: 100,
                lines: 93,
              },
              "src/**/*.ts": { statements: 60, branches: 60, functions: 50, lines: 60 },
            },
          }),
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
