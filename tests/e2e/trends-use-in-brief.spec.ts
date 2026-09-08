import { test, expect, type Page } from "@playwright/test";

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
  test("clicking Use in brief opens QuickCreate with the trend label", async ({
    page,
  }: {
    page: Page;
  }) => {
    await page.goto("/app/w/demo/trends");

    // Wait for at least one card.
    const card = page.getByTestId("trend-card").first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Capture the label text.
    const label = await card.getByTestId("trend-label").innerText();

    // Click "Use in brief".
    const useInBrief = card.getByRole("button", { name: /use in brief/i });
    await useInBrief.click();

    // QuickCreate drawer opens.
    const drawer = page.getByTestId("quick-create-drawer");
    await expect(drawer).toBeVisible();

    // The topic field is pre-filled with the trend label.
    const topicField = drawer.getByTestId("quick-create-topic");
    await expect(topicField).toHaveValue(label);
  });
});
