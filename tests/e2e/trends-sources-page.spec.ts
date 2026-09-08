import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Sources page — agency admin view.
 *
 * Test strategy:
 *   1. Sign in as agency admin.
 *   2. Visit the trend sources page.
 *   3. The page shows 12+ source cards.
 *   4. Enable a free source with one click.
 *   5. Configure a paid source — its form reveals a key-input field.
 */

test.describe("Trend Radar — Sources admin page", () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapTestSession(page, {
      agencySlug: "trend-sources-agency",
      workspaceSlug: "trend-sources",
    });
  });

  test("admin sees 12+ sources and can enable / configure", async ({ page }: { page: Page }) => {
    // 1+2. Visit the admin page.
    await page.goto("/app/agency-settings/trend-sources");

    // 3. At least 12 source cards.
    const cards = page.locator('[data-testid^="source-card-"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(12);

    // 4. Enable a free source in one click.
    const freeCard = page.getByTestId("source-card-reddit_json");
    await expect(freeCard).toBeVisible();
    const freeEnable = freeCard.getByRole("button", { name: /enable/i });
    await freeEnable.click();
    await expect(page.getByTestId("source-status-reddit_json")).toHaveText(/enabled|active/i, {
      timeout: 5_000,
    });

    // 5. Configure a paid source — its form should reveal a key input.
    const paidCard = page.getByTestId("source-card-youtube_data_api");
    const configure = paidCard.getByRole("button", { name: /configure/i });
    await configure.click();

    const keyInput = page.getByTestId("source-config-youtube_data_api-key");
    await expect(keyInput).toBeVisible();
  });
});
