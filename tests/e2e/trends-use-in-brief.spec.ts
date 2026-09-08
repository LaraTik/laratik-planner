import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * "Use in brief" — clicking the button on a trend card pre-fills the
 * QuickCreate drawer with the trend's label as the topic seed.
 *
 * Test strategy:
 *   1. Visit the Trends page.
 *   2. Click "Use in brief" on the first card.
 *   3. QuickCreate drawer opens with the trend label visible in the
 *      "Topic" field.
 */

test.describe("Trend Radar — Use in brief", () => {
  const workspaceSlug = "trend-brief";
  test.beforeEach(async ({ page }) => {
    await bootstrapTestSession(page, { agencySlug: "trend-brief-agency", workspaceSlug });
    const source = await page.request.post("/api/dev/trend-source/force-open", {
      data: { sourceKey: "tiktok_creative_center" },
    });
    if (!source.ok()) throw new Error(`Failed to enable trend source: ${source.status()}`);
    const response = await page.request.post("/api/dev/trend-signal", {
      data: { workspaceSlug },
    });
    if (!response.ok()) throw new Error(`Failed to seed trend signal: ${response.status()}`);
  });

  test("clicking Use in brief opens QuickCreate with the trend label", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.goto(`/app/w/${workspaceSlug}/trends`);

    // Wait for at least one card.
    const card = page.getByTestId("trend-card").first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Capture the label text.
    const label = await card.getByTestId("trend-label").innerText();

    // Click "Use in brief".
    const useInBrief = card.getByRole("button", { name: /use in brief/i });
    await useInBrief.click();

    // Quick Create opens with the validated trend signal in the URL.
    await expect(page).toHaveURL(/\/planning\/new\?trendSignalId=/);

    // The title and brief are pre-filled from the trend label.
    await expect(page.getByTestId("quick-create-form")).toBeVisible();
    await expect(page.locator('input[name="title"]')).toHaveValue(label);
  });
});
