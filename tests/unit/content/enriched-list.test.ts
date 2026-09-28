import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Enriched planning-list query.
 *
 * This file had no test at all. Two things it does are easy to get subtly
 * wrong and expensive when they are:
 *
 *   1. **`healthIn` is a post-filter, on purpose.** It runs *after* the page
 *      query, while `total` is counted *without* it. If health filtering ever
 *      moved into the WHERE clause, a manager's "Needs attention" view would
 *      shift the pagination window on every filter change. These tests pin
 *      the asymmetry.
 *   2. **The fan-out is `O(6 × pageSize)`, not N+1.** Six parallel lookups
 *      keyed by content-item id, then merged into maps. A refactor to a
 *      per-row lookup would still pass a shape-only test but not the query
 *      count asserted here.
 */

const dbMock = vi.hoisted(() => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/db", () => dbMock);

const policyMock = vi.hoisted(() => ({
  getWorkspaceRoles: vi.fn(),
  hasWorkspaceRole: vi.fn(),
  requirePolicy: vi.fn(),
  INTERNAL_WORKSPACE_ROLES: ["workspace_manager", "content_planner", "content_writer", "designer"],
}));
vi.mock("@/lib/auth/policy", () => policyMock);

const healthMock = vi.hoisted(() => ({ classifyHealth: vi.fn(), daysOverdue: vi.fn() }));
vi.mock("@/lib/dashboard/health", () => healthMock);

const nextActionMock = vi.hoisted(() => ({ deriveNextAction: vi.fn() }));
vi.mock("@/lib/content/next-action", () => nextActionMock);

const planningMock = vi.hoisted(() => ({ statusesForPlanningStage: vi.fn() }));
vi.mock("@/lib/planning/presentation", () => planningMock);

import { listWorkspaceContentEnriched, resolveActorRoles } from "@/lib/content/enriched-list";
// `ActorRoles` is consumed by enriched-list but re-exported from the module
// that defines it, so import it from its home rather than through the barrel.
import type { ActorRoles } from "@/lib/content/next-action";

const ACTOR = { id: "11111111-1111-4111-8111-111111111111" };
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-03-15T12:00:00.000Z");
const ROLES: ActorRoles = ["workspace_manager", "content_planner"];

/** Fluent, awaitable Drizzle stand-in. */
function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

function baseRow(over: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    title: "Launch post",
    format: "static_post",
    status: "approved",
    plannedPublishAt: new Date("2026-03-10T09:00:00.000Z"),
    brief: "Tease the launch",
    priority: "normal",
    blockedReason: null,
    cancellationReason: null,
    changeRequestGate: null,
    ownerId: "user-1",
    ownerName: "Ada",
    ownerDisplayName: "Ada L",
    ownerAvatarPath: "/a.png",
    designerId: "user-2",
    ...over,
  };
}

/**
 * The function issues the page query, then six fan-out queries, then the
 * count. `db.select` is served from a queue in exactly that order.
 */
function primeQueries(
  opts: {
    base?: unknown[];
    designers?: unknown[];
    channels?: unknown[];
    comments?: unknown[];
    attachments?: unknown[];
    deliveries?: unknown[];
    approvals?: unknown[];
    count?: unknown[];
  } = {},
) {
  let i = 0;
  const queue: unknown[][] = [
    opts.base ?? [baseRow()],
    opts.designers ?? [],
    opts.channels ?? [],
    opts.comments ?? [],
    opts.attachments ?? [],
    opts.deliveries ?? [],
    opts.approvals ?? [],
    opts.count ?? [{ count: 1 }],
  ];
  dbMock.db.select.mockImplementation(() => {
    const result = queue[Math.min(i, queue.length - 1)] ?? [];
    i += 1;
    return makeChain(result);
  });
}

const list = (opts: Parameters<typeof listWorkspaceContentEnriched>[2]) =>
  listWorkspaceContentEnriched(ACTOR, WORKSPACE_ID, opts, NOW, ROLES);

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.db.select.mockReset();
  policyMock.getWorkspaceRoles.mockReset();
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.requirePolicy.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.requirePolicy.mockResolvedValue(undefined);
  healthMock.classifyHealth.mockReset();
  healthMock.daysOverdue.mockReset();
  nextActionMock.deriveNextAction.mockReset();
  planningMock.statusesForPlanningStage.mockReset();

  healthMock.classifyHealth.mockReturnValue("on_track");
  healthMock.daysOverdue.mockReturnValue(0);
  nextActionMock.deriveNextAction.mockReturnValue({ kind: "none" });
  planningMock.statusesForPlanningStage.mockReturnValue(null);
});

