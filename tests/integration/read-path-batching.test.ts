import { beforeAll, beforeEach, describe, expect, it } from "vitest";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * Differential + query-budget suite for the second read-path batching sweep.
 *
 * Covers three fan-outs removed in this change:
 *   1. `app/media/page.tsx` — two per-workspace role loops → one
 *      `getActorWorkspaceRoleIndex` call.
 *   2. `lib/media/service.ts` — `listMediaFolders` and
 *      `listMediaFoldersTree` issuing the same folder + access query twice.
 *   3. `lib/support/access.ts` — `listRequestsForAgency` called once per
 *      agency, i.e. O(number of agencies on the platform).
 *
 * Written as DIFFERENTIAL tests: each batched result is compared against the
 * per-item path it replaced, used as an oracle. Hand-written expected values
 * would drift together with the implementation and prove nothing. Query
 * budgets are counted through the real pool, not mocked — a fan-out is
 * invisible to behavioural tests, so the budget has to be asserted
 * separately.
 */
describe("read-path batching — media page + platform support", () => {
  let db: typeof import("@/lib/db").db;
  let pool: typeof import("@/lib/db").pool;
  let sql: typeof import("drizzle-orm").sql;
  let schema: typeof import("@/lib/db/schema");
  let policy: typeof import("@/lib/auth/policy");
  let media: typeof import("@/lib/media/service");
  let support: typeof import("@/lib/support/access");

  beforeAll(async () => {
    ({ db, pool } = await import("@/lib/db"));
    ({ sql } = await import("drizzle-orm"));
    schema = await import("@/lib/db/schema");
    policy = await import("@/lib/auth/policy");
    media = await import("@/lib/media/service");
    support = await import("@/lib/support/access");
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
      return { value: await fn(), queries };
    } finally {
      (pool as unknown as { query: unknown }).query = original;
    }
  }

  async function seedAgency(label = "b") {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const [agency] = await db
      .insert(schema.agencies)
      .values({ name: `Agency ${label}`, slug: `ag-${label}-${stamp}` })
      .returning();
    const [user] = await db
      .insert(schema.users)
      .values({ email: `u-${label}-${stamp}@example.com`, displayName: "U" })
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

    async function makeWorkspace(name: string, roles: string[], slugPrefix = name) {
      const [ws] = await db
        .insert(schema.workspaces)
        .values({
          agencyId,
          name,
          slug: `${slugPrefix}-${stamp}-${name}`,
          status: "active" as const,
          createdBy: userId,
        })
        .returning();
      if (!ws) throw new Error("workspace insert failed");
      if (roles.length > 0) {
        const [membership] = await db
          .insert(schema.workspaceMemberships)
          .values({ workspaceId: ws.id, userId, status: "active" })
          .returning();
        if (!membership) throw new Error("membership insert failed");
        await db.insert(schema.workspaceMembershipRoles).values(
          roles.map((role) => ({
            workspaceMembershipId: membership.id,
            role: role as "workspace_manager",
          })),
        );
      }
      return ws;
    }

    return { agency, user, agencyId, userId, makeWorkspace };
  }

  /** The exact predicates `media/page.tsx` used before the batching change. */
  async function perWorkspaceFilters(actor: { id: string }, workspaces: { id: string }[]) {
    const writable = await Promise.all(
      workspaces.map((ws) => policy.canWriteToWorkspace(actor, ws.id)),
    );
    const managerIds = (
      await Promise.all(
        workspaces.map(async (ws) =>
          (await policy.hasWorkspaceRole(actor, ws.id, ["workspace_manager"])) ? ws.id : null,
        ),
      )
    ).filter((id): id is string => id !== null);
    return { writable: workspaces.filter((_, i) => writable[i] === true), managerIds };
  }

  /** The batched replacement the page now uses. */
  function batchedFilters(
    actor: { id: string },
    workspaces: { id: string }[],
    roleIndex: Awaited<ReturnType<typeof policy.getActorWorkspaceRoleIndex>>,
  ) {
    const hasRole = (workspaceId: string, roles: readonly string[]) => {
      const held = roleIndex.rolesByWorkspaceId.get(workspaceId);
      return held ? roles.some((role) => held.has(role)) : false;
    };
    return {
      writable: workspaces.filter((ws) => hasRole(ws.id, policy.WRITE_CAPABLE_ROLES)),
      managerIds: workspaces
        .filter((ws) => hasRole(ws.id, ["workspace_manager"]))
        .map((ws) => ws.id),
    };
  }

  describe("media page role filters", () => {
    it("batched filters match the per-workspace predicates for every role", async () => {
      const { userId, makeWorkspace } = await seedAgency("roles");
      const managerWs = await makeWorkspace("manager", ["workspace_manager"]);
      const designerWs = await makeWorkspace("designer", ["designer"]);
      const clientWs = await makeWorkspace("client", ["client_reviewer"]);
      const noRoleWs = await makeWorkspace("norole", []);
      const workspaces = [managerWs, designerWs, clientWs, noRoleWs];
      const actor = { id: userId };

      const expected = await perWorkspaceFilters(actor, workspaces);
      const roleIndex = await policy.getActorWorkspaceRoleIndex(
        actor,
        workspaces.map((ws) => ws.id),
      );
      const actual = batchedFilters(actor, workspaces, roleIndex);

      expect(actual.writable.map((ws) => ws.id)).toEqual(expected.writable.map((ws) => ws.id));
      expect(actual.managerIds).toEqual(expected.managerIds);

      // The discriminating cases, spelled out so a symmetric bug is visible.
      expect(actual.writable.map((ws) => ws.id)).toContain(designerWs.id);
      expect(actual.managerIds).not.toContain(designerWs.id);
      expect(actual.writable.map((ws) => ws.id)).not.toContain(clientWs.id);
      expect(actual.writable.map((ws) => ws.id)).not.toContain(noRoleWs.id);
    });

    it("an agency admin keeps write access and the manager affordance everywhere", async () => {
      const seed = await seedAgency("admin");
      const managerWs = await seed.makeWorkspace("manager", ["workspace_manager"]);
      const noRoleWs = await seed.makeWorkspace("norole", []);
      await db
        .update(schema.agencyMemberships)
        .set({ isAgencyAdmin: true })
        .where(
          sql`${schema.agencyMemberships.agencyId} = ${seed.agencyId} AND ${schema.agencyMemberships.userId} = ${seed.userId}`,
        );
      const actor = { id: seed.userId };
      const workspaces = [managerWs, noRoleWs];

      const expected = await perWorkspaceFilters(actor, workspaces);
      const roleIndex = await policy.getActorWorkspaceRoleIndex(
        actor,
        workspaces.map((ws) => ws.id),
      );
      const actual = batchedFilters(actor, workspaces, roleIndex);

      // The admin shortcut is the easiest thing to lose in this refactor.
      expect(actual.writable.map((ws) => ws.id)).toEqual(expected.writable.map((ws) => ws.id));
      expect(actual.managerIds).toEqual(expected.managerIds);
      expect(actual.managerIds).toContain(noRoleWs.id);
    });

    it("role index issues a constant number of queries as workspaces grow", async () => {
      const seed = await seedAgency("scale");
      const actor = { id: seed.userId };

      async function build(count: number, tag: string) {
        const rows = [];
        for (let i = 0; i < count; i += 1) {
          rows.push(await seed.makeWorkspace(`${tag}${i}`, ["workspace_manager"]));
        }
        return rows;
      }

      const small = await build(3, "s");
      const large = await build(30, "l");

      const smallIndex = await countQueries(() =>
        policy.getActorWorkspaceRoleIndex(
          actor,
          small.map((ws) => ws.id),
        ),
      );
      const largeIndex = await countQueries(() =>
        policy.getActorWorkspaceRoleIndex(
          actor,
          large.map((ws) => ws.id),
        ),
      );

      expect(largeIndex.queries).toBe(smallIndex.queries);
      expect(smallIndex.queries).toBeLessThanOrEqual(3);
    });
  });

  describe("media folder reads", () => {
    it("both entry points share one folder + access query per workspace", async () => {
      const seed = await seedAgency("folders");
      const ws = await seed.makeWorkspace("media", ["workspace_manager"]);
      const actor = { id: seed.userId };
      await db.insert(schema.mediaFolders).values({
        agencyId: seed.agencyId,
        workspaceId: ws.id,
        name: "Posts",
        sortOrder: 0,
        createdBy: seed.userId,
      });

      // This mirrors the two media pages, which call both helpers for the
      // same workspace. `React.cache` only memoises inside an active Next
      // request scope, so the pages pass the rows explicitly; that path is
      // what keeps the saving deterministic and testable.
      const { queries } = await countQueries(async () => {
        const flat = await media.listMediaFolders(actor, {
          agencyId: seed.agencyId,
          workspaceId: ws.id,
        });
        const tree = await media.listMediaFoldersTree(
          actor,
          { agencyId: seed.agencyId, workspaceId: ws.id },
          flat,
        );
        expect(flat.length).toBe(1);
        expect(tree.length).toBe(1);
      });

      // 1 folder select + 1 asset-count select. The access check is 2 queries
      // (admin probe + membership), and it runs ONCE — the tree reuses the
      // already-authorized rows instead of repeating both the check and the
      // read. Without the hand-off this was 7.
      expect(queries).toBeLessThanOrEqual(4);
    });

    it("the tree reads for itself when no rows are handed over", async () => {
      const seed = await seedAgency("solo");
      const ws = await seed.makeWorkspace("media", ["workspace_manager"]);
      const actor = { id: seed.userId };
      await db.insert(schema.mediaFolders).values({
        agencyId: seed.agencyId,
        workspaceId: ws.id,
        name: "Posts",
        sortOrder: 0,
        createdBy: seed.userId,
      });

      // The API route calls it alone; it must still work with no hand-off.
      const tree = await media.listMediaFoldersTree(actor, {
        agencyId: seed.agencyId,
        workspaceId: ws.id,
      });
      expect(tree.length).toBe(1);
    });

    it("returns [] for an inaccessible workspace from both entry points", async () => {
      const seed = await seedAgency("denied");
      const ws = await seed.makeWorkspace("other", []);
      const [outsider] = await db
        .insert(schema.users)
        .values({ email: `outsider-${Date.now()}@example.com`, displayName: "O" })
        .returning();
      if (!outsider) throw new Error("outsider insert failed");
      const actor = { id: outsider.id };

      const flat = await media.listMediaFolders(actor, {
        agencyId: seed.agencyId,
        workspaceId: ws.id,
      });
      const tree = await media.listMediaFoldersTree(actor, {
        agencyId: seed.agencyId,
        workspaceId: ws.id,
      });
      expect(flat).toEqual([]);
      expect(tree).toEqual([]);
    });

    it("an empty workspace yields an empty list, not a null-ish error", async () => {
      const seed = await seedAgency("empty");
      const ws = await seed.makeWorkspace("blank", ["workspace_manager"]);
      const actor = { id: seed.userId };

      const flat = await media.listMediaFolders(actor, {
        agencyId: seed.agencyId,
        workspaceId: ws.id,
      });
      const tree = await media.listMediaFoldersTree(actor, {
        agencyId: seed.agencyId,
        workspaceId: ws.id,
      });
      expect(flat).toEqual([]);
      expect(tree).toEqual([]);
    });
  });

  describe("platform support requests", () => {
    async function addRequest(agencyId: string, userId: string, createdAt: Date, index: number) {
      const [row] = await db
        .insert(schema.supportAccessRequests)
        .values({
          ticketReference: `T-${agencyId.slice(0, 4)}-${index}`,
          reason: "need access",
          targetAgencyId: agencyId,
          requestedDurationHours: 1,
          downloadsRequested: false,
          status: "pending",
          requestedByUserId: userId,
          createdAt,
        })
        .returning();
      if (!row) throw new Error("request insert failed");
      return row;
    }

    it("batched groups match the per-agency helper, including the per-agency cap", async () => {
      const seed = await seedAgency("support");
      const [otherAgency] = await db
        .insert(schema.agencies)
        .values({ name: "Other", slug: `other-${Date.now()}` })
        .returning();
      if (!otherAgency) throw new Error("other agency insert failed");
      const base = new Date("2026-01-01T00:00:00.000Z");

      // 13 requests for the seeded agency (more than the cap of 10), 1 for the
      // other, and a third agency with none at all.
      for (let i = 0; i < 13; i += 1) {
        await addRequest(seed.agencyId, seed.userId, new Date(base.getTime() + i * 1000), i);
      }
      await addRequest(otherAgency.id, seed.userId, base, 0);
      const [emptyAgency] = await db
        .insert(schema.agencies)
        .values({ name: "Empty", slug: `empty-${Date.now()}` })
        .returning();
      if (!emptyAgency) throw new Error("empty agency insert failed");

      const agencyIds = [seed.agencyId, otherAgency.id, emptyAgency.id];
      const batched = await support.listRecentRequestsByAgency(agencyIds, { perAgencyLimit: 10 });

      for (const agencyId of agencyIds) {
        const expected = await support.listRequestsForAgency(agencyId, { limit: 10 });
        const actual = batched.get(agencyId) ?? [];
        expect(actual).toEqual(expected);
      }

      // The cap is per agency, not global — the other agency keeps its request
      // even though the first agency has 13.
      expect(batched.get(seed.agencyId)?.length).toBe(10);
      expect(batched.get(otherAgency.id)?.length).toBe(1);
      // An agency with no requests is absent, matching the caller's
      // `filter(row => row.requests.length > 0)`.
      expect(batched.has(emptyAgency.id)).toBe(false);
    });

    it("returns the newest requests first within an agency", async () => {
      const seed = await seedAgency("order");
      const base = new Date("2026-02-01T00:00:00.000Z");
      for (let i = 0; i < 5; i += 1) {
        await addRequest(seed.agencyId, seed.userId, new Date(base.getTime() + i * 1000), i);
      }

      const batched = await support.listRecentRequestsByAgency([seed.agencyId], {
        perAgencyLimit: 5,
      });
      const requests = batched.get(seed.agencyId) ?? [];
      expect(requests.length).toBe(5);
      for (let i = 1; i < requests.length; i += 1) {
        const prev = requests[i - 1]!;
        const curr = requests[i]!;
        expect(prev.createdAt.getTime()).toBeGreaterThanOrEqual(curr.createdAt.getTime());
      }
    });

    it("is one query regardless of how many agencies are asked for", async () => {
      const seed = await seedAgency("count");
      const agencyIds = [seed.agencyId];

      for (let i = 0; i < 12; i += 1) {
        const [agency] = await db
          .insert(schema.agencies)
          .values({ name: `bulk${i}`, slug: `bulk-${i}-${Date.now()}-${i}` })
          .returning();
        if (!agency) throw new Error("bulk agency insert failed");
        agencyIds.push(agency.id);
        await addRequest(agency.id, seed.userId, new Date(), i);
      }

      const smallIds = agencyIds.slice(0, 5);
      const { queries: smallQueries, value: smallValue } = await countQueries(() =>
        support.listRecentRequestsByAgency(smallIds, { perAgencyLimit: 10 }),
      );
      const { queries: largeQueries, value: largeValue } = await countQueries(() =>
        support.listRecentRequestsByAgency(agencyIds, { perAgencyLimit: 10 }),
      );

      expect(largeQueries).toBe(smallQueries);
      expect(largeQueries).toBe(1);
      expect(largeValue.size).toBeGreaterThan(smallValue.size);
    });

    it("an empty agency id list never reaches the database", async () => {
      const { queries, value } = await countQueries(() =>
        support.listRecentRequestsByAgency([], { perAgencyLimit: 10 }),
      );
      expect(queries).toBe(0);
      expect(value.size).toBe(0);
    });
  });
});
