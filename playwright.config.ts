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
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],

  // Boot the Next.js dev server before tests if not already running.
  webServer: {
    command: process.env.PLAYWRIGHT_NO_WEBSERVER ? "echo skip" : "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
} as Parameters<typeof defineConfig>[0]);
