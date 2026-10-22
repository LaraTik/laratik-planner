import { test, expect } from "@playwright/test";
import { applySeededAgencyContext, bootstrapRoleSession, devSeed, devSignIn } from "./_helpers";

test.describe("account theme preference", () => {
  test("lists all agency memberships and marks the signed active agency", async ({
    page,
  }, testInfo) => {
    const email = `e2e-account-agencies-${testInfo.project.name}@laratik.local`;
    await devSeed(page.request, {
      email,
      agencyName: "Account Agency One",
      agencySlug: `account-agency-one-${testInfo.project.name}`,
      workspaceName: "Account Workspace One",
      workspaceSlug: `account-workspace-one-${testInfo.project.name}`,
    });
    const second = await devSeed(page.request, {
      email,
      agencyName: "Account Agency Two",
      agencySlug: `account-agency-two-${testInfo.project.name}`,
      workspaceName: "Account Workspace Two",
      workspaceSlug: `account-workspace-two-${testInfo.project.name}`,
    });
    await devSignIn(page.request, { email });
    await applySeededAgencyContext(page, second);

    await page.goto("/app/account");
    const memberships = page.getByTestId("account-agency-membership");
    await expect(memberships).toHaveCount(2);
    await expect(memberships.filter({ hasText: "Account Agency One" })).toBeVisible();
    const activeMembership = memberships.filter({ hasText: "Account Agency Two" });
    await expect(activeMembership).toContainText("Current");
    await expect(memberships.filter({ hasText: "Account Agency One" })).not.toContainText(
      "Current",
    );
  });

  test("is available beside notifications in the app shell", async ({ page }, testInfo) => {
    await bootstrapRoleSession(page, "workspace_manager", "shell-theme", {
      email: `e2e-shell-theme-${testInfo.project.name}@laratik.local`,
    });
    await page.goto("/app/a/test-agency/w/shell-theme");

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

    const membership = page.getByTestId("account-agency-membership");
    await expect(membership).toHaveCount(1);
    await expect(membership).toContainText("Test Agency");
    await expect(membership).toContainText("Current");

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
