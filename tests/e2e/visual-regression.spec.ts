import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapTestSession, devSeed, devSignIn, type SeedResult } from "./_helpers";
import {
  CANONICAL_SURFACES,
  REGRESSION_VIEWPORTS,
  SETUP_FUNCTIONS,
  STITCH_CASES,
  responsiveScreenshotName,
  resolveStitchRoute,
  screenshotNameFor,
  type RegressionViewport,
  type SeedResultLike,
} from "./stitch-cases";

/**
 * Visual regression coverage for the canonical Stitch screen set.
 *
 * Two phases, both driven by the typed manifest in
 * `tests/e2e/stitch-cases.ts`:
 *
 *   1. **Exact reference** — one screenshot per active Stitch case
 *      (`canonical` / `responsive` / `supporting`) at the viewport
 *      the case was captured at. Names contain the screen ID and
 *      classification so reviewers can map every PNG to its source
 *      capture in `designs/stitch/`.
 *
 *   2. **Responsive matrix** — one screenshot per canonical surface
 *      (unique route from the 27 canonical cases) at every regression
 *      viewport. 23 routes × 6 viewports = 138 baselines that lock in
 *      the responsive layout the Stitch captures only sample at three
 *      widths. The `operational-states` evidence group is not a route
 *      and is reviewed directly against the captured PNG/HTML.
 *
 * Dynamic data (timestamps, IDs, hash-like strings) is masked via
 * injected CSS so baselines stay stable across runs.
 *
 * Two run modes, controlled by `PW_VISUAL_CAPTURE`:
 *
 *   - **ASSERT (default)** — the compare step (`pnpm test:e2e:critical`
 *     / `pnpm test:visual`) gates the build. a11y must be clean and
 *     every screenshot must match the committed baseline. A broken
 *     route fails the build so humans are alerted.
 *   - **WRITE (CI capture)** — the capture step (`pnpm
 *     test:visual:update` in CI) tolerates pre-existing a11y
 *     violations, broken routes, and dev-sign-in 500s. The spec
 *     writes what it can to the snapshot directory and logs the
 *     broken routes for follow-up. The capture step NEVER fails the
 *     build; the a11y + screenshot contract is enforced by the
 *     separate `pnpm test:a11y` and `pnpm test:e2e:critical` steps.
 *
 * Setup:
 *   PW_VISUAL_CAPTURE=1 pnpm test:visual:update   # write candidates
 *   pnpm test:visual                              # compare against baselines
 *
 * The spec runs in the dedicated `visual-chromium` project (see
 * `playwright.config.ts`) so the 6-viewport matrix does not repeat
 * across the 5 functional browser projects.
 */

/**
 * Task 9: capture-mode flag. When set, the spec tolerates pre-existing
 * a11y violations, broken routes, and dev-sign-in failures so the CI
 * capture step can commit as many baselines as possible in a single
 * run. The compare step never sets this flag and still gates the
 * build with strict a11y + screenshot comparison.
 */
const isCaptureMode = process.env.PW_VISUAL_CAPTURE === "1";
console.log(`[visual] capture mode: ${isCaptureMode ? "WRITE" : "ASSERT"}`);

/**
 * Resolved snapshot directory used by `page.screenshot({ path })` in
 * capture mode. Hard-coding the relative path keeps the filename
 * contract identical to the `toHaveScreenshot` path that the
 * compare step uses (`testInfo.snapshotPath(safeName)` resolves to
 * the same file via `playwright.config.ts → snapshotPathTemplate`),
 * so the two modes produce byte-for-byte equivalent PNGs.
 */
const SNAPSHOT_DIR = "tests/e2e/visual-regression.spec.ts-snapshots";

const A11Y_TAGS = ["wcag2a", "wcag2aa", "wcag22aa"] as const;

/**
 * Per-test timeout in capture mode. The dev-sign-in 500 on the
 * Linux runner can stall a route past the 30s default; 20s is
 * short enough to fail fast and let the next case run, and long
 * enough to let a healthy route complete on first hit (lazy
 * compilation in dev). The compare step keeps the 30s default so
 * a slow-but-correctly-rendered page does not falsely fail.
 */
const CAPTURE_MODE_TIMEOUT_MS = 20_000;

/**
 * CSS injected before each screenshot to hide volatile content
 * (timestamps, IDs, hash-like strings). Pure CSS can't run regex
 * against text content, so this targets the common element /
 * attribute patterns that render those values. Combined with the
 * `mask` option on each screenshot for anything that slips through,
 * this keeps baselines stable while we iterate on UI.
 */
