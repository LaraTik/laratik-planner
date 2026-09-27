import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Global calendar filter feedback (gap from round-of-2026-09-27).
 *
 * The assignee + status filters only affect tasks; plans stay
 * visible. When the user picks an assignee with no tasks this
 * month, the calendar visually looks identical to the unfiltered
 * view (plans dominate the count) — making the filter feel broken.
 *
 * The fix splits the count into plan/task breakdown and renders a
 * warning-styled hint when an active task filter reduces the task
 * list to zero. These tests cover the three states the user sees:
 *
 *  1. No filter — count shows plan/task breakdown.
 *  2. Workspace filter (matches plans) — breakdown updates, no hint.
 *  3. Status filter with no matching tasks — warning hint appears,
 *     plan count remains in the breakdown.
 *
 * The dev seed creates one workspace with one plan and no tasks
 * (the per-agency fixtures accumulated by previous test runs supply
 * the rest). We rely on those accumulated plans + tasks so the
 * unfiltered count has both kinds; the workspace filter narrows the
 * view but still surfaces the plan-only breakdown; and the
 * `cancelled` status (valid enum value, no seed tasks) triggers
 * the no-tasks hint.
 */
const TARGET_MONTH = "2026-09";

test.describe("Global calendar filter feedback", () => {
  test("unfiltered calendar shows plan/task breakdown", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    const summary = page.locator(
      '[data-testid="global-calendar"] [aria-live="polite"] p:first-child',
    );
    const text = (await summary.textContent()) ?? "";
    // The breakdown is rendered as either:
    //   - "Showing X plans and Y tasks" (both > 0)
    //   - "Showing X plans" (tasks = 0)
    //   - "Showing Y tasks" (plans = 0)
    //   - "Showing 0 events" (both = 0)
    expect(text).toMatch(/Showing (\d+ plans?( and \d+ tasks?)?|\d+ tasks?|0 events)$/);

    // No warning hint is rendered without a filter
    await expect(
      page.locator('[data-testid="global-calendar"] [aria-live="polite"] [role="status"]'),
    ).toHaveCount(0);
  });

  test("workspace filter keeps the plan/task breakdown and skips the hint", async ({ page }) => {
    const seed = await bootstrapTestSession(page);
    await page.goto(
      `/app/calendar?month=${TARGET_MONTH}&workspaceId=${seed.workspaceId}&showPlans=true&showTasks=true`,
    );

    const summary = page.locator(
      '[data-testid="global-calendar"] [aria-live="polite"] p:first-child',
    );
    const text = (await summary.textContent()) ?? "";
    expect(text).toMatch(/Showing \d+ plans?( and \d+ tasks?)?$/);

    // No warning hint — workspace filter is a plan filter, not a task
    // filter, so it should never trigger the "no tasks" hint.
    await expect(
      page.locator('[data-testid="global-calendar"] [aria-live="polite"] [role="status"]'),
    ).toHaveCount(0);
  });

  test("status filter with no matching tasks renders the warning hint", async ({ page }) => {
    const seed = await bootstrapTestSession(page);
    // 'cancelled' is a valid status enum value, so the form submits
    // it. The seed creates no tasks → the filter yields 0 tasks and
    // the hint should fire.
    await page.goto(
      `/app/calendar?month=${TARGET_MONTH}&workspaceId=${seed.workspaceId}&taskStatus=cancelled&showPlans=true&showTasks=true`,
    );

    const summary = page.locator(
      '[data-testid="global-calendar"] [aria-live="polite"] p:first-child',
    );
    const summaryText = (await summary.textContent()) ?? "";
    // Breakdown drops the "and Y tasks" suffix when tasks = 0
    expect(summaryText).not.toMatch(/and \d+ tasks/);

    const hint = page.locator(
      '[data-testid="global-calendar"] [aria-live="polite"] [role="status"]',
    );
    await expect(hint).toBeVisible();
    const hintText = (await hint.textContent()) ?? "";
    // Hint mentions the cancelled status and the remaining plan count
    expect(hintText).toMatch(/cancelled/i);
    expect(hintText).toMatch(/plans? remain visible/i);
  });
});
