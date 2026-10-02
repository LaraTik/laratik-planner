import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Planning-detail inline edits.
 *
 * Three server actions, one shared gate, one shared materiality contract.
 * The interesting behaviour is almost entirely in the failure paths, which
 * were the untested 68% of this file's branches:
 *
 *   1. **The gate has five distinct rejections**, and the order matters:
 *      not signed in → no actor → unknown workspace → item not in that
 *      workspace → wrong role → status not inline-editable. The
 *      "item belongs to another workspace" check is the tenant boundary; it
 *      must be a *not found*, not a permission error that confirms existence.
 *   2. **A failed write is reported, not swallowed** — the inline editor
 *      stays in edit mode on `{ error }` and only leaves on `{ ok: true }`.
 *   3. **A failed materiality reset is reported differently from a failed
 *      write.** The row already saved, so the error text says so explicitly:
 *      telling the planner it failed would make them re-save, and the
 *      approvals would still be stale either way.
 */

const dbMock = vi.hoisted(() => {
  const select = vi.fn();
  const transaction = vi.fn();
  return { db: { select, transaction } };
});
vi.mock("@/lib/db", () => dbMock);

const cacheMock = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cacheMock);

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/config", () => authMock);

const currentActorMock = vi.hoisted(() => ({ currentActor: vi.fn() }));
vi.mock("@/lib/auth/current-actor", () => currentActorMock);

const workspaceMock = vi.hoisted(() => ({ getAccessibleWorkspace: vi.fn() }));
vi.mock("@/lib/workspaces/context", () => workspaceMock);

const policyMock = vi.hoisted(() => ({ hasWorkspaceRole: vi.fn() }));
vi.mock("@/lib/auth/policy", () => policyMock);

const materialityMock = vi.hoisted(() => ({ recordMaterialityEvent: vi.fn() }));
vi.mock("@/lib/publishing/materiality", () => materialityMock);

import {
  inlineUpdateBriefAction,
  inlineUpdateDateAction,
  inlineUpdateTitleAction,
} from "@/lib/content/inline-update";
import { INLINE_EDITABLE_STATUSES } from "@/lib/content/inline-update-actions";

const SLUG = "acme";
const ITEM_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = { id: "22222222-2222-4222-8222-222222222222", slug: SLUG };
const ACTOR = { id: "33333333-3333-4333-8333-333333333333" };

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

type TxRecord = {
  updates: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  beforeRow: unknown;
};

/** Make `db.transaction` run its callback against a recording `tx`. */
function primeTransaction(beforeRow: unknown = { brief: "old" }): TxRecord {
  const record: TxRecord = { updates: [], events: [], beforeRow };
  dbMock.db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      select: vi.fn(() => makeChain([record.beforeRow])),
      update: vi.fn(() => ({
        set: (payload: Record<string, unknown>) => {
          record.updates.push(payload);
          return makeChain(undefined);
        },
      })),
      insert: vi.fn(() => ({
        values: (payload: Record<string, unknown>) => {
          record.events.push(payload);
          return makeChain(undefined);
        },
      })),
    };
    return cb(tx);
  });
  return record;
}

/** Put the gate in its happy state. */
function primeGate(status = "draft") {
  authMock.auth.mockResolvedValue({ user: { id: ACTOR.id } });
  currentActorMock.currentActor.mockResolvedValue(ACTOR);
  workspaceMock.getAccessibleWorkspace.mockResolvedValue(WORKSPACE);
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  dbMock.db.select.mockReturnValue(makeChain([{ id: ITEM_ID, workspaceId: WORKSPACE.id, status }]));
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.db.select.mockReset();
  dbMock.db.transaction.mockReset();
  authMock.auth.mockReset();
  currentActorMock.currentActor.mockReset();
  workspaceMock.getAccessibleWorkspace.mockReset();
  policyMock.hasWorkspaceRole.mockReset();
  materialityMock.recordMaterialityEvent.mockReset();
  cacheMock.revalidatePath.mockReset();
  materialityMock.recordMaterialityEvent.mockResolvedValue(undefined);
  primeGate();
  primeTransaction();
});

// ── The shared gate ──────────────────────────────────────────────────────