const DYNAMIC_DATA_MASK_CSS = `
  time,
  [data-timestamp],
  [datetime],
  [data-date],
  [data-created-at],
  [data-updated-at],
  [data-published-at],
  [data-deleted-at] {
    color: transparent !important;
    text-shadow: none !important;
    background-color: transparent !important;
  }
  [data-id],
  [data-record-id],
  [data-uuid],
  [data-hash],
  code,
  pre,
  kbd,
  samp {
    color: transparent !important;
    text-shadow: none !important;
    background-color: transparent !important;
  }
`;

/**
 * Map a resolved route to a stable `data-testid` selector we can wait
 * for. The harness should always wait for a known DOM hook before
 * taking a screenshot, so the baseline reflects a real page state
 * rather than a navigation transition.
 */
const STABLE_TESTID: Record<string, string> = {
  "/": "landing-page",
  "/signin": "signin-page",
  "/signin/forgot-password": "forgot-password-page",
  "/setup": "setup-page",
  "/app": "my-work-kpi-row",
  "/app/workspaces": "workspaces-kpi-row",
  "/app/workspaces/new": "workspaces-new-form",
  "/app/users": "users-kpi-row",
  "/app/agency-settings": "agency-settings",
  "/app/account": "account-page",
  "/app/w/acme": "workspace-overview",
  "/app/w/acme/planning": "workspace-planning",
  "/app/w/acme/planning/new": "workspace-planning-new",
  "/app/w/acme/planning/batch": "workspace-planning-batch",
  "/app/w/acme/board": "workspace-board",
  "/app/w/acme/calendar": "workspace-calendar",
  "/app/w/acme/reviews": "reviews-kpi-row",
  "/app/w/acme/design-queue": "workspace-design-queue",
  "/app/w/acme/channels": "channels-table",
  "/app/w/acme/brand-kit": "brand-kit-add-asset",
  "/app/w/acme/team": "workspace-team",
  "/app/w/acme/settings": "workspace-settings",
  "/app/w/acme/library": "library-campaigns",
  "/app/w/acme/ai-settings": "workspace-ai-settings",
  "/app/w/acme/client": "workspace-client-review",
  "/app/w/acme/client/calendar": "workspace-client-calendar",
  "/app/w/acme/planning/{contentItemId}": "workspace-content-detail",
};

async function waitForStableDom(page: Page, route: string, timeoutMs: number): Promise<void> {
  // Wait for the page to be visually stable: no pending network and the
  // body is non-empty. This is intentionally lenient — we don't want
  // the capture step to fail because a specific data-testid is missing.
  // The compare step relies on the route having rendered enough to be
  // visually stable, not on a specific testid being present.
  const preferredTestid = STABLE_TESTID[route];
  const targetSelector = preferredTestid
    ? [`[data-testid="${preferredTestid}"]`, "[data-testid]", "main", '[role="main"]'].join(", ")
    : '[data-testid], main, [role="main"]';

  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {
    // Some pages have long-polling or never-idle networks; treat as a
    // soft signal. The page is still usable.
  });
  // Wait for at least one of the candidate hooks to be visible. If the
  // preferred testid is present, prefer it; otherwise any testid/main
  // is good enough — a page with none of these is genuinely broken and
  // the outer try/catch in the test will log and continue.
  await page
    .locator(targetSelector)
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .catch(() => {
      // Even the lenient fallback can fail; the outer try/catch in
      // the test will log the broken route and continue.
    });
}

async function assertNoCriticalA11y(page: Page, context: string): Promise<void> {
  let results: Awaited<ReturnType<AxeBuilder["analyze"]>> | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      results = await new AxeBuilder({ page }).withTags([...A11Y_TAGS]).analyze();
      break;
    } catch (error) {
      const isNavigationRace =
        error instanceof Error && error.message.includes("Execution context was destroyed");
      if (!isNavigationRace || attempt === 1) throw error;
      await page.waitForLoadState("domcontentloaded");
    }
  }
  if (!results) throw new Error(`Could not scan ${context}`);
  const critical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  expect(critical, `${context} has ${critical.length} critical/serious a11y violation(s)`).toEqual(
    [],
  );
}

/**
 * Capture-mode a11y scan. Runs axe with the same tags as the strict
 * path but never throws — the result is logged so follow-up can
 * triage the route. The dedicated `pnpm test:a11y` suite enforces
 * the contract in a separate run.
 */
