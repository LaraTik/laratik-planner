import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Global calendar — workspace identity.
 *
 * The defect this pins: the agency-wide month grid renders plans and
 * tasks from EVERY workspace into one set of day cells, but the compact
 * card variant accepted `workspaceName` and then ignored it. Two cards
 * from two different clients looked identical, so an admin could not
 * tell which workspace a plan belonged to without opening it.
 *
 * What must hold now:
 *  1. A legend exists and names every workspace — a colour is only a
 *     cue if the reader can decode it.
 *  2. Cards themselves carry the workspace name next to a coloured dot
 *     (colour is redundant, the text is the real signal).
 *  3. The legend doubles as the workspace filter, and clicking it does
 *     NOT drop the other active filters (month is asserted here as the
 *     proxy — it is the one param every other chip must preserve).
 */
const TARGET_MONTH = (() => {
  // The seed creates its content item in the CURRENT month, so deriving
  // the month keeps this suite from silently skipping once the fixtures
  // for a hard-coded month age out. (The legend tests do not depend on
  // events existing, so they work for any month.)
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
})();

test.describe("Global calendar workspace identity", () => {
  test("legend lists workspaces and marks 'All' as active when unfiltered", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    const legend = page.getByRole("navigation", { name: /filter the calendar by workspace/i });
    await expect(legend).toBeVisible();

    const allChip = page.getByTestId("workspace-legend-all");
    await expect(allChip).toBeVisible();
    await expect(allChip).toHaveAttribute("aria-current", "true");
  });

  test("each workspace chip links to that workspace and preserves the month", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    const chip = page
      .locator('[data-testid^="workspace-legend-"]:not([data-testid="workspace-legend-all"])')
      .first();
    await expect(chip).toBeVisible();

    const href = await chip.getAttribute("href");
    expect(href).toContain("workspaceId=");
    // The round-trip guarantee: switching workspace must not reset the
    // month the user is looking at.
    expect(href).toContain(`month=${TARGET_MONTH}`);
  });

  test("clicking a workspace chip filters the calendar and moves the active state", async ({
    page,
  }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    const chip = page
      .locator('[data-testid^="workspace-legend-"]:not([data-testid="workspace-legend-all"])')
      .first();
    const testId = await chip.getAttribute("data-testid");
    await chip.click();

    await expect(page).toHaveURL(/workspaceId=/);
    await expect(page.getByTestId(testId!)).toHaveAttribute("aria-current", "true");
    await expect(page.getByTestId("workspace-legend-all")).not.toHaveAttribute("aria-current");
    // Still on the same month after the filter round-trip.
    await expect(page).toHaveURL(new RegExp(`month=${TARGET_MONTH}`));
  });

  test("calendar cards name their workspace, not just colour them", async ({ page }) => {
    // Deliberately UNFILTERED: filtering to the freshly-seeded workspace
    // yields no plans (the seeded plan belongs to an earlier workspace),
    // so the assertion silently SKIPPED — which is exactly how the
    // original defect could have shipped green.
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    // NOTE: every assertion below is an auto-retrying expect(). A bare
    // `locator.count()` reads the DOM immediately and this page streams,
    // so counting right after goto() can observe a partially-rendered
    // grid and fail for a reason that has nothing to do with the change.
    //
    // `:visible` matters too: the mobile agenda and the desktop grid
    // render the SAME cards, and the agenda is `md:hidden`, so `.first()`
    // would otherwise grab a hidden node and fail on visibility.
    const cards = page
      .locator('[data-testid^="calendar-event-"]:visible')
      .filter({ hasText: /\S/ });
    await expect(cards.first()).toBeVisible();

    const legendChip = page
      .locator('[data-testid^="workspace-legend-"]:not([data-testid="workspace-legend-all"])')
      .first();
    await expect(legendChip).toBeVisible();
    const workspaceName = ((await legendChip.innerText()) ?? "").trim().split("\n")[0] ?? "";
    expect(workspaceName.length).toBeGreaterThan(0);

    // The regression: the compact day-cell card carried no workspace text
    // at all, so two cards from two clients were indistinguishable.
    await expect(cards.first()).toContainText(workspaceName);
  });

  test("workspace dots are decorative — the name is the accessible signal", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto(`/app/calendar?month=${TARGET_MONTH}`);

    const dots = page.locator('[data-testid$="-workspace-dot"]');
    await expect(dots.first()).toHaveAttribute("aria-hidden", "true");
  });
});
