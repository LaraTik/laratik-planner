import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Agency switcher (M1.5) — end-to-end coverage of the sidebar
 * popover that lists every agency the signed-in user belongs to
 * and lets them pick one.
 *
 * Current state of the test infra:
 *  - The dev seed creates a single agency (the singleton from M1.1).
 *    The schema enforces `singletonKey = true` and a unique index
 *    on `singletonKey`, so a second agency row CANNOT be created
 *    in the test database until M2 lifts that invariant.
 *  - With one agency available, the switcher renders the active
 *    agency in the trigger and lists it in the popover. Selecting
 *    it is a no-op (the action is guarded by `if (a.id === active?.id)`).
 *
 * What this spec covers TODAY (single-agency world):
 *  1. The agency switcher trigger is visible in the sidebar.
 *  2. The trigger shows the seeded agency's name.
 *  3. Clicking the trigger opens a popover with a listbox that
 *     includes the seeded agency.
 *  4. The trigger exposes a stable test id (sidebar-agency-switcher-trigger).
 *
 * What this spec will cover once the singleton constraint is lifted
 * (M2 or later — the dev/seed helper would grow an `extraAgencies`
 * parameter to seed a second agency for the actor):
 *  5. The listbox contains one row per agency the actor belongs to.
 *  6. Selecting a different row sets the `laratik_active_agency`
 *     cookie via the server action.
 *  7. The page URL gains `?agency=<id>` after the switch.
 *  8. The new agency is the active one on the next render of
 *     /app/w/[slug] (M1.4 resolver chain).
 *
 * Those are gated by `.fixme` blocks with a comment so the file
 * still type-checks, the test list is stable, and the dependency is
 * discoverable from the test name alone.
 */

test.describe("Agency switcher (sidebar) — M1.5", () => {
  test("trigger is visible in the sidebar with the seeded agency name", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app");

    const trigger = page.locator('[data-testid="sidebar-agency-switcher-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-label", /Active agency: Test Agency/);
  });

  test("trigger exposes a stable test id usable by other specs", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app");

    const trigger = page.locator('[data-testid="sidebar-agency-switcher-trigger"]');
    await expect(trigger).toBeVisible();
  });

  test("clicking the trigger opens a listbox containing the seeded agency", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app");

    const trigger = page.locator('[data-testid="sidebar-agency-switcher-trigger"]');
    await trigger.click();
    const listbox = page.getByRole("listbox", { name: "Agencies" });
    await expect(listbox).toBeVisible({ timeout: 5_000 });
    // The seeded agency is the only option. The listbox must contain
    // a row for it. Marked active (`aria-selected="true"`).
    const option = listbox.getByRole("option", { name: /Test Agency/ });
    await expect(option).toBeVisible();
    await expect(option).toHaveAttribute("aria-selected", "true");
  });

  test("Escape closes the popover and returns focus to the trigger", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app");

    const trigger = page.locator('[data-testid="sidebar-agency-switcher-trigger"]');
    await trigger.click();
    await expect(page.getByRole("listbox", { name: "Agencies" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Agencies" })).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("outside click closes the popover", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app");

    const trigger = page.locator('[data-testid="sidebar-agency-switcher-trigger"]');
    await trigger.click();
    await expect(page.getByRole("listbox", { name: "Agencies" })).toBeVisible();

    await page.mouse.click(600, 240);
    await expect(page.getByRole("listbox", { name: "Agencies" })).not.toBeVisible();
  });

  // The two-agency scenarios are gated on lifting the singleton
  // constraint in the agency schema (M1.1 invariant: every row has
  // `singletonKey = true` and a unique index makes a second row
  // impossible to insert). When M2 / the dev seed helper grows a
  // multi-agency seed option, drop the `.fixme` and uncomment the
  // tests below.
  test.fixme("user with two agencies sees both rows in the popover (gated on M2 multi-agency seed)", async () => {
    // Implementation note (for the M2 owner): seed two agencies
    // and the actor as a member of both, then assert the listbox
    // has 2 options and the active one is marked aria-selected.
    expect(true).toBe(true);
  });

  test.fixme("selecting the second agency sets the cookie and navigates with ?agency=<id> (gated on M2 multi-agency seed)", async () => {
    // Implementation note: after seeding two agencies, click the
    // non-active option in the listbox, then assert:
    //   - the URL gained `?agency=<second-id>`
    //   - the `laratik_active_agency` cookie was written
    //   - the next render of /app/w/<slug> resolves to the new agency
    expect(true).toBe(true);
  });
});