async function logA11yIfBroken(page: Page, context: string): Promise<void> {
  try {
    const results = await new AxeBuilder({ page }).withTags([...A11Y_TAGS]).analyze();
    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    if (critical.length > 0) {
      console.warn(
        `[visual] ${context} has ${critical.length} critical/serious a11y violation(s) — capture continues`,
      );
    }
  } catch (error) {
    console.warn(`[visual] ${context} axe scan failed:`, error);
  }
}

async function applyMask(page: Page): Promise<void> {
  await page.addStyleTag({ content: DYNAMIC_DATA_MASK_CSS });
}

/**
 * Surface the data-testid or evidence-group name for a Stitch case
 * so the visual harness can name snapshots deterministically.
 */
const caseLabel = (entry: (typeof STITCH_CASES)[number]): string =>
  entry.route ?? entry.evidenceGroup ?? entry.screenId;

/**
 * Log a short, single-line summary of a bootstrap failure so the
 * capture CI log makes the broken-route list easy to grep without
 * dumping the full stack.
 */
const formatBootstrapError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

// ─── Phase 1: exact reference (one capture per active case) ─────────────

test.describe("visual regression (exact reference)", () => {
  for (const entry of STITCH_CASES) {
    if (entry.classification === "historical" || entry.classification === "superseded") {
      continue; // excluded from implementation targets
    }
    if (!entry.route) {
      // Shared evidence group (operational-states, notification-drawer).
      // The drawer case routes to `/app` and the operational-states case
      // routes to a representative surface for the matrix; both are
      // exercised by their `SETUP_FUNCTIONS[state]` helper.
      continue;
    }

    test(`${entry.classification} ${entry.screenId} ${caseLabel(entry)}`, async ({
      page,
    }, testInfo) => {
      if (isCaptureMode) {
        // Fail fast on broken routes in capture mode so the suite
        // moves on to the next case instead of burning the full
        // 30s default. The compare step keeps the 30s default.
        testInfo.setTimeout(CAPTURE_MODE_TIMEOUT_MS);
      }

      const viewport: RegressionViewport = {
        name: "stitch",
        width: entry.viewport.width,
        height: entry.viewport.height,
      };

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const safeName = screenshotNameFor(entry, viewport);
      const screenshotPath = path.join(SNAPSHOT_DIR, safeName);

      // Bootstrap + setup + nav + mask. In capture mode, swallow
      // failures so a single broken route (dev-sign-in 500, route
      // 404, page error, etc.) does not kill the suite. In compare
      // mode, propagate the error so the build fails loudly.
      let seed: SeedResult;
      let resolved: string;
      try {
        seed = await bootstrapTestSession(page);
        const seedLike: SeedResultLike = seed;
        const setup = SETUP_FUNCTIONS[entry.state];
        resolved = resolveStitchRoute(entry.route!, seedLike);
        await setup(page, seedLike);
        await page.goto(resolved);
        await page.waitForLoadState("domcontentloaded");
        await waitForStableDom(page, entry.route!, CAPTURE_MODE_TIMEOUT_MS);
        await applyMask(page);
      } catch (error) {
        if (!isCaptureMode) throw error;
        console.warn(
          `[visual] ${entry.screenId} (${entry.route}) bootstrap failed: ${formatBootstrapError(error)}`,
        );
        return; // skip the route, write nothing
      }

      if (isCaptureMode) {
        // Log a11y issues without failing; the dedicated
        // pnpm test:a11y suite enforces these in a separate run.
        await logA11yIfBroken(page, `${entry.screenId} ${resolved}`);

        // Write the baseline. `fullPage: true` matches the
        // `toHaveScreenshot` default used by the compare step, so
        // capture and compare produce byte-equivalent PNGs.
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`[visual] captured ${entry.screenId} → ${screenshotPath}`);
        } catch (e) {
          console.warn(`[visual] ${entry.screenId} capture failed:`, e);
        }
      } else {
        // Compare mode: strict a11y + strict baseline comparison.
        await assertNoCriticalA11y(page, `${entry.screenId} ${resolved}`);
        // The compare path keeps the existing contract:
        // `testInfo.snapshotPath(safeName)` resolves the portable
        // `reference/...png` name through the
        // `snapshotPathTemplate` declared in playwright.config.ts.
        const referencePath = testInfo.snapshotPath(safeName);
        await expect(page).toHaveScreenshot(referencePath, {
          maxDiffPixelRatio: 0.01,
        });
      }
    });
  }
});

