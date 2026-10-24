import { expect, test } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

const reviewRequiredKeys = ["instagram_graph_api", "linkedin_marketing_api"] as const;
const englishMessage = "Provider review is required before this source can be enabled.";
const arabicMessage = "يجب إكمال مراجعة المنصة قبل تفعيل هذا المصدر.";

test.describe("Trend Radar — provider review gate", () => {
  test("agency settings explains and disables review-required sources in English", async ({
    page,
  }) => {
    await bootstrapTestSession(page, {
      agencySlug: "review-required-admin-en",
      workspaceSlug: "review-required-admin-en",
      locale: "en",
      enableTrendRadar: true,
    });

    await page.goto("/app/agency-settings/trend-sources");

    await expect(page.getByTestId("admin-source-review-note")).toHaveCount(2);
    await expect(page.getByTestId("admin-source-review-note").first()).toContainText(
      englishMessage,
    );
    for (const key of reviewRequiredKeys) {
      await expect(page.getByTestId(`admin-source-toggle-${key}`)).toBeDisabled();
    }
  });

  test("agency settings explains and disables review-required sources in Arabic", async ({
    page,
  }) => {
    await bootstrapTestSession(page, {
      agencySlug: "review-required-admin-ar",
      workspaceSlug: "review-required-admin-ar",
      locale: "ar",
      enableTrendRadar: true,
    });

    await page.goto("/app/agency-settings/trend-sources");

    const notes = page.getByTestId("admin-source-review-note");
    await expect(notes).toHaveCount(2);
    await expect(notes.first()).toContainText(arabicMessage);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    for (const key of reviewRequiredKeys) {
      await expect(page.getByTestId(`admin-source-toggle-${key}`)).toBeDisabled();
    }
  });

  test("workspace onboarding explains and disables review-required sources in English", async ({
    page,
  }) => {
    const agencySlug = "review-required-onboarding-en";
    const workspaceSlug = "review-required-onboarding-en";
    await bootstrapTestSession(page, {
      agencySlug,
      workspaceSlug,
      locale: "en",
      enableTrendRadar: true,
    });

    await page.goto(`/app/a/${agencySlug}/w/${workspaceSlug}/trends`);

    const wizard = page.getByTestId("trends-onboarding-wizard");
    await expect(wizard).toBeVisible();
    await expect(wizard.getByTestId("source-review-required")).toHaveCount(2);
    await expect(wizard.getByTestId("source-review-required").first()).toContainText(
      englishMessage,
    );
    for (const key of reviewRequiredKeys) {
      await expect(wizard.getByTestId(`source-toggle-${key}`)).toBeDisabled();
    }
  });

  test("workspace onboarding explains and disables review-required sources in Arabic", async ({
    page,
  }) => {
    const agencySlug = "review-required-onboarding-ar";
    const workspaceSlug = "review-required-onboarding-ar";
    await bootstrapTestSession(page, {
      agencySlug,
      workspaceSlug,
      locale: "ar",
      enableTrendRadar: true,
    });

    await page.goto(`/app/a/${agencySlug}/w/${workspaceSlug}/trends`);

    const wizard = page.getByTestId("trends-onboarding-wizard");
    await expect(wizard).toBeVisible();
    const notes = wizard.getByTestId("source-review-required");
    await expect(notes).toHaveCount(2);
    await expect(notes.first()).toContainText(arabicMessage);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    for (const key of reviewRequiredKeys) {
      await expect(wizard.getByTestId(`source-toggle-${key}`)).toBeDisabled();
    }
  });
});
