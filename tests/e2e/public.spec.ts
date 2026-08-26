import { test, expect } from "@playwright/test";

/**
 * Public-route smoke + contract tests.
 *
 * Covers every URL that an unauthenticated visitor can reach. The
 * auth gate, sign-in flow, and authenticated app shell live in their
 * own specs.
 */

test.describe("GET /", () => {
  test("renders the landing page", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: /Plan, review, and publish with clarity/i }),
    ).toBeVisible();
  });

  test("shows one contextual entry action", async ({ page }) => {
    const statusResponse = await page.request.get("/api/bootstrap/status");
    const status = (await statusResponse.json()) as { configured: boolean };
    await page.goto("/");

    const cta = page.getByRole("link", {
      name: status.configured ? /sign in to studioflow/i : /set up studioflow/i,
    });
    await expect(cta).toHaveAttribute(
      "href",
      status.configured ? "/signin" : "/signin?callbackUrl=%2Fsetup&method=magic",
    );
    await expect(page.getByRole("main").getByRole("link")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /sign up|register/i })).toHaveCount(0);
  });
});

test.describe("GET /signin", () => {
  test("renders the configured sign-in entry state", async ({ page }) => {
    const res = await page.goto("/signin");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /email address/i })).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toHaveCount(1);
  });

  test("preserves callbackUrl in the form", async ({ page }) => {
    await page.goto("/signin?callbackUrl=%2Fapp%2Fworkspaces");
    await expect(page).toHaveURL(/callbackUrl/);
  });
});

test.describe("GET /signin/verify", () => {
  test("renders the verify-request page", async ({ page }) => {
    const res = await page.goto("/signin/verify");
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/check your email|sign-in link|magic link/i).first()).toBeVisible();
  });
});

test.describe("GET /api/health", () => {
  test("returns 200 with the expected JSON shape", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: expect.any(Boolean),
      version: expect.any(String),
      env: expect.stringMatching(/development|production|test/),
      db: expect.stringMatching(/up|down|disabled/),
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
  });

  test("never leaks secrets in the response body", async ({ request }) => {
    const res = await request.get("/api/health");
    const text = await res.text();
    for (const forbidden of [
      "AUTH_SECRET",
      "DATABASE_URL",
      "GOOGLE_CLIENT_SECRET",
      "SMTP_PASSWORD",
      "MINIMAX_API_KEY",
      "SENTRY_AUTH_TOKEN",
      "CRON_SECRET",
    ]) {
      expect(text.toUpperCase(), `health must not contain ${forbidden}`).not.toContain(
        forbidden.toUpperCase(),
      );
    }
  });
});

test.describe("GET /api/bootstrap/status", () => {
  test("returns 200 with { configured, agencyId, signedIn }", async ({ request }) => {
    const res = await request.get("/api/bootstrap/status");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      configured: expect.any(Boolean),
      agencyId: expect.anything(),
      signedIn: expect.any(Boolean),
    });
  });
});

test.describe("Dev-only API endpoints (guarded server-side)", () => {
  test("GET /api/dev/sign-in returns a help message", async ({ request }) => {
    const res = await request.get("/api/dev/sign-in");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("GET /api/dev/seed returns the fixtures definition", async ({ request }) => {
    const res = await request.get("/api/dev/seed");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fixtures).toHaveProperty("email");
    expect(body.fixtures).toHaveProperty("agencySlug");
  });
});
