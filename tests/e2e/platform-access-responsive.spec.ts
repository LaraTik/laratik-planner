import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { devSeed, devSignIn } from "./_helpers";

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
] as const;

test("Platform Access keeps identity, role, and primary actions usable at six viewports", async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `e2e-responsive-owner-${stamp}@laratik.local`;
  const seeded = await devSeed(page.request, {
    email,
    agencyAdmin: false,
    platformRole: "platform_owner",
    agencySlug: `responsive-owner-${stamp}`,
    workspaceSlug: `responsive-owner-${stamp}`,
  });
  await devSignIn(page.request, { email, role: "user" });
  const outputDir = join("test-results", "platform-access-responsive");
  mkdirSync(outputDir, { recursive: true });

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/app/platform/access");
    const assignment =
      viewport.width < 1024
        ? page.getByTestId(`platform-access-card-${seeded.userId}`)
        : page.getByTestId(`platform-access-row-${seeded.userId}`);
    await expect(assignment.getByText(email, { exact: true })).toBeVisible();
    await expect(assignment.getByText("Platform Owner", { exact: true })).toBeVisible();
    const change = page.getByRole("button", { name: `Change role for ${email}` });
    await expect(change).toBeVisible();
    const box = await change.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    const layout = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      return {
        overflow: document.documentElement.scrollWidth - viewportWidth,
        offenders: [...document.querySelectorAll<HTMLElement>("body *")]
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName,
              testId: element.dataset.testid ?? null,
              className: element.className,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            };
          })
          .filter((element) => element.right > viewportWidth + 1 || element.left < -1)
          .slice(0, 8),
      };
    });
    expect(layout.overflow, JSON.stringify(layout.offenders, null, 2)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: join(outputDir, `${seeded.userId}-${viewport.width}x${viewport.height}.png`),
      fullPage: true,
    });
  }
});
