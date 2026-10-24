import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/** A paid source reports a clear error when enabled without its required key. */

test.describe("Trend Radar — paid source without key", () => {
  test.beforeEach(async ({ page }) => {
    await bootstrapTestSession(page, {
      agencySlug: "trend-paid-agency",
      workspaceSlug: "trend-paid",
      enableTrendRadar: true,
    });
  });

  test("youtube_data_api without a key shows a graceful configuration error", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Visit the source admin page directly.
    await page.goto("/app/agency-settings/trend-sources");

    const card = page.getByTestId("source-card-youtube_data_api");
    await expect(card).toBeVisible();

    const enable = card.getByRole("button", { name: /enable/i });
    await enable.click();
    const errorBanner = card.getByTestId("source-enable-error");
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText(/api key|key|required/i);
    await expect(card.getByTestId("source-status-youtube_data_api")).toContainText(/disabled/i);

    await card.getByRole("button", { name: /configure/i }).click();
    await expect(card.getByTestId("source-config-youtube_data_api-key")).toBeVisible();
  });
});
