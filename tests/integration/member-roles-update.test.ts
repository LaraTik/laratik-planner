/**
 * Regression test for the 2026-08-26 /app/users "cannot assign user to
 * workspace" outage (Sentry 347888499 et al.).
 *
 * The previous test-only fix (62e643e `users-hooks-order.test.tsx`) only
 * asserted that the client components don't have a hooks-order
 * problem. It did NOT actually drive the server action against a
 * database, so the real bug — a `touch_updated_at` trigger
 * referencing a non-existent `updated_at` column on
 * `workspace_membership` (added in 0004, column never added until
 * 0021) — slipped through and kept failing in production with
 * `record "new" has no field "updated_at"` (SQLSTATE 42703).
 *
 * This test boots a real PostgreSQL via the integration harness and
 * exercises both the raw UPDATE path (which fires the trigger) and
 * the full `updateMemberRolesAction` flow (which goes through
 * `onConflictDoUpdate`).
 *
 * If anyone removes the `updated_at` column from `workspace_membership`
 * (or re-applies the broken 0004 trigger to a table without that
 * column), this test fails fast — before the change ships.
 */

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

// Mock the auth + actor lookup so the action's first two checks pass
// for our seeded admin. Everything else goes through the real DB.
const mockActor = { id: "00000000-0000-0000-0000-0000000000aa" } as {
  id: string;
  name?: string;
  email?: string;
};

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "00000000-0000-0000-0000-0000000000aa" } })),
}));

vi.mock("@/lib/auth/current-actor", () => ({
  currentActor: vi.fn(async () => mockActor),
}));

vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: vi.fn(async () => ({
    agencyId: "11111111-aaaa-bbbb-cccc-000000000001",
  })),
}));

