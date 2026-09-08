import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Saved filters — create → apply → share with workspace.
 *
 * Test strategy:
 *   1. Visit the Trends page.
 *   2. Apply a filter (e.g. vertical = "fashion").
 *   3. Save it as a named filter.
 *   4. Verify the filter appears in the saved-filters dropdown.
 *   5. Share with workspace.
 *   6. Sign in as a teammate in the same workspace and verify the
 *      filter is visible.
 */

test.describe("Trend Radar — saved filters", () => {
  const workspaceSlug = "trend-filters";
  test.beforeEach(async ({ page }) => {
    await bootstrapTestSession(page, { agencySlug: "trend-filters-agency", workspaceSlug });
  });

  test("save → apply → share with workspace", async ({
    page,
    context,
  }: {
    page: Page;
    context: import("@playwright/test").BrowserContext;
  }) => {
    await page.goto(`/app/w/${workspaceSlug}/trends`);

    const wizard = page.getByTestId("trends-onboarding-wizard");
    await expect(wizard).toBeVisible();
    await page.getByTestId("onboarding-close").click();
    await expect(wizard).toBeHidden();

    // 1. Open the filter drawer.
    const filterButton = page.getByTestId("trends-filters-button");
    await filterButton.click();

    // 2. Pick a vertical.
    const verticalSelect = page.getByTestId("filter-vertical");
    await verticalSelect.selectOption("fashion");

    // 3. Save the filter.
    const saveButton = page.getByTestId("filter-save");
    await saveButton.click();

    const nameInput = page.getByTestId("filter-save-name");
    await nameInput.fill("My fashion pulse");

    const confirm = page.getByTestId("filter-save-confirm");
    await confirm.click();

    // 4. Filter shows in the dropdown.
    await page.getByTestId("saved-filters-button").click();
    const dropdown = page.getByTestId("saved-filters-dropdown");
    await expect(dropdown).toContainText(/my fashion pulse/i);

    // 5. Share with workspace.
    const share = page.getByTestId("filter-share-workspace");
    await share.click();
    await expect(page.getByTestId("filter-share-confirmed")).toBeVisible();

    // 6. Teammate in same workspace sees the filter.
    // The auth fixture should already have a second user wired up.
    // For v1 we just verify the API endpoint returns it.
    const apiResp = await page.request.get(`/api/trends/saved-filters?workspace=${workspaceSlug}`);
    expect(apiResp.status()).toBe(200);
    const body = await apiResp.json();
    expect(Array.isArray(body.filters)).toBe(true);
    const names = body.filters.map((f: { name: string }) => f.name);
    expect(names).toContain("My fashion pulse");
    // Workspace-shared filter has share_scope === "workspace".
    const mine = body.filters.find((f: { name: string }) => f.name === "My fashion pulse");
    expect(mine.shareScope).toBe("workspace");

    // Suppress unused context warning; the future test will use it.
    void context;
  });
});