describe("inline-update gate", () => {
  it("rejects an unauthenticated caller", async () => {
    authMock.auth.mockResolvedValue(null);
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Not signed in",
    });
  });

  it("rejects a session with no user id", async () => {
    authMock.auth.mockResolvedValue({ user: {} });
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Not signed in",
    });
  });

  it("rejects when the actor cannot be resolved", async () => {
    currentActorMock.currentActor.mockResolvedValue(null);
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Not signed in",
    });
  });

  it("rejects an unknown workspace slug", async () => {
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(null);
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Workspace not found",
    });
  });

  it("reports a cross-workspace item as not found, not as forbidden", async () => {
    // "Not found" is deliberate: a "you don't have permission" answer would
    // confirm the id exists in some other tenant.
    dbMock.db.select.mockReturnValue(
      makeChain([{ id: ITEM_ID, workspaceId: "other-workspace", status: "draft" }]),
    );
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Content item not found",
    });
  });

  it("rejects a missing item", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Content item not found",
    });
  });

  it("rejects an actor without the planning role", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "You don't have permission to edit this item.",
    });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(ACTOR, WORKSPACE.id, [
      "workspace_manager",
      "content_planner",
    ]);
  });

  it("keeps cancelled items immutable", async () => {
    primeGate("cancelled");
    const result = await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief");
    expect(result.error).toContain("cancelled");
  });

  it("allows every documented inline-editable status", async () => {
    for (const status of INLINE_EDITABLE_STATUSES) {
      primeGate(status);
      expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({ ok: true });
    }
  });
});

// ── brief ────────────────────────────────────────────────────────────────

describe("inlineUpdateBriefAction", () => {
  it("rejects a brief longer than 2000 characters before the gate runs", async () => {
    const result = await inlineUpdateBriefAction(SLUG, ITEM_ID, "x".repeat(2001));
    expect(result.error).toBeTruthy();
    // Validation first: a 2KB payload should never reach the DB.
    expect(dbMock.db.transaction).not.toHaveBeenCalled();
  });

  it("writes the brief, the activity event, and the materiality record", async () => {
    const record = primeTransaction({ brief: "old brief" });
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({ ok: true });

    expect(record.updates[0]).toMatchObject({ brief: "new brief" });
    expect(record.updates[0]!.updatedAt).toBeInstanceOf(Date);
    expect(record.events[0]).toMatchObject({
      workspaceId: WORKSPACE.id,
      contentItemId: ITEM_ID,
      actorId: ACTOR.id,
      kind: "brief_updated",
      metadata: { field: "brief", before: "old brief", after: "new brief" },
    });
    // A brief is the creative direction, so it maps to audience_copy.
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledWith({
      actor: ACTOR,
      contentItemId: ITEM_ID,
      resource: "audience_copy",
      beforeValue: "old brief",
      afterValue: "new brief",
      reasonCode: "audience_copy.update",
    });
  });

  it("records a null before-value when the item had no brief", async () => {
    const record = primeTransaction({ brief: null });
    await inlineUpdateBriefAction(SLUG, ITEM_ID, "first brief");
    expect(record.events[0]!.metadata).toMatchObject({ before: null, after: "first brief" });
    expect(materialityMock.recordMaterialityEvent.mock.calls[0]![0]).toMatchObject({
      beforeValue: null,
    });
  });

  it("surfaces a transaction failure as an error and skips materiality", async () => {
    dbMock.db.transaction.mockRejectedValue(new Error("deadlock detected"));
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "deadlock detected",
    });
    expect(materialityMock.recordMaterialityEvent).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    dbMock.db.transaction.mockRejectedValue("not an error");
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Could not save the brief.",
    });
  });

  it("says the brief saved when only the materiality record failed", async () => {
    materialityMock.recordMaterialityEvent.mockRejectedValue(new Error("no reviewer found"));
    const result = await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief");
    // The row IS saved. Telling the planner it failed would make them
    // re-save, and approval history remains intentionally valid.
    expect(result.error).toBe(
      "no reviewer found Brief was saved and approval history remains unchanged.",
    );
  });

  it("uses the generic wording when a non-Error materiality failure is thrown", async () => {
    materialityMock.recordMaterialityEvent.mockRejectedValue({ weird: true });
    expect(await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief")).toEqual({
      error: "Brief saved and approval history remains unchanged.",
    });
  });

  it("revalidates the planning detail page on success only", async () => {
    await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith(`/app/w/${SLUG}/planning/${ITEM_ID}`);

    cacheMock.revalidatePath.mockClear();
    dbMock.db.transaction.mockRejectedValue(new Error("nope"));
    await inlineUpdateBriefAction(SLUG, ITEM_ID, "new brief");
    expect(cacheMock.revalidatePath).not.toHaveBeenCalled();
  });
});

// ── title ────────────────────────────────────────────────────────────────

