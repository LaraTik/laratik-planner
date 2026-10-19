import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapTestSession } from "./_helpers";

const AGENCY_SLUG = "community-e2e";
const WORKSPACE_SLUG = "community";
const BASE = `/app/a/${AGENCY_SLUG}/w/${WORKSPACE_SLUG}/engagement`;
const FIXTURE_MESSAGE = "Could you share this with our youth team?";
const SECTIONS = [
  "",
  "inbox",
  "comments",
  "reviews",
  "automations",
  "playbooks",
  "test-lab",
  "analytics",
  "connections",
  "team",
  "settings",
  "activity",
  "setup",
] as const;

async function seedCommunitySession(
  page: Parameters<typeof bootstrapTestSession>[0],
  locale = "en",
) {
  return bootstrapTestSession(page, {
    email: "community-e2e@laratik.local",
    name: "Community Operator",
    agencyName: "Community E2E Agency",
    agencySlug: AGENCY_SLUG,
    workspaceName: "Community E2E Workspace",
    workspaceSlug: WORKSPACE_SLUG,
    agencyAdmin: true,
    locale: locale as "en" | "ar",
    communityInboxFixture: true,
  });
}

test.describe("Community & Inbox", () => {
  test.describe.configure({ mode: "serial" });

  test("inbox cards open the thread and explain when author identity is unavailable", async ({
    page,
  }) => {
    await seedCommunitySession(page);
    await page.goto(`${BASE}/inbox`, { waitUntil: "domcontentloaded" });

    const conversation = page.getByRole("link", { name: new RegExp(FIXTURE_MESSAGE) }).first();
    await expect(conversation).toBeVisible();
    await expect(page.getByText("Author name not provided by the platform").first()).toBeVisible();
    await expect(page.getByText("Unknown author")).toHaveCount(0);
    await conversation.click();

    await expect(page).toHaveURL(/\/engagement\/inbox\?.*conversation=/);
    await expect(page.getByText(FIXTURE_MESSAGE).last()).toBeVisible();
  });

  test("Post comments opens the shared inbox thread", async ({ page }) => {
    await seedCommunitySession(page);
    await page.goto(`${BASE}/comments`, { waitUntil: "domcontentloaded" });

    const conversation = page.getByRole("link", { name: new RegExp(FIXTURE_MESSAGE) }).first();
    await expect(conversation).toBeVisible();
    await conversation.click();

    await expect(page).toHaveURL(/\/engagement\/inbox\?.*conversation=/);
    await expect(page.getByText(FIXTURE_MESSAGE).last()).toBeVisible();
  });

  test("Team assigns a conversation to an active workspace member", async ({ page }) => {
    await seedCommunitySession(page);
    await page.goto(`${BASE}/team`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Team & routing" }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    const assignee = page.getByLabel("Assign").first();
    await assignee.selectOption({ label: "Community Assignee" });
    await expect(assignee).not.toHaveValue("");
    const save = page.getByRole("button", { name: "Save assignment" }).first();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: "Assignment saved." })).toBeVisible();
  });

  test("actions without an implemented or validated write path remain disabled", async ({
    page,
  }) => {
    const guardedActions = [
      ["reviews", "community-review-reject-disabled"],
      ["reviews", "community-review-approve-disabled"],
      ["automations", "community-automation-emergency-stop-disabled"],
      ["automations", "community-automation-configure-disabled"],
      ["settings", "community-settings-emergency-stop-disabled"],
      ["activity", "community-activity-export-disabled"],
    ] as const;

    for (const locale of ["en", "ar"] as const) {
      await seedCommunitySession(page, locale);
      for (const [section, testId] of guardedActions) {
        await page.goto(`${BASE}/${section}`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle");
        await expect(page.getByTestId(testId)).toBeDisabled();
      }
    }
  });

  test("all Community routes render in English and Arabic without serious accessibility issues", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    for (const locale of ["en", "ar"] as const) {
      await seedCommunitySession(page, locale);
      for (const width of [1440, 1280, 1024, 768, 375]) {
        await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
        for (const section of SECTIONS) {
          const route = section ? `${BASE}/${section}` : BASE;
          await page.goto(route, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle");
          await expect(page.locator("main")).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          await expect(page.locator("html")).toHaveAttribute(
            "dir",
            locale === "ar" ? "rtl" : "ltr",
          );

          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          );
          expect(overflow, `${route} overflows at ${width}px (${locale})`).toBe(false);

          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
            .analyze();
          const serious = results.violations.filter(
            (violation) => violation.impact === "critical" || violation.impact === "serious",
          );
          expect(serious, `${route} has serious accessibility issues (${locale})`).toEqual([]);
        }
      }
    }
  });
});
