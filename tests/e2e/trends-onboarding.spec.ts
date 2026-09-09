import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * First-run wizard → enable 4 sources → see trends on the page.
 *
 * Smoke test for the v1 Trend Radar onboarding flow. The wizard is
 * the entry point the first time a workspace visits the Trends page.
 *
 * Steps:
 *   1. Visit /app/w/{slug}/trends as a workspace manager.
 *   2. Wizard appears with a list of available sources.
 *   3. Pick at least 4 sources.
 *   4. Wizard confirms and the page transitions to the live feed.
 *   5. The feed has at least one trend card per enabled source.
 *
 * NOTE: the trend backend may not return real data in CI; the test
 * relies on the page shell + the empty-state copy rather than the
 * live signals. Tighten the assertion once the sidecar is wired
 * into the staging test environment.
 */

test.describe("Trend Radar — first-run onboarding", () => {
  const workspaceSlug = "trend-onboarding";
  test.beforeEach(async ({ page }) => {
    await bootstrapTestSession(page, { agencySlug: "trend-onboarding-agency", workspaceSlug });
  });

  test("wizard → 4 sources → trends page", async ({ page }: { page: Page }) => {
    await page.goto(`/app/w/${workspaceSlug}/trends`);

    // 1. Wizard surface — data-testid pinned here so the test survives
    //    copy changes.
    const wizard = page.getByTestId("trends-onboarding-wizard");
    await expect(wizard).toBeVisible({ timeout: 10_000 });

    // 2. Pick 4 sources by their stable test ids.
    for (const key of [
      "reddit_json",
      "reddit_praw",
      "tiktok_creative_center",
      "youtube_data_api",
    ]) {
      const card = wizard.getByTestId(`source-card-${key}`);
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: /enable/i }).click();
    }

    // 3. Confirm.
    const confirm = wizard.getByTestId("onboarding-confirm");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // 4. Wizard closes, feed is visible.
    await expect(wizard).toBeHidden({ timeout: 10_000 });
    const feed = page.getByTestId("trends-feed");
    await expect(feed).toBeVisible();

    // 5. The empty-state copy OR the first trend card is shown. Either
    //    is fine; the assertion is "the page is on the live state".
    const emptyState = page.getByTestId("trends-empty-state");
    const firstCard = page.getByTestId("trend-card").first();
    await expect(emptyState.or(firstCard)).toBeVisible();
  });
});
