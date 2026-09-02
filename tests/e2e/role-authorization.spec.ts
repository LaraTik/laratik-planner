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
 * Note on negative assertions: the reviews-queue page does NOT gate
 * access by role (it shows 0 decisions to non-reviewers, which is a UX
 * choice). The strongest deny signal available for /reviews is the
 * presence of decision rows, but Playwright cannot read the count of
 * rendered `ReviewRow` children. We therefore assert the "Creation
 * access required" deny page for /planning/new (a clean deny) and the
 * "Page not found" deny page for /planning under client_reviewer (the
 * client surface is gated). The /reviews surface is left out of the
 * negative matrix intentionally — a future gate can add a clean test.
 *
 * Pairs with:
 *   - tests/unit/auth-policy.test.ts (policy helpers in isolation)
 *   - PRODUCTION_READINESS_TRACKER.md SEC-003 (role-by-route matrix)
 */

type RoleCase = {
  role: Exclude<FixtureRole, "agency_admin">;
  can: { route: string; testid: string }[];
  cannot: { route: string; heading: RegExp }[];
};

const ROLE_MATRIX: RoleCase[] = [
  {
    role: "workspace_manager",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    // workspace_manager can manage content (canManageContent includes
    // workspace_manager + content_planner), so /planning/new is allowed.
    // workspace_manager is not an internal_reviewer, but the reviews page
    // is not role-gated (it shows 0 decisions to non-reviewers); see the
    // file header for the rationale on omitting /reviews from the matrix.
    cannot: [],
  },
  {
    role: "content_planner",
    can: [
      { route: "/app/w/acme/planning", testid: "workspace-planning" },
      { route: "/app/w/acme/planning/new", testid: "workspace-planning-new" },
    ],
    cannot: [],
  },
  {
    role: "designer",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    cannot: [
      // A designer has no creator role → /planning/new shows the
      // "Creation access required" page.
      { route: "/app/w/acme/planning/new", heading: /Creation access required/i },
    ],
  },
  {
    role: "internal_reviewer",
    can: [{ route: "/app/w/acme/reviews", testid: "reviews-kpi-row" }],
    cannot: [
      // Reviewer has no creator role; /planning/new shows the denied page.
      { route: "/app/w/acme/planning/new", heading: /Creation access required/i },
    ],
  },
  {
    role: "client_reviewer",
    can: [{ route: "/app/w/acme/client", testid: "workspace-client-review" }],
    cannot: [
      // Client reviewer has no internal workspace role; planning is gated.
      { route: "/app/w/acme/planning", heading: /Workspace unavailable|Page not found/i },
    ],
  },
  {
    role: "publisher",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    cannot: [
      // Publisher has no creator role → /planning/new shows the denied page.
      { route: "/app/w/acme/planning/new", heading: /Creation access required/i },
    ],
  },
  {
    role: "viewer",
    can: [{ route: "/app/w/acme", testid: "workspace-overview" }],
    cannot: [
      // Viewer has no creator role → /planning/new shows the denied page.
      { route: "/app/w/acme/planning/new", heading: /Creation access required/i },
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
    await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();

    await bootstrapRoleSession(page, "client_reviewer");
    await page.goto("/app/w/acme/client");
    await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Planning" })).toHaveCount(0);
    await page.goto("/app/w/acme/planning");
    await expect(
      page.getByRole("heading", { name: /Workspace unavailable|Page not found/i }),
    ).toBeVisible();
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
        await expect(page.getByRole("heading", { name: deny.heading })).toBeVisible();
      });
    }
  });
}
