import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * The interface locale is a server-resolved setting, not just a CSS flip.
 * Keep one browser-level contract for the authenticated shell so regressions
 * cannot silently ship an Arabic cookie with English/LTR document metadata.
 */
test("authenticated shell resolves Arabic RTL without horizontal overflow @a11y", async ({
  page,
}) => {
  await bootstrapTestSession(page, { locale: "ar" });

  await page.goto("/app/w/acme");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "ar");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(page.getByTestId("app-sidebar")).toBeVisible();

  const overflowsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowsHorizontally).toBe(false);
});
