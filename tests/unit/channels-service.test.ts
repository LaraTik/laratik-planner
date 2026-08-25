import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FEAT-07 (GAP-FULL-REVIEW-2026-08-25) — channels service tests.
 *
 * The page-level `channels/actions.ts` already implemented
 * `createChannelAction`, `updateChannelAction`, and
 * `archiveChannelAction` as "use server" wrappers. The §14 contract
 * additionally requires `restoreChannel`, which the page never
 * exposed. This file pins the service surface that backs the page
 * (and is now the §14 implementation):
 *
 *   - createChannel: validates + reserves capacity
 *   - updateChannel: partial update
 *   - archiveChannel: releases capacity, idempotent
 *   - restoreChannel: re-reserves capacity, idempotent
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

const capacityMock = vi.hoisted(() => ({
  reserveCapacity: vi.fn(async () => undefined),
  releaseCapacity: vi.fn(async () => undefined),
  LimitExceededError: class LimitExceededError extends Error {
    readonly details: unknown;
    constructor(message: string, details?: unknown) {
      super(message);
      this.details = details;
    }
  },
}));
vi.mock("@/lib/entitlements", () => capacityMock);

const { createChannel, updateChannel, archiveChannel, restoreChannel } =
  await import("@/lib/channels/service");

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
  capacityMock.reserveCapacity.mockReset();
  capacityMock.releaseCapacity.mockReset();
});

describe("createChannel", () => {
  it("rejects without workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValueOnce(false);
    await expect(
      createChannel(actor, workspaceId, { platform: "instagram", accountName: "Acme" }),
    ).rejects.toThrow(/Permission denied/);
  });
  it("resolves agencyId + reserves capacity + inserts the row", async () => {
    state.selectResults.push([{ agencyId: "agency-1" }]); // agencyId lookup
    state.insertReturningIds.push({ id: "ch-1" });
    const out = await createChannel(actor, workspaceId, {
      platform: "instagram",
      accountName: "Acme",
    });
    expect(out.id).toBe("ch-1");
    expect(capacityMock.reserveCapacity).toHaveBeenCalledTimes(1);
    // The service calls reserveCapacity(tx, agencyId, items). The
    // mocked function drops the tx (a tx-shaped object) and accepts
    // the agencyId + items; we just verify the items are correct.
    const calls = capacityMock.reserveCapacity.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    expect(lastCallArgs[1]).toBe("agency-1");
    expect(lastCallArgs[2]).toEqual([
      { resource: "social_profiles", increase: 1 },
      { resource: "social_profiles:instagram", increase: 1 },
    ]);
  });
  it("rejects invalid input", async () => {
    await expect(
      createChannel(actor, workspaceId, { platform: "instagram", accountName: "" }),
    ).rejects.toThrow(/at least 2 character/);
  });
});

describe("updateChannel", () => {
  it("updates the editable fields", async () => {
    state.selectResults.push([{ id: "ch-1", platform: "instagram" }]);
    await updateChannel(actor, workspaceId, {
      channelId: "ch-1",
      accountName: "Acme 2.0",
    });
    expect(state.updateCalls[0]!.set).toMatchObject({ accountName: "Acme 2.0" });
  });
  it("throws when the channel is not found", async () => {
    // The select inside updateChannel returns [] so the row is
    // treated as missing. (The pre-fix `updateChannelAction` did
    // not check; the service does.)
    state.selectResults.push([]);
    await expect(
      updateChannel(actor, workspaceId, { channelId: "missing", accountName: "Acme" }),
    ).rejects.toThrow("Channel not found");
  });
});

describe("archiveChannel", () => {
  it("is a no-op when the channel is already archived", async () => {
    state.selectResults.push([{ platform: "instagram", archivedAt: new Date() }]);
    await archiveChannel(actor, workspaceId, "ch-1");
    expect(state.updateCalls.length).toBe(0);
    expect(capacityMock.releaseCapacity).not.toHaveBeenCalled();
  });
  it("updates the row + releases capacity", async () => {
    state.selectResults.push([{ platform: "instagram", archivedAt: null }]);
    state.selectResults.push([{ agencyId: "agency-1" }]); // agencyId lookup
    await archiveChannel(actor, workspaceId, "ch-1");
    expect(state.updateCalls[0]!.set).toMatchObject({
      isActive: false,
      archivedAt: expect.any(Date),
    });
    expect(capacityMock.releaseCapacity).toHaveBeenCalledTimes(1);
  });
});

describe("restoreChannel (FEAT-07)", () => {
  it("throws when the channel is not found", async () => {
    state.selectResults.push([]);
    await expect(restoreChannel(actor, workspaceId, "missing")).rejects.toThrow(
      "Channel not found",
    );
  });
  it("is a no-op when the channel is already active", async () => {
    state.selectResults.push([{ platform: "instagram", archivedAt: null }]);
    await restoreChannel(actor, workspaceId, "ch-1");
    expect(capacityMock.reserveCapacity).not.toHaveBeenCalled();
    expect(state.updateCalls.length).toBe(0);
  });
  it("re-reserves capacity + clears the archive fields", async () => {
    state.selectResults.push([{ platform: "instagram", archivedAt: new Date() }]);
    state.selectResults.push([{ agencyId: "agency-1" }]);
    await restoreChannel(actor, workspaceId, "ch-1");
    expect(capacityMock.reserveCapacity).toHaveBeenCalledTimes(1);
    expect(state.updateCalls[0]!.set).toMatchObject({
      isActive: true,
      archivedAt: null,
      archivedBy: null,
    });
  });
});
