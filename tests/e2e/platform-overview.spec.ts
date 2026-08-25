import { expect, test } from "@playwright/test";
import { devSeed, devSignIn } from "./_helpers";

/**
 * Platform overview E2E (M1.8) — gate behavior on `/app/platform/*`.
 *
 * Two assertions, one of each side of the gate:
 *
 *   1. Non-platform-admin sees the Forbidden surface (NOT a redirect).
 *      The page must render the same URL the actor typed so the
 *      audit log can record the exact attempt. (See the layout
 *      comment in `src/app/(app)/app/platform/layout.tsx` for why
 *      the gate is intentionally non-redirecting.)
 *
 *   2. Platform admin sees the overview KPIs. The seed grants a
 *      `platform_administrator` row via the `platformAdmin: true`
 *      flag on `/api/dev/seed`. The page renders four aggregate
 *      KPIs: total agencies, active users, total workspaces, AI
 *      usage. The test does NOT assert the values (they depend on
 *      the seed state) — only that the row + the recent-agencies
 *      card are present.
 *
 * The forbidden test seeds a `user` role (no agency-admin, no
 * platform-admin) so the gate is exercised at its strictest setting.
 */

test.describe("/app/platform overview — gate behavior", () => {
  test("non-platform-admin sees the Forbidden surface (no redirect)", async ({ page }) => {
    const nonAdminEmail = `e2e-nonplatform-${Date.now()}@laratik.local`;
    await devSeed(page.request, {
      email: nonAdminEmail,
      agencyAdmin: false,
      workspaceRoles: ["viewer"],
      platformAdmin: false,
    });
    await devSignIn(page.request, { email: nonAdminEmail, role: "user" });

    // Visit the overview URL. The response must be a 200 (no
    // redirect) so the URL stays stable for the audit log.
    const response = await page.goto("/app/platform/overview");
    expect(response, "navigation must produce a response").not.toBeNull();
    expect(response!.status(), "forbidden page is a 200, not a redirect").toBe(200);
    expect(page.url(), "URL must not change on a forbidden platform view").toMatch(
      /\/app\/platform\/overview$/,
    );

    // The forbidden surface is rendered with its data-testid. The
    // title says "Forbidden" and the description names the gate.
    await expect(page.getByTestId("platform-forbidden")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /forbidden/i }),
      "title announces the gate failure",
    ).toBeVisible();

    // The overview KPIs MUST NOT leak. The row testid is a stable
    // contract — its presence is the strongest signal that the gate
    // short-circuited before any data fetch.
    await expect(page.getByTestId("platform-overview-kpi-row")).toHaveCount(0);
    await expect(page.getByTestId("platform-overview-kpi-agencies")).toHaveCount(0);
    await expect(page.getByTestId("platform-overview-kpi-users")).toHaveCount(0);
    await expect(page.getByTestId("platform-overview-kpi-workspaces")).toHaveCount(0);
    await expect(page.getByTestId("platform-overview-kpi-ai")).toHaveCount(0);
  });

  test("platform admin sees the overview KPIs", async ({ page }) => {
    const adminEmail = `e2e-platformadmin-${Date.now()}@laratik.local`;
    const seed = await devSeed(page.request, {
      email: adminEmail,
      agencyAdmin: false,
      workspaceRoles: [],
      platformRole: "platform_owner",
    });
    await devSignIn(page.request, { email: adminEmail, role: "user" });

    const response = await page.goto("/app/platform/overview");
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    // The gate is happy — the forbidden surface must NOT render.
    await expect(page.getByTestId("platform-forbidden")).toHaveCount(0);

    // PageHeader announces the surface; the title "Overview" is
    // rendered under the eyebrow "Platform".
    await expect(
      page.getByRole("heading", { name: "Overview", level: 1 }),
      "title is the overview page title",
    ).toBeVisible();

    // The 4-KPI row + each KPI tile is present. We assert presence
    // (not values) so the test is robust to aggregate drift.
    await expect(page.getByTestId("platform-overview-kpi-row")).toBeVisible();
    await expect(page.getByTestId("platform-overview-kpi-agencies")).toBeVisible();
    await expect(page.getByTestId("platform-overview-kpi-users")).toBeVisible();
    await expect(page.getByTestId("platform-overview-kpi-workspaces")).toBeVisible();
    await expect(page.getByTestId("platform-overview-kpi-ai")).toBeVisible();

    // The "Recent agencies" card or its empty state is present
    // (depending on whether the seed created one or more agencies).
    // We accept either because the test seeds only the singleton —
    // the empty state path is valid when an earlier run revoked it.
    const recentEmpty = page.getByTestId("platform-overview-recent-empty");
    const recentList = page.getByTestId("platform-overview-recent-list");
    await expect(recentEmpty.or(recentList)).toBeVisible();

    // The "View agencies" CTA links to the agencies list — exercises
    // the navigation to a sibling M1.8 surface.
    const cta = page.getByTestId("platform-overview-view-agencies");
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/app\/platform\/agencies$/);
    await expect(page.getByRole("heading", { name: "Agencies", level: 1 })).toBeVisible();

    // Smoke: the agency we just seeded is reachable by id. Use the
    // seed's agencyId directly so the test is order-independent.
    await page.goto(`/app/platform/agencies/${seed.agencyId}`);
    await expect(
      page.getByTestId("platform-agency-kpi-row"),
      "per-agency KPI row renders for the seeded agency",
    ).toBeVisible();
  });
});
