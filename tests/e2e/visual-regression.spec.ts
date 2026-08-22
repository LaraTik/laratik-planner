import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapTestSession, type SeedResult } from "./_helpers";
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
 * Setup:
 *   pnpm test:visual:update   # capture candidates into __snapshots__/...
 *
 * Review:
 *   pnpm test:visual          # compare against committed baselines
 *
 * The spec runs in the dedicated `visual-chromium` project (see
 * `playwright.config.ts`) so the 6-viewport matrix does not repeat
 * across the 5 functional browser projects.
 */

const A11Y_TAGS = ["wcag2a", "wcag2aa", "wcag22aa"] as const;

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

async function waitForStableDom(page: Page, route: string): Promise<void> {
  const testid = STABLE_TESTID[route];
  if (testid) {
    await page.locator(`[data-testid="${testid}"]`).first().waitFor({ state: "visible" });
    return;
  }
  // Fallback: the page either has no testid hook or the route is
  // dynamic. Wait for the body to be in a quiescent state.
  await page.waitForLoadState("networkidle");
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

async function applyMask(page: Page): Promise<void> {
  await page.addStyleTag({ content: DYNAMIC_DATA_MASK_CSS });
}

/**
 * Surface the data-testid or evidence-group name for a Stitch case
 * so the visual harness can name snapshots deterministically.
 */
const caseLabel = (entry: (typeof STITCH_CASES)[number]): string =>
  entry.route ?? entry.evidenceGroup ?? entry.screenId;

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
      const viewport: RegressionViewport = {
        name: "stitch",
        width: entry.viewport.width,
        height: entry.viewport.height,
      };

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const seed: SeedResult = await bootstrapTestSession(page);
      const seedLike: SeedResultLike = seed;
      const setup = SETUP_FUNCTIONS[entry.state];

      const resolved = resolveStitchRoute(entry.route!, seedLike);
      const safeName = screenshotNameFor(entry, viewport);

      await setup(page, seedLike);
      await page.goto(resolved);
      await page.waitForLoadState("domcontentloaded");
      await waitForStableDom(page, entry.route!);
      await applyMask(page);

      await assertNoCriticalA11y(page, `${entry.screenId} ${resolved}`);

      // The exact-reference snapshots live in their own directory so
      // the responsive matrix and the per-case captures never collide.
      // The helper returns `reference/...png` (Task 8 — portable,
      // no absolute path, no host OS suffix); the Playwright
      // `snapshotPathTemplate` reduces that to
      // `<snapshotDir>/reference/<name>.png` on every host.
      const referencePath = testInfo.snapshotPath(safeName);
      await expect(page).toHaveScreenshot(referencePath, {
        maxDiffPixelRatio: 0.01,
      });
    });
  }
});

// ─── Phase 2: responsive matrix (canonical surface × viewport) ──────────

test.describe("visual regression (responsive matrix)", () => {
  for (const surface of CANONICAL_SURFACES) {
    for (const viewport of REGRESSION_VIEWPORTS) {
      test(`responsive ${surface} @ ${viewport.name}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        // The seed gives us a contentItemId for the planning-detail
        // surface; the other surfaces ignore it.
        const seed: SeedResult = await bootstrapTestSession(page);
        const seedLike: SeedResultLike = seed;

        const resolved = resolveStitchRoute(surface, seedLike);

        await page.goto(resolved);
        await page.waitForLoadState("domcontentloaded");
        await waitForStableDom(page, surface);
        await applyMask(page);

        await assertNoCriticalA11y(page, `responsive ${surface} @ ${viewport.name}`);

        // The responsive matrix snapshots live in their own directory
        // so the exact-reference loop and the matrix never collide.
        // The helper returns `responsive/...png` (Task 8 — portable,
        // no absolute path, no host OS suffix).
        const responsivePath = testInfo.snapshotPath(responsiveScreenshotName(surface, viewport));
        await expect(page).toHaveScreenshot(responsivePath, {
          maxDiffPixelRatio: 0.01,
        });
      });
    }
  }
});
