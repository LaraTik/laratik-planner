import { test, expect } from "@playwright/test";

test.describe("mobile-safari project smoke", () => {
  test("signin page renders without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /sign in/i }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
