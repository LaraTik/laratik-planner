import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Global calendar Workload view (round-of-2026-09-27):
 *
 * "What's important to me in the global calendar is the ability to
 * select a user and see all his tasks and current plans" — for a
 * designer or reviewer, "what they have left" is the goal.
 *
 * The Workload view is a toggle above the filters on /app/calendar.
 * Picking a person (or no-one, yet) shows a focused panel:
 *  - summary chips (overdue / in-progress / blocked / month totals)
 *  - a filtered monthly grid (only that user's events)
 *  - a right rail with sorted tasks + plans they're touching
 *
 * These tests cover the view mode toggle and the three render states.
 */
const TARGET_MONTH = "2026-09";

test.describe("Global calendar Workload view", () => {
  test("Calendar view default — no view toggle highlight", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    await expect(page.getByTestId("calendar-view-toggle")).toBeVisible();
    await expect(page.getByTestId("calendar-view-tab")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("workload-view-tab")).toHaveAttribute("aria-selected", "false");
    // Calendar view shows the agency-wide grid; workload body is hidden
    await expect(page.getByTestId("workload-view")).toHaveCount(0);
  });

  test("Workload view without assignee picked shows the empty state", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}&view=workload`);

    await expect(page.getByTestId("workload-view-tab")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("workload-empty-pick-assignee")).toBeVisible();
    // Body copy tells the user how to recover from the empty state
    await expect(page.getByTestId("workload-empty-pick-assignee")).toContainText(
      /Task assignee filter/i,
    );
  });

  test("Workload view with assignee picked renders summary chips + grid + rail", async ({
    page,
  }) => {
    const seed = await bootstrapTestSession(page);
    await page.goto(
      `/app/calendar?month=${TARGET_MONTH}&view=workload&assigneeId=${seed.userId}&showPlans=true&showTasks=true`,
    );

    await expect(page.getByTestId("workload-view")).toBeVisible();
    // Summary chips are present
    await expect(page.getByTestId("workload-summary-overdue")).toBeVisible();
    await expect(page.getByTestId("workload-summary-in-progress")).toBeVisible();
    await expect(page.getByTestId("workload-summary-blocked")).toBeVisible();
    await expect(page.getByTestId("workload-summary-tasks-this-month")).toBeVisible();
    await expect(page.getByTestId("workload-summary-plans-this-month")).toBeVisible();
    // Rail lists render — either the list or the empty state must
    // be present (the seed user has no tasks, so the empty state
    // is the expected outcome for that branch)
    await expect(page.getByTestId("workload-rail")).toBeVisible();
    const tasksList = page.getByTestId("workload-tasks-list");
    const tasksEmpty = page.getByTestId("workload-tasks-empty");
    expect((await tasksList.count()) + (await tasksEmpty.count())).toBeGreaterThan(0);
    const plansList = page.getByTestId("workload-plans-list");
    const plansEmpty = page.getByTestId("workload-plans-empty");
    expect((await plansList.count()) + (await plansEmpty.count())).toBeGreaterThan(0);
  });

  test("Toggling from Calendar to Workload preserves the month", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    // Click the Workload tab — should preserve the month in the URL
    await page.getByTestId("workload-view-tab").click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain(`month=${TARGET_MONTH}`);
    expect(page.url()).toContain("view=workload");
  });

  test("Toggling from Workload to Calendar drops the view param", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}&view=workload`);

    await page.getByTestId("calendar-view-tab").click();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain(`month=${TARGET_MONTH}`);
    expect(page.url()).not.toContain("view=workload");
  });

  test("Submitting the filter form in Workload view preserves the view param", async ({ page }) => {
    const seed = await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}&view=workload&assigneeId=${seed.userId}`);

    // Change the workspace filter and submit
    await page.selectOption("#calendar-workspace", seed.workspaceId);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);
    // View param survives the form round-trip
    expect(page.url()).toContain("view=workload");
    expect(page.url()).toContain("workspaceId=");
  });
});
