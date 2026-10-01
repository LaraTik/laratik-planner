import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapRoleSession } from "./_helpers";

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  const violations = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact ?? ""),
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test.describe("Command Center accessibility", () => {
  test("connected data is axe-clean in the light theme", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "command-center-a11y-light", {
      socialAnalyticsFixture: true,
    });
    await page.goto("/app/w/command-center-a11y-light");
    await expect(page.getByTestId("command-center-panel")).toBeVisible();
    await expect(page.getByTestId("command-center-evidence")).toContainText("Latest metric");
    await expect(page.getByTestId("command-center-account-health")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("connected data is axe-clean in the dark theme", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "command-center-a11y-dark", {
      socialAnalyticsFixture: true,
    });
    await page.goto("/app/account");
    await page.getByTestId("account-theme-input").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.goto("/app/w/command-center-a11y-dark");
    await expect(page.getByTestId("command-center-panel")).toBeVisible();
    await expect(page.getByTestId("command-center-evidence")).toContainText("Latest metric");
    await expectNoSeriousViolations(page);
  });

  test("observed content supports Meedro-style filters and pagination", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "command-center-inventory", {
      socialAnalyticsFixture: true,
    });
    await page.goto("/app/w/command-center-inventory");
    const inventory = page.getByTestId("command-center-inventory");
    await expect(inventory).toBeVisible();
    await expect(
      inventory.getByRole("button", { name: "Most viewed", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await inventory.getByRole("button", { name: "Most viewed", exact: true }).click();
    await expect(
      inventory.getByRole("button", { name: "Most viewed", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(inventory.getByText(/Page 1 \/ /)).toBeVisible();
    await expect(inventory.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  });
});
