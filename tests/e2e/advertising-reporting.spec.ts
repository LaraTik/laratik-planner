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
      socialAnalyticsFixture: true,
    });

    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );

    await expect(page.getByTestId("advertising-reporting-page")).toBeVisible();
    await expect(page.getByTestId("advertising-reporting-dashboard")).toBeVisible();
    await expect(page.getByTestId("advertising-reporting-data-health")).toContainText(
      "Data health",
    );
    await page.getByTestId("advertising-reporting-data-health-details-trigger").click();
    await expect(page.getByTestId("advertising-reporting-data-health-details")).toContainText(
      "Metric status",
    );
    await expect(page.getByTestId("advertising-reporting-data-health-details")).toContainText(
      "All clicks",
    );
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("advertising-reporting-data-health-details")).toBeHidden();
    await expect(page.getByTestId("advertising-reporting-performance-trend")).toBeVisible();
    await expect(page.getByTestId("advertising-reporting-action-center")).toBeVisible();
    const actionCenter = page.getByTestId("advertising-reporting-action-center");
    const feedbackResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/advertising/signal-feedback") &&
        response.request().method() === "POST" &&
        response.status() === 200,
    );
    await actionCenter.getByRole("button", { name: "Mark reviewed" }).first().click();
    await feedbackResponse;
    await expect(actionCenter).toContainText("Reviewed");
    await expect(page.getByTestId("advertising-intelligence")).toBeVisible();
    await expect(page.getByTestId("advertising-campaign-signals")).toContainText("Effective");
    await expect(page.getByTestId("advertising-budget-pacing")).toContainText("Budget pacing");
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      /surface=csv_export/,
    );
    await expect(page.getByTestId("advertising-reporting-section-nav")).toBeHidden();
    await expect(page.getByTestId("sidebar-advertising-reporting")).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );
    await expect(page.getByTestId("advertising-reporting-filter-drawer-trigger")).toBeVisible();
    await page.getByRole("button", { name: "Filters" }).click();
    await expect(page.getByTestId("advertising-reporting-filter-drawer")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Report filters");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("advertising-reporting-filter-drawer")).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );
    await expect(page.getByTestId("sidebar-advertising-campaigns")).toHaveAttribute(
      "href",
      /section=campaigns/,
    );
    await expect(page.getByTestId("sidebar-advertising-campaigns")).toBeVisible();
    await expect(page.getByTestId("sidebar-advertising-audience")).toBeVisible();
    await expect(page.getByTestId("sidebar-advertising-reporting")).toHaveAttribute(
      "href",
      /section=reporting/,
    );
    await expect(page.getByTestId("advertising-reporting-campaigns")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=campaigns`,
    );
    await expect(page.getByTestId("advertising-reporting-campaigns")).toContainText(
      "e2e-campaign-spring",
    );
    await expect(page.getByTestId("advertising-reporting-dashboard")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=adsets`,
    );
    await expect(page.getByTestId("advertising-reporting-adsets")).toContainText(
      "e2e-adset-spring",
    );
    await expect(page.getByTestId("advertising-reporting-ads")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=ads`,
    );
    await expect(page.getByTestId("advertising-reporting-ads")).toContainText("e2e-ad-spring");
    await expect(page.getByTestId("advertising-reporting-adsets")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=creatives`,
    );
    await expect(page.getByTestId("advertising-reporting-promoted-posts")).toContainText(
      "e2e-instagram-0",
    );
    await expect(page.getByTestId("advertising-reporting-adsets")).toHaveCount(0);
    await expect(page.getByTestId("advertising-reporting-ads")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=audience`,
    );
    await expect(page.getByTestId("advertising-reporting-audience")).toBeVisible();
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=targeting`,
    );
    await expect(page.getByTestId("advertising-reporting-targeting")).toContainText("DE");
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=overview`,
    );
    await expect(page.getByTestId("advertising-reporting-partial-warning")).toHaveCount(0);
    await expect(page.getByTestId("advertising-reporting-last-sync")).toHaveText(/.+[:：].+/);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&trendGranularity=week&trendMetricA=impressions&trendMetricB=clicks`,
    );
    await expect(page.locator("#advertising-trend-granularity")).toHaveValue("week");
    await expect(page.locator("#advertising-trend-a")).toHaveValue("impressions");
    await expect(page.locator("#advertising-trend-b")).toHaveValue("clicks");
    await expect(page.locator("#advertising-supplementary-metric")).toHaveValue("impressions");
    await page.locator("#advertising-supplementary-metric").selectOption("ctrAll");
    await expect(page.locator("#advertising-supplementary-metric")).toHaveValue("ctrAll");
    await expect(page).toHaveURL(/supplementaryMetric=ctrAll/);
    await expect(page.getByTestId("advertising-reporting-supplementary-metric")).toContainText(
      "CTR (all)",
    );
    await page.getByRole("button", { name: "Save view" }).click();
    await expect(page.getByTestId("advertising-save-view-dialog")).toBeVisible();
    await page.getByLabel("View name").fill("Weekly acquisition review");
    await page.getByLabel("Who can use this view?").selectOption("workspace");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("advertising-save-view-dialog")).toContainText(
      "View saved for this workspace.",
    );
    await expect(page.getByTestId("advertising-save-view-dialog")).toContainText(
      "Weekly acquisition review",
    );
    await page
      .getByTestId("advertising-save-view-dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .first()
      .click();
    await expect(page.getByRole("link", { name: "Open client report" })).toHaveAttribute(
      "href",
      /presentation=client/,
    );
    await page.goto(
      (await page.getByRole("link", { name: "Open client report" }).getAttribute("href"))!,
    );
    await expect(page.getByTestId("advertising-client-report")).toBeVisible();
    await expect(page.getByTestId("advertising-client-report")).toContainText("Campaign scorecard");
    await expect(page.getByTestId("advertising-ai-recommendations")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate recommendations" })).toBeVisible();
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
      socialAnalyticsFixture: true,
    });

    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("advertising-reporting-page")).toBeVisible();
    await expect(page.getByTestId("advertising-reporting-dashboard")).toBeVisible();
    await expect(page.getByTestId("advertising-reporting-data-health")).toContainText(
      "صحة البيانات",
    );
    await page.getByTestId("advertising-reporting-data-health-details-trigger").click();
    await expect(page.getByTestId("advertising-reporting-data-health-details")).toContainText(
      "حالة المقاييس",
    );
    await expect(page.getByTestId("advertising-reporting-data-health-details")).toContainText(
      "كل النقرات",
    );
    await page.getByRole("button", { name: "إغلاق" }).click();
    await expect(page.getByTestId("advertising-reporting-data-health-details")).toBeHidden();
    await expect(page.getByTestId("advertising-intelligence")).toBeVisible();
    await expect(page.getByTestId("advertising-campaign-signals")).toContainText("فعّالة");
    await expect(page.getByTestId("advertising-reporting-section-nav")).toBeHidden();
    await expect(page.getByTestId("sidebar-advertising-reporting")).toBeVisible();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );
    await expect(page.getByTestId("advertising-reporting-filter-drawer-trigger")).toBeVisible();
    await page.getByRole("button", { name: "الفلاتر" }).click();
    await expect(page.getByTestId("advertising-reporting-filter-drawer")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("فلاتر التقرير");
    await page.getByRole("button", { name: "إغلاق" }).click();
    await expect(page.getByTestId("advertising-reporting-filter-drawer")).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02`,
    );
    await expect(page.getByTestId("sidebar-advertising-campaigns")).toHaveAttribute(
      "href",
      /section=campaigns/,
    );
    await expect(page.getByTestId("sidebar-advertising-reporting")).toHaveAttribute(
      "href",
      /section=reporting/,
    );
    await expect(page.getByTestId("advertising-reporting-campaigns")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=campaigns`,
    );
    await expect(page.getByTestId("advertising-reporting-campaigns")).toContainText(
      "e2e-campaign-spring",
    );
    await expect(page.getByTestId("advertising-reporting-dashboard")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=adsets`,
    );
    await expect(page.getByTestId("advertising-reporting-adsets")).toContainText(
      "e2e-adset-spring",
    );
    await expect(page.getByTestId("advertising-reporting-ads")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=ads`,
    );
    await expect(page.getByTestId("advertising-reporting-ads")).toContainText("e2e-ad-spring");
    await expect(page.getByTestId("advertising-reporting-adsets")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=creatives`,
    );
    await expect(page.getByTestId("advertising-reporting-promoted-posts")).toContainText(
      "e2e-instagram-0",
    );
    await expect(page.getByTestId("advertising-reporting-adsets")).toHaveCount(0);
    await expect(page.getByTestId("advertising-reporting-ads")).toHaveCount(0);
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=audience`,
    );
    await expect(page.getByTestId("advertising-reporting-audience")).toBeVisible();
    await page.goto(
      `/app/a/${agencySlug}/w/${workspaceSlug}/analytics/advertising?since=2026-10-01&until=2026-10-02&section=overview`,
    );
    await expect(page.getByTestId("advertising-reporting-partial-warning")).toHaveCount(0);
    await expect(page.getByTestId("advertising-reporting-last-sync")).toHaveText(/.+[:：].+/);
    await page.getByRole("button", { name: "حفظ العرض" }).click();
    await expect(page.getByTestId("advertising-save-view-dialog")).toBeVisible();
    await page.getByLabel("اسم العرض").fill("مراجعة الاستحواذ الأسبوعية");
    await page.getByLabel("من يمكنه استخدام هذا العرض؟").selectOption("workspace");
    await page.getByRole("button", { name: "حفظ", exact: true }).click();
    await expect(page.getByTestId("advertising-save-view-dialog")).toContainText(
      "تم حفظ العرض لمساحة العمل هذه.",
    );
    await page
      .getByTestId("advertising-save-view-dialog")
      .getByRole("button", { name: "إلغاء", exact: true })
      .first()
      .click();
    await expect(page.getByRole("link", { name: "فتح تقرير العميل" })).toHaveAttribute(
      "href",
      /presentation=client/,
    );
    await page.goto(
      (await page.getByRole("link", { name: "فتح تقرير العميل" }).getAttribute("href"))!,
    );
    await expect(page.getByTestId("advertising-client-report")).toBeVisible();
    await expect(page.getByTestId("advertising-client-report")).toContainText("بطاقة أداء الحملات");
    await expect(page.getByTestId("advertising-ai-recommendations")).toBeVisible();
    await expect(page.getByRole("button", { name: "إنشاء التوصيات" })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });
});
