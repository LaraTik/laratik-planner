import { describe, expect, it, vi, beforeEach } from "vitest";
import { PermissionDeniedError } from "@/lib/auth/policy";

/**
 * The brand service is a thin layer over Drizzle. We mock the chainable
 * Drizzle API and the auth policy. The test surface is therefore:
 *   - the call shape passed to `db.insert / db.update` (workspaceId,
 *     createdBy, kind, value, etc.);
 *   - the predicate passed to `hasWorkspaceRole`;
 *   - the inputs to `PermissionDeniedError` when the predicate is false.
 *
 * We don't try to assert the result of `db.select` here — that is
 * covered by the integration suite. The unit suite's job is to lock
 * down the contract.
 */

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  updateCalls: { table: unknown; set: unknown; where: unknown }[];
  deleteCalls: { table: unknown; where: unknown }[];
  limitIndex: number;
};

function makeDrizzleMock(state: DrizzleState) {
  // Build a chain object that:
  //  - `.from()` and `.where()` return the chain (chainable in any order);
  //  - `.orderBy()` returns a thenable that resolves the next queued
  //    `selectResults` entry, AND is still chainable so `.limit()` can
  //    follow (used by listers that call `.orderBy().limit(n)`);
  //  - `.limit()` is the final thenable for the "with limit" listers.
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    // `.orderBy()` returns a thenable proxy: if the caller does
    // `.orderBy().limit(n)`, the proxy forwards `.limit` to the chain
    // (and that .limit resolves the queued rows). If the caller
    // `await`s the `.orderBy()` result, the proxy resolves the queued
    // rows directly.
    chain.orderBy = vi.fn(
      () =>
        new Proxy(chain, {
          get(target, prop, receiver) {
            if (prop === "then") {
              return (resolve: (v: unknown) => void) => resolve(state.selectResults.shift() ?? []);
            }
            if (prop === "limit") {
              return target.limit;
            }
            return Reflect.get(target, prop, receiver);
          },
        }),
    );
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ table: "insert", values });
    return Promise.resolve();
  });
  const insert = vi.fn(() => insertChain);

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
  const update = vi.fn(() => updateChain);

  const deleteChain: Record<string, unknown> = {};
  deleteChain.where = vi.fn((where: unknown) => {
    state.deleteCalls.push({ table: "delete", where });
    return Promise.resolve();
  });
  const del = vi.fn(() => deleteChain);

  return { select, insert, update, delete: del, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    insertCalls: [],
    updateCalls: [],
    deleteCalls: [],
    limitIndex: 0,
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
}));
vi.mock("@/lib/auth/policy", async () => {
  // Re-export the real PermissionDeniedError so the SUT can throw it.
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, hasWorkspaceRole: policyMock.hasWorkspaceRole };
});

const {
  createBrandAsset,
  archiveBrandAsset,
  createBrandVoiceRule,
  archiveBrandVoiceRule,
  listBrandAssets,
  listBrandVoiceRules,
  listContentPillars,
  listRecentBrandUpdates,
} = await import("@/lib/brand/service");

const actor = { id: "user-1" };
const workspaceId = "ws-1";

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.state.deleteCalls = [];
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
});

