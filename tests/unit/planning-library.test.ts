import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FEAT-06 (GAP-FULL-REVIEW-2026-08-25) — planning library CRUD unit
 * tests. The four new service modules (`src/lib/planning/*`) each
 * export `createX` + `archiveX` (plus the content-clone module for
 * `duplicateContentItem`). This file pins:
 *
 *   1. The Zod input schemas accept the documented shape.
 *   2. The role gate (`hasWorkspaceRole`) is enforced.
 *   3. The service writes the right rows + activity events.
 *   4. `duplicateContentItem` deep-copies the source item + its
 *      `content_item_channels`, but does not copy delivery / approval /
 *      publication rows.
 *   5. Idempotency: archiving an already-archived row is a no-op.
 *
 * The DB is mocked with a chainable that records calls and resolves
 * queued rows — the same pattern `tests/unit/deliveries-service.test.ts`
 * uses.
 */

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  insertReturningIds: { id: string }[];
  updateCalls: { table: unknown; set: unknown; where: unknown }[];
  deleteCalls: { table: unknown; where: unknown }[];
  executeCalls: { sql: unknown }[];
  transactionCalls: number;
};

function thenableProxy(target: Record<string, unknown>): Record<string, unknown> {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(state.selectResults.shift() ?? []);
      }
      if (prop === "limit") return t.limit;
      if (prop === "for") return t.for;
      if (prop === "orderBy") return t.orderBy;
      return Reflect.get(t, prop, receiver);
    },
  });
}
let state: DrizzleState;

function makeSelectChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => thenableProxy(chain));
  chain.orderBy = vi.fn(() => thenableProxy(chain));
  chain.for = vi.fn(() => chain);
  chain.limit = vi.fn(() => {
    const rows = state.selectResults.shift() ?? [];
    return Promise.resolve(rows);
  });
  return chain;
}
const insertReturningChain: Record<string, unknown> = {
  returning: vi.fn(() => {
    const row = state.insertReturningIds.shift() ?? { id: "default-id" };
    return Promise.resolve([row]);
  }),
  onConflictDoUpdate: vi.fn(() => insertReturningChain),
  onConflictDoNothing: vi.fn(() => Promise.resolve()),
};
const insertChain: Record<string, unknown> = {
  values: vi.fn((values: unknown) => {
    state.insertCalls.push({ table: "insert", values });
    return insertReturningChain;
  }),
};
const updateChain: Record<string, unknown> = {};
let lastSet: unknown = undefined;
updateChain.set = vi.fn((set: unknown) => {
  lastSet = set;
  return updateChain;
});
updateChain.where = vi.fn((where: unknown) => {
  state.updateCalls.push({ table: "update", set: lastSet, where });
  lastSet = undefined;
  return Promise.resolve();
});
const delChain: Record<string, unknown> = {
  where: vi.fn((where: unknown) => {
    state.deleteCalls.push({ table: "delete", where });
    return Promise.resolve();
  }),
};
const executeFn = vi.fn((sqlArg: unknown) => {
  state.executeCalls.push({ sql: sqlArg });
  return Promise.resolve();
});
const transactionFn = vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
  state.transactionCalls += 1;
  const txSelect = vi.fn(() => makeSelectChain());
  const txInsert = vi.fn(() => insertChain);
  const txUpdate = vi.fn(() => updateChain);
  const txApi = {
    select: txSelect,
    insert: txInsert,
    update: txUpdate,
    execute: vi.fn(() => Promise.resolve()),
  };
  return cb(txApi);
});

const dbMock = {
  select: vi.fn(() => makeSelectChain()),
  insert: vi.fn(() => insertChain),
  update: vi.fn(() => updateChain),
  delete: vi.fn(() => delChain),
  transaction: transactionFn,
  execute: executeFn,
  get state() {
    return state;
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("server-only", () => ({}));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
  requirePolicy: vi.fn(async (predicate: Promise<boolean>, action: string) => {
    if (!(await predicate)) {
      const err = new Error(`Permission denied: ${action}`);
      err.name = "PermissionDeniedError";
      throw err;
    }
  }),
}));
vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, ...policyMock };
});

const actor = { id: "user-1" };
const workspaceId = "ws-1";

beforeEach(() => {
  state = {
    selectResults: [],
    insertCalls: [],
    insertReturningIds: [],
    updateCalls: [],
    deleteCalls: [],
    executeCalls: [],
    transactionCalls: 0,
  };
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.requirePolicy.mockReset();
  policyMock.requirePolicy.mockImplementation(
    async (predicate: Promise<boolean>, action: string) => {
      if (!(await predicate)) {
        const err = new Error(`Permission denied: ${action}`);
        err.name = "PermissionDeniedError";
        throw err;
      }
    },
  );
});

// ─── campaigns ────────────────────────────────────────────────────────────
const { CreateCampaignSchema, createCampaign, archiveCampaign } =
  await import("@/lib/planning/campaigns");

