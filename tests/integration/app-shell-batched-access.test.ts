import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Differential regression suite for the app-shell layout's per-workspace
 * fan-out (`getActorWorkspaceRoleIndex` + `getWorkspaceBadgesForActor`).
 *
 * WHY THIS SUITE EXISTS
 *
 * Switching tenant or workspace re-renders the authenticated app shell, and
 * the shell previously resolved roles and badge counts one workspace at a
 * time. Measured on a real database, a member of an agency with 8 workspaces
 * issued **131 SQL round-trips for one navigation, of which only 6 were
 * unique** — the `isAgencyAdmin` lookup repeated byte-identically 41 times
 * because every workspace in one agency resolves the same agency id.
 *
 * The batched helpers fix the cost. The risk they introduce is EQUIVALENCE:
 * a batched count that is faster but quietly different from the per-workspace
 * count is a permissions or data bug wearing a performance patch's clothes.
 * So this suite is written as a DIFFERENTIAL test — for the same fixtures it
 * asserts the batched result is identical to the per-workspace result, and
 * separately that the query count is bounded.
 *
 * That shape catches the failure a hand-written expectation list would miss:
 * if someone later changes the gate rules in `badges.ts` and updates the
 * expected numbers by hand, both paths drift together silently. Here the
 * per-workspace path is the oracle and is compared on every run.
 */