// ─── Phase 2: responsive matrix (canonical surface × viewport) ──────────
//
// In capture mode the matrix runs serially and the dev seed is
// established once per surface via `test.beforeAll`, not per
// (surface, viewport) pair. The seed is the slow part of the
// bootstrap (Next.js dev compilation + a real DB insert), so doing
// it once per surface instead of 6 times per surface trims minutes
// off the 25-min capture budget. The per-test sign-in is cheap — it
// just sets an auth cookie via the dev endpoint — so we still do it
// per test to get a fresh page context.
//
// In compare mode the matrix keeps the default parallel execution
// and a full `bootstrapTestSession` per test, because the compare
// step is already fast (warm dev server, real DB, no flake budget
// to spend) and the strict contract must not be weakened.
test.describe("visual regression (responsive matrix)", () => {
  if (isCaptureMode) {
    // Force sequential execution in capture mode so the dev server
    // is not being hammered by parallel tests. Each test triggers
    // some next.js dev compilation; doing them serially keeps the
    // wall-clock time bounded.
    test.describe.configure({ mode: "serial" });
  }
  for (const surface of CANONICAL_SURFACES) {
    test.describe(`surface ${surface}`, () => {
      // Shared across all viewports for this surface in capture
      // mode. Populated in `test.beforeAll`; each test still calls
      // `devSignIn` on its own page request context (cookie scope is
      // per-page-context), but the expensive `devSeed` is paid once.
      let sharedSeed: SeedResult | undefined;

      if (isCaptureMode) {
        test.beforeAll(async ({ request }) => {
          // The dev seed is idempotent, so re-seeding across
          // surfaces is fine; we just want one seed per surface
          // instead of one per (surface, viewport) pair.
          sharedSeed = await devSeed(request);
        });
      }

      for (const viewport of REGRESSION_VIEWPORTS) {
        test(`responsive ${surface} @ ${viewport.name}`, async ({ page }, testInfo) => {
          if (isCaptureMode) {
            testInfo.setTimeout(CAPTURE_MODE_TIMEOUT_MS);
          }

          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          // The seed gives us a contentItemId for the planning-detail
          // surface; the other surfaces ignore it.
          const responsiveName = responsiveScreenshotName(surface, viewport);
          const screenshotPath = path.join(SNAPSHOT_DIR, responsiveName);

          let seed: SeedResult;
          let resolved: string;
          try {
            if (isCaptureMode && sharedSeed) {
              // Reuse the surface's shared seed and only re-do the
              // (cheap) sign-in so the page context has the auth
              // cookie. This is the bulk of the capture-mode
              // time saving.
              await devSignIn(page.request);
              seed = sharedSeed;
            } else {
              seed = await bootstrapTestSession(page);
            }
            const seedLike: SeedResultLike = seed;
            resolved = resolveStitchRoute(surface, seedLike);
            await page.goto(resolved);
            await page.waitForLoadState("domcontentloaded");
            await waitForStableDom(page, surface, CAPTURE_MODE_TIMEOUT_MS);
            await applyMask(page);
          } catch (error) {
            if (!isCaptureMode) throw error;
            console.warn(
              `[visual] responsive ${surface} @ ${viewport.name} bootstrap failed: ${formatBootstrapError(error)}`,
            );
            return;
          }

          if (isCaptureMode) {
            await logA11yIfBroken(page, `responsive ${surface} @ ${viewport.name}`);
            try {
              await page.screenshot({ path: screenshotPath, fullPage: true });
              console.log(
                `[visual] captured responsive ${surface} @ ${viewport.name} → ${screenshotPath}`,
              );
            } catch (e) {
              console.warn(`[visual] responsive ${surface} @ ${viewport.name} capture failed:`, e);
            }
          } else {
            await assertNoCriticalA11y(page, `responsive ${surface} @ ${viewport.name}`);
            // The compare path keeps the existing contract:
            // `testInfo.snapshotPath(responsiveName)` resolves the
            // portable `responsive/...png` name through the
            // `snapshotPathTemplate` declared in playwright.config.ts.
            const responsivePath = testInfo.snapshotPath(responsiveName);
            await expect(page).toHaveScreenshot(responsivePath, {
              maxDiffPixelRatio: 0.01,
            });
          }
        });
      }
    });
  }
});
