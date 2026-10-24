import { expect, test } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

for (const locale of ["en", "ar"] as const) {
  test(`agency report channel selection works in ${locale.toUpperCase()}`, async ({ page }) => {
    const suffix = `${locale}-${Date.now().toString(36)}`;
    const seeded = await bootstrapTestSession(page, {
      locale,
      agencyName: `Reports ${suffix}`,
      agencySlug: `reports-${suffix}`,
      workspaceName: `Reports workspace ${suffix}`,
      workspaceSlug: `reports-${suffix}`,
    });

    await page.goto("/app/agency-settings/reports");
    await expect(page.getByTestId("reports-root")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");

    const firstChannel = page.getByTestId(`report-channel-${seeded.channelIds[0]!}`);
    const firstChannelCheckbox = firstChannel.getByRole("checkbox");
    await expect(firstChannelCheckbox).toBeChecked();
    await firstChannelCheckbox.uncheck();
    await expect(firstChannel).toBeVisible();
    await expect(firstChannelCheckbox).not.toBeChecked();
    await expect(firstChannel.locator('input[name="channelIds"]')).toHaveCount(0);

    const workspace = page.getByTestId(`report-workspace-${seeded.workspaceId}`);
    const workspaceCheckbox = workspace.getByRole("checkbox");
    await workspaceCheckbox.uncheck();
    await expect(firstChannel).toHaveCount(0);
    await workspaceCheckbox.check();

    await expect(firstChannel).toBeVisible();
    await expect(firstChannelCheckbox).not.toBeChecked();
    await expect(firstChannel.locator('input[name="channelIds"]')).toHaveCount(0);

    for (const width of [375, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.getByTestId("reports-root")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
    }
  });
}
