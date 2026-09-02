import { test, expect } from "@playwright/test";

/**
 * Error-state coverage:
 *  - 404 page (notFound() in a server component)
 *  - Signin error banner for common NextAuth error codes
 *  - /app/* without a session → ends up on the signin page (not just a 307)
 *
 * The signin error banner has `role="alert"` and a distinctive class
 * (`bg-danger-subtle`). We use that to disambiguate from Next.js's
 * hidden route-announcer which also has `role="alert"`.
 */

test.describe("Error states", () => {
  test("unknown routes show the not-found page, not a blank screen", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByRole("heading", { name: /Page not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /My Work/i })).toBeVisible();
  });

  test("/app without a session lands on the signin page (not just a redirect chain)", async ({
    page,
  }) => {
    // No bootstrap — no session cookie
    await page.goto("/app");
    await expect(page).toHaveURL(/\/signin/);
    await expect(page.getByRole("heading", { name: /Sign in to your workspace/i })).toBeVisible();
    await expect(page.getByText(/Invitation-only access/i)).toBeVisible();
  });

  test("/signin?error=AccessDenied shows the access-denied banner", async ({ page }) => {
    await page.goto("/signin?error=AccessDenied");
    const banner = page.locator('[role="alert"].bg-danger-subtle');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/denied/i);
  });

  test("/signin?error=Verification shows the verification-link banner", async ({ page }) => {
    await page.goto("/signin?error=Verification");
    const banner = page.locator('[role="alert"].bg-danger-subtle');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/sign-in link|expired/i);
  });

  test("/signin?error=Configuration shows the configuration banner", async ({ page }) => {
    await page.goto("/signin?error=Configuration");
    const banner = page.locator('[role="alert"].bg-danger-subtle');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/not configured/i);
  });

  test("an unknown error code falls back to the default banner (no internal error leak)", async ({
    page,
  }) => {
    await page.goto("/signin?error=SomeInternalErrorCodeThatDoesNotExist");
    const banner = page.locator('[role="alert"].bg-danger-subtle');
    await expect(banner).toBeVisible();
    // Must not echo back the code itself
    await expect(banner).not.toContainText("SomeInternalErrorCodeThatDoesNotExist");
  });
});
