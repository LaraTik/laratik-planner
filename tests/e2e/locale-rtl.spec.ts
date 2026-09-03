import { test, expect, type Page } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

// This contract visits four authenticated routes. A cold isolated Next.js
// server can spend more than the default 30s budget compiling the final
// settings route, so keep the assertion budget explicit without weakening
// any individual navigation or assertion.
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

/**
 * The interface locale is a server-resolved setting, not just a CSS flip.
 * Keep one browser-level contract for the authenticated shell so regressions
 * cannot silently ship an Arabic cookie with English/LTR document metadata.
 */
test("authenticated shell resolves Arabic RTL without horizontal overflow @a11y", async ({
  page,
}) => {
  await bootstrapTestSession(page, { locale: "ar" });

  await gotoStable(page, "/app/w/acme");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "ar");
  await expect(html).toHaveAttribute("dir", "rtl");
  const isMobile = await page.evaluate(() => window.matchMedia("(max-width: 767px)").matches);
  if (isMobile) {
    await expect(page.getByTestId("mobile-navigation")).toBeVisible();
  } else {
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
  }

  const overflowsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflowsHorizontally).toBe(false);

  await gotoStable(page, "/app/w/acme/planning");
  await expect(page.getByRole("heading", { name: "التخطيط", level: 1 })).toBeVisible();
  await expect(page.getByTestId("planning-search-input")).toHaveAttribute(
    "placeholder",
    "ابحث في العنوان أو الوصف",
  );
  const planningOverflowsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(planningOverflowsHorizontally).toBe(false);

  await gotoStable(page, "/app/w/acme/board");
  await expect(page.getByRole("heading", { name: "لوحة سير العمل", level: 1 })).toBeVisible();
  await expect(page.getByTestId("board-search-input")).toHaveAttribute(
    "placeholder",
    "ابحث في العنوان أو الوصف",
  );
  await expect(page.getByRole("heading", { name: "أفكار", level: 2 })).toBeVisible();
  const boardOverflowsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(boardOverflowsHorizontally).toBe(false);

  await gotoStable(page, "/app/w/acme/settings");
  await expect(page.getByRole("heading", { name: "إعدادات مساحة العمل", level: 1 })).toBeVisible();
  await expect(page.getByTestId("settings-setup-checklist-progress")).toContainText("تم إعداد");
  await expect(page.getByTestId("sidebar-settings-lifecycle")).toHaveAttribute(
    "href",
    "/app/w/acme/settings#lifecycle",
  );
  await expect(page.getByRole("heading", { name: "أوقات التسليم", level: 2 })).toBeVisible();
  const settingsOverflowsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(settingsOverflowsHorizontally).toBe(false);

  await expect(page.getByTestId("settings-health-lead-times")).toContainText("صحة الإعدادات");
});
