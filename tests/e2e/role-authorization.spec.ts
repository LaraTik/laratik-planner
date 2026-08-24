import { expect, test } from "@playwright/test";
import { bootstrapRoleSession, type FixtureRole } from "./_helpers";

/**
 * The 8-role authorization matrix.
 *
 * The original role-authorization spec only covered 4 of the 7 workspace
 * roles. This file is the full matrix — for every workspace role, a
 * positive ("I can see my own surface") and one or more negatives
 * ("I cannot see a surface reserved for a different role"). Agency admin
 * is intentionally excluded: by policy an agency admin always has full
 * workspace access (the admin shortcut in hasWorkspaceRole), so a
 * positive/negative matrix for that role would be all positive and add
 * no signal.
 *
 * Surface rules (from `src/lib/auth/policy.ts`):
 *   - INTERNAL_WORKSPACE_ROLES = workspace_manager, content_planner,
 *     designer, internal_reviewer, publisher, viewer (canAccessInternalWorkspace)
 *   - client_reviewer is the only role that satisfies canAccessClientWorkspace
 *   - canManageContent (Quick Create) is workspace_manager + content_planner
 *   - canReview at the content / creative_internal gate is internal_reviewer
 *   - canReview at the creative_client gate is client_reviewer
 *
 * Note on positive assertions: the page header renders the workspace
 * name in an `<p>` eyebrow (not a heading), and the h1 is the page
 * section title (e.g. "Overview", "Reviews queue"). We use page-level
 * `data-testid`s as the stable contract.
 *
 * Pairs with:
 *   - tests/unit/auth-policy.test.ts (policy helpers in isolation)
 *   - PRODUCTION_READINESS_TRACKER.md SEC-003 (role-by-route matrix)
 */

type RoleCase = {
  role: Exclude<FixtureRole, "agency_admin">;
  can: { route: string; testid: string }[];
  cannot: { route: string; marker: RegExp | string }[];
};

const ROLE_MATRIX: RoleCase[] = [
  {
    role: "workspace_manager",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    cannot: [
      // workspace_manager is not an internal_reviewer; the reviews
      // queue renders an empty state to non-reviewers, so a clean
      // negative is the absence of the testid.
      { route: "/app/w/acme/reviews", marker: "reviews-kpi-row" },
      // workspace_manager is not a creator; /planning/new shows the
      // "Creation access required" page (no workspace-planning-new testid).
      { route: "/app/w/acme/planning/new", marker: "workspace-planning-new" },
    ],
  },
  {
    role: "content_planner",
    can: [
      { route: "/app/w/acme/planning", testid: "workspace-planning" },
      { route: "/app/w/acme/planning/new", testid: "workspace-planning-new" },
    ],
    cannot: [
      // A non-reviewer cannot see the reviews queue.
      { route: "/app/w/acme/reviews", marker: "reviews-kpi-row" },
    ],
  },
  {
    role: "designer",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    cannot: [
      // A designer has no reviewer role → no reviews queue.
      { route: "/app/w/acme/reviews", marker: "reviews-kpi-row" },
      // A designer has no creator role → no /planning/new.
      { route: "/app/w/acme/planning/new", marker: "workspace-planning-new" },
    ],
  },
  {
    role: "internal_reviewer",
    can: [{ route: "/app/w/acme/reviews", testid: "reviews-kpi-row" }],
    cannot: [
      // Reviewer has no creator role; /planning/new shows the denied page.
      { route: "/app/w/acme/planning/new", marker: "workspace-planning-new" },
    ],
  },
  {
    role: "client_reviewer",
    can: [{ route: "/app/w/acme/client", testid: "workspace-client-review" }],
    cannot: [
      // Client reviewer has no internal workspace role; planning is gated.
      { route: "/app/w/acme/planning", marker: /Page not found/i },
      // Client reviewer has no internal role; reviews queue is internal.
      { route: "/app/w/acme/reviews", marker: "reviews-kpi-row" },
    ],
  },
  {
    role: "publisher",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    cannot: [
      // Publisher has no creator role → no /planning/new.
      { route: "/app/w/acme/planning/new", marker: "workspace-planning-new" },
      // Publisher has no reviewer role → no reviews queue.
      { route: "/app/w/acme/reviews", marker: "reviews-kpi-row" },
    ],
  },
  {
    role: "viewer",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    cannot: [
      // Viewer has no creator role → no /planning/new.
      { route: "/app/w/acme/planning/new", marker: "workspace-planning-new" },
      // Viewer has no reviewer role → no reviews queue.
      { route: "/app/w/acme/reviews", marker: "reviews-kpi-row" },
    ],
  },
];

test.describe("role-separated workspace access (existing)", () => {
  test("content planner can create while viewer cannot", async ({ page }) => {
    await bootstrapRoleSession(page, "content_planner");
    await page.goto("/app/w/acme/planning");
    await expect(page.getByRole("link", { name: /Quick Create/i })).toBeVisible();

    await bootstrapRoleSession(page, "viewer");
    await page.goto("/app/w/acme/planning");
    await expect(page.getByRole("link", { name: /Quick Create/i })).toHaveCount(0);
    await page.goto("/app/w/acme/planning/new");
    await expect(page.getByRole("heading", { name: "Creation access required" })).toBeVisible();
  });

  test("review roles see only their review surface", async ({ page }) => {
    await bootstrapRoleSession(page, "internal_reviewer");
    await page.goto("/app/w/acme/reviews");
    await expect(page.getByRole("heading", { name: "Reviews queue" })).toBeVisible();

    await bootstrapRoleSession(page, "client_reviewer");
    await page.goto("/app/w/acme/client");
    await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Planning" })).toHaveCount(0);
    await page.goto("/app/w/acme/planning");
    await expect(page.getByRole("heading", { name: /Page not found/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Planning$/i })).toHaveCount(0);
  });

  for (const role of ["workspace_manager", "designer", "publisher", "viewer"] as const) {
    test(`${role} has workspace access without agency-admin privileges`, async ({ page }) => {
      await bootstrapRoleSession(page, role);
      await page.goto("/app/w/acme");
      // Workspace overview page testid is the stable contract.
      await expect(page.getByTestId("workspace-overview")).toBeVisible();
      await expect(page.getByText("No access")).toHaveCount(0);
    });
  }
});

for (const { role, can, cannot } of ROLE_MATRIX) {
  test.describe(`${role} role matrix`, () => {
    test.beforeEach(async ({ page }) => {
      await bootstrapRoleSession(page, role);
    });

    for (const allow of can) {
      test(`can see ${allow.route}`, async ({ page }) => {
        await page.goto(allow.route);
        await expect(page.getByTestId(allow.testid)).toBeVisible();
      });
    }

    for (const deny of cannot) {
      test(`is denied from ${deny.route}`, async ({ page }) => {
        await page.goto(deny.route);
        if (typeof deny.marker === "string") {
          // testid marker — assert the gated surface is NOT rendered.
          await expect(page.getByTestId(deny.marker)).toHaveCount(0);
        } else {
          // heading marker — assert the page is the not-found page.
          await expect(page.getByRole("heading", { name: deny.marker })).toBeVisible();
        }
      });
    }
  });
}