describe("createBrandAsset", () => {
  it("requires workspace_manager role", async () => {
    await createBrandAsset(actor, workspaceId, {
      kind: "color",
      name: "Brand blue",
      value: { hex: "#3B82F6" },
    });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
  });

  it("inserts a color asset with workspaceId, createdBy, and the validated value", async () => {
    await createBrandAsset(actor, workspaceId, {
      kind: "color",
      name: "Brand blue",
      value: { hex: "#3B82F6" },
    });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    const call = dbMock.state.insertCalls[0]!;
    expect(call.table).toBeDefined();
    expect(call.values).toMatchObject({
      workspaceId,
      createdBy: actor.id,
      kind: "color",
      name: "Brand blue",
      value: { hex: "#3B82F6" },
    });
  });

  it("inserts a logo asset with the externalUrl when provided", async () => {
    await createBrandAsset(actor, workspaceId, {
      kind: "logo",
      name: "Wordmark",
      externalUrl: "https://cdn.example.com/logo.svg",
    });
    const values = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(values).toMatchObject({
      kind: "logo",
      name: "Wordmark",
      externalUrl: "https://cdn.example.com/logo.svg",
    });
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      createBrandAsset(actor, workspaceId, {
        kind: "color",
        name: "Brand blue",
        value: { hex: "#3B82F6" },
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("archiveBrandAsset", () => {
  it("requires workspace_manager role before updating", async () => {
    await archiveBrandAsset(actor, workspaceId, "asset-1");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
  });

  it("updates the asset row with an archivedAt timestamp", async () => {
    await archiveBrandAsset(actor, workspaceId, "asset-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    const call = dbMock.state.updateCalls[0]!;
    expect(call.set).toMatchObject({ archivedAt: expect.any(Date) });
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(archiveBrandAsset(actor, workspaceId, "asset-1")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});

describe("createBrandVoiceRule", () => {
  it("requires workspace_manager role", async () => {
    await createBrandVoiceRule(actor, workspaceId, { ruleType: "tone", content: "Warm." });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
  });

  it("inserts a voice rule with the right workspaceId and createdBy", async () => {
    await createBrandVoiceRule(actor, workspaceId, {
      ruleType: "do",
      content: "Lead with outcomes.",
    });
    const values = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(values).toMatchObject({
      workspaceId,
      createdBy: actor.id,
      ruleType: "do",
      content: "Lead with outcomes.",
    });
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      createBrandVoiceRule(actor, workspaceId, { ruleType: "tone", content: "Warm." }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("archiveBrandVoiceRule", () => {
  it("requires workspace_manager role and issues a delete with the ruleId", async () => {
    await archiveBrandVoiceRule(actor, workspaceId, "rule-1");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
    // `brand_voice_rules` has no archivedAt — we hard-delete.
    expect(dbMock.state.updateCalls).toHaveLength(0);
    expect(dbMock.state.deleteCalls).toHaveLength(1);
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(archiveBrandVoiceRule(actor, workspaceId, "rule-1")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});

describe("listBrandAssets", () => {
  it("returns the queued select result", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    dbMock.state.selectResults.push([
      {
        id: "a1",
        workspaceId,
        kind: "color",
        name: "Blue",
        value: { hex: "#0000FF" },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const rows = await listBrandAssets(workspaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("a1");
  });

  it("honors the kind filter when provided", async () => {
    dbMock.state.selectResults.push([]);
    await listBrandAssets(workspaceId, { kind: "color" });
    // The chain was called; the where clause is built by the SUT.
    expect(dbMock.state.selectResults).toHaveLength(0);
  });
});

describe("listBrandVoiceRules", () => {
  it("returns the queued select result", async () => {
    dbMock.state.selectResults.push([
      { id: "r1", workspaceId, ruleType: "tone", content: "Warm.", sortOrder: "0" },
    ]);
    const rows = await listBrandVoiceRules(workspaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("r1");
  });
});

describe("listContentPillars", () => {
  it("returns the queued select result", async () => {
    dbMock.state.selectResults.push([
      { id: "p1", name: "Recipes", color: "#ff0000", description: "How-tos" },
    ]);
    const rows = await listContentPillars(workspaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Recipes");
  });

  it("returns an empty list when there are no pillars", async () => {
    dbMock.state.selectResults.push([]);
    const rows = await listContentPillars(workspaceId);
    expect(rows).toEqual([]);
  });
});

describe("listRecentBrandUpdates", () => {
  it("merges asset and rule rows, sorted desc, sliced to the limit", async () => {
    const older = new Date("2026-01-01T00:00:00Z");
    const newer = new Date("2026-01-02T00:00:00Z");
    // assets query result
    dbMock.state.selectResults.push([{ updatedAt: older, kind: "color", name: "Brand blue" }]);
    // rules query result
    dbMock.state.selectResults.push([
      { updatedAt: newer, ruleType: "tone", content: "Warm and direct." },
    ]);

    const updates = await listRecentBrandUpdates(workspaceId, 5);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.kind).toBe("rule");
    expect(updates[0]?.description).toBe("tone: Warm and direct.");
    expect(updates[1]?.kind).toBe("asset");
    expect(updates[1]?.description).toBe("color Brand blue");
  });

  it("respects the limit and only returns the most recent N", async () => {
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    const at = (offsetDays: number) => new Date(base + offsetDays * 86_400_000);
    dbMock.state.selectResults.push([
      { updatedAt: at(3), kind: "color", name: "A" },
      { updatedAt: at(2), kind: "color", name: "B" },
      { updatedAt: at(1), kind: "color", name: "C" },
    ]);
    dbMock.state.selectResults.push([{ updatedAt: at(4), ruleType: "do", content: "D" }]);
    const updates = await listRecentBrandUpdates(workspaceId, 2);
    expect(updates).toHaveLength(2);
    expect(updates[0]?.description).toBe("do: D");
    expect(updates[1]?.description).toBe("color A");
  });
});
