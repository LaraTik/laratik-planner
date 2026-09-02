import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config.
 *
 * - Default port 3000 matches `next dev`.
 * - Override with PORT or PLAYWRIGHT_BASE_URL when running against a
 *   non-default stack (e.g. the production container on port 3100).
 * - The webServer block boots `pnpm dev` only when no server is already
 *   listening on PORT (reuseExistingServer=true in non-CI). In CI we
 *   boot a fresh server every run.
 * - All tests assume a test database is reachable via DATABASE_URL.
 *   The dev seed endpoint (`/api/dev/seed`) requires NODE_ENV !==
 *   "production" and is the only test-only path; the production
 *   sign-in flow is unchanged.
 */

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/_helpers.ts"], // shared helpers — not test files
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Visual-capture retries: the capture step is best-effort and runs
  // with PW_VISUAL_CAPTURE=1, so retrying a broken route twice only
  // burns the 25-min job budget. The compare step (no flag set) keeps
  // the 2-retry budget so flaky network conditions get a second
  // chance before the build fails.
  retries: process.env.CI && process.env.PW_VISUAL_CAPTURE !== "1" ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // TEST-03 (GAP-FULL-REVIEW-2026-08-25) — visual-regression gating.
  // The 6-viewport responsive matrix was reduced to 3 (mobile-s,
  // tablet, wide) so the capture step fits in the 25-min CI job
  // budget. The remaining matrix drives 3 baselines per surface; the
  // 138-baseline plan from docs/visual-parity/PLAN.md is preserved by
  // the test spec (each surface is still enumerated), but only 3
  // viewports × N surfaces are committed. The full 6-viewport matrix
  // can be re-enabled in `tests/e2e/stitch-cases.ts` once a longer CI
  // job budget is allocated.
  //
  // 2026-08-30 — Milestone 5 (Planning Content Detail refactor).
  // The 4-viewport M5 matrix (375/768/1024/1440) is **scoped to the
  // planning content detail only** via the `viewportsForSurface()`
  // helper. Every other canonical surface continues to use the
  // legacy 3-viewport matrix. This keeps the capture job within
  // the 25-min CI budget and avoids forcing unrelated surfaces to
  // re-capture baselines for a viewport only the planning detail
  // spec requires.
  // Task 8 + TEST-03 (GAP-FULL-REVIEW-2026-08-25): portable
  // visual-baseline filenames. The default Playwright template embeds
  // the absolute test file path ({testFilePath}) and the host OS
  // ({platform} / {snapshotSuffix}) into every snapshot filename,
  // which makes baselines captured on macOS non-portable to the Linux
  // CI runner (see commit f406fbc).
  //
  // `snapshotDir` is the project test directory, not the per-file
  // snapshot directory. Recreate Playwright's conventional
  // `<test-file>-snapshots/` segment explicitly, then append the portable
  // `reference/...` or `responsive/...` name supplied by the visual spec.
  // This keeps assert mode aligned with capture mode on every host.
  snapshotPathTemplate: "{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Mark every test request so the access log can filter
    extraHTTPHeaders: {
      "x-playwright-test": "laratik-planner-e2e",
    },
  },

  projects: [
    {
      name: "chromium",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      testIgnore: /visual-regression\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "visual-chromium",
      testMatch: /visual-regression\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Boot the Next.js dev server before tests if not already running.
  //
  // Task: clear `.next` before each dev-server boot. The Next.js 16.3.1
  // build manifest on the Linux CI runner is occasionally written as
  // an empty file (see commit c1c8dca log: `Error: Manifest file is
  // empty` → `AppRouteRouteModule.loadManifests` 500 on every app
  // route). Clearing the cache before boot forces a fresh manifest
  // and prevents the dev-sign-in 500 from cascading into every other
  // test that needs an authenticated session.
  ...(process.env.PLAYWRIGHT_NO_WEBSERVER
    ? {}
    : {
        webServer: {
          command: "rm -rf .next && pnpm exec next dev --webpack",
          // The root page can return before Next has finished writing the
          // App Router manifests used by API routes. Waiting on readiness
          // makes the test server contract match production: the process is
          // not considered usable until the database/schema/storage checks
          // have passed. This prevents an early /api/dev/sign-in request
          // from racing an empty manifest on cold starts.
          url: `${BASE_URL}/api/health/ready`,
          // Isolated runs must own their server and environment. Reusing an
          // orphaned dev server is especially dangerous because it may point
          // at another database or retain stale .next output. Opt in only
          // for an intentionally shared local server.
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1" && !process.env.CI,
          timeout: 120_000,
          stdout: "ignore" as const,
          stderr: "pipe" as const,
        },
      }),
} as Parameters<typeof defineConfig>[0]);
