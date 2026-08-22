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
  await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, {
    timeout: 20_000,
    waitUntil: "commit",
  });
  return page.url();
}

async function expectClean(route: string, page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");

  let results: Awaited<ReturnType<AxeBuilder["analyze"]>> | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      break;
    } catch (error) {
      const isNavigationRace =
        error instanceof Error && error.message.includes("Execution context was destroyed");
      if (!isNavigationRace || attempt === 1) throw error;
      await page.waitForLoadState("domcontentloaded");
    }
  }

  if (!results) throw new Error(`Could not scan ${route}`);
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

  // ─── Extended Stitch canonical coverage ──────────────────────────────────
  //
  // The 18 routes below close the coverage gap on the canonical
  // surfaces in `STITCH_CASES` that the original 6-route spec
  // skipped. The visual capture step (`pnpm test:visual`) runs axe
  // per route, so a missing entry here means a CI capture run can
  // re-introduce an a11y regression on a surface we never scan in
  // strict mode. Public routes (`/signin/forgot-password`, `/setup`)
  // are also asserted here so the entire canonical surface matrix is
  // covered in a single suite; the public-only `a11y.spec.ts` still
  // owns the broader public-route scans.

  test("@a11y /signin/forgot-password has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/signin/forgot-password");
    await expectClean("/signin/forgot-password", page);
  });

  // /setup is intentionally NOT scanned here. The page only renders its
  // form for the first user of a deployment (no agency exists yet); the
  // dev seed always creates a singleton agency, so `activeAgencyId()`
  // returns non-null and the page short-circuits to a Next.js
  // `<meta http-equiv="refresh">` redirect to /app. axe's `meta-refresh`
  // rule then fires on the redirect placeholder. The visual capture
  // step (visual-regression.spec.ts) is the only place that needs
  // `/setup` to render, and it tolerates the redirect in WRITE mode
  // (see the `isCaptureMode` branch). A separate test that drops the
  // singleton agency row before the scan would unlock the strict
  // coverage; until then this entry is documented but skipped.

  test("@a11y /app/agency-settings has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings");
    await expectClean("/app/agency-settings", page);
  });

  test("@a11y /app/users has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/users");
    await expectClean("/app/users", page);
  });

  test("@a11y /app/w/[slug]/brand-kit has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/brand-kit");
    await expectClean("/app/w/acme/brand-kit", page);
  });

  test("@a11y /app/w/[slug]/channels has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/channels");
    await expectClean("/app/w/acme/channels", page);
  });

  test("@a11y /app/w/[slug]/team has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/team");
    await expectClean("/app/w/acme/team", page);
  });

  test("@a11y /app/w/[slug]/settings has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/settings");
    await expectClean("/app/w/acme/settings", page);
  });

  test("@a11y /app/w/[slug]/calendar has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/calendar");
    await expectClean("/app/w/acme/calendar", page);
  });

  test("@a11y /app/w/[slug]/board has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/board");
    await expectClean("/app/w/acme/board", page);
  });

  test("@a11y /app/w/[slug]/design-queue has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/design-queue");
    await expectClean("/app/w/acme/design-queue", page);
  });

  test("@a11y /app/w/[slug]/reviews has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/reviews");
    await expectClean("/app/w/acme/reviews", page);
  });

  test("@a11y /app/w/[slug]/planning/new has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/planning/new");
    await expectClean("/app/w/acme/planning/new", page);
  });

  test("@a11y /app/w/[slug]/planning/batch has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/planning/batch");
    await expectClean("/app/w/acme/planning/batch", page);
  });

  test("@a11y /app/w/[slug]/library has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/library");
    await expectClean("/app/w/acme/library", page);
  });

  test("@a11y /app/w/[slug]/client has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/client");
    await expectClean("/app/w/acme/client", page);
  });

  test("@a11y /app/w/[slug]/client/calendar has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/w/acme/client/calendar");
    await expectClean("/app/w/acme/client/calendar", page);
  });
});
