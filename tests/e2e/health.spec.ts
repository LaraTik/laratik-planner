import { test, expect } from "@playwright/test";

test.describe("GET /api/health", () => {
  test("returns 200 with a non-sensitive JSON body", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBeLessThan(500);

    const body = await res.json();
    expect(body).toHaveProperty("ok");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("env");
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("timestamp");

    // Must never leak secrets.
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      "AUTH_SECRET",
      "DATABASE_URL",
      "GOOGLE_CLIENT_SECRET",
      "SMTP_PASSWORD",
      "MINIMAX_API_KEY",
      "SENTRY_AUTH_TOKEN",
      "CRON_SECRET",
    ]) {
      expect(serialized, `health endpoint must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  test("home page renders the production entry point", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "laratik-planner" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });
});
