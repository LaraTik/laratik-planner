import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Regression guard for the meta-refresh a11y P1 (WCAG 2.2.2).
 *
 * History: the per-route axe-core scan (`pnpm test:a11y`) found 3
 * critical meta-refresh violations on /app, /app/w/[slug], and
 * /app/w/[slug]/planning because the page-level redirect to /signin
 * (in every src/app/(app)/app page) was the only auth gate. Next.js
 * server-renders those redirects as a meta http-equiv=refresh tag
 * (Next.js writes content="0;url=/signin"), which axe flags.
 *
 * The fix: `src/proxy.ts` (Next.js 16's renamed `middleware.ts`) returns
 * a real `NextResponse.redirect()` 307 for unauthenticated `/app/*` and
 * `/api/*` requests, so the page-level `redirect()` is never reached and
 * the meta-refresh tag is never rendered.
 *
 * These tests assert the proxy contract directly (not via axe) so a
 * future regression that swaps proxy for a page-level redirect gets
 * caught at the unit/e2e layer too. Failing assertions to watch for:
 *  - status !== 307 on unauth /app/*
 *  - body contains <meta http-equiv="refresh">
 *  - body contains __next-page-redirect
 *  - status on /api/auth/* !== 200/404
 *  - signed-in /signin does not redirect to /app
 *
 * Pairs with:
 *  - tests/e2e/auth-gate.spec.ts (page-level UX of the redirect)
 *  - tests/e2e/a11y-routes.spec.ts (axe-core sweep, includes meta-refresh rule)
 *  - tests/unit/auth-proxy.test.ts (structural guard on getToken() args)
 */

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Helper: fetch a path and return the raw response (Playwright follows
 * redirects by default; we want to assert the 307 + Location header so
 * we disable the follow with `maxRedirects: 0`).
 */
async function raw(request: APIRequestContext, path: string) {
  return request.get(path, { maxRedirects: 0 });
}

test.describe("auth proxy: unauthenticated /app/* returns 307 + Location, no meta-refresh", () => {
  const PROTECTED_APP_ROUTES = [
    "/app",
    "/app/workspaces",
    "/app/account",
    "/app/users",
    "/app/w/acme",
    "/app/w/acme/planning",
    "/app/w/acme/calendar",
    "/app/agency-settings",
  ];

  for (const route of PROTECTED_APP_ROUTES) {
    test(`unauthed ${route} → 307 to /signin, no meta-refresh`, async ({ request }) => {
      const res = await raw(request, route);

      // 1. The proxy MUST return a 3xx redirect. Anything < 300 means
      //    the page rendered, which is the bug.
      expect(
        res.status(),
        `${route} expected 3xx redirect from proxy, got ${res.status()}`,
      ).toBeGreaterThanOrEqual(300);
      expect(
        res.status(),
        `${route} expected 3xx redirect from proxy, got ${res.status()}`,
      ).toBeLessThan(400);

      // 2. The Location header must point at /signin.
      const location = res.headers()["location"] ?? "";
      expect(location, `${route} expected Location: /signin...`).toMatch(/\/signin/);
      expect(location, `${route} expected callbackUrl round-trip in Location`).toContain(
        "callbackUrl=",
      );

      // 3. The response body MUST NOT contain the meta-refresh tag that
      //    Next.js renders when a server component calls redirect().
      //    This is the actual axe-core assertion in a focused form.
      const body = await res.text();
      expect(body, `${route} response must not contain <meta http-equiv="refresh">`).not.toMatch(
        /<meta\s+http-equiv=["']refresh["']/i,
      );
      expect(body, `${route} response must not contain #__next-page-redirect`).not.toContain(
        "__next-page-redirect",
      );
    });
  }
});

test.describe("auth proxy: unauthenticated /api/* (non-auth) returns 3xx", () => {
  test("unauthed POST /api/ai/generate → 3xx (never 2xx)", async ({ request }) => {
    const res = await request.post("/api/ai/generate", {
      data: {},
      maxRedirects: 0,
    });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.status()).toBeLessThan(400);
  });
});

test.describe("auth proxy: public routes stay public (no redirect, no auth check)", () => {
  const PUBLIC_ROUTES = ["/", "/signin", "/signin/verify", "/signin/forgot-password", "/setup"];

  for (const route of PUBLIC_ROUTES) {
    test(`unauthed ${route} → 2xx, no redirect to /signin`, async ({ request }) => {
      const res = await raw(request, route);
      // Public routes must render or 404, never redirect to /signin
      // just because the user is unauthenticated.
      expect(res.status(), `${route} public route returned ${res.status()}`).toBeLessThan(300);
      const location = res.headers()["location"] ?? "";
      expect(location, `${route} must not redirect to /signin for unauth visitors`).not.toMatch(
        /\/signin/,
      );
    });
  }
});

test.describe("auth proxy: NextAuth callback routes stay public", () => {
  // The proxy must NOT block /api/auth/callback/* — NextAuth handles
  // those routes itself, and blocking them would silently break OAuth
  // and magic-link sign-in.
  test("GET /api/auth/session → 2xx (no auth gate)", async ({ request }) => {
    const res = await raw(request, "/api/auth/session");
    expect(res.status()).toBeLessThan(300);
  });

  test("GET /api/auth/providers → 2xx (no auth gate)", async ({ request }) => {
    const res = await raw(request, "/api/auth/providers");
    expect(res.status()).toBeLessThan(300);
  });

  test("GET /api/auth/csrf → 2xx (no auth gate)", async ({ request }) => {
    const res = await raw(request, "/api/auth/csrf");
    expect(res.status()).toBeLessThan(300);
  });
});

test.describe("auth proxy: signed-in user on /signin redirects to /app", () => {
  test("authed GET /signin → 3xx to /app", async ({ page }) => {
    const { devSignIn } = await import("./_helpers");
    await devSignIn(page.request);
    const res = await raw(page.request, "/signin");
    expect(res.status(), `authed /signin expected 3xx, got ${res.status()}`).toBeGreaterThanOrEqual(
      300,
    );
    const location = res.headers()["location"] ?? "";
    expect(
      location,
      `authed /signin must redirect to /app or /setup, got Location: ${location}`,
    ).toMatch(/\/(app|setup)/);
  });
});

test.describe("auth proxy: authed /app/* still renders without redirect (regression for getToken cookie-name bug)", () => {
  // This is the positive-path counterpart of the meta-refresh bug. If
  // the proxy's getToken() fails to read the dev sign-in cookie (the
  // silent bug that started this whole thread — see
  // tests/unit/auth-proxy.test.ts for the structural fix), every
  // /app/* page would round-trip /app → /signin → /app and never
  // render. The a11y scan's 30s timeout downstream of /app/w/[slug]/planning/[id]
  // is exactly this symptom.
  test("authed GET /app → 200, body contains the page header", async ({ page }) => {
    const { devSignIn } = await import("./_helpers");
    await devSignIn(page.request);
    const res = await raw(page.request, "/app");
    expect(
      res.status(),
      `authed /app expected 200, got ${res.status()} (proxy may be reading the wrong cookie name)`,
    ).toBe(200);
    const body = await res.text();
    // The page should render its title, not a redirect target
    expect(body).toContain("My Work");
    expect(body).not.toMatch(/<meta\s+http-equiv=["']refresh["']/i);
  });
});