describe("app-shell layout — batched workspace roles and badges", () => {
  let db: typeof import("@/lib/db").db;
  let pool: typeof import("@/lib/db").pool;
  let sql: typeof import("drizzle-orm").sql;
  let schema: typeof import("@/lib/db/schema");
  let policy: typeof import("@/lib/auth/policy");
  let badges: typeof import("@/lib/nav/badges");

  beforeAll(async () => {
    ({ db, pool } = await import("@/lib/db"));
    ({ sql } = await import("drizzle-orm"));
    schema = await import("@/lib/db/schema");
    policy = await import("@/lib/auth/policy");
    badges = await import("@/lib/nav/badges");
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE agency, "user" CASCADE`);
  });

  /** Count SQL round-trips issued by `fn` against the real pool. */
  async function countQueries<T>(fn: () => Promise<T>): Promise<{ value: T; queries: number }> {
    const original = pool.query.bind(pool);
    let queries = 0;
    (pool as unknown as { query: unknown }).query = ((...args: unknown[]) => {
      queries += 1;
      return (original as (...a: unknown[]) => unknown)(...args);
    }) as typeof pool.query;
    try {
      const value = await fn();
      return { value, queries };
    } finally {
      (pool as unknown as { query: unknown }).query = original;
    }
  }

  async function makeContentItem(
    workspaceId: string,
    userId: string,
    opts: { status?: string; designerId?: string | null } = {},
  ) {
    const [row] = await db
      .insert(schema.contentItems)
      .values({
        workspaceId,
        contentOwnerId: userId,
        createdBy: userId,
        title: `item-${Math.random().toString(36).slice(2, 8)}`,
        format: "static_post",
        plannedPublishAt: new Date(),
        status: (opts.status ?? "draft") as "draft",
        designerId: opts.designerId ?? null,
      })
      .returning();
    if (!row) throw new Error("content item insert failed");
    return row;
  }

  async function seed() {
    const stamp = Date.now();
    const [agency] = await db
      .insert(schema.agencies)
      .values({ name: "Agency", slug: `agency-${stamp}` })
      .returning();
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `u-${stamp}@example.com`,
        displayName: "U",
      })
      .returning();
    if (!agency || !user) throw new Error("seed failed");
    const agencyId = agency.id;
    const userId = user.id;

    await db.insert(schema.agencyMemberships).values({
      agencyId,
      userId,
      status: "active",
      isAgencyAdmin: false,
    });

    const wsRows = await db
      .insert(schema.workspaces)
      .values(
        ["manager", "reviewer", "client"].map((label) => ({
          agencyId: agency.id,
          name: label,
          slug: `${label}-${stamp}`,
          status: "active" as const,
          createdBy: user.id,
        })),
      )
      .returning();

    const byLabel = Object.fromEntries(wsRows.map((w) => [w.name, w]));

    async function grant(workspaceId: string, roles: string[]) {
      const [membership] = await db
        .insert(schema.workspaceMemberships)
        .values({ workspaceId, userId, status: "active" })
        .returning();
      if (!membership) throw new Error("membership insert failed");
      if (roles.length > 0) {
        await db.insert(schema.workspaceMembershipRoles).values(
          roles.map((role) => ({
            workspaceMembershipId: membership.id,
            role: role as "workspace_manager",
          })),
        );
      }
      return membership;
    }

    const managerWs = byLabel.manager!;
    const reviewerWs = byLabel.reviewer!;
    const clientWs = byLabel.client!;

    const managerMembership = await grant(managerWs.id, ["workspace_manager"]);
    const reviewerMembership = await grant(reviewerWs.id, ["internal_reviewer"]);
    const clientMembership = await grant(clientWs.id, ["client_reviewer"]);

    return {
      agency,
      user,
      managerWs,
      reviewerWs,
      clientWs,
      managerMembershipId: managerMembership.id,
      reviewerMembershipId: reviewerMembership.id,
      clientMembershipId: clientMembership.id,
    };
  }

  it("batched roles are identical to the per-workspace resolver for every workspace", async () => {
    const { user, managerWs, reviewerWs, clientWs } = await seed();
    const actor = { id: user.id };
    const ids = [managerWs.id, reviewerWs.id, clientWs.id];

    const index = await policy.getActorWorkspaceRoleIndex(actor, ids);

    for (const id of ids) {
      const expected = await policy.getWorkspaceRoles(actor, id);
      const actual = index.rolesByWorkspaceId.get(id);
      expect([...(actual ?? [])].sort()).toEqual([...expected].sort());
    }

    // Spot-check the actual role sets, not only the equality — a batch that
    // returned the right roles for the wrong reason would still pass above.
    expect([...(index.rolesByWorkspaceId.get(reviewerWs.id) ?? [])]).toEqual(["internal_reviewer"]);
    expect([...(index.rolesByWorkspaceId.get(clientWs.id) ?? [])]).toEqual(["client_reviewer"]);
    expect([...(index.rolesByWorkspaceId.get(managerWs.id) ?? [])]).toEqual(["workspace_manager"]);
  });

  it("gives an agency admin every internal role in every workspace, but not client_reviewer", async () => {
    const { agency, user, managerWs, reviewerWs, clientWs } = await seed();
    await db
      .update(schema.agencyMemberships)
      .set({ isAgencyAdmin: true })
      .where(
        sql`${schema.agencyMemberships.agencyId} = ${agency.id} AND ${schema.agencyMemberships.userId} = ${user.id}`,
      );
    const actor = { id: user.id };
    const ids = [managerWs.id, reviewerWs.id, clientWs.id];

    const index = await policy.getActorWorkspaceRoleIndex(actor, ids);

    for (const id of ids) {
      const expected = await policy.getWorkspaceRoles(actor, id);
      expect([...(index.rolesByWorkspaceId.get(id) ?? [])].sort()).toEqual([...expected].sort());
      expect(index.rolesByWorkspaceId.get(id)?.has("client_reviewer")).toBe(false);
      expect(index.isAgencyAdminByWorkspaceId.get(id)).toBe(true);
    }
  });

  it("treats an unknown workspace id as no roles rather than throwing or granting access", async () => {
    const { user, managerWs } = await seed();
    const actor = { id: user.id };
    const missing = "00000000-0000-4000-8000-000000000000";

    const index = await policy.getActorWorkspaceRoleIndex(actor, [managerWs.id, missing]);

    expect(index.rolesByWorkspaceId.get(missing)).toEqual(new Set());
    expect(index.isAgencyAdminByWorkspaceId.get(missing)).toBeUndefined();
    expect(index.rolesByWorkspaceId.get(managerWs.id)?.size).toBe(1);
  });

  it("batched badges equal the per-workspace badges across every role", async () => {
    const { user, managerWs, reviewerWs, clientWs, clientMembershipId } = await seed();
    const actor = { id: user.id };
    const ids = [managerWs.id, reviewerWs.id, clientWs.id];

    // The actor additionally holds `internal_reviewer` in the client workspace,
    // making that workspace's allowed gates a strict SUPERSET of the plain
    // internal reviewer's. This is the only shape that makes the per-workspace
    // gate filter load-bearing: the batched query can then select the union of
    // gates (which necessarily includes `creative_client`) and must filter each
    // workspace's rows back down in memory. A fixture where every workspace
    // has the same gates, or where no workspace can act on a client gate,
    // would let a missing filter pass silently.
    await db
      .insert(schema.workspaceMembershipRoles)
      .values({ workspaceMembershipId: clientMembershipId, role: "internal_reviewer" });

    // internal-reviewer workspace: 2 unassigned queue items, and approvals at
    // both a gate it may act on (`content`) and one it may not
    // (`creative_client`, which belongs to the client reviewer).
    await makeContentItem(reviewerWs.id, user.id, { status: "approved_for_design" });
    await makeContentItem(reviewerWs.id, user.id, { status: "approved_for_design" });
    const gateContent = await makeContentItem(reviewerWs.id, user.id, { status: "in_design" });
    await db.insert(schema.approvalRequests).values({
      contentItemId: gateContent.id,
      gate: "content",
      requestedBy: user.id,
      status: "pending",
      sequence: 1,
    });
    await db.insert(schema.approvalRequests).values({
      contentItemId: gateContent.id,
      gate: "creative_client",
      requestedBy: user.id,
      status: "pending",
      sequence: 2,
    });
    // Assigned work is not "unassigned" — must not count.
    await makeContentItem(reviewerWs.id, user.id, {
      status: "approved_for_design",
      designerId: user.id,
    });

    // manager workspace: 1 unassigned queue item, no approvals (not a reviewer).
    await makeContentItem(managerWs.id, user.id, { status: "approved_for_design" });

    // client workspace: both review gates are actionable here.
    const clientItem = await makeContentItem(clientWs.id, user.id, { status: "in_design" });
    await db.insert(schema.approvalRequests).values({
      contentItemId: clientItem.id,
      gate: "content",
      requestedBy: user.id,
      status: "pending",
      sequence: 1,
    });
    await db.insert(schema.approvalRequests).values({
      contentItemId: clientItem.id,
      gate: "creative_client",
      requestedBy: user.id,
      status: "pending",
      sequence: 2,
    });

    const index = await policy.getActorWorkspaceRoleIndex(actor, ids);
    const { value: batched, queries } = await countQueries(() =>
      badges.getWorkspaceBadgesForActor(ids, index),
    );

    for (const id of ids) {
      const expected = await badges.getWorkspaceBadges(actor, id);
      expect(batched.get(id)).toEqual(expected);
    }

    // Cross-check the sensitive numbers explicitly.
    // Internal reviewer only: may act on `content` but NOT `creative_client`,
    // so the client-gate request sitting in THIS workspace must be excluded.
    // 2 unassigned queue items (the assigned one is excluded).
    expect(batched.get(reviewerWs.id)).toEqual({ approvals: 1, designQueue: 2 });
    // manager: no review role ⇒ no approvals; 1 unassigned queue item.
    expect(batched.get(managerWs.id)).toEqual({ approvals: 0, designQueue: 1 });
    // internal reviewer AND client reviewer: may act on both gates it has
    // pending here, so both count.
    expect(batched.get(clientWs.id)).toEqual({ approvals: 2, designQueue: 0 });

    // 3 workspaces ⇒ 2 grouped count queries (approvals + design queue).
    expect(queries).toBeLessThanOrEqual(2);
  });

  it("badge counts stay flat as the workspace count grows", async () => {
    const stamp = Date.now();
    const [agency] = await db
      .insert(schema.agencies)
      .values({ name: "Flat", slug: `flat-${stamp}` })
      .returning();
    const [user] = await db
      .insert(schema.users)
      .values({ email: `flat-${stamp}@example.com`, displayName: "U" })
      .returning();
    if (!agency || !user) throw new Error("seed failed");
    const agencyId = agency.id;
    const userId = user.id;
    await db.insert(schema.agencyMemberships).values({
      agencyId: agencyId,
      userId: userId,
      status: "active",
      isAgencyAdmin: false,
    });

    const actor = { id: userId };
    async function build(count: number) {
      const wsRows = await db
        .insert(schema.workspaces)
        .values(
          Array.from({ length: count }, (_, i) => ({
            agencyId: agencyId,
            name: `w${i}`,
            slug: `w${i}-${stamp}-${count}`,
            status: "active" as const,
            createdBy: userId,
          })),
        )
        .returning();
      for (const ws of wsRows) {
        const [m] = await db
          .insert(schema.workspaceMemberships)
          .values({ workspaceId: ws.id, userId: userId, status: "active" })
          .returning();
        await db.insert(schema.workspaceMembershipRoles).values({
          workspaceMembershipId: m!.id,
          role: "workspace_manager",
        });
      }
      return wsRows.map((w) => w.id);
    }

    const smallIds = await build(3);
    const largeIds = await build(30);

    const smallIndex = await policy.getActorWorkspaceRoleIndex(actor, smallIds);
    const largeIndex = await policy.getActorWorkspaceRoleIndex(actor, largeIds);

    const { queries: smallQueries } = await countQueries(() =>
      badges.getWorkspaceBadgesForActor(smallIds, smallIndex),
    );
    const { queries: largeQueries } = await countQueries(() =>
      badges.getWorkspaceBadgesForActor(largeIds, largeIndex),
    );

    // 10x the workspaces must not mean 10x the round-trips.
    expect(largeQueries).toBe(smallQueries);
    expect(largeQueries).toBeLessThanOrEqual(2);
  });

  it("role index issues a fixed number of queries regardless of workspace count", async () => {
    const stamp = Date.now();
    const [agency] = await db
      .insert(schema.agencies)
      .values({ name: "Scale", slug: `scale-${stamp}` })
      .returning();
    const [user] = await db
      .insert(schema.users)
      .values({ email: `scale-${stamp}@example.com`, displayName: "U" })
      .returning();
    if (!agency || !user) throw new Error("seed failed");
    const agencyId = agency.id;
    const userId = user.id;
    await db.insert(schema.agencyMemberships).values({
      agencyId: agencyId,
      userId: userId,
      status: "active",
      isAgencyAdmin: false,
    });
    const actor = { id: userId };

    // Both sizes must be REAL workspaces. A list of unknown ids would make
    // the helper skip its agency-admin query entirely (nothing to ask
    // about), which would "prove" flatness by measuring a different path.
    async function build(count: number, tag: string) {
      const wsRows = await db
        .insert(schema.workspaces)
        .values(
          Array.from({ length: count }, (_, i) => ({
            agencyId: agencyId,
            name: `${tag}${i}`,
            slug: `${tag}${i}-${stamp}`,
            status: "active" as const,
            createdBy: userId,
          })),
        )
        .returning();
      for (const ws of wsRows) {
        const [m] = await db
          .insert(schema.workspaceMemberships)
          .values({ workspaceId: ws.id, userId: userId, status: "active" })
          .returning();
        await db.insert(schema.workspaceMembershipRoles).values({
          workspaceMembershipId: m!.id,
          role: "workspace_manager",
        });
      }
      return wsRows.map((w) => w.id);
    }

    const smallIds = await build(3, "s");
    const largeIds = await build(30, "l");

    const { queries: smallQueries, value: smallIndex } = await countQueries(() =>
      policy.getActorWorkspaceRoleIndex(actor, smallIds),
    );
    const { queries: largeQueries, value: largeIndex } = await countQueries(() =>
      policy.getActorWorkspaceRoleIndex(actor, largeIds),
    );

    // 10x the workspaces must not mean 10x the round-trips.
    expect(largeQueries).toBe(smallQueries);
    // workspace→agency, agency-admin flags, roles. Never per-workspace.
    expect(smallQueries).toBeLessThanOrEqual(3);
    // And the batched answer is still right at both sizes.
    for (const id of [...smallIds, ...largeIds]) {
      expect([
        ...(smallIndex.rolesByWorkspaceId.get(id) ?? largeIndex.rolesByWorkspaceId.get(id) ?? []),
      ]).toEqual(["workspace_manager"]);
    }
  });
});
