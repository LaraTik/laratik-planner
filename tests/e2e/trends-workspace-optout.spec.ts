import { test, expect, type Page } from "@playwright/test";

/**
 * Workspace-level opt-out — a workspace that has opted out of TikTok
 * should not see TikTok cards on its Trends page even if the agency
 * has TikTok enabled globally.
 *
 * Test strategy:
 *   1. Visit the workspace's Trend settings page.
 *   2. Opt out of TikTok.
 *   3. Visit the Trends page.
 *   4. No TikTok card is rendered; the opt-out is recorded.
 */

test.describe("Trend Radar — workspace opt-out", () => {
  test("opting out of TikTok hides TikTok trends from the page", async ({
    page,
  }: {
    page: Page;
  }) => {
    // Step 1: settings page.
    await page.goto("/app/w/demo/settings/trends");

    // Step 2: opt out via the toggle.
    const toggle = page.getByTestId("optout-toggle-tiktok_tamnd");
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Confirm in the modal.
    const confirm = page.getByTestId("optout-confirm");
    await confirm.click();

    // Step 3: visit the trends page.
    await page.goto("/app/w/demo/trends");

    // Step 4: the opt-out badge for TikTok is shown.
    const optoutBadge = page.getByTestId("trends-optout-badge-tiktok_tamnd");
    await expect(optoutBadge).toBeVisible();
    await expect(optoutBadge).toContainText(/tiktok/i);

    // No trend card has the tiktok data attribute.
    const tiktokCards = page.locator('[data-platform="tiktok"]');
    await expect(tiktokCards).toHaveCount(0);
  });
});
