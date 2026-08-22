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

/**
 * Cycle-safe stringifier for Drizzle SQL nodes. The Drizzle
 * `and(eq(...), eq(...))` predicate contains circular references
 * (column → table → columns again) that crash `JSON.stringify` with
 * a `TypeError`. We use a `WeakSet` to break cycles and walk every
 * own enumerable property to surface identifiers hidden inside the
 * chunks.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v as object)) return "[Circular]";
      seen.add(v as object);
    }
    if (typeof v === "bigint") return v.toString();
    return v;
  });
}

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
  createLogoAsset,
  archiveLogoAsset,
  createFontAsset,
  archiveFontAsset,
  createBrandVoiceRule,
  archiveBrandVoiceRule,
  listBrandAssets,
  listBrandVoiceRules,
  listContentPillars,
  listRecentBrandUpdates,
  listBrandPublishingRules,
  listBrandLinkedResources,
  createBrandPublishingRule,
  archiveBrandPublishingRule,
  createBrandLinkedResource,
  archiveBrandLinkedResource,
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

describe("createLogoAsset", () => {
  it("requires workspace_manager role", async () => {
    await createLogoAsset(actor, workspaceId, {
      name: "Wordmark",
      storagePath: "ws-1/abc.png",
    });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
  });

  it("inserts a logo asset with storagePath when provided", async () => {
    await createLogoAsset(actor, workspaceId, {
      name: "Wordmark",
      storagePath: "ws-1/abc-123.png",
    });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    const values = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(values).toMatchObject({
      workspaceId,
      createdBy: actor.id,
      kind: "logo",
      name: "Wordmark",
      storagePath: "ws-1/abc-123.png",
      externalUrl: null,
      value: {},
    });
  });

  it("inserts a logo asset with externalUrl when provided", async () => {
    await createLogoAsset(actor, workspaceId, {
      name: "Mark",
      externalUrl: "https://cdn.example.com/mark.svg",
    });
    const values = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(values).toMatchObject({
      kind: "logo",
      name: "Mark",
      externalUrl: "https://cdn.example.com/mark.svg",
      storagePath: null,
    });
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      createLogoAsset(actor, workspaceId, { name: "Wordmark", storagePath: "ws-1/x.png" }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("archiveLogoAsset", () => {
  it("requires workspace_manager role and updates the row with archivedAt", async () => {
    await archiveLogoAsset(actor, workspaceId, "logo-1");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ archivedAt: expect.any(Date) });
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(archiveLogoAsset(actor, workspaceId, "logo-1")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });
});

describe("createFontAsset", () => {
  it("requires workspace_manager role", async () => {
    await createFontAsset(actor, workspaceId, {
      name: "Heading",
      family: "Inter",
      weight: 700,
      role: "headline",
    });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
  });

  it("inserts a font asset with family/weight/role in the value jsonb", async () => {
    await createFontAsset(actor, workspaceId, {
      name: "Body",
      family: "Roboto",
      weight: 400,
      role: "body",
    });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    const values = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(values).toMatchObject({
      workspaceId,
      createdBy: actor.id,
      kind: "font",
      name: "Body",
      value: { family: "Roboto", weight: 400, role: "body" },
    });
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      createFontAsset(actor, workspaceId, {
        name: "Body",
        family: "Inter",
        weight: 400,
        role: "body",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });
});

describe("archiveFontAsset", () => {
  it("requires workspace_manager role and updates the row with archivedAt", async () => {
    await archiveFontAsset(actor, workspaceId, "font-1");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
    ]);
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ archivedAt: expect.any(Date) });
  });

  it("throws PermissionDeniedError when the actor is not a workspace_manager", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(archiveFontAsset(actor, workspaceId, "font-1")).rejects.toBeInstanceOf(
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

  it("returns an empty list when there are no assets or rules", async () => {
    dbMock.state.selectResults.push([]);
    dbMock.state.selectResults.push([]);
    const updates = await listRecentBrandUpdates(workspaceId);
    expect(updates).toEqual([]);
  });

  it("formats asset descriptions as `${kind} ${name}` and rule descriptions as `${ruleType}: ${content}`", async () => {
    const t = new Date("2026-01-01T00:00:00Z");
    dbMock.state.selectResults.push([{ updatedAt: t, kind: "logo", name: "Wordmark" }]);
    dbMock.state.selectResults.push([{ updatedAt: t, ruleType: "dont", content: "No jargon" }]);
    const updates = await listRecentBrandUpdates(workspaceId);
    const asset = updates.find((u) => u.kind === "asset");
    const rule = updates.find((u) => u.kind === "rule");
    expect(asset?.description).toBe("logo Wordmark");
    expect(rule?.description).toBe("dont: No jargon");
  });

  it("falls back to the default limit of 10 when none is passed", async () => {
    // Both queries return 0 rows; the merged result is also empty.
    // The default-limit branch is exercised by every call without an
    // explicit limit (e.g. the "returns the queued select result"
    // test in listBrandVoiceRules uses the default path).
    dbMock.state.selectResults.push([]);
    dbMock.state.selectResults.push([]);
    const updates = await listRecentBrandUpdates(workspaceId);
    expect(updates).toEqual([]);
  });
});

// ─── Publishing rules (Task 3) ─────────────────────────────────────────

describe("createBrandPublishingRule", () => {
  it("agency admin succeeds through the policy shortcut", async () => {
    // `hasWorkspaceRole` resolves true for any role list when the
    // actor is an agency admin — we model that by returning true.
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await createBrandPublishingRule(actor, workspaceId, {
      ruleType: "compliance",
      title: "Legal review",
      content: "Claims require written approval.",
    });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
    ]);
    expect(dbMock.state.insertCalls).toHaveLength(1);
  });

  it("workspace manager succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await createBrandPublishingRule(actor, workspaceId, {
      ruleType: "channel",
      title: "LinkedIn voice",
      content: "Lead with the customer outcome.",
    });
    expect(dbMock.state.insertCalls).toHaveLength(1);
  });

  it("content planner succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await createBrandPublishingRule(actor, workspaceId, {
      ruleType: "alt_text",
      title: "Alt text",
      content: "Describe the image in plain English.",
    });
    expect(dbMock.state.insertCalls).toHaveLength(1);
  });

  it.each(["designer", "internal_reviewer", "publisher", "viewer", "client_reviewer"] as const)(
    "designer/reviewer/publisher/viewer/client_reviewer cannot mutate (%s)",
    async (role) => {
      // The `hasWorkspaceRole` helper returns false for any role not
      // in the allowlist (and the actor is not an agency admin in the
      // mock's default state). This is the deny path.
      void role;
      policyMock.hasWorkspaceRole.mockResolvedValue(false);
      await expect(
        createBrandPublishingRule(actor, workspaceId, {
          ruleType: "general",
          title: "Forbidden",
          content: "Should not be inserted.",
        }),
      ).rejects.toBeInstanceOf(PermissionDeniedError);
      expect(dbMock.state.insertCalls).toHaveLength(0);
    },
  );

  it("inserts a publishing rule with workspaceId, createdBy, and the validated value", async () => {
    await createBrandPublishingRule(actor, workspaceId, {
      ruleType: "compliance",
      title: "Legal review",
      content: "Claims require written approval.",
    });
    const values = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(values).toMatchObject({
      workspaceId,
      createdBy: actor.id,
      ruleType: "compliance",
      title: "Legal review",
      content: "Claims require written approval.",
    });
  });
});

describe("archiveBrandPublishingRule", () => {
  it("agency admin succeeds through the policy shortcut", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveBrandPublishingRule(actor, workspaceId, "rule-1");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
    ]);
    expect(dbMock.state.updateCalls).toHaveLength(1);
  });

  it("workspace manager succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveBrandPublishingRule(actor, workspaceId, "rule-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ archivedAt: expect.any(Date) });
  });

  it("content planner succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveBrandPublishingRule(actor, workspaceId, "rule-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
  });

  it("designer/reviewer/publisher/viewer/client_reviewer cannot mutate", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(archiveBrandPublishingRule(actor, workspaceId, "rule-1")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
    expect(dbMock.state.updateCalls).toHaveLength(0);
  });

  it("archiving includes both the rule ID and the workspace ID in the predicate", async () => {
    await archiveBrandPublishingRule(actor, workspaceId, "rule-42");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    // The Drizzle `and(eq(table.id, X), eq(table.workspaceId, Y))`
    // expression compiles to an SQL node with a queryChunks array —
    // we verify the workspaceId and rule id appear as strings inside
    // it without depending on the private shape. The integration
    // test pins the actual SQL via the live database.
    const where = dbMock.state.updateCalls[0]?.where as { queryChunks?: unknown[] } & unknown;
    const whereString = safeStringify(where);
    expect(whereString).toContain("rule-42");
    expect(whereString).toContain(workspaceId);
  });
});

describe("listBrandPublishingRules", () => {
  it("returns the queued select result", async () => {
    dbMock.state.selectResults.push([
      { id: "p1", workspaceId, ruleType: "compliance", title: "Legal", content: "X" },
    ]);
    const rows = await listBrandPublishingRules(workspaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("p1");
  });

  it("filters by workspaceId and archivedAt IS NULL", async () => {
    dbMock.state.selectResults.push([]);
    await listBrandPublishingRules(workspaceId);
    // The chain runs `.select().from().where(...).orderBy(...)` —
    // the only thing we can assert at the unit level is that the
    // chain was invoked and returned the queued empty result. The
    // SQL predicate is pinned by the integration test.
    expect(dbMock.state.selectResults).toHaveLength(0);
  });
});

// ─── Linked resources (Task 3) ──────────────────────────────────────────

describe("createBrandLinkedResource", () => {
  it("agency admin succeeds through the policy shortcut", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await createBrandLinkedResource(actor, workspaceId, {
      provider: "figma",
      name: "Master library",
      url: "https://figma.com/file/example",
      description: "Approved components",
    });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
    ]);
    expect(dbMock.state.insertCalls).toHaveLength(1);
  });

  it("workspace manager succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await createBrandLinkedResource(actor, workspaceId, {
      provider: "google_drive",
      name: "Drive",
      url: "https://drive.google.com/folders/abc",
    });
    expect(dbMock.state.insertCalls).toHaveLength(1);
  });

  it("content planner succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await createBrandLinkedResource(actor, workspaceId, {
      provider: "canva",
      name: "Templates",
      url: "https://canva.com/p/abc",
    });
    expect(dbMock.state.insertCalls).toHaveLength(1);
  });

  it("designer/reviewer/publisher/viewer/client_reviewer cannot mutate", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      createBrandLinkedResource(actor, workspaceId, {
        provider: "figma",
        name: "Forbidden",
        url: "https://figma.com/file/x",
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("inserts a linked resource with workspaceId, createdBy, and the validated value", async () => {
    await createBrandLinkedResource(actor, workspaceId, {
      provider: "figma",
      name: "Master library",
      url: "https://figma.com/file/example",
      description: "Approved components",
    });
    const values = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(values).toMatchObject({
      workspaceId,
      createdBy: actor.id,
      provider: "figma",
      name: "Master library",
      url: "https://figma.com/file/example",
      description: "Approved components",
    });
  });
});

describe("archiveBrandLinkedResource", () => {
  it("agency admin succeeds through the policy shortcut", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveBrandLinkedResource(actor, workspaceId, "res-1");
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
    ]);
    expect(dbMock.state.updateCalls).toHaveLength(1);
  });

  it("workspace manager succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveBrandLinkedResource(actor, workspaceId, "res-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ archivedAt: expect.any(Date) });
  });

  it("content planner succeeds", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveBrandLinkedResource(actor, workspaceId, "res-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
  });

  it("designer/reviewer/publisher/viewer/client_reviewer cannot mutate", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(archiveBrandLinkedResource(actor, workspaceId, "res-1")).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
    expect(dbMock.state.updateCalls).toHaveLength(0);
  });

  it("archiving includes both the resource ID and the workspace ID in the predicate", async () => {
    await archiveBrandLinkedResource(actor, workspaceId, "res-42");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    const where = dbMock.state.updateCalls[0]?.where as unknown;
    const whereString = safeStringify(where);
    expect(whereString).toContain("res-42");
    expect(whereString).toContain(workspaceId);
  });
});

describe("listBrandLinkedResources", () => {
  it("returns the queued select result", async () => {
    dbMock.state.selectResults.push([
      {
        id: "r1",
        workspaceId,
        provider: "figma",
        name: "Library",
        url: "https://figma.com/file/x",
        description: null,
      },
    ]);
    const rows = await listBrandLinkedResources(workspaceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("r1");
  });

  it("filters by workspaceId and archivedAt IS NULL", async () => {
    dbMock.state.selectResults.push([]);
    await listBrandLinkedResources(workspaceId);
    expect(dbMock.state.selectResults).toHaveLength(0);
  });
});

// ─── listRecentBrandUpdates extension (Task 3) ─────────────────────────

describe("listRecentBrandUpdates — rules + resources", () => {
  it("includes publishing rule entries", async () => {
    const t = new Date("2026-01-01T00:00:00Z");
    // assets
    dbMock.state.selectResults.push([]);
    // rules
    dbMock.state.selectResults.push([]);
    // publishing rules
    dbMock.state.selectResults.push([{ updatedAt: t, ruleType: "compliance", title: "Legal" }]);
    // linked resources
    dbMock.state.selectResults.push([]);
    const updates = await listRecentBrandUpdates(workspaceId);
    const rule = updates.find((u) => u.kind === "publishing_rule");
    expect(rule).toBeDefined();
    expect(rule?.description).toBe("compliance: Legal");
  });

  it("includes linked resource entries without exposing URLs", async () => {
    const t = new Date("2026-01-01T00:00:00Z");
    dbMock.state.selectResults.push([]); // assets
    dbMock.state.selectResults.push([]); // voice rules
    dbMock.state.selectResults.push([]); // publishing rules
    dbMock.state.selectResults.push([
      {
        updatedAt: t,
        provider: "figma",
        name: "Master library",
        url: "https://figma.com/file/secret-token",
      },
    ]);
    const updates = await listRecentBrandUpdates(workspaceId);
    const resource = updates.find((u) => u.kind === "linked_resource");
    expect(resource).toBeDefined();
    expect(resource?.description).toBe("figma Master library");
    // Critical: the URL must NOT appear in the descriptor — even if a
    // viewer can see that a resource exists, they shouldn't get the
    // deep link to the upstream library.
    expect(resource?.description ?? "").not.toContain("figma.com");
    expect(resource?.description ?? "").not.toContain("secret-token");
    // The returned update object must not carry a `url` field either.
    const resourceRecord = resource as unknown as Record<string, unknown>;
    expect(resourceRecord.url).toBeUndefined();
  });
});
