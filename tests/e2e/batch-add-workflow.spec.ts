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
    await expect(template.locator("table")).toBeHidden();
    await expect(template.locator("details article")).toHaveCount(8);
    await expect(page.getByText("Row 1", { exact: true })).toBeVisible();
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(mobileOverflow).toBe(false);
  });

  test("explains the next step after saving a batch", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/planning/batch");

    await page.getByRole("textbox", { name: "Title for row 1" }).fill("Batch completion test");
    await page.getByRole("combobox", { name: "Format for row 1" }).selectOption("static_post");
    await page.getByRole("textbox", { name: "Date and time for row 1" }).fill("2026-09-20T10:00");
    await page.getByRole("textbox", { name: "Short brief for row 1" }).fill("A clear next step");
    await page.getByRole("button", { name: /Save all as drafts/i }).click();

    await page.waitForURL(/\/app\/w\/acme\/planning\?batchCreated=1$/, {
      timeout: 20_000,
      waitUntil: "load",
    });
    const completion = page.getByTestId("planning-batch-success");
    await expect(completion).toContainText("Created 1 draft successfully.");
    await expect(completion).toContainText("They are now in Planning as drafts.");
    await expect(completion).toContainText("submit them for content review");
    await expect(page.getByTestId("planning-batch-success-view-drafts")).toBeVisible();
  });
});
