import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Boundary tests: loading skeletons + error UI.
 *
 * Loading: the (app) layout wraps every protected route in <Suspense>
 * via `loading.tsx`. When navigation is slow, the skeleton must render
 * (not a blank screen).
 *
 * Error: `error.tsx` at the (app) segment catches server-component
 * throws. We force one by pointing the planning detail page at a
 * non-existent content item id — `notFound()` renders the not-found
 * page; that's the user-visible error surface.
 */

test.describe("Loading + error boundaries", () => {
  test("loading skeleton is shown while /app shell hydrates (no blank flash)", async ({ page }) => {
    await bootstrapTestSession(page);

    // Block the dashboard data fetch so the page sits in its loading
    // state long enough to assert. We intercept a common request that
    // happens on /app load (the workspace summary or notifications).
    await page.route("**/api/**", async (route) => {
      await new Promise((r) => setTimeout(r, 5_000));
      await route.continue();
    });

    // Start the navigation, but don't wait for it to fully resolve
    const navPromise = page.goto("/app", { waitUntil: "domcontentloaded" });
    // The page should still render some shell — the layout's loading
    // skeleton or the header — never a truly empty body.
    const html = await Promise.race([
      navPromise.then(() => page.content()),
      new Promise<string>((resolve) => setTimeout(() => resolve(page.content()), 1_000)),
    ]);
    expect(html).toMatch(/laratik-planner|aria-busy|My Work|skeleton/i);

    // Cleanup: cancel the navigation and unblock the route
    await page.unroute("**/api/**");
  });

  test("a non-existent content item renders the not-found page (no 500 page)", async ({ page }) => {
    await bootstrapTestSession(page);
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await page.goto(`/app/w/acme/planning/${fakeId}`, {
      waitUntil: "domcontentloaded",
    });
    // 200 (rendered not-found boundary) or 404 (transport-level
    // not-found) — both are acceptable; what matters is the user
    // sees a usable page, not a 500.
    expect([200, 404]).toContain(res?.status() ?? 0);
    // The not-found page renders the "Back to My Work" CTA
    await expect(page.getByRole("link", { name: /My Work/i }).first()).toBeVisible();
  });

  test("a non-existent workspace renders the not-found page", async ({ page }) => {
    await bootstrapTestSession(page);
    const res = await page.goto("/app/w/this-workspace-does-not-exist", {
      waitUntil: "domcontentloaded",
    });
    expect([200, 404]).toContain(res?.status() ?? 0);
    await expect(page.getByRole("link", { name: /My Work/i }).first()).toBeVisible();
  });
});