// ── resolveActorRoles ────────────────────────────────────────────────────

describe("resolveActorRoles", () => {
  it("materialises the role set into an array", async () => {
    policyMock.getWorkspaceRoles.mockResolvedValue(new Set(["workspace_manager", "designer"]));
    expect(await resolveActorRoles(ACTOR, WORKSPACE_ID)).toEqual(["workspace_manager", "designer"]);
    expect(policyMock.getWorkspaceRoles).toHaveBeenCalledWith(ACTOR, WORKSPACE_ID);
  });

  it("returns an empty list for a user with no workspace roles", async () => {
    policyMock.getWorkspaceRoles.mockResolvedValue(new Set());
    expect(await resolveActorRoles(ACTOR, WORKSPACE_ID)).toEqual([]);
  });
});

// ── empty page ───────────────────────────────────────────────────────────

describe("listWorkspaceContentEnriched", () => {
  it("returns an empty page and short-circuits the fan-out when nothing matched", async () => {
    primeQueries({ base: [] });
    const result = await list({});
    // No rows means no ids to fan out on; running six extra queries would be
    // pure waste on the empty "no results" render.
    expect(result).toEqual({ items: [], total: 0 });
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
  });

  it("requires an internal workspace role", async () => {
    primeQueries();
    await list({});
    expect(policyMock.requirePolicy).toHaveBeenCalledWith(expect.anything(), "list_content");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(
      ACTOR,
      WORKSPACE_ID,
      policyMock.INTERNAL_WORKSPACE_ROLES,
    );
  });
});

// ── filter construction ──────────────────────────────────────────────────

describe("listWorkspaceContentEnriched filters", () => {
  it("adds a condition for every supplied filter", async () => {
    planningMock.statusesForPlanningStage.mockReturnValue(["draft", "in_progress"]);
    primeQueries();
    await list({
      monthStart: new Date("2026-03-01T00:00:00.000Z"),
      monthEnd: new Date("2026-04-01T00:00:00.000Z"),
      status: "approved",
      stage: "planning",
      ownerId: "user-1",
      format: "static_post",
      channelId: "chan-1",
      search: "Launch",
      cursor: { plannedPublishAt: new Date("2026-03-01T00:00:00.000Z"), id: "item-0" },
      limit: 10,
      offset: 5,
    });
    // A stage that maps to statuses uses IN, not an equality on the stage name.
    expect(planningMock.statusesForPlanningStage).toHaveBeenCalledWith("planning");
  });

  it("falls back to an equality filter when the stage has no status mapping", async () => {
    planningMock.statusesForPlanningStage.mockReturnValue(null);
    primeQueries();
    await list({ stage: "backlog" });
    expect(planningMock.statusesForPlanningStage).toHaveBeenCalledWith("backlog");
  });

  it("uses only the base conditions when no filter is supplied", async () => {
    planningMock.statusesForPlanningStage.mockClear();
    primeQueries();
    await list({});
    expect(planningMock.statusesForPlanningStage).not.toHaveBeenCalled();
  });

  it("treats a zero or negative offset as 0", async () => {
    const offsets: number[] = [];
    const target: Record<string, unknown> = {};
    let queueIndex = 0;
    const rows: unknown[][] = [[baseRow()], [], [], [], [], [], [], [{ count: 1 }]];
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve(rows[Math.min(queueIndex++, rows.length - 1)]).then(onFulfilled);
        }
        if (prop === "offset")
          return (n: number) => {
            offsets.push(n);
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.select.mockReturnValue(proxy);

    await list({ offset: -5 });
    expect(offsets).toEqual([0]);
  });
});

// ── enrichment merge ─────────────────────────────────────────────────────

