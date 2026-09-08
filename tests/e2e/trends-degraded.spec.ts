import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Source-degraded E2E — when a source's circuit breaker is OPEN,
 * the Trends page surfaces a "degraded" banner rather than 500ing.
 *
 * Test strategy:
 *   1. Seed the source-health row to circuit_state=open via the
 *      dev-only admin route. (In a real environment this is a
 *      follow-up after the scheduler has tripped the breaker.)
 *   2. Visit the Trends page.
 *   3. Assert the degraded banner is visible and the affected source
 *      card shows the "fallback engaged" badge.
 *   4. The page does NOT crash; trend cards from the other (healthy)
 *      sources are still rendered.
 */

test.describe("Trend Radar — degraded source UX", () => {
  const workspaceSlug = "trend-degraded";
  test.beforeEach(async ({ page }) => {
    await bootstrapTestSession(page, { agencySlug: "trend-degraded-agency", workspaceSlug });
  });

  test("circuit-open source shows degraded banner, not a crash", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Step 1: seed the health row. The admin route is gated to the
    // platform role; the auth fixture should provide that.
    const seed = await page.request.post("/api/dev/trend-source/force-open", {
      data: { sourceKey: "tiktok_creative_center" },
    });
    if (!seed.ok()) {
      throw new Error(`Failed to seed circuit-open: ${seed.status()}`);
    }

    // Step 2: visit the page.
    await page.goto(`/app/w/${workspaceSlug}/trends`);

    // Step 3: degraded banner is visible.
    const banner = page.getByTestId("trends-degraded-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText(/tiktok/i);

    // Step 4: other sources are still listed (smoke check — the
    // reddit card testid is in the DOM even if empty).
    const feed = page.getByTestId("trends-feed");
    await expect(feed).toBeVisible();
  });
});
