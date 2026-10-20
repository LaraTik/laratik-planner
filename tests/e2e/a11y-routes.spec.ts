import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapTestSession, type SeedResult } from "./_helpers";

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

function workspaceRoute(seeded: SeedResult, rest = "") {
  return `/app/a/test-agency/w/${seeded.workspaceSlug}${rest ? `/${rest}` : ""}`;
}

async function createDraft(
  page: import("@playwright/test").Page,
  title: string,
  seeded: SeedResult,
) {
  await page.goto(workspaceRoute(seeded, "planning/new"));
  await page.getByLabel(/Title/i).first().fill(title);
  await page.getByRole("button", { name: /Create draft/i }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith(`/app/a/test-agency/w/${seeded.workspaceSlug}/planning/`) &&
      /^[0-9a-f-]+$/.test(url.pathname.split("/").at(-1) ?? ""),
    { timeout: 20_000 },
  );
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

  test("@a11y /app/media has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/media");
    await expectClean("/app/media", page);
  });

  test("@a11y /app/account has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/account");
    await expectClean("/app/account", page);
  });

  test("@a11y /app/account dark theme has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/account");
    await page.getByTestId("account-theme-input").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("theme-preference-form").getByRole("status")).toHaveText(
      "Appearance saved.",
    );
    await expectClean("/app/account [dark]", page);
  });

  test("@a11y /app/w/[slug] (workspace overview) has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded);
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/media has no critical violations", async ({ page }) => {
    const invalidNestingWarnings: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("<nav> cannot be a descendant of <p>")
      ) {
        invalidNestingWarnings.push(message.text());
      }
    });
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "media");
    await page.goto(route);
    await expectClean(route, page);
    await expect(page.getByRole("navigation", { name: "Folder path" })).toBeVisible();
    expect(invalidNestingWarnings).toEqual([]);
  });

  test("@a11y /app/w/[slug]/planning (planning list) has no critical violations", async ({
    page,
  }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "planning");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/planning/[id] (content detail) has no critical violations", async ({
    page,
  }) => {
    const seeded = await bootstrapTestSession(page);
    await createDraft(page, `A11y detail ${Date.now()}`, seeded);
    await expectClean(page.url(), page);
  });

  test("@a11y /app/w/[slug]/planning/[id]?tab=publishing has no critical violations", async ({
    page,
  }) => {
    // Phase 7 of the planning-detail refactor (2026-08-30)
    // absorbed the standalone `/publish` route into the
    // Publishing tab. The `/publish` URL is now a server-side
    // redirect to `#publishing`; the publishing form lives
    // inside the planning detail page (mount testID
    // `publish-package-form-mount`). The a11y sweep now targets
    // the planning detail page with the publishing tab active.
    const seeded = await bootstrapTestSession(page);
    await page.goto(`${workspaceRoute(seeded, `planning/${seeded.contentItemId}`)}#publishing`);
    // The shell may mount the panel asynchronously after the
    // hash syncs; give the form mount a beat to appear.
    await expect(page.getByTestId("publish-package-form-mount")).toBeVisible({
      timeout: 10_000,
    });
    await expectClean(page.url(), page);
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

  test("@a11y /app/agency-settings/ai has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings/ai");
    await expectClean("/app/agency-settings/ai", page);
  });

  test("@a11y agency plan settings has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings/plan");
    await expectClean("/app/agency-settings/plan", page);
  });

  test("@a11y agency social settings has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings/social");
    await expectClean("/app/agency-settings/social", page);
  });

  test("@a11y agency social provider settings has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings/social/providers");
    await expectClean("/app/agency-settings/social/providers", page);
  });

  test("@a11y agency storage settings has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings/storage");
    await expectClean("/app/agency-settings/storage", page);
  });

  test("@a11y agency advertising settings has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings/advertising");
    await expect(page.getByTestId("advertising-settings")).toBeVisible();
    await expectClean("/app/agency-settings/advertising", page);
  });

  test("@a11y /app/users has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/users");
    await expectClean("/app/users", page);
  });

  test("@a11y /app/w/[slug]/brand-kit has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "brand-kit");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/channels has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "channels");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/analytics/social has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "analytics/social");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/analytics/advertising has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "analytics/advertising");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/analytics/advertising renders Arabic RTL", async ({ page }) => {
    const seeded = await bootstrapTestSession(page, { locale: "ar" });
    const route = workspaceRoute(seeded, "analytics/advertising");
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expectClean(`${route} [ar]`, page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("@a11y /app/w/[slug]/research has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "research");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/team has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "team");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/settings has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "settings");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/calendar has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "calendar");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/board has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "board");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/design-queue has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "design-queue");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/reviews has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "reviews");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/planning/new has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "planning/new");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/planning/batch has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "planning/batch");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/planning/monthly has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "planning/monthly");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/brand-kit/profile has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "brand-kit/profile");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/agency-settings/planning-packs has no critical violations", async ({ page }) => {
    await bootstrapTestSession(page);
    await page.goto("/app/agency-settings/planning-packs");
    await expectClean("/app/agency-settings/planning-packs", page);
  });

  test("@a11y /app/w/[slug]/library has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "library");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/client has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "client");
    await page.goto(route);
    await expectClean(route, page);
  });

  test("@a11y /app/w/[slug]/client/calendar has no critical violations", async ({ page }) => {
    const seeded = await bootstrapTestSession(page);
    const route = workspaceRoute(seeded, "client/calendar");
    await page.goto(route);
    await expectClean(route, page);
  });
});
