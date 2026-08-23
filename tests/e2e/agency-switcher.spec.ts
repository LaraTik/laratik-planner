import { test, expect } from "@playwright/test";
import { bootstrapTestSession, devSeed, devSignIn } from "./_helpers";

/**
 * Agency switcher (M1.5) — end-to-end coverage of the sidebar
 * popover that lists every agency the signed-in user belongs to
 * and lets them pick one.
 *
 * The dev seed is idempotent by agency slug and issues a signed active-agency
 * cookie for the seeded member. This spec covers both the original
 * single-agency interaction and the multi-agency behavior:
 *
 *  1. The agency switcher trigger is visible in the sidebar.
 *  2. The trigger shows the seeded agency's name.
 *  3. Clicking the trigger opens a popover with a listbox that
 *     includes the seeded agency.
 *  4. The trigger exposes a stable test id (sidebar-agency-switcher-trigger).
 *  5. The listbox contains one row per agency the actor belongs to.
 *  6. Selecting a different row sets the `laratik_active_agency`
 *     cookie via the server action.
 *  7. The refreshed app shell names the newly active agency.
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

  test("user with two agencies sees both rows in the popover", async ({ page }) => {
    const email = "agency-switcher-multi@laratik.local";
    await devSeed(page.request, {
      email,
      agencyName: "Switcher Agency One",
      agencySlug: "switcher-agency-one",
      workspaceName: "Switcher Workspace One",
      workspaceSlug: "switcher-workspace-one",
    });
    await devSeed(page.request, {
      email,
      agencyName: "Switcher Agency Two",
      agencySlug: "switcher-agency-two",
      workspaceName: "Switcher Workspace Two",
      workspaceSlug: "switcher-workspace-two",
    });
    await devSignIn(page.request, { email });

    await page.goto("/app");
    await page.getByTestId("sidebar-agency-switcher-trigger").click();

    const listbox = page.getByRole("listbox", { name: "Agencies" });
    await expect(listbox.getByRole("option", { name: /Switcher Agency One/ })).toBeVisible();
    await expect(listbox.getByRole("option", { name: /Switcher Agency Two/ })).toBeVisible();
  });

  test("selecting another agency updates the signed cookie and active shell", async ({ page }) => {
    const email = "agency-switcher-select@laratik.local";
    const first = await devSeed(page.request, {
      email,
      agencyName: "Selectable Agency One",
      agencySlug: "selectable-agency-one",
      workspaceName: "Selectable Workspace One",
      workspaceSlug: "selectable-workspace-one",
    });
    await devSeed(page.request, {
      email,
      agencyName: "Selectable Agency Two",
      agencySlug: "selectable-agency-two",
      workspaceName: "Selectable Workspace Two",
      workspaceSlug: "selectable-workspace-two",
    });
    await devSignIn(page.request, { email });
    await page.goto("/app");

    const trigger = page.getByTestId("sidebar-agency-switcher-trigger");
    await expect(trigger).toHaveAttribute("aria-label", /Active agency: Selectable Agency Two/);
    const before = await page.context().cookies();
    const priorValue = before.find((cookie) => cookie.name === "laratik_active_agency")?.value;

    await trigger.click();
    await page
      .getByRole("listbox", { name: "Agencies" })
      .getByRole("option", { name: /Selectable Agency One/ })
      .click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(trigger).toHaveAttribute("aria-label", /Active agency: Selectable Agency One/);
    const after = await page.context().cookies();
    const activeCookie = after.find((cookie) => cookie.name === "laratik_active_agency");
    expect(activeCookie?.value).toBeTruthy();
    expect(activeCookie?.value).not.toBe(priorValue);
    expect(activeCookie?.value.startsWith(`${first.agencyId}.`)).toBe(true);
  });
});
