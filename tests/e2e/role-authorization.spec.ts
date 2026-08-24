import { expect, test } from "@playwright/test";
import { bootstrapRoleSession, type FixtureRole } from "./_helpers";

test.describe("role-separated workspace access", () => {
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
      await expect(page.getByRole("heading", { name: "Acme" })).toBeVisible();
      await expect(page.getByText("No access")).toHaveCount(0);
    });
  }
});

/**
 * The 8-role matrix (7 workspace roles + agency_admin). The matrix
 * below asserts, for every workspace role, a positive "I can see my
 * own surface" and a negative "I cannot see a surface reserved for a
 * different role". This is the e2e complement to
 * `tests/unit/auth-policy.test.ts` (which exercises the policy
 * helpers in isolation) and the role-by-route matrix promised in
 * `PRODUCTION_READINESS_TRACKER.md` SEC-003.
 *
 *   workspace_manager — can see workspace settings; cannot review
 *   content_planner   — can see Quick Create; cannot review
 *   designer          — can see design queue; cannot review
 *   internal_reviewer — can see reviews; cannot create
 *   client_reviewer   — can see client surface; cannot plan
 *   publisher         — can see workspace; cannot create
 *   viewer            — can see workspace; cannot create; cannot review
 *
 * Agency admin is excluded: by policy an agency admin always has
 * full workspace access (the admin shortcut in hasWorkspaceRole),
 * so a positive/negative matrix for that role would all be positive.
 */
type RoleCase = {
  role: Exclude<FixtureRole, "agency_admin">;
  can: { route: string; heading?: RegExp; testid?: string }[];
  cannot: { route: string; assertion: "notFound" | "missingHeading" | "missingTestId"; marker: RegExp | string }[];
};

const ROLE_MATRIX: RoleCase[] = [
  {
    role: "workspace_manager",
    can: [{ route: "/app/w/acme", heading: /^Acme$/ }],
    cannot: [
      { route: "/app/w/acme/reviews", assertion: "notFound", marker: /Page not found/i },
    ],
  },
  {
    role: "content_planner",
    can: [
      { route: "/app/w/acme/planning", testid: "workspace-planning" },
      { route: "/app/w/acme/planning/new" },
    ],
    cannot: [
      // A non-creator without `internal_reviewer` cannot see the reviews
      // queue (it renders an empty state behind a policy gate).
      { route: "/app/w/acme/reviews", assertion: "missingTestId", marker: "reviews-kpi-row" },
    ],
  },
  {
    role: "designer",
    can: [{ route: "/app/w/acme", heading: /^Acme$/ }],
    cannot: [
      // A designer has no reviewer role → no reviews queue.
      { route: "/app/w/acme/reviews", assertion: "missingTestId", marker: "reviews-kpi-row" },
      // A designer has no creator role → no Quick Create.
      { route: "/app/w/acme/planning/new", assertion: "missingHeading", marker: /Quick Create/i },
    ],
  },
  {
    role: "internal_reviewer",
    can: [{ route: "/app/w/acme/reviews", testid: "reviews-kpi-row" }],
    cannot: [
      // Reviewer cannot create; Quick Create is hidden.
      { route: "/app/w/acme/planning", assertion: "missingHeading", marker: /Quick Create/i },
    ],
  },
  {
    role: "client_reviewer",
    can: [{ route: "/app/w/acme/client", heading: /Client review/i }],
    cannot: [
      // Client reviewer has no internal workspace role; planning is gated.
      { route: "/app/w/acme/planning", assertion: "notFound", marker: /Page not found/i },
      // Client reviewer has no internal role; reviews queue is internal.
      { route: "/app/w/acme/reviews", assertion: "missingTestId", marker: "reviews-kpi-row" },
    ],
  },
  {
    role: "publisher",
    can: [{ route: "/app/w/acme", heading: /^Acme$/ }],
    cannot: [
      // Publisher has no creator role → no Quick Create.
      { route: "/app/w/acme/planning", assertion: "missingHeading", marker: /Quick Create/i },
      // Publisher has no reviewer role → no reviews queue.
      { route: "/app/w/acme/reviews", assertion: "missingTestId", marker: "reviews-kpi-row" },
    ],
  },
  {
    role: "viewer",
    can: [{ route: "/app/w/acme", heading: /^Acme$/ }],
    cannot: [
      // Viewer has no creator role → no Quick Create.
      { route: "/app/w/acme/planning", assertion: "missingHeading", marker: /Quick Create/i },
      // Viewer has no reviewer role → no reviews queue.
      { route: "/app/w/acme/reviews", assertion: "missingTestId", marker: "reviews-kpi-row" },
      // Viewer has no creator role → /planning/new shows the denied page.
      { route: "/app/w/acme/planning/new", assertion: "missingHeading", marker: /Quick Create/i },
    ],
  },
];

for (const { role, can, cannot } of ROLE_MATRIX) {
  test.describe(`${role} role matrix`, () => {
    test.beforeEach(async ({ page }) => {
      await bootstrapRoleSession(page, role);
    });

    for (const allow of can) {
      test(`can see ${allow.route}`, async ({ page }) => {
        await page.goto(allow.route);
        if (allow.heading) {
          await expect(page.getByRole("heading", { name: allow.heading })).toBeVisible();
        } else if (allow.testid) {
          await expect(page.getByTestId(allow.testid)).toBeVisible();
        }
      });
    }

    for (const deny of cannot) {
      test(`is denied from ${deny.route} (${deny.assertion})`, async ({ page }) => {
        await page.goto(deny.route);
        if (deny.assertion === "notFound") {
          await expect(page.getByRole("heading", { name: deny.marker as RegExp })).toBeVisible();
        } else if (deny.assertion === "missingHeading") {
          await expect(page.getByRole("heading", { name: deny.marker as RegExp })).toHaveCount(0);
        } else {
          // missingTestId
          await expect(page.getByTestId(deny.marker as string)).toHaveCount(0);
        }
      });
    }
  });
}
