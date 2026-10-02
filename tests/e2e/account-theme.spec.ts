import { test, expect } from "@playwright/test";
import { bootstrapRoleSession } from "./_helpers";

test.describe("account theme preference", () => {
  test("is available beside notifications in the app shell", async ({ page }, testInfo) => {
    await bootstrapRoleSession(page, "workspace_manager", "shell-theme", {
      email: `e2e-shell-theme-${testInfo.project.name}@laratik.local`,
    });
    await page.goto("/app/w/acme");

    await page.getByRole("button", { name: "Color theme" }).first().click();
    await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeVisible();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

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