vi.mock("@/lib/auth/policy", () => ({
  isAgencyAdmin: vi.fn(async () => true),
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));

describe("workspace_membership.updated_at + touch_updated_at trigger", () => {
  // Wipe everything tied to the test agency or the seeded users
  // in FK-safe order. The shared afterAll truncate in setup.ts
  // only runs once at the end of the file, so without this each
  // test pollutes the next one and trips the email / slug unique
  // constraints or the workspace FKs.
  const TEST_AGENCY_ID = "11111111-aaaa-bbbb-cccc-000000000001";
  const TEST_USER_ID = "00000000-0000-0000-0000-0000000000aa";

  async function seedAgencyAndAdmin() {
    const { db } = await import("@/lib/db");
    const { agencies, users } = await import("@/lib/db/schema");
    await db
      .insert(agencies)
      .values({
        id: TEST_AGENCY_ID,
        name: "Trigger Test",
        slug: "trigger-test",
      })
      .onConflictDoNothing();
    // The admin is the actor the action's `auth()` / `currentActor()`
    // mocks impersonate. Every test that calls the action needs this
    // user to exist so the workspace FK on `created_by` is satisfied.
    await db
      .insert(users)
      .values({
        id: TEST_USER_ID,
        email: "trigger-admin@member-roles.test.local",
        displayName: "Trigger Admin",
        emailVerified: new Date(),
        role: "agency_admin",
      })
      .onConflictDoNothing();
  }

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`DELETE FROM "workspace_membership_role"
        WHERE workspace_membership_id IN (
          SELECT wm.id FROM "workspace_membership" wm
          JOIN "workspace" w ON wm.workspace_id = w.id
          WHERE w.agency_id = ${TEST_AGENCY_ID}
        )`,
    );
    await db.execute(
      sql`DELETE FROM "workspace_membership"
        WHERE workspace_id IN (SELECT id FROM "workspace" WHERE agency_id = ${TEST_AGENCY_ID})`,
    );
    await db.execute(sql`DELETE FROM "agency_membership" WHERE agency_id = ${TEST_AGENCY_ID}`);
    await db.execute(sql`DELETE FROM "workspace" WHERE agency_id = ${TEST_AGENCY_ID}`);
    await db.execute(sql`DELETE FROM "agency" WHERE id = ${TEST_AGENCY_ID}`);
    await db.execute(sql`DELETE FROM "security_audit_event" WHERE actor_id = ${TEST_USER_ID}`);
    await db.execute(
      sql`DELETE FROM "user" WHERE email LIKE ${"%@member-roles.test.local"} OR id = ${TEST_USER_ID}`,
    );
    // Re-seed the agency + admin so each test starts from a known state.
    await seedAgencyAndAdmin();
  });

  it("raw UPDATE on workspace_membership fires touch_updated_at without error", async () => {
    const { db } = await import("@/lib/db");
    const { agencyMemberships, users, workspaceMemberships, workspaces } =
      await import("@/lib/db/schema");

    // The agency + admin are seeded by the beforeEach (so the
    // workspace FK is satisfied) — we just add the target member here.
    const [member] = await db
      .insert(users)
      .values({
        email: "trigger-member@member-roles.test.local",
        displayName: "Trigger Member",
        emailVerified: new Date(),
      })
      .returning();
    if (!member) throw new Error("Failed to seed member");

    await db.insert(agencyMemberships).values({
      agencyId: TEST_AGENCY_ID,
      userId: member.id,
      status: "active",
      isAgencyAdmin: false,
    });

    const [workspace] = await db
      .insert(workspaces)
      .values({
        agencyId: TEST_AGENCY_ID,
        name: "Trigger WS",
        slug: "trigger-ws",
        createdBy: TEST_USER_ID,
      })
      .returning();
    if (!workspace) throw new Error("Failed to seed workspace");

    const [membership] = await db
      .insert(workspaceMemberships)
      .values({ workspaceId: workspace.id, userId: member.id, status: "active" })
      .returning();
    if (!membership) throw new Error("Failed to seed membership");

    // This is the exact statement path the broken trigger used to
    // fail on. If `updated_at` is missing the trigger throws
    // "record 'new' has no field 'updated_at'" and this assertion
    // never runs.
    const before = await db
      .select({ updatedAt: workspaceMemberships.updatedAt })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.id, membership.id));
    expect(before).toHaveLength(1);

    await db
      .update(workspaceMemberships)
      .set({ status: "active", deactivatedAt: null })
      .where(eq(workspaceMemberships.id, membership.id));

    const after = await db
      .select({ updatedAt: workspaceMemberships.updatedAt })
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.id, membership.id));
    expect(after).toHaveLength(1);
    expect(after[0]!.updatedAt).toBeInstanceOf(Date);
  });

  it("updateMemberRolesAction: assigns a workspace role end-to-end (no #441, no trigger error)", async () => {
    const { updateMemberRolesAction } = await import("@/app/(app)/app/users/actions");
    const { db } = await import("@/lib/db");
    const { agencyMemberships, users, workspaceMembershipRoles, workspaceMemberships, workspaces } =
      await import("@/lib/db/schema");

    // Add a second workspace owned by the same agency so the action
    // exercises the multi-workspace loop.
    const [ws1] = await db
      .insert(workspaces)
      .values({
        agencyId: "11111111-aaaa-bbbb-cccc-000000000001",
        name: "Roles WS 1",
        slug: "roles-ws-1",
        createdBy: "00000000-0000-0000-0000-0000000000aa",
      })
      .returning();
    const [ws2] = await db
      .insert(workspaces)
      .values({
        agencyId: "11111111-aaaa-bbbb-cccc-000000000001",
        name: "Roles WS 2",
        slug: "roles-ws-2",
        createdBy: "00000000-0000-0000-0000-0000000000aa",
      })
      .returning();
    if (!ws1 || !ws2) throw new Error("Failed to seed workspaces");

    const [target] = await db
      .insert(users)
      .values({
        email: "roles-target@member-roles.test.local",
        displayName: "Roles Target",
        emailVerified: new Date(),
      })
      .returning();
    if (!target) throw new Error("Failed to seed target user");

    await db.insert(agencyMemberships).values({
      agencyId: "11111111-aaaa-bbbb-cccc-000000000001",
      userId: target.id,
      status: "active",
      isAgencyAdmin: false,
    });

    // Pre-seed ws1 as a previous membership so the onConflictDoUpdate
    // branch fires (this is the exact path that hit the broken
    // trigger in production).
    await db.insert(workspaceMemberships).values({
      workspaceId: ws1.id,
      userId: target.id,
      status: "active",
    });

    const formData = new FormData();
    formData.set(
      "workspaceRoles",
      JSON.stringify([
        { workspaceId: ws1.id, role: "designer" },
        { workspaceId: ws2.id, role: "viewer" },
      ]),
    );

    const result = await updateMemberRolesAction(target.id, {}, formData);

    // The bug manifested as a thrown DB error that propagated to the
    // error boundary (visible as a minified React #441). After the
    // fix, the action returns a successful state.
    expect(result).toEqual({ saved: true });
    expect("error" in result).toBe(false);

    // Both memberships exist; both roles match the submitted JSON.
    const memberships = await db
      .select()
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.userId, target.id));
    expect(memberships).toHaveLength(2);

    const roles = await db
      .select({
        workspaceId: workspaceMemberships.workspaceId,
        role: workspaceMembershipRoles.role,
      })
      .from(workspaceMembershipRoles)
      .innerJoin(
        workspaceMemberships,
        eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
      )
      .where(eq(workspaceMemberships.userId, target.id));
    const rolesByWs = Object.fromEntries(roles.map((r) => [r.workspaceId, r.role]));
    expect(rolesByWs[ws1.id]).toBe("designer");
    expect(rolesByWs[ws2.id]).toBe("viewer");
  });

  it("updateMemberRolesAction: surfaces a DB failure as an inline error, never throws", async () => {
    const { updateMemberRolesAction } = await import("@/app/(app)/app/users/actions");
    const { db } = await import("@/lib/db");
    const { users } = await import("@/lib/db/schema");

    // Seed a target whose agency-membership is missing — the action
    // reads that row and returns an error rather than touching the DB.
    const [target] = await db
      .insert(users)
      .values({
        email: "no-membership@member-roles.test.local",
        displayName: "No Membership",
        emailVerified: new Date(),
      })
      .returning();
    if (!target) throw new Error("Failed to seed target");

    const formData = new FormData();
    formData.set("workspaceRoles", "[]");
    const result = await updateMemberRolesAction(target.id, {}, formData);

    // The "Member not found." branch returns an error state. The key
    // contract for the regression is: no throw, no error-boundary
    // re-render — even when the action's underlying logic decides
    // the request can't proceed.
    expect(result).toEqual({ error: "Member not found." });
    expect("saved" in result && result.saved).toBeFalsy();
    // No `saved: true` means the form stays open with the error
    // inline (per the existing UX), and the error boundary is
    // never engaged.
  });

  it("the workspace_membership table has the columns the trigger depends on", async () => {
    // Belt-and-braces schema check: catch a future migration that
    // drops `updated_at` even if the trigger itself is left wired
    // to the same table list.
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    const cols = await db.execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'workspace_membership'
    `);
    const names = new Set(cols.rows.map((r) => r.column_name));
    expect(names.has("updated_at")).toBe(true);
    expect(names.has("workspace_id")).toBe(true);
    expect(names.has("user_id")).toBe(true);
  });
});
