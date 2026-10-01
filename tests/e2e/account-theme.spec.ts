import { test, expect } from "@playwright/test";
import { bootstrapRoleSession } from "./_helpers";

test.describe("account theme preference", () => {
  test("persists Light, Dark, and System per user", async ({ page }, testInfo) => {
    await bootstrapRoleSession(page, "workspace_manager", "account-theme", {
      email: `e2e-theme-${testInfo.project.name}@laratik.local`,
    });
    await page.goto("/app/account");

    const theme = page.getByTestId("account-theme-input");
    const form = page.getByTestId("theme-preference-form");
    await expect(theme).toHaveValue("system");

    await theme.selectOption("dark");
    await expect(theme).toHaveValue("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(form.getByRole("status")).toHaveText("Appearance saved.");

    await page.reload();
    await expect(page.getByTestId("account-theme-input")).toHaveValue("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByTestId("account-theme-input").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(form.getByRole("status")).toHaveText("Appearance saved.");

    await page.getByTestId("account-theme-input").selectOption("system");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    await expect(form.getByRole("status")).toHaveText("Appearance saved.");
  });
});
