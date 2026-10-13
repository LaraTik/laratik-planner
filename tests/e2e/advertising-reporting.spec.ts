import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapTestSession } from "./_helpers";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
}

test.describe("synthetic advertising reporting", () => {
  test("renders populated canonical facts in English", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const agencySlug = `advertising-reporting-${suffix}`;
    const workspaceSlug = `advertising-reporting-${suffix}`;
    await bootstrapTestSession(page, {
      agencyName: "E2E Advertising Reporting Agency",
      agencySlug,
      workspaceName: "E2E Advertising Reporting Workspace",
      workspaceSlug,
      advertisingReportingFixture: true,
    });

    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );

    await expect(page.getByTestId("advertising-reporting-page")).toBeVisible();
    await expect(page.getByTestId("advertising-reporting-campaigns")).toContainText(
      "e2e-campaign-spring",
    );
    await expect(page.getByTestId("advertising-reporting-campaigns")).toContainText(
      "e2e-campaign-retargeting",
    );
    await expect(page.getByTestId("advertising-reporting-daily-spend")).toContainText("€");
    await expect(page.getByTestId("advertising-reporting-partial-warning")).toHaveCount(0);
    await expect(page.getByTestId("advertising-reporting-last-sync")).toHaveText(/.+[:：].+/);
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("renders populated canonical facts in Arabic RTL", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const agencySlug = `advertising-reporting-ar-${suffix}`;
    const workspaceSlug = `advertising-reporting-ar-${suffix}`;
    await bootstrapTestSession(page, {
      agencyName: "وكالة تقارير الإعلانات للاختبار",
      agencySlug,
      workspaceName: "مساحة تقارير الإعلانات للاختبار",
      workspaceSlug,
      locale: "ar",
      advertisingReportingFixture: true,
    });

    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("advertising-reporting-page")).toBeVisible();
    await expect(page.getByTestId("advertising-reporting-campaigns")).toContainText(
      "e2e-campaign-spring",
    );
    await expect(page.getByTestId("advertising-reporting-campaigns")).toContainText(
      "e2e-campaign-retargeting",
    );
    await expect(page.getByTestId("advertising-reporting-partial-warning")).toHaveCount(0);
    await expect(page.getByTestId("advertising-reporting-last-sync")).toHaveText(/.+[:：].+/);
    await expectNoSeriousAccessibilityViolations(page);
  });
});