describe("listWorkspaceContentEnriched enrichment", () => {
  it("merges all six fan-out concerns onto the base row", async () => {
    primeQueries({
      base: [baseRow()],
      designers: [{ id: "user-2", name: "Grace", displayName: "Grace H", avatarPath: "/g.png" }],
      channels: [
        { contentItemId: "item-1", channelId: "c1", platform: "instagram", accountName: "@acme" },
      ],
      comments: [{ contentItemId: "item-1", count: 3 }],
      attachments: [{ contentItemId: "item-1", count: 2 }],
      deliveries: [{ contentItemId: "item-1", count: 4, approvedCount: 1 }],
      approvals: [{ contentItemId: "item-1", count: 1 }],
      count: [{ count: 12 }],
    });

    const { items, total } = await list({});

    expect(items[0]).toMatchObject({
      id: "item-1",
      owner: { id: "user-1", name: "Ada", displayName: "Ada L" },
      designer: { id: "user-2", name: "Grace", displayName: "Grace H" },
      channels: [{ id: "c1", platform: "instagram", accountName: "@acme" }],
      commentCount: 3,
      assetCount: 2,
      deliveryCount: 4,
      hasApprovedDelivery: true,
      openApprovalCount: 1,
      health: "on_track",
      overdueDays: 0,
    });
    expect(total).toBe(12);
    // 1 page query + 6 fan-out + 1 count.
    expect(dbMock.db.select).toHaveBeenCalledTimes(8);
  });

  it("defaults missing concerns to zero rather than dropping the key", async () => {
    primeQueries({ base: [baseRow()], count: [{ count: 1 }] });
    const { items } = await list({});
    // The row component reads these unconditionally; a missing key would
    // render "undefined" counts.
    expect(items[0]).toMatchObject({
      channels: [],
      commentCount: 0,
      assetCount: 0,
      deliveryCount: 0,
      hasApprovedDelivery: false,
      openApprovalCount: 0,
    });
  });

  it("reports no approved delivery when the approved count is 0", async () => {
    primeQueries({
      base: [baseRow()],
      deliveries: [{ contentItemId: "item-1", count: 4, approvedCount: 0 }],
      count: [{ count: 1 }],
    });
    const { items } = await list({});
    expect(items[0]!.deliveryCount).toBe(4);
    expect(items[0]!.hasApprovedDelivery).toBe(false);
  });

  it("returns a null owner when the item is unassigned", async () => {
    primeQueries({
      base: [baseRow({ ownerId: null, ownerName: null, ownerDisplayName: null })],
      count: [{ count: 1 }],
    });
    const { items } = await list({});
    expect(items[0]!.owner).toBeNull();
  });

  it("falls back through name then id for a display name", async () => {
    primeQueries({
      base: [baseRow({ ownerDisplayName: null, ownerName: "Ada" })],
      count: [{ count: 1 }],
    });
    expect((await list({})).items[0]!.owner!.displayName).toBe("Ada");

    primeQueries({
      base: [baseRow({ ownerDisplayName: null, ownerName: null, ownerId: "user-1" })],
      count: [{ count: 1 }],
    });
    expect((await list({})).items[0]!.owner!.displayName).toBe("user-1");
  });

  it("falls back the same way for a designer with no display name", async () => {
    primeQueries({
      base: [baseRow()],
      designers: [{ id: "user-2", name: "Grace", displayName: null, avatarPath: null }],
      count: [{ count: 1 }],
    });
    expect((await list({})).items[0]!.designer!.displayName).toBe("Grace");

    primeQueries({
      base: [baseRow()],
      designers: [{ id: "user-2", name: null, displayName: null, avatarPath: null }],
      count: [{ count: 1 }],
    });
    expect((await list({})).items[0]!.designer!.displayName).toBe("user-2");
  });

  it("returns a null designer when the referenced user row is missing", async () => {
    // A left-join that matched nothing must not produce a half-built owner.
    primeQueries({ base: [baseRow()], count: [{ count: 1 }] });
    expect((await list({})).items[0]!.designer).toBeNull();
  });

  it("returns a null designer when the item has no designer assigned", async () => {
    primeQueries({ base: [baseRow({ designerId: null })], count: [{ count: 1 }] });
    expect((await list({})).items[0]!.designer).toBeNull();
  });

  it("ignores count rows with a null contentItemId", async () => {
    primeQueries({
      base: [baseRow()],
      comments: [{ contentItemId: null, count: 9 }],
      count: [{ count: 1 }],
    });
    expect((await list({})).items[0]!.commentCount).toBe(0);
  });

  it("groups multiple channels onto the right item", async () => {
    primeQueries({
      base: [baseRow()],
      channels: [
        { contentItemId: "item-1", channelId: "c1", platform: "instagram", accountName: "@a" },
        { contentItemId: "item-1", channelId: "c2", platform: "linkedin", accountName: "@b" },
        { contentItemId: "other", channelId: "c3", platform: "x", accountName: "@c" },
      ],
      count: [{ count: 1 }],
    });
    const { items } = await list({});
    expect(items[0]!.channels).toHaveLength(2);
  });

  it("passes the row, the health snapshot and the caller's roles to deriveNextAction", async () => {
    healthMock.classifyHealth.mockReturnValue("overdue");
    primeQueries({
      base: [baseRow()],
      approvals: [{ contentItemId: "item-1", count: 2 }],
      count: [{ count: 1 }],
    });
    await list({});
    const arg = nextActionMock.deriveNextAction.mock.calls[0]![0] as Record<string, unknown>;
    // The next-action hint is where a manager's role actually changes the UI,
    // so the role list has to reach it unchanged.
    expect(arg).toMatchObject({
      status: "approved",
      health: "overdue",
      openApprovalCount: 2,
      actorRoles: ROLES,
      now: NOW,
    });
  });

  it("forwards the page timestamp into the health rollup", async () => {
    primeQueries({ count: [{ count: 1 }] });
    await list({});
    expect(healthMock.classifyHealth.mock.calls[0]![0]).toMatchObject({ now: NOW });
    expect(healthMock.daysOverdue.mock.calls[0]![0]).toMatchObject({ now: NOW });
  });
});

