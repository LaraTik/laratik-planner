import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Coverage for the bulk "Reset all ideas" server action.
 *
 * The action is the only place that runs the bulk cascade delete
 * and the per-operation audit. A regression here is a security
 * incident (forgotten permission check, accepting a tampered typed
 * phrase, skipping the includePublished filter, etc.). These
 * tests pin:
 *
 *   1. The Zod command rejects malformed input BEFORE any DB work
 *      runs.
 *   2. Missing auth → 401-shaped error, no audit.
 *   3. Missing permission → denied audit + "you don't have
 *      permission" error.
 *   4. Tampered workspace slug → "workspace not found".
 *   5. Typed phrase != live workspace name → field error + failed
 *      audit.
 *   6. Workspace with no in-scope ideas → no-op error + failed
 *      audit (so the operator knows the run happened).
 *   7. Successful delete (includePublished=false and =true) →
 *      success audit with the right per-status breakdown and the
 *      right idea-ids payload.
 */

const dbMock = vi.hoisted(() => {
  const state: {
    selectResults: unknown[][];
    insertCalls: { values: unknown }[];
    deleteCalls: { where: unknown }[];
    transactionExecutions: number;
  } = {
    selectResults: [],
    insertCalls: [],
    deleteCalls: [],
    transactionExecutions: 0,
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
  function selectChain() {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => thenableProxy(chain));
    chain.orderBy = vi.fn(() => thenableProxy(chain));
    chain.for = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(state.selectResults.shift() ?? []));
    return chain;
  }
  const select = vi.fn(() => selectChain());

  function insertChain() {
    const chain: Record<string, unknown> = {};
    chain.values = vi.fn((values: unknown) => {
      state.insertCalls.push({ values });
      return Promise.resolve();
    });
    return chain;
  }
  const insert = vi.fn(() => insertChain());

  function deleteChain() {
    const chain: Record<string, unknown> = {};
    chain.where = vi.fn((where: unknown) => {
      state.deleteCalls.push({ where });
      return Promise.resolve();
    });
    return chain;
  }
  const del = vi.fn(() => deleteChain());

  const transaction = vi.fn(
    async (
      fn: (tx: {
        select: typeof select;
        delete: typeof del;
        insert: typeof insert;
      }) => Promise<unknown>,
    ) => {
      state.transactionExecutions += 1;
      const tx = { select, delete: del, insert };
      return fn(tx);
    },
  );

  return { db: { select, insert, delete: del, transaction }, state };
});

const currentActorMock = vi.hoisted(() => vi.fn());
const platformAccessMock = vi.hoisted(() => ({
  requirePlatformPermission: vi.fn(),
}));
const workspaceContextMock = vi.hoisted(() => ({
  getAccessibleWorkspace: vi.fn(),
}));
const navMock = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock("@/lib/db", () => ({ db: dbMock.db }));
vi.mock("@/lib/auth/current-actor", () => ({
  currentActor: currentActorMock,
}));
vi.mock("@/lib/auth/platform-access", () => platformAccessMock);
vi.mock("@/lib/workspaces/context", () => workspaceContextMock);
vi.mock("next/navigation", () => navMock);

import { resetAllIdeasAction } from "@/lib/content/reset-all-ideas-action";

const ACTOR_ID = "00000000-0000-0000-0000-000000000001";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000020";

function makeFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const form = new FormData();
  form.set("includePublished", overrides.includePublished ?? "false");
  form.set("typedPhrase", overrides.typedPhrase ?? "Acme Studio");
  form.set("reason", overrides.reason ?? "Bulk reset for the next planning cycle test run.");
  return form;
}

function findAudit(outcome: "success" | "denied" | "failed") {
  return dbMock.state.insertCalls.find((c) => {
    const v = c.values as Record<string, unknown>;
    return v.outcome === outcome;
  });
}

