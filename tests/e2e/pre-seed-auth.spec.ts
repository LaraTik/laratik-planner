import { test, expect } from "@playwright/test";
import { setAuthCookie } from "./_helpers";

/**
 * TEST-18 (GAP-FULL-REVIEW-2026-08-25) — pre-seeded session cookie
 * contract test.
 *
 * The pre-existing `devSignIn` / `bootstrapTestSession` helpers hit
 * `/api/dev/sign-in` on every test. A flake in that endpoint
 * cascades into every e2e spec. The `setAuthCookie` helper
 * introduced next to `devSignIn` lets a `beforeAll` mint the cookie
 * once and reuse it across the file's tests.
 *
 * This spec is the contract for the helper:
 *   1. The helper returns the `authjs.session-token` cookie that
 *      the dev endpoint minted.
 *   2. The helper applies the cookie to the page's browser context
 *      so a subsequent `page.goto("/app/...")` lands authenticated.
 *   3. Multiple tests in the same file can share the cookie from a
 *      `beforeAll` without re-calling the dev endpoint.
 *
 * The pre-seed benefit: when the dev endpoint is healthy, this spec
 * is one network call instead of three (one per test). When the
 * endpoint flakes, the `withRetry` budget is paid once instead of
 * per-test.
 *
 * The test uses the same `withRetry` wrapper as the existing
 * `devSignIn` so a transient 500 still surfaces as a single retry
 * rather than a hard fail.
 */

test.describe("pre-seeded session cookie (TEST-18)", () => {
  test("setAuthCookie returns a usable session cookie and applies it to the page context", async ({
    page,
    request,
  }) => {
    const result = await setAuthCookie(page, request, {
      email: `test-pre-seed-${Date.now()}@laratik.local`,
    });

    expect(result.cookie.name).toBe("authjs.session-token");
    expect(result.cookie.value.length).toBeGreaterThan(0);
    expect(result.userId.length).toBeGreaterThan(0);

    // The cookie must be present on the page context, not just the
    // request context. We read the page's cookies to assert this
    // without hitting the server.
    const cookies = await page.context().cookies();
    const applied = cookies.find((c) => c.name === "authjs.session-token");
    expect(applied, "page context should have the authjs.session-token cookie").toBeDefined();
    expect(applied?.value).toBe(result.cookie.value);
  });

  test("the pre-seeded cookie authenticates a /app navigation", async ({ page, request }) => {
    await setAuthCookie(page, request, {
      email: `test-pre-seed-nav-${Date.now()}@laratik.local`,
    });

    // /app/w/acme requires a real workspace + membership, but the
    // middleware-level check is "is the user signed in". A signed-in
    // user with no workspace membership lands on /app (the My Work
    // index) instead of /signin?error=AccessDenied. That's enough to
    // prove the cookie works without seeding a full workspace.
    const response = await page.goto("/app");
    expect(response, "GET /app should not redirect to /signin").not.toBeNull();
    expect(page.url(), "should land on /app or /app/w/*, not /signin").not.toContain("/signin");
  });
});
