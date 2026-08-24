import { test, expect } from "@playwright/test";
import { bootstrapRoleSession } from "./_helpers";

/**
 * M4 — social analytics dashboard E2E.
 *
 * Journey:
 *   1. Workspace manager navigates to the analytics page; the
 *      window selector and the empty-state are visible.
 *   2. The 7/30/90 window links navigate to the right URL.
 *   3. Client reviewer gets 404 (the page calls `notFound()` for
 *      `client_reviewer`).
 */

test.describe("M4 — social analytics dashboard", () => {
  test("renders the empty state when no channels are connected", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager");
    await page.goto("/app/w/acme/analytics/social");
    await expect(page.getByTestId("social-analytics-page")).toBeVisible();
    await expect(page.getByTestId("social-analytics-empty")).toBeVisible();
  });

  test("window selector offers 7/30/90 with the current window as aria-current", async ({
    page,
  }) => {
    await bootstrapRoleSession(page, "workspace_manager");
    await page.goto("/app/w/acme/analytics/social");
    await expect(page.getByTestId("window-7")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("window-30")).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("window-90")).not.toHaveAttribute("aria-current", "page");
  });

  test("navigating to ?window=30 makes the 30 link current", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager");
    await page.goto("/app/w/acme/analytics/social?window=30");
    await expect(page.getByTestId("window-30")).toHaveAttribute("aria-current", "page");
  });

  test("client_reviewer gets 404 (not redirect)", async ({ page }) => {
    await bootstrapRoleSession(page, "client_reviewer");
    const response = await page.goto("/app/w/acme/analytics/social");
    // The page calls `notFound()` which renders the 404 surface.
    expect(response?.status()).toBe(404);
  });
});