describe("CreateCampaignSchema", () => {
  it("accepts the minimal required shape", () => {
    expect(CreateCampaignSchema.safeParse({ name: "Summer launch" }).success).toBe(true);
  });
  it("rejects short names", () => {
    expect(CreateCampaignSchema.safeParse({ name: "a" }).success).toBe(false);
  });
  it("rejects invalid coverColor", () => {
    expect(
      CreateCampaignSchema.safeParse({ name: "Summer launch", coverColor: "red" }).success,
    ).toBe(false);
  });
});

describe("createCampaign", () => {
  it("requires workspace_manager or content_planner", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValueOnce(false);
    await expect(
      createCampaign(actor, workspaceId, { name: "Test", status: "draft" }),
    ).rejects.toThrow(/Permission denied/);
  });
  it("inserts the campaign row + an activity_event", async () => {
    state.insertReturningIds.push({ id: "campaign-1" });
    const out = await createCampaign(actor, workspaceId, { name: "Test", status: "draft" });
    expect(out.id).toBe("campaign-1");
    // The first insert is the campaign row, the second is the activity event.
    expect(state.insertCalls.length).toBe(2);
    const campaignInsert = state.insertCalls[0]!.values as Record<string, unknown>;
    expect(campaignInsert["name"]).toBe("Test");
    expect(campaignInsert["workspaceId"]).toBe(workspaceId);
    expect(campaignInsert["createdBy"]).toBe("user-1");
    const activityInsert = state.insertCalls[1]!.values as Record<string, unknown>;
    expect(activityInsert["kind"]).toBe("create");
  });
});

describe("archiveCampaign", () => {
  it("is a no-op when the row is already archived", async () => {
    state.selectResults.push([{ id: "campaign-1", name: "Test", archivedAt: new Date() }]);
    await archiveCampaign(actor, workspaceId, "campaign-1");
    expect(state.updateCalls.length).toBe(0);
  });
  it("updates the row + writes an activity event", async () => {
    state.selectResults.push([{ id: "campaign-1", name: "Test", archivedAt: null }]);
    await archiveCampaign(actor, workspaceId, "campaign-1");
    const update = state.updateCalls[0]!;
    expect(update.set).toMatchObject({
      status: "archived",
      archivedAt: expect.any(Date),
    });
  });
  it("throws when the campaign is not found", async () => {
    state.selectResults.push([]);
    await expect(archiveCampaign(actor, workspaceId, "missing")).rejects.toThrow(
      "Campaign not found",
    );
  });
});

// ─── pillars ──────────────────────────────────────────────────────────────
const { CreatePillarSchema, createPillar, archivePillar } = await import("@/lib/planning/pillars");

describe("CreatePillarSchema", () => {
  it("accepts a name", () => {
    expect(CreatePillarSchema.safeParse({ name: "Product" }).success).toBe(true);
  });
  it("rejects too-long names", () => {
    expect(CreatePillarSchema.safeParse({ name: "a".repeat(81) }).success).toBe(false);
  });
});

describe("createPillar", () => {
  it("inserts the pillar row + activity", async () => {
    state.insertReturningIds.push({ id: "pillar-1" });
    const out = await createPillar(actor, workspaceId, { name: "Product" });
    expect(out.id).toBe("pillar-1");
    expect(state.insertCalls[0]!.values).toMatchObject({
      name: "Product",
      workspaceId,
      createdBy: "user-1",
    });
  });
  it("translates unique-violation to a friendly message", async () => {
    // Build a fresh insert chain that throws a Postgres 23505, so the
    // global mock isn't polluted for subsequent tests.
    const err = new Error("duplicate key") as Error & { code: string };
    err.code = "23505";
    const throwingChain: Record<string, unknown> = {
      values: vi.fn(() => {
        throw err;
      }),
    };
    const origInsert = dbMock.insert;
    dbMock.insert = vi.fn(() => throwingChain);
    try {
      await expect(createPillar(actor, workspaceId, { name: "Product" })).rejects.toThrow(
        /already exists/,
      );
    } finally {
      dbMock.insert = origInsert;
    }
  });
});

describe("archivePillar", () => {
  it("is a no-op when already archived", async () => {
    state.selectResults.push([{ id: "p-1", name: "X", archivedAt: new Date() }]);
    await archivePillar(actor, workspaceId, "p-1");
    expect(state.updateCalls.length).toBe(0);
  });
});

// ─── templates ────────────────────────────────────────────────────────────
const { CreateTemplateSchema, createTemplate, archiveTemplate } =
  await import("@/lib/planning/templates");

describe("CreateTemplateSchema", () => {
  it("accepts the minimal required shape", () => {
    expect(
      CreateTemplateSchema.safeParse({ name: "Quote card", format: "static_post" }).success,
    ).toBe(true);
  });
  it("rejects unknown formats", () => {
    expect(CreateTemplateSchema.safeParse({ name: "Q", format: "vaporwave" }).success).toBe(false);
  });
});

