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
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Task 8: portable visual-baseline filenames. The default
  // Playwright template embeds the absolute test file path
  // ({testFilePath}) and the host OS ({platform} / {snapshotSuffix})
  // into every snapshot filename, which makes baselines captured on
  // macOS non-portable to the Linux CI runner (see commit f406fbc).
  // The reduced template keeps `{snapshotDir}` (the testDir) and
  // `{testFileName}-snapshots/` (the per-test snapshot directory)
  // so the snapshots still land in
  // `tests/e2e/visual-regression.spec.ts-snapshots/`, but drops
  // every token that would embed the absolute path, the project
  // name, or the host platform. The `{arg}` and `{ext}` are owned
  // by the helpers in `tests/e2e/stitch-cases.ts`, which produces
  // the same string on every host.
  snapshotPathTemplate: "{snapshotDir}/{testFileName}-snapshots/{arg}{ext}",

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
  ...(process.env.PLAYWRIGHT_NO_WEBSERVER
    ? {}
    : {
        webServer: {
          command: "pnpm exec next dev --webpack",
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "ignore" as const,
          stderr: "pipe" as const,
        },
      }),
} as Parameters<typeof defineConfig>[0]);