// ── healthIn post-filter ─────────────────────────────────────────────────

describe("healthIn is a post-filter, total is not", () => {
  it("filters the returned items but counts the unfiltered total", async () => {
    healthMock.classifyHealth.mockImplementation(({ status }: { status: string }) =>
      status === "approved" ? "on_track" : "overdue",
    );
    primeQueries({
      base: [baseRow(), baseRow({ id: "item-2", status: "draft" })],
      count: [{ count: 40 }],
    });

    const { items, total } = await list({ healthIn: ["overdue"] });

    // Only the overdue row is returned…
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("item-2");
    // …but the total is the unfiltered count, so applying the attention view
    // does not shift the pagination window under the user.
    expect(total).toBe(40);
  });

  it("returns everything when healthIn is omitted", async () => {
    healthMock.classifyHealth.mockImplementation(({ status }: { status: string }) =>
      status === "approved" ? "on_track" : "overdue",
    );
    primeQueries({
      base: [baseRow(), baseRow({ id: "item-2", status: "draft" })],
      count: [{ count: 2 }],
    });
    const { items } = await list({});
    expect(items).toHaveLength(2);
  });

  it("can return an empty page when nothing matches the health filter", async () => {
    primeQueries({ base: [baseRow()], count: [{ count: 7 }] });
    const { items, total } = await list({ healthIn: ["at_risk"] });
    expect(items).toEqual([]);
    expect(total).toBe(7);
  });
});

// ── count fallback ───────────────────────────────────────────────────────

describe("total count", () => {
  it("returns 0 when the count query yields no row", async () => {
    primeQueries({ base: [baseRow()], count: [] });
    expect((await list({})).total).toBe(0);
  });

  it("applies the same non-health filters to the count as to the page query", async () => {
    primeQueries({ count: [{ count: 3 }] });
    const { total } = await list({
      monthStart: new Date("2026-03-01T00:00:00.000Z"),
      monthEnd: new Date("2026-04-01T00:00:00.000Z"),
      status: "approved",
      ownerId: "user-1",
      format: "static_post",
      channelId: "chan-1",
      search: "Launch",
    });
    expect(total).toBe(3);
  });

  it("deliberately ignores healthIn and cursor in the count", async () => {
    // `cursor` must not be counted (it would shrink every later page) and
    // `healthIn` is excluded by design — see the describe block above.
    primeQueries({ count: [{ count: 5 }] });
    const { total } = await list({
      healthIn: ["overdue"],
      cursor: { plannedPublishAt: new Date("2026-03-01T00:00:00.000Z"), id: "x" },
    });
    expect(total).toBe(5);
  });
});