describe("createTemplate", () => {
  it("inserts the template row", async () => {
    state.insertReturningIds.push({ id: "tpl-1" });
    const out = await createTemplate(actor, workspaceId, {
      name: "Quote card",
      format: "static_post",
      defaultChannelIds: [],
    });
    expect(out.id).toBe("tpl-1");
    const values = state.insertCalls[0]!.values as Record<string, unknown>;
    expect(values["name"]).toBe("Quote card");
    expect(values["format"]).toBe("static_post");
    expect(values["defaultChannelIds"]).toEqual([]);
  });
});

describe("archiveTemplate", () => {
  it("updates the row to archived", async () => {
    state.selectResults.push([{ id: "tpl-1", name: "Quote card", archivedAt: null }]);
    await archiveTemplate(actor, workspaceId, "tpl-1");
    expect(state.updateCalls[0]!.set).toMatchObject({ archivedAt: expect.any(Date) });
  });
});

// ─── content-clone ────────────────────────────────────────────────────────
const { duplicateContentItem } = await import("@/lib/planning/content-clone");

describe("duplicateContentItem", () => {
  const sourceId = "src-1";
  it("requires the role gate", async () => {
    // Provide a found source so we exercise the role check, not the
    // missing-source check.
    state.selectResults.push([
      {
        id: sourceId,
        workspaceId,
        title: "Original",
        format: "static_post",
        brief: "",
        formatPayload: null,
        plannedPublishAt: new Date(),
        priority: "normal",
        contentOwnerId: "owner-1",
        campaignId: null,
        contentPillarId: null,
      },
    ]);
    policyMock.hasWorkspaceRole.mockResolvedValueOnce(false);
    await expect(duplicateContentItem(actor, sourceId)).rejects.toThrow(/Permission denied/);
  });
  it("throws when the source item is missing", async () => {
    state.selectResults.push([]);
    await expect(duplicateContentItem(actor, sourceId)).rejects.toThrow("Content item not found");
  });
  it("deep-copies the source item + its channels, returns new id", async () => {
    // First select: the source content item
    state.selectResults.push([
      {
        id: sourceId,
        workspaceId,
        title: "Original",
        format: "static_post",
        brief: "hello",
        formatPayload: null,
        plannedPublishAt: new Date("2026-09-01T00:00:00Z"),
        priority: "normal",
        contentOwnerId: "owner-1",
        campaignId: "camp-1",
        contentPillarId: "pillar-1",
      },
    ]);
    // Insert (clone content_item) returns the new id
    state.insertReturningIds.push({ id: "clone-1" });
    // Second select: the source channels
    state.selectResults.push([{ socialChannelId: "ch-1" }, { socialChannelId: "ch-2" }]);

    const out = await duplicateContentItem(actor, sourceId);
    expect(out.id).toBe("clone-1");

    // First insert: the clone of the content_item
    const cloneInsert = state.insertCalls[0]!.values as Record<string, unknown>;
    expect(cloneInsert["title"]).toBe("Original (copy)");
    expect(cloneInsert["status"]).toBe("draft");
    expect(cloneInsert["contentOwnerId"]).toBe(actor.id);
    expect(cloneInsert["campaignId"]).toBe("camp-1");
    expect(cloneInsert["contentPillarId"]).toBe("pillar-1");
    expect(cloneInsert["revision"]).toBe(0);

    // Second insert: the cloned content_item_channels (2 rows, one per source channel)
    const channelInsert = state.insertCalls[1]!.values as Array<Record<string, unknown>>;
    expect(Array.isArray(channelInsert)).toBe(true);
    expect(channelInsert).toHaveLength(2);
    expect(channelInsert[0]!["contentItemId"]).toBe("clone-1");
    expect(channelInsert[0]!["socialChannelId"]).toBe("ch-1");
    expect(channelInsert[1]!["socialChannelId"]).toBe("ch-2");
  });
  it("honours the plannedPublishAt override", async () => {
    state.selectResults.push([
      {
        id: sourceId,
        workspaceId,
        title: "Original",
        format: "static_post",
        brief: "",
        formatPayload: null,
        plannedPublishAt: new Date("2026-09-01T00:00:00Z"),
        priority: "normal",
        contentOwnerId: "owner-1",
        campaignId: null,
        contentPillarId: null,
      },
    ]);
    state.insertReturningIds.push({ id: "clone-2" });
    state.selectResults.push([]);
    const newDate = new Date("2026-10-15T00:00:00Z");
    await duplicateContentItem(actor, sourceId, { plannedPublishAt: newDate });
    const cloneInsert = state.insertCalls[0]!.values as Record<string, unknown>;
    expect(new Date(cloneInsert["plannedPublishAt"] as Date).toISOString()).toBe(
      newDate.toISOString(),
    );
  });
});
