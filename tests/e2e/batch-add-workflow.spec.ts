import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

test.describe("Batch Add spreadsheet workflow", () => {
  test("shows the complete template and keeps the grid usable at desktop and mobile widths", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/planning/batch", { waitUntil: "networkidle" });

    const template = page.getByTestId("batch-template-example");
    await expect(template).toBeVisible();
    await expect(template.locator("tbody tr")).toHaveCount(8);
    await expect(template).toContainText("Five ways to brew a better cup");
    await expect(template).toContainText("5-slide carousel");

    const grid = page.getByTestId("batch-grid-scroll");
    await expect(grid).toBeVisible();
    const desktopMetrics = await grid.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(desktopMetrics.scrollWidth).toBeGreaterThan(desktopMetrics.clientWidth);
    expect(desktopMetrics.scrollHeight).toBeGreaterThanOrEqual(desktopMetrics.clientHeight);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(grid).toBeHidden();
    await expect(page.getByText("Row 1", { exact: true })).toBeVisible();
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(mobileOverflow).toBe(false);
  });
});
