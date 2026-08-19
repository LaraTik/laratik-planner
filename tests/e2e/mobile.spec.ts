import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Mobile viewport (375×667) layout + touch-target checks.
 *
 * The mobile-chrome project (Pixel 7) is the default for these specs.
 * Some tests flip the viewport explicitly to cover both narrow mobile
 * and tablet widths.
 */

test.describe("Mobile layout (master prompt §3 — <768px)", () => {
  test("mobile bottom nav is visible on the My Work route", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
  });

  test("desktop sidebar is hidden at 375px, visible at 1280px", async ({ page }) => {
    await bootstrapTestSession(page);

    // The sidebar is an <aside> with class md:flex — only visible at md+
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app");
    const aside = page.locator("aside").first();
    await expect(aside).toBeHidden();

    // Widen — should appear
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    await expect(aside).toBeVisible();
  });

  test("bottom-nav tiles are at least 44px tall (touch target)", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
    const links = nav.getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box, `link #${i} should have a bounding box`).not.toBeNull();
      expect(box!.height, `link #${i} should be ≥44px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test("mobile topbar shows initials, desktop topbar shows the full user menu", async ({
    page,
  }) => {
    await bootstrapTestSession(page);

    // Mobile — initials in the mobile topbar (h-9 w-9 = 36px avatar)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app");
    // The mobile topbar's avatar has aria-label="Signed in as ..."
    const mobileAvatar = page.getByLabel(/Signed in as/i);
    await expect(mobileAvatar).toBeVisible();

    // Desktop — the user menu (a <Link> inside the topbar) shows the
    // name. Use the first matching link to disambiguate from the
    // sidebar footer link (also a Link to /app/account).
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    const userMenu = page.getByRole("link", { name: /Test User/i }).first();
    await expect(userMenu).toBeVisible();
  });
});