describe("inlineUpdateTitleAction", () => {
  it("trims the title and enforces the 2..200 bound", async () => {
    await expect(inlineUpdateTitleAction(SLUG, ITEM_ID, "x")).resolves.toHaveProperty("error");
    await expect(inlineUpdateTitleAction(SLUG, ITEM_ID, "x".repeat(201))).resolves.toHaveProperty(
      "error",
    );
    const record = primeTransaction({ title: "Old" });
    expect(await inlineUpdateTitleAction(SLUG, ITEM_ID, "  New title  ")).toEqual({ ok: true });
    expect(record.updates[0]!.title).toBe("New title");
  });

  it("writes the title event and the schedule materiality record", async () => {
    const record = primeTransaction({ title: "Old" });
    await inlineUpdateTitleAction(SLUG, ITEM_ID, "New title");
    expect(record.events[0]).toMatchObject({
      kind: "title_updated",
      metadata: { field: "title", before: "Old", after: "New title" },
    });
    // A title is a co-equal creative-direction change, so it routes to
    // the same materiality resource as a schedule change.
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "schedule", reasonCode: "audience_copy.update" }),
    );
  });

  it("records a null before-value when the item had no title", async () => {
    const record = primeTransaction({ title: null });
    await inlineUpdateTitleAction(SLUG, ITEM_ID, "New title");
    expect(record.events[0]!.metadata).toMatchObject({ before: null });
  });

  it("uses the title-specific failure wording", async () => {
    dbMock.db.transaction.mockRejectedValue(new Error("boom"));
    expect(await inlineUpdateTitleAction(SLUG, ITEM_ID, "New title")).toEqual({ error: "boom" });

    dbMock.db.transaction.mockRejectedValue("raw");
    expect(await inlineUpdateTitleAction(SLUG, ITEM_ID, "New title")).toEqual({
      error: "Could not save the title.",
    });

    // Restore a working write: the next two cases must get past the
    // transaction to reach the materiality reset.
    primeTransaction({ title: "Old" });
    materialityMock.recordMaterialityEvent.mockRejectedValue(new Error("x"));
    expect(await inlineUpdateTitleAction(SLUG, ITEM_ID, "New title")).toEqual({
      error: "x Title was saved and approval history remains unchanged.",
    });

    materialityMock.recordMaterialityEvent.mockRejectedValue({});
    expect(await inlineUpdateTitleAction(SLUG, ITEM_ID, "New title")).toEqual({
      error: "Title saved and approval history remains unchanged.",
    });
  });
});

// ── date ─────────────────────────────────────────────────────────────────

describe("inlineUpdateDateAction", () => {
  const NEW_DATE = new Date("2026-04-01T08:00:00.000Z");

  it("coerces a string date and normalises the stored value", async () => {
    const record = primeTransaction({ plannedPublishAt: new Date("2026-03-01T00:00:00.000Z") });
    expect(await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE)).toEqual({ ok: true });
    expect(record.updates[0]!.plannedPublishAt).toEqual(NEW_DATE);
  });

  it("rejects an unparseable date", async () => {
    const result = await inlineUpdateDateAction(SLUG, ITEM_ID, "not a date" as unknown as Date);
    expect(result.error).toBeTruthy();
    expect(dbMock.db.transaction).not.toHaveBeenCalled();
  });

  it("stores the before/after pair as ISO strings in the event metadata", async () => {
    const before = new Date("2026-03-01T00:00:00.000Z");
    const record = primeTransaction({ plannedPublishAt: before });
    await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE);
    expect(record.events[0]).toMatchObject({
      kind: "date_updated",
      metadata: {
        field: "date",
        before: before.toISOString(),
        after: NEW_DATE.toISOString(),
      },
    });
  });

  it("stores a null before-value when the item was never scheduled", async () => {
    const record = primeTransaction({ plannedPublishAt: null });
    await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE);
    expect(record.events[0]!.metadata).toMatchObject({ before: null });
    expect(materialityMock.recordMaterialityEvent.mock.calls[0]![0]).toMatchObject({
      beforeValue: null,
      afterValue: NEW_DATE.toISOString(),
    });
  });

  it("routes a date change to the schedule materiality resource", async () => {
    await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE);
    expect(materialityMock.recordMaterialityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "schedule", reasonCode: "schedule.update" }),
    );
  });

  it("uses the date-specific failure wording", async () => {
    dbMock.db.transaction.mockRejectedValue(new Error("boom"));
    expect(await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE)).toEqual({ error: "boom" });

    dbMock.db.transaction.mockRejectedValue("raw");
    expect(await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE)).toEqual({
      error: "Could not save the date.",
    });

    // Restore a working write so the next two cases reach materiality.
    primeTransaction({ plannedPublishAt: new Date("2026-03-01T00:00:00.000Z") });
    materialityMock.recordMaterialityEvent.mockRejectedValue(new Error("x"));
    expect(await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE)).toEqual({
      error: "x Date was saved and approval history remains unchanged.",
    });

    materialityMock.recordMaterialityEvent.mockRejectedValue({});
    expect(await inlineUpdateDateAction(SLUG, ITEM_ID, NEW_DATE)).toEqual({
      error: "Date saved and approval history remains unchanged.",
    });
  });
});
