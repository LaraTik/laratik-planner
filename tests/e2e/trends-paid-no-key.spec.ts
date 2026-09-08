import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Paid source with no API key — graceful error.
 *
 * TikTok via the official Research API requires a server-side key.
 * If the operator tries to enable the source without one, the UI
 * shows a friendly error rather than crashing the page.
 */

test.describe("Trend Radar — paid source without key", () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapTestSession(page, {
      agencySlug: "trend-paid-agency",
      workspaceSlug: "trend-paid",
    });
  });

  test("enabling youtube_data_api without a key shows a graceful error", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Visit the source admin page directly.
    await page.goto("/app/agency-settings/trend-sources");

    // The TikTok Research card exists.
    const card = page.getByTestId("source-card-youtube_data_api");
    await expect(card).toBeVisible();

    // The "Enable" button is rendered, but clicking surfaces a "missing
    // API key" inline error — not a 500.
    const enable = card.getByRole("button", { name: /enable/i });
    await enable.click();

    // Wait for either the inline error or a modal.
    const errorBanner = page.getByTestId("source-enable-error");
    await expect(errorBanner).toBeVisible({ timeout: 5_000 });
    await expect(errorBanner).toContainText(/api key|key|missing/i);
  });
});
