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

  test("account menu exposes build identity on mobile and desktop", async ({ page }) => {
    await bootstrapTestSession(page);

    // Mobile — the avatar is a 44px trigger for a focus-trapped sheet.
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app");
    const mobileMenu = page.getByTestId("user-menu-trigger-mobile");
    await expect(mobileMenu).toBeVisible();
    expect((await mobileMenu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await mobileMenu.click();
    await expect(page.getByTestId("user-menu-mobile")).toBeVisible();
    await expect(page.getByTestId("copy-build-info-sheet-action")).toBeVisible();

    // Desktop — the user menu is a button in the topbar (data-testid
    // "user-menu-trigger") with an aria-label that includes the user
    // name. The avatar inside the button also has the user's initial.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");
    const userMenu = page.getByTestId("user-menu-trigger");
    await expect(userMenu).toBeVisible();
    await userMenu.click();
    await expect(page.getByTestId("copy-build-info-menuitem")).toBeVisible();
  });

  test("account page shows build details without horizontal overflow", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/app/account");

    await expect(page.getByTestId("application-info-card")).toBeVisible();
    await expect(page.getByTestId("application-build-sha")).toBeVisible();
    await expect(page.getByTestId("copy-build-info-button")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      375,
    );
  });
});
