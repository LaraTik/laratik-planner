import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * P0b (2026-09-03, /ui-ux-pro-max): regression test for the
 * RTL dialog centering bug. The previous DialogContent used
 * `start-1/2` (logical) + `-translate-x-1/2` (physical). In
 * RTL the dialog ended up biased to the left and the left edge
 * was clipped on smaller viewports, which is what the user
 * reported as "not visible correctly the screen" for the
 * design-assignee dialog.
 *
 * The fix is to use physical `left-1/2 top-1/2` so the
 * centering math is direction-agnostic. This test boots the
 * authenticated shell in Arabic and opens the
 * `AssignDesignerDialog` on a planning detail page. It then
 * asserts the dialog's bounding box is centered on the
 * viewport within a small tolerance.
 */
test.setTimeout(60_000);

async function gotoStable(page: Page, path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(path, { waitUntil: "networkidle" });
      return;
    } catch (error) {
      const message = String(error);
      if (attempt === 1 || !message.includes("interrupted by another navigation")) {
        throw error;
      }
    }
  }
}

test("centered dialogs are visually centered under RTL @a11y", async ({ page }) => {
  const seeded = await bootstrapTestSession(page, {
    locale: "ar",
    platformRole: "platform_owner",
  });

  // The seeded content item is deterministic. Opening its detail page
  // also makes the platform-owner-only reset action deterministic, so
  // this required visual invariant never depends on a fixture-dependent
  // button being present in a list view.
  await gotoStable(page, `/app/w/${seeded.workspaceSlug}/planning/${seeded.contentItemId}`);

  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "ar");
  await expect(html).toHaveAttribute("dir", "rtl");

  const overflow = page.getByTestId("workspace-overflow-trigger");
  await expect(overflow).toBeVisible();
  await overflow.click();
  const resetButton = page.getByTestId("workspace-overflow-reset");
  await expect(resetButton).toBeVisible();
  await resetButton.click();

  // Wait for the dialog to mount. Radix renders the dialog in a
  // portal so the element is detached from the layout tree.
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();

  // The viewport and the dialog's bounding box.
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;

  // The dialog's center should be within 4 px of the viewport
  // centerline. Pre-fix this was failing in RTL by half the
  // dialog's width (often > 200 px off).
  const dialogCenterX = box.x + box.width / 2;
  const dialogCenterY = box.y + box.height / 2;
  const viewportCenterX = viewport.width / 2;
  const viewportCenterY = viewport.height / 2;
  expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThanOrEqual(4);
  expect(Math.abs(dialogCenterY - viewportCenterY)).toBeLessThanOrEqual(4);
});
