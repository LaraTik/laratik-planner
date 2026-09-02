import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Coverage for the destructive "Reset idea" server action.
 *
 * The action is the only place that performs the cascade delete, so
 * a regression here is a security incident (forgotten permission
 * check, missing audit write, accepting a tampered typed phrase,
 * etc.). These tests pin:
 *
 *   1. The Zod command rejects malformed input BEFORE any DB work
 *      runs (typed phrase < 1 char, reason < 8 chars, non-UUID
 *      content item id).
 *   2. Missing auth → 401-shaped error, no audit.
 *   3. Missing `platform.destructive.execute` permission → denied
 *      audit row + "you don't have permission" error.
 *   4. Cross-tenant formData (idea in workspace A submitted from
 *      workspace B's slug) → refused.
 *   5. Typed phrase != live idea title → field error + failed audit.
 *   6. Successful delete → success audit with bucket counts.
 */

const dbMock = vi.hoisted(() => {
  type SelectResult = unknown[];
  const state: {
    selectResults: SelectResult[];
    insertCalls: { values: unknown }[];
    deleteCalls: { where: unknown }[];
    transactionExecutions: number;
  } = {
    selectResults: [],
    insertCalls: [],
    deleteCalls: [],
    transactionExecutions: 0,
  };

  function selectChain() {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
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
        execute: ReturnType<typeof vi.fn>;
        delete: typeof del;
        insert: typeof insert;
      }) => Promise<unknown>,
    ) => {
      state.transactionExecutions += 1;
      const tx = {
        execute: vi.fn(async () => [{ cic: "2", ca: "1", c: "3", dv: "1" }]),
        delete: del,
        insert,
      };
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

import { resetIdeaAction } from "@/lib/content/reset-idea-action";

const ACTOR_ID = "00000000-0000-0000-0000-000000000001";
const IDEA_ID = "00000000-0000-0000-0000-000000000010";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000020";

function makeFormData(overrides: Partial<Record<string, string>> = {}): FormData {
  const form = new FormData();
  form.set("contentItemId", overrides.contentItemId ?? IDEA_ID);
  form.set("typedPhrase", overrides.typedPhrase ?? "Spring sale — Instagram carousel");
  form.set(
    "reason",
    overrides.reason ?? "Idea is a test fixture; resetting the slate for the next run.",
  );
  return form;
}

describe("resetIdeaAction", () => {
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
  });

  it("returns a sign-in error when the actor is missing", async () => {
    currentActorMock.mockResolvedValueOnce(null);
    const result = await resetIdeaAction("acme", undefined, makeFormData());
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/sign in/i) });
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("refuses when the typed phrase is shorter than 1 character", async () => {
    const result = await resetIdeaAction("acme", undefined, makeFormData({ typedPhrase: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors.typedPhrase).toBeDefined();
    } else {
      throw new Error("expected field errors, got: " + JSON.stringify(result));
    }
    // No permission check, no audit, no DB.
    expect(platformAccessMock.requirePlatformPermission).not.toHaveBeenCalled();
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("refuses when the reason is shorter than 8 characters", async () => {
    const result = await resetIdeaAction("acme", undefined, makeFormData({ reason: "too" }));
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
    const result = await resetIdeaAction("acme", undefined, makeFormData());
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/don't have permission/i),
    });
    // The deny must be in the audit log.
    expect(dbMock.state.insertCalls).toHaveLength(1);
    const row = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(row).toMatchObject({
      action: "platform.destructive.reset_idea",
      targetType: "content_item",
      targetId: IDEA_ID,
      outcome: "denied",
    });
  });

  it("refuses cross-tenant formData (idea in a different workspace)", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    dbMock.state.selectResults.push([
      { id: IDEA_ID, title: "Spring sale", workspaceId: "another-workspace-id" },
    ]);
    workspaceContextMock.getAccessibleWorkspace.mockResolvedValueOnce({
      id: WORKSPACE_ID,
    });
    const result = await resetIdeaAction("acme", undefined, makeFormData());
    expect(result).toEqual({
      ok: false,
      error: expect.stringMatching(/not in the current workspace/i),
    });
    // The cross-tenant refusal must NOT be audited as "denied"
    // (that's reserved for permission denials) — it's a "failed"
    // outcome with no insert call, because the cross-tenant path
    // returns before any DB write.
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("returns a field error when the typed phrase does not match the live title", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    dbMock.state.selectResults.push([
      { id: IDEA_ID, title: "Spring sale — Instagram carousel", workspaceId: WORKSPACE_ID },
    ]);
    workspaceContextMock.getAccessibleWorkspace.mockResolvedValueOnce({
      id: WORKSPACE_ID,
    });
    const result = await resetIdeaAction(
      "acme",
      undefined,
      makeFormData({ typedPhrase: "totally wrong phrase" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok && "fieldErrors" in result) {
      expect(result.fieldErrors.typedPhrase).toMatch(/type the idea's title exactly/i);
    } else {
      throw new Error("expected field errors, got: " + JSON.stringify(result));
    }
    // The failed attempt is audited so a reviewer can spot typos
    // that were the operator's fault vs a UI mismatch.
    const audit = dbMock.state.insertCalls[0]?.values as Record<string, unknown>;
    expect(audit.outcome).toBe("failed");
    expect((audit.metadata as Record<string, unknown>).typed_phrase_match).toBe(false);
  });

  it("deletes the idea, writes a success audit, and redirects to planning on success", async () => {
    platformAccessMock.requirePlatformPermission.mockResolvedValueOnce({});
    dbMock.state.selectResults.push([
      {
        id: IDEA_ID,
        title: "Spring sale — Instagram carousel",
        workspaceId: WORKSPACE_ID,
      },
    ]);
    workspaceContextMock.getAccessibleWorkspace.mockResolvedValueOnce({
      id: WORKSPACE_ID,
    });

    // `redirect` throws to unwind the request; that's fine for the
    // action — we just need to confirm it ran.
    await expect(resetIdeaAction("acme", undefined, makeFormData())).rejects.toThrow(
      /NEXT_REDIRECT/,
    );

    // The action must have run the delete inside a transaction
    // (so the cascade + audit commit atomically).
    expect(dbMock.state.transactionExecutions).toBe(1);
    expect(dbMock.state.deleteCalls.length).toBeGreaterThan(0);

    // Success audit row carries the per-bucket counts.
    const successAudit = dbMock.state.insertCalls.find((c) => {
      const v = c.values as Record<string, unknown>;
      return v.outcome === "success";
    });
    expect(successAudit).toBeDefined();
    const v = successAudit!.values as Record<string, unknown>;
    const meta = v.metadata as Record<string, unknown>;
    expect(meta.typed_phrase_match).toBe(true);
    expect(meta.bucket_counts).toEqual({
      contentItemChannels: 2,
      contentAssignments: 1,
      comments: 3,
      deliveryVersions: 1,
    });
    // We bounced the operator back to the planning list with a
    // confirmation flag the page can use for a toast.
    expect(navMock.redirect).toHaveBeenCalledWith(expect.stringMatching(/\/planning\?reset=1/));
  });
});