describe("resetAllIdeasAction", () => {
  beforeEach(() => {
    dbMock.state.selectResults = [];
    dbMock.state.insertCalls = [];
    dbMock.state.deleteCalls = [];
    dbMock.state.transactionExecutions = 0;
    currentActorMock.mockReset();
    platformAccessMock.requirePlatformPermission.mockReset();
    workspaceContextMock.getAccessibleWorkspace.mockReset();
    navMock.redirect.mockClear();
    currentActorMock.mockResolvedValue({ id: ACTOR_ID });
    workspaceContextMock.getAccessibleWorkspace.mockResolvedValue({
      id: WORKSPACE_ID,
      name: "Acme Studio",
    });
  });

  it("returns a sign-in error when the actor is missing", async () => {
    currentActorMock.mockResolvedValueOnce(null);
    const result = await resetAllIdeasAction("acme", undefined, makeFormData());
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/sign in/i) });
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("refuses when the reason is shorter than 8 characters", async () => {
    const result = await resetAllIdeasAction("acme", undefined, makeFormData({ reason: "too" }));
    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors.reason).toMatch(/8 characters/i);
    } else {
      throw new Error("expected field errors, got: " + JSON.stringify(result));
    }
    expect(platformAccessMock.requirePlatformPermission).not.toHaveBeenCalled();
  });

  it("writes a denied audit row when the operator lacks the permission", async () => {
    platformAccessMock.requirePlatformPermission.mockRejectedValueOnce(
      new Error("platform-permission:platform.destructive.execute"),
    );
    const result = await resetAllIdeasAction("acme", undefined, makeFormData());
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/don't have permission/i),
    });
    const denied = findAudit("denied");
    expect(denied).toBeDefined();
    const v = denied!.values as Record<string, unknown>;
    expect(v).toMatchObject({
      action: "platform.destructive.reset_all_ideas",
      targetType: "workspace",
      outcome: "denied",
    });
  });

  it("refuses when the workspace is not accessible", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    workspaceContextMock.getAccessibleWorkspace.mockResolvedValueOnce(null);
    const result = await resetAllIdeasAction("acme", undefined, makeFormData());
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/workspace not found/i),
    });
    // No audit (cross-tenant refusal happens before any state write).
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("returns a field error when the typed phrase does not match the live workspace name", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    const result = await resetAllIdeasAction(
      "acme",
      undefined,
      makeFormData({ typedPhrase: "wrong name" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors.typedPhrase).toMatch(/workspace's name exactly/i);
    } else {
      throw new Error("expected field errors, got: " + JSON.stringify(result));
    }
    const failed = findAudit("failed");
    const v = failed!.values as Record<string, unknown>;
    expect((v.metadata as Record<string, unknown>).typed_phrase_match).toBe(false);
  });

  it("returns a no-op error and audits the attempt when the workspace has no in-scope ideas", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    // The select inside the transaction returns zero ideas.
    dbMock.state.selectResults.push([]);
    const result = await resetAllIdeasAction("acme", undefined, makeFormData());
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/no non-live ideas/i),
    });
    const failed = findAudit("failed");
    const v = failed!.values as Record<string, unknown>;
    const meta = v.metadata as Record<string, unknown>;
    expect(meta.error_message).toMatch(/no ideas in scope/i);
    expect(meta.idea_count).toBe(0);
  });

  it("deletes only non-live ideas when includePublished=false", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    dbMock.state.selectResults.push([
      { id: "i-1", status: "draft" },
      { id: "i-2", status: "in_design" },
      { id: "i-3", status: "published" },
      { id: "i-4", status: "partially_published" },
    ]);
    await expect(resetAllIdeasAction("acme", undefined, makeFormData())).rejects.toThrow(
      /NEXT_REDIRECT/,
    );

    expect(dbMock.state.transactionExecutions).toBe(1);
    expect(dbMock.state.deleteCalls.length).toBe(1);
    // Audit row must record includePublished=false and only the
    // non-live idea IDs in the payload. The by_status is the full
    // workspace picture at delete time, not the deleted-only
    // breakdown, so a reviewer can see what was skipped too.
    const success = findAudit("success");
    const v = success!.values as Record<string, unknown>;
    const meta = v.metadata as Record<string, unknown>;
    expect(meta.include_published).toBe(false);
    expect(meta.idea_ids).toEqual(["i-1", "i-2"]);
    expect(meta.idea_count).toBe(2);
    expect(meta.by_status).toEqual({
      draft: 1,
      in_design: 1,
      published: 1,
      partially_published: 1,
    });
    expect(navMock.redirect).toHaveBeenCalledWith(expect.stringMatching(/\/planning\?reset=bulk/));
  });

  it("deletes every idea including live ones when includePublished=true", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    dbMock.state.selectResults.push([
      { id: "i-1", status: "draft" },
      { id: "i-2", status: "in_design" },
      { id: "i-3", status: "published" },
      { id: "i-4", status: "partially_published" },
    ]);
    await expect(
      resetAllIdeasAction("acme", undefined, makeFormData({ includePublished: "true" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);

    const success = findAudit("success");
    const v = success!.values as Record<string, unknown>;
    const meta = v.metadata as Record<string, unknown>;
    expect(meta.include_published).toBe(true);
    expect(meta.idea_ids).toEqual(["i-1", "i-2", "i-3", "i-4"]);
    expect(meta.idea_count).toBe(4);
    expect(meta.by_status).toEqual({
      draft: 1,
      in_design: 1,
      published: 1,
      partially_published: 1,
    });

    // Plan §1: one activity_event row is written in the same
    // transaction as the bulk delete. The kind is "bulk_delete",
    // content_item_id is null (the row is workspace-scoped, not
    // idea-scoped), and the metadata carries the includePublished
    // toggle + the per-status breakdown.
    const activityEvent = dbMock.state.insertCalls.find((c) => {
      const v = c.values as Record<string, unknown>;
      return v.kind === "bulk_delete";
    });
    expect(activityEvent).toBeDefined();
    const aev = activityEvent!.values as Record<string, unknown>;
    expect(aev.contentItemId).toBeNull();
    expect(aev.summary).toBe("Deleted 4 ideas (all)");
    const aem = aev.metadata as Record<string, unknown>;
    expect(aem.includePublished).toBe(true);
    expect(aem.count).toBe(4);
    expect(aem.byStatus).toEqual({
      draft: 1,
      in_design: 1,
      published: 1,
      partially_published: 1,
    });
    expect(aem.contentItemIds).toEqual(["i-1", "i-2", "i-3", "i-4"]);
  });
});
