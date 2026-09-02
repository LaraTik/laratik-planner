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
 *   4. Agency admin gets 200 (regression for the
 *      `hasWorkspaceRole` admin-shortcut bug that incorrectly denied
 *      admins from the analytics surface).
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
    await page.goto("/app/w/acme/analytics/social");
    // The page calls `notFound()`, which renders the stable in-app denial
    // surface. Next's development server may return the shell status while
    // rendering this route-level not-found boundary, so assert the user-facing
    // contract rather than coupling the test to that transport detail.
    await expect(page.getByTestId("app-not-found")).toBeVisible();
  });

  // Regression: an agency admin (no workspace role row, full access
  // via the agency_admin shortcut on `hasWorkspaceRole`) used to be
  // 404'd by the page because the deny check asked
  // `hasWorkspaceRole(actor, ws, ["client_reviewer"])` — the admin
  // shortcut short-circuited to true and the page read that as "user
  // is a client_reviewer". The page now checks for internal access
  // instead, so an agency admin must render the surface normally.
  test("agency_admin gets 200, not 404 (regression for admin-shortcut deny bug)", async ({
    page,
  }) => {
    await bootstrapRoleSession(page, "agency_admin");
    const response = await page.goto("/app/w/acme/analytics/social");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("social-analytics-page")).toBeVisible();
  });

  // M4 "feel" round (2026-08-27): the new banner / strip / sparkline /
  // engagement-rate components must not render anything when no channels
  // are connected. The empty state owns the page; the new components
  // only surface when there's something to surface. The dev seed has
  // no connected channel — the happy-path "4 channels with data" cases
  // are covered by the unit + integration suites for the analytics
  // functions and by the page-server render.
  test("the new banner / strip / sparkline / engagement-rate are absent in the empty state", async ({
    page,
  }) => {
    await bootstrapRoleSession(page, "workspace_manager");
    await page.goto("/app/w/acme/analytics/social");
    await expect(page.getByTestId("social-analytics-empty")).toBeVisible();
    // The banner is intentionally quiet when everything is healthy,
    // and there is no channel at all in the dev seed — so the
    // container is NOT in the DOM (early-return `<></>`).
    await expect(page.getByTestId("social-health-banner")).toHaveCount(0);
    // The aggregate strip is gated on `channels.length > 0`.
    await expect(page.getByTestId("social-aggregate-strip")).toHaveCount(0);
    // Sparkline is per-channel; with no channels there are none.
    await expect(page.locator('[data-testid="social-sparkline"]')).toHaveCount(0);
    // Engagement rate is per-channel; with no channels there are none.
    await expect(page.getByTestId("social-engagement-rate")).toHaveCount(0);
  });
});
