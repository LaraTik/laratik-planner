import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Milestone 1.7 — multi-agency DB constraint removal.
 *
 * After migration 0008 the `agency` table no longer enforces the
 * singleton invariant (no more unique index on `singleton_key`, no more
 * `singleton_key = true` check, no more NOT NULL). This test exercises
 * the post-migration invariants at the service / row level so a
 * regression that re-introduces the singleton constraint (either in
 * the schema or in a future migration) is caught here, not in
 * production.
 *
 * Test plan (per PLAN.md §1.7):
 *   1. Two agencies can be created and both persist.
 *   2. Two workspaces with the SAME slug in DIFFERENT agencies both
 *      persist (the existing `workspace_agency_slug_unique` index is
 *      on `(agency_id, lower(slug))`, so this is the new freedom).
 *   3. A member of agency A cannot access a workspace that lives in
 *      agency B even when the slugs collide — the
 *      `canAccessWorkspace(actor, workspaceId)` gate is
 *      agency-scoped via `agency_memberships`, not via slug.
 */
describe("agency singleton constraint (M1.7)", () => {
  let canAccessWorkspace: typeof import("@/lib/auth/policy").canAccessWorkspace;
  let isAgencyAdmin: typeof import("@/lib/auth/policy").isAgencyAdmin;
  let isAgencyMember: typeof import("@/lib/auth/policy").isAgencyMember;

  beforeAll(async () => {
    ({ canAccessWorkspace, isAgencyAdmin, isAgencyMember } = await import("@/lib/auth/policy"));
  });

  beforeEach(async () => {
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
  });

  it("allows two agencies to coexist (DB-level singleton is gone)", async () => {
    const { db } = await import("@/lib/db");
    const { agencies } = await import("@/lib/db/schema");

    const [a] = await db
      .insert(agencies)
      .values({ name: "Alpha Agency", slug: "alpha" })
      .returning();
    const [b] = await db.insert(agencies).values({ name: "Beta Agency", slug: "beta" }).returning();

    expect(a?.id).toBeDefined();
    expect(b?.id).toBeDefined();
    expect(a?.id).not.toBe(b?.id);

    const rows = await db.select({ id: agencies.id, slug: agencies.slug }).from(agencies);
    expect(rows).toHaveLength(2);
  });

  it("allows two workspaces with the same slug in different agencies", async () => {
    const { db } = await import("@/lib/db");
    const { agencies, users, workspaces } = await import("@/lib/db/schema");

    const [alpha] = await db.insert(agencies).values({ name: "Alpha", slug: "alpha" }).returning();
    const [beta] = await db.insert(agencies).values({ name: "Beta", slug: "beta" }).returning();
    if (!alpha || !beta) throw new Error("failed to seed agencies");

    const [owner] = await db
      .insert(users)
      .values({
        email: "shared-owner@multi-agency.test",
        displayName: "Owner",
        emailVerified: new Date(),
      })
      .returning();
    if (!owner) throw new Error("failed to seed owner user");

    const [wsAlpha] = await db
      .insert(workspaces)
      .values({
        agencyId: alpha.id,
        slug: "acme",
        name: "Acme (alpha)",
        createdBy: owner.id,
      })
      .returning();
    const [wsBeta] = await db
      .insert(workspaces)
      .values({
        agencyId: beta.id,
        slug: "acme",
        name: "Acme (beta)",
        createdBy: owner.id,
      })
      .returning();

    expect(wsAlpha?.id).toBeDefined();
    expect(wsBeta?.id).toBeDefined();
    expect(wsAlpha?.id).not.toBe(wsBeta?.id);

    // Both rows are visible from a fresh select — the per-agency
    // slug uniqueness lets two `acme`s live side by side.
    const all = await db
      .select({ id: workspaces.id, agencyId: workspaces.agencyId, slug: workspaces.slug })
      .from(workspaces);
    expect(all).toHaveLength(2);
    const slugs = all.map((w) => w.slug).sort();
    expect(slugs).toEqual(["acme", "acme"]);
  });

  it("rejects a member of agency A from accessing a same-slug workspace in agency B", async () => {
    const { db } = await import("@/lib/db");
    const { agencies, agencyMemberships, users, workspaceMemberships, workspaces } =
      await import("@/lib/db/schema");
    const { and, eq } = await import("drizzle-orm");

    const [alpha] = await db.insert(agencies).values({ name: "Alpha", slug: "alpha" }).returning();
    const [beta] = await db.insert(agencies).values({ name: "Beta", slug: "beta" }).returning();
    if (!alpha || !beta) throw new Error("failed to seed agencies");

    const [memberA] = await db
      .insert(users)
      .values({
        email: "a-member@multi-agency.test",
        displayName: "A Member",
        emailVerified: new Date(),
      })
      .returning();
    const [memberB] = await db
      .insert(users)
      .values({
        email: "b-member@multi-agency.test",
        displayName: "B Member",
        emailVerified: new Date(),
      })
      .returning();
    if (!memberA || !memberB) throw new Error("failed to seed members");

    // Membership: memberA is in alpha, memberB is in beta.
    await db.insert(agencyMemberships).values([
      { agencyId: alpha.id, userId: memberA.id, status: "active" },
      { agencyId: beta.id, userId: memberB.id, status: "active" },
    ]);

    // One workspace per agency, SAME slug "acme".
    const [wsAlpha] = await db
      .insert(workspaces)
      .values({
        agencyId: alpha.id,
        slug: "acme",
        name: "Acme (alpha)",
        createdBy: memberA.id,
      })
      .returning();
    const [wsBeta] = await db
      .insert(workspaces)
      .values({
        agencyId: beta.id,
        slug: "acme",
        name: "Acme (beta)",
        createdBy: memberB.id,
      })
      .returning();
    if (!wsAlpha || !wsBeta) throw new Error("failed to seed workspaces");

    // Workspace-level membership: memberA is in alpha's workspace,
    // memberB is in beta's workspace.
    await db.insert(workspaceMemberships).values([
      { workspaceId: wsAlpha.id, userId: memberA.id, status: "active" },
      { workspaceId: wsBeta.id, userId: memberB.id, status: "active" },
    ]);

    // Sanity: each user is a member of their own agency's workspace
    // and a non-member of the other agency's workspace.
    expect(await isAgencyMember({ id: memberA.id }, alpha.id)).toBe(true);
    expect(await isAgencyMember({ id: memberA.id }, beta.id)).toBe(false);
    expect(await isAgencyAdmin({ id: memberA.id }, alpha.id)).toBe(false);
    expect(await isAgencyAdmin({ id: memberA.id }, beta.id)).toBe(false);

    // The cross-agency access gate: memberA cannot read beta's
    // workspace, even though its slug matches memberA's own.
    expect(await canAccessWorkspace({ id: memberA.id }, wsBeta.id)).toBe(false);
    // Sanity: memberA CAN read their own workspace.
    expect(await canAccessWorkspace({ id: memberA.id }, wsAlpha.id)).toBe(true);
    // Sanity: memberB is the mirror image.
    expect(await canAccessWorkspace({ id: memberB.id }, wsAlpha.id)).toBe(false);
    expect(await canAccessWorkspace({ id: memberB.id }, wsBeta.id)).toBe(true);

    // And: agency_admin flag still overrides per-workspace membership
    // for same-agency workspaces — promote memberA to alpha admin and
    // confirm they still cannot reach beta's workspace.
    await db
      .update(agencyMemberships)
      .set({ isAgencyAdmin: true })
      .where(
        and(eq(agencyMemberships.agencyId, alpha.id), eq(agencyMemberships.userId, memberA.id)),
      );
    expect(await canAccessWorkspace({ id: memberA.id }, wsAlpha.id)).toBe(true);
    expect(await canAccessWorkspace({ id: memberA.id }, wsBeta.id)).toBe(false);
  });
});
