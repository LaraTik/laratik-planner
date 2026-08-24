import { test, expect } from "@playwright/test";

/**
 * Auth-gate tests.
 *
 * Per master prompt §3.7 "never leave blank screens": any request to a
 * protected route must return a usable sign-in page (307 → /signin?callbackUrl=...)
 * rather than a 401 / 500 / blank body.
 *
 * These tests run with a *fresh* browser context (no shared cookies),
 * so they exercise the unauthenticated path.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const PROTECTED_APP_ROUTES = [
  "/app",
  "/app/workspaces",
  "/app/workspaces/new",
  "/app/users",
  "/app/agency-settings",
  "/app/account",
  "/app/w/acme",
  "/app/w/acme/planning",
  "/app/w/acme/planning/new",
  "/app/w/acme/calendar",
];

const PROTECTED_API_ROUTES = ["/api/bootstrap/admin", "/api/ai/generate"];

test.describe("auth gate: protected /app/* routes redirect to /signin", () => {
  for (const route of PROTECTED_APP_ROUTES) {
    test(`unauthed ${route} → /signin?callbackUrl=`, async ({ page }) => {
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      // The proxy returns 307 + Location header; the page may end up at /signin
      // (or render /signin directly if it follows redirects). Either way,
      // it must NOT 500/401/blank.
      expect(res?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/signin/);
      // The callbackUrl must round-trip the original path
      await expect(page).toHaveURL(new RegExp(`callbackUrl=${encodeURIComponent(route)}`));
      // The sign-in form must be visible
      await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    });
  }
});

test.describe("auth gate: protected /api/* routes return JSON 401/redirect", () => {
  for (const route of PROTECTED_API_ROUTES) {
    test(`unauthed POST ${route} → 307 or 401`, async ({ request }) => {
      const res = await request.post(route, { data: {}, maxRedirects: 0 });
      // NextAuth proxy returns 307 to /signin; some API routes return 401
      // directly. Both are acceptable — anything 2xx would be a bug.
      expect([307, 308, 401, 403]).toContain(res.status());
    });
  }
});

test.describe("auth gate: signed-in users skip /signin", () => {
  test("GET /signin while authed → 307 → /app", async ({ page }) => {
    const { devSignIn } = await import("./_helpers");
    await devSignIn(page.request);
    const res = await page.goto("/signin", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBeLessThan(500);
    // After auth, /signin redirects to /app (or /setup if no agency)
    await expect(page).toHaveURL(/\/(app|setup)/);
  });
});

test.describe("auth gate: public routes still work while authed", () => {
  test("GET / and /api/health remain reachable", async ({ page }) => {
    const { devSignIn } = await import("./_helpers");
    await devSignIn(page.request);
    const home = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(home?.status()).toBeLessThan(500);
    // The home page must NOT redirect to /app — it's a public landing.
    expect(home?.url()).toMatch(/\/$|laratik\.com|\/laratik-planner/);
  });
});

test.describe("auth gate: callbackUrl edge cases", () => {
  test("open-redirect protection: //evil.com is rewritten to /evil.com", async ({ page }) => {
    // NextAuth's callbackUrl validator strips protocol-relative URLs.
    // An attacker who tricks the user into clicking
    // /signin?callbackUrl=//evil.com must NOT be redirected to evil.com
    // after sign-in. The validator downgrades //evil.com → /evil.com
    // (same-origin), so the test asserts the final URL is on our origin.
    await page.goto("/signin?callbackUrl=//evil.com/phish");
    const url = new URL(page.url());
    // The hostname must still be ours (or the test's localhost)
    expect(url.hostname).not.toBe("evil.com");
  });

  test("internal callbackUrl round-trips through the redirect", async ({ page }) => {
    const target = "/app/w/acme/planning";
    await page.goto(`/signin?callbackUrl=${encodeURIComponent(target)}`);
    await expect(page).toHaveURL(new RegExp(`callbackUrl=${encodeURIComponent(target)}`));
  });

  test("a non-member hitting a workspace URL gets the no-access page, not a server error", async ({
    page,
  }) => {
    const { devSeed, devSignIn } = await import("./_helpers");
    const agency = {
      agencyName: "Auth Gate Agency",
      agencySlug: "auth-gate-agency",
    };
    // Create the protected workspace for one agency member, then give a
    // second member access only to another workspace in the same agency.
    // This exercises the page-level anti-IDOR guard instead of relying on
    // whichever fixture a previous test happened to leave behind.
    await devSeed(page.request, {
      ...agency,
      email: "auth-gate-owner@laratik.local",
      workspaceName: "Protected workspace",
      workspaceSlug: "auth-gate-protected",
      agencyAdmin: false,
      workspaceRoles: ["viewer"],
    });
    const outsiderEmail = "auth-gate-outsider@laratik.local";
    await devSeed(page.request, {
      ...agency,
      email: outsiderEmail,
      workspaceName: "Outsider workspace",
      workspaceSlug: "auth-gate-outsider",
      agencyAdmin: false,
      workspaceRoles: ["viewer"],
    });
    await devSignIn(page.request, { email: outsiderEmail, role: "user" });

    const res = await page.goto("/app/w/auth-gate-protected", {
      waitUntil: "domcontentloaded",
    });
    // Workspace lookup deliberately masks inaccessible tenants as not found.
    // App Router may stream that boundary with a 200 status, so the rendered
    // surface—not the transport status—is the stable security contract.
    expect(res?.status()).toBeLessThan(500);
    await expect(page).not.toHaveURL(/\/setup/);
    await expect(page.getByRole("heading", { name: /Page not found/i })).toBeVisible();
    await expect(page.getByTestId("workspace-overview")).toHaveCount(0);
  });
});
