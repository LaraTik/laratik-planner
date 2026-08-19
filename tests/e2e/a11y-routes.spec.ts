import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapTestSession } from "./_helpers";

/**
 * Per-route axe-core scan for the authenticated app shell.
 *
 * Pairs with `a11y.spec.ts` (public routes) to cover the whole app.
 * These specs need a seeded session because they hit authenticated
 * routes. Each test creates a draft so the planning detail page has
 * real content to scan (the empty state has its own DOM shape).
 */

const VIOLATION_FILTER = ["critical", "serious"] as const;

function reportViolations(route: string, results: Awaited<ReturnType<AxeBuilder["analyze"]>>) {
  const critical = results.violations.filter((v) => VIOLATION_FILTER.includes(v.impact as never));
  if (critical.length === 0) return;
  const lines = critical.flatMap((v) => {
    const header = `  [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`;
    const nodeDetails = v.nodes.map((n) => {
      const target = Array.isArray(n.target) ? n.target.join(" ") : String(n.target);
      const summary = n.failureSummary ?? "";
      return `    target: ${target}\n    summary: ${summary.replace(/\n/g, " | ")}`;
    });
    return [header, ...nodeDetails];
  });
  return new Error(
    `${route} has ${critical.length} critical/serious a11y violation(s):\n${lines.join("\n")}`,
  );
}

async function createDraft(page: import("@playwright/test").Page, title: string) {
  await page.goto("/app/w/acme/planning/new");
  await page.getByLabel(/Title/i).first().fill(title);
  await page.getByRole("button", { name: /Create draft/i }).click();
  await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, { timeout: 10_000 });
  return page.url();
}

async function expectClean(route: string, page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  const err = reportViolations(route, results);
  if (err) throw err;
  expect(err).toBeUndefined();
}

test.describe("a11y: authenticated routes (WCAG 2.2 AA)", () => {
  test("@a11y /app has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app");
    await expectClean("/app", page);
  });

  test("@a11y /app/workspaces has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/workspaces");
    await expectClean("/app/workspaces", page);
  });

  test("@a11y /app/account has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/account");
    await expectClean("/app/account", page);
  });

  test("@a11y /app/w/[slug] (workspace overview) has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme");
    await expectClean("/app/w/acme", page);
  });

  test("@a11y /app/w/[slug]/planning (planning list) has no critical violations", async ({
    page,
  }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/planning");
    await expectClean("/app/w/acme/planning", page);
  });

  test("@a11y /app/w/[slug]/planning/[id] (content detail) has no critical violations", async ({
    page,
  }) => {
    await bootstrapTestSession(page);
    await createDraft(page, `A11y detail ${Date.now()}`);
    await expectClean("/app/w/acme/planning/[id]", page);
  });
});
