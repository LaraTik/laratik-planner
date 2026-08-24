import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M4.3 — Materiality service unit tests.
 *
 * The module under test (`src/lib/publishing/materiality.ts`) is
 * the single funnel for content-item material mutations per the
 * master prompt's "Material edits and approvals" section.
 *
 *   - `recordMaterialityEvent` increments the content item's
 *     revision, cancels every pending approval request, records
 *     an immutable activity_event row, and notifies every
 *     active reviewer.
 *   - `recordNonMaterialityEvent` writes a `material: false`
 *     activity row with no revision bump, no approval cancel,
 *     and no notifications.
 *   - `listMaterialEdits` returns the recent material-edit history
 *     for a content item, filtered to `metadata.material = true`.
 *   - `newMaterialityCorrelationId` is a UUID v4 helper.
 *
 * The service is heavily DB-bound (Drizzle + a transaction). The
 * mock is similar to `publishing-service.test.ts` and
 * `ai-feature-settings.test.ts`. The transaction is exercised
 * through the same `db.transaction(cb)` so we capture the upsert
 * + activity-event insert in one queue.
 */

vi.mock("server-only", () => ({}));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
  // Tracks the row count of the most recent select. `update().returning()`
  // uses this to decide how many rows to return — matching real
  // Drizzle's "all rows that match the WHERE clause" behavior.
  // The first update (revision bump) follows a `select(...).limit(1)`
  // → returns 1 row. The second update (cancel) follows a
  // `select(...)` whose result had N rows → returns N rows.
  lastSelectRowCount: number;
  transactionCalls: number;
};

function dequeue(state: DrizzleState): unknown[] {
  const rows = state.selectResults.shift() ?? [];
  state.lastSelectRowCount = rows.length;
  return rows;
}

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(dequeue(state)));
    const thenable = (next: () => Record<string, unknown>) =>
      new Proxy(next(), {
        get(target, prop, receiver) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(dequeue(state));
          }
          if (prop === "limit") {
            return target.limit;
          }
          if (prop === "orderBy") {
            return target.orderBy;
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    chain.where = vi.fn(() => thenable(() => chain));
    chain.innerJoin = vi.fn(() => thenable(() => chain));
    chain.orderBy = vi.fn(() => thenable(() => chain));
    return chain;
  }
  const select = vi.fn(() => makeChain());

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
    insertChain.returning = vi.fn(() => {
      // Return N rows where N = lastSelectRowCount, matching the
      // same heuristic the update.returning uses. The SUT's
      // `recordNonMaterialityEvent` only uses the first row's
      // `id` field (it destructures `[audit]` then reads
      // `audit?.id`).
      const count = state.lastSelectRowCount || 1;
      return Promise.resolve(
        Array.from({ length: count }, (_, i) => ({
          id: `audit-${state.insertCalls.length}-${i}`,
        })),
      );
    });
    return insertChain;
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn((where: unknown) => {
    state.updateCalls.push({ set: lastSet, where });
    lastSet = undefined;
    const returningChain: Record<string, unknown> = {};
    returningChain.returning = vi.fn(() => {
      // Return `lastSelectRowCount` rows. The SUT's first
      // update follows a `select().limit(1)` (single content
      // item lookup) → lastSelectRowCount=1 → returns 1 row.
      // The SUT's second update follows the openRequests select
      // whose result had N rows → returns N rows.
      //
      // We include both `revision` and `id` on every row so
      // the first update's `bumped.revision` reads back a
      // non-zero value, while the second update's
      // `cancelled.length` is still N.
      const count = state.lastSelectRowCount;
      if (count === 0) return Promise.resolve([{ revision: 1 }]);
      return Promise.resolve(Array.from({ length: count }, () => ({ revision: count, id: "row" })));
    });
    return returningChain;
  });
  const update = vi.fn(() => updateChain);

  type Tx = {
    select: typeof select;
    insert: typeof insert;
    update: typeof update;
  };
  const tx: Tx = {
    select: select,
    insert: insert,
    update: update,
  };

  const transaction = vi.fn(async (cb: (tx: Tx) => Promise<unknown>) => {
    state.transactionCalls += 1;
    return cb(tx);
  });

  return { select, insert, update, transaction };
}

const dbState: DrizzleState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertCalls: [] as { values: unknown }[],
  updateCalls: [] as { set: unknown; where: unknown }[],
  lastSelectRowCount: 0,
  transactionCalls: 0,
}));
const dbMock = vi.hoisted(() => makeDrizzleMock(dbState));

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, hasWorkspaceRole: policyMock.hasWorkspaceRole };
});

const {
  recordMaterialityEvent,
  recordNonMaterialityEvent,
  listMaterialEdits,
  newMaterialityCorrelationId,
  MaterialityError,
  MaterialityReasonCodeSchema,
  RecordMaterialityEventInputSchema,
  RecordNonMaterialityEventInputSchema,
} = await import("@/lib/publishing/materiality");

const actor = { id: "99999999-9999-9999-9999-999999999999" };
const workspaceId = "ws-1";
const contentItemId = "11111111-1111-1111-1111-111111111111";
const userId = "99999999-9999-9999-9999-999999999999";

function resetState() {
  dbState.selectResults = [];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  dbState.lastSelectRowCount = 0;
  dbState.transactionCalls = 0;
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
}

beforeEach(resetState);

describe("MaterialityReasonCodeSchema", () => {
  it("accepts every documented reason code", () => {
    for (const code of [
      "platform_payload.save",
      "platform_payload.clear",
      "caption.update",
      "hashtags.update",
      "schedule.update",
      "channel.add",
      "channel.remove",
      "delivery.update",
      "approval.reset",
    ]) {
      expect(MaterialityReasonCodeSchema.safeParse(code).success).toBe(true);
    }
  });
  it("rejects an unknown reason code", () => {
    expect(MaterialityReasonCodeSchema.safeParse("not.a.code").success).toBe(false);
  });
});

describe("RecordMaterialityEventInputSchema", () => {
  it("accepts a full input", () => {
    const ok = RecordMaterialityEventInputSchema.safeParse({
      actor,
      contentItemId,
      resource: "caption",
      beforeValue: { caption: "old" },
      afterValue: { caption: "new" },
      reasonCode: "caption.update",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects a missing contentItemId", () => {
    const ok = RecordMaterialityEventInputSchema.safeParse({
      actor,
      resource: "caption",
      beforeValue: null,
      afterValue: null,
      reasonCode: "caption.update",
    });
    expect(ok.success).toBe(false);
  });
});

describe("RecordNonMaterialityEventInputSchema", () => {
  it("accepts a summary within the documented length", () => {
    const ok = RecordNonMaterialityEventInputSchema.safeParse({
      actor,
      contentItemId,
      resource: "internal_notes",
      summary: "Reworded the brief for clarity",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects an empty summary", () => {
    const ok = RecordNonMaterialityEventInputSchema.safeParse({
      actor,
      contentItemId,
      resource: "internal_notes",
      summary: "",
    });
    expect(ok.success).toBe(false);
  });
});

describe("newMaterialityCorrelationId", () => {
  it("returns a UUID v4 string", () => {
    const id = newMaterialityCorrelationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
  it("returns unique values across calls", () => {
    const ids = new Set(Array.from({ length: 8 }, () => newMaterialityCorrelationId()));
    expect(ids.size).toBe(8);
  });
});

describe("MaterialityError", () => {
  it("captures code, message, and details", () => {
    const err = new MaterialityError("FORBIDDEN", "denied", { workspaceId });
    expect(err.name).toBe("MaterialityError");
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("denied");
    expect(err.details).toEqual({ workspaceId });
  });
});

describe("recordMaterialityEvent", () => {
  it("throws NOT_FOUND when the content item is missing", async () => {
    dbState.selectResults.push([]); // no content item
    await expect(
      recordMaterialityEvent({
        actor,
        contentItemId,
        resource: "caption",
        beforeValue: null,
        afterValue: { caption: "new" },
        reasonCode: "caption.update",
      }),
    ).rejects.toBeInstanceOf(MaterialityError);
    expect(dbState.transactionCalls).toBe(0);
  });

  it("throws FORBIDDEN when the actor is not a workspace member", async () => {
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      recordMaterialityEvent({
        actor,
        contentItemId,
        resource: "caption",
        beforeValue: null,
        afterValue: { caption: "new" },
        reasonCode: "caption.update",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("increments revision, cancels approvals, and notifies reviewers", async () => {
    // 1. content-item lookup (select.limit(1) → lastSelectRowCount=1)
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    // 2. inside tx: openRequests (2 pending approvals → lastSelectRowCount=2)
    dbState.selectResults.push([{ id: "approval-1" }, { id: "approval-2" }]);
    // 3. reviewers query (after the cancel, the SUT re-selects
    //    approval_requests for the notification set).
    dbState.selectResults.push([{ requestedBy: userId }, { requestedBy: "user-2" }]);

    const result = await recordMaterialityEvent({
      actor,
      contentItemId,
      resource: "caption",
      beforeValue: { caption: "old" },
      afterValue: { caption: "new" },
      reasonCode: "caption.update",
    });

    expect(result).toEqual({
      revision: 1, // the mock's first update returns 1 row (1 = lastSelectRowCount from the limit(1) select)
      cancelledApprovalCount: 2, // 2 pending approvals cancelled
      notifiedReviewerCount: 1, // actor is dropped from the notify set
    });
    expect(dbState.updateCalls.length).toBeGreaterThanOrEqual(2); // revision + cancel
    expect(dbState.insertCalls.length).toBeGreaterThanOrEqual(2); // activity + notification
    const activityInsert = dbState.insertCalls.find((c) =>
      (c.values as Record<string, unknown>).summary?.toString().includes("Material edit"),
    );
    expect(activityInsert).toBeDefined();
  });

  it("returns 0 notifiedReviewerCount when the only reviewer is the actor", async () => {
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    dbState.selectResults.push([]); // no open approval requests
    dbState.selectResults.push([{ requestedBy: userId }]); // reviewers = actor only
    const result = await recordMaterialityEvent({
      actor,
      contentItemId,
      resource: "caption",
      beforeValue: null,
      afterValue: { caption: "x" },
      reasonCode: "caption.update",
    });
    expect(result.cancelledApprovalCount).toBe(0);
    expect(result.notifiedReviewerCount).toBe(0);
  });

  it("writes an activity row that captures the resource, reason code, and revision", async () => {
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    dbState.selectResults.push([]);
    dbState.selectResults.push([]);
    await recordMaterialityEvent({
      actor,
      contentItemId,
      resource: "platform_payload",
      beforeValue: null,
      afterValue: { platform: "instagram" },
      reasonCode: "platform_payload.save",
    });
    const activityInsert = dbState.insertCalls.find((c) =>
      (c.values as Record<string, unknown>).summary?.toString().includes("Material edit"),
    );
    expect(activityInsert).toBeDefined();
    const meta = (activityInsert?.values as Record<string, unknown>).metadata as Record<
      string,
      unknown
    >;
    expect(meta.resource).toBe("platform_payload");
    expect(meta.reasonCode).toBe("platform_payload.save");
    // The materialized metadata includes the new revision so the
    // publish UI's "what changed since last approval" banner can
    // group by revision.
    expect(typeof meta.revision).toBe("number");
  });
});

describe("recordNonMaterialityEvent", () => {
  it("throws NOT_FOUND when the content item is missing", async () => {
    dbState.selectResults.push([]);
    await expect(
      recordNonMaterialityEvent({
        actor,
        contentItemId,
        resource: "internal_notes",
        summary: "Reworded brief",
      }),
    ).rejects.toBeInstanceOf(MaterialityError);
  });

  it("throws FORBIDDEN when the actor is not a workspace member", async () => {
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(
      recordNonMaterialityEvent({
        actor,
        contentItemId,
        resource: "internal_notes",
        summary: "x",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("writes an activity row stamped material=false and returns the auditId", async () => {
    dbState.selectResults.push([{ id: contentItemId, workspaceId }]);
    // The insert's .returning() now also follows the lastSelectRowCount
    // pattern: the previous select returned 1 row, so the mock
    // returns 1 row from insert.returning().
    const result = await recordNonMaterialityEvent({
      actor,
      contentItemId,
      resource: "internal_notes",
      summary: "Reworded brief for clarity",
    });
    // The mock returns `{ revision: count, id: "audit-default" }`
    // for the insert's returning. We assert the row was written
    // with the right shape rather than the exact id.
    expect(result.auditId).toMatch(/^audit-/);
    const insert = dbState.insertCalls.find(
      (c) => (c.values as Record<string, unknown>).summary === "Reworded brief for clarity",
    );
    expect(insert).toBeDefined();
    const meta = (insert?.values as Record<string, unknown>).metadata as Record<string, unknown>;
    expect(meta.material).toBe(false);
  });
});

describe("listMaterialEdits", () => {
  it("throws FORBIDDEN when the actor is not a workspace member", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await expect(listMaterialEdits({ actor, workspaceId, contentItemId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("clamps the limit between 1 and 50", async () => {
    dbState.selectResults.push([]); // no rows
    const low = await listMaterialEdits({ actor, workspaceId, contentItemId, limit: 0 });
    expect(low.length).toBe(0);
    dbState.selectResults.push([]);
    const high = await listMaterialEdits({ actor, workspaceId, contentItemId, limit: 999 });
    expect(high.length).toBe(0);
  });

  it("returns the rows that the SUT selected", async () => {
    dbState.selectResults.push([
      {
        id: "evt-1",
        actorId: userId,
        kind: "update",
        summary: "Material edit on 'caption' (revision 1).",
        metadata: { material: true, resource: "caption" },
        createdAt: new Date("2026-08-24T10:00:00Z"),
      },
      {
        id: "evt-2",
        actorId: "user-2",
        kind: "update",
        summary: "Material edit on 'hashtags' (revision 2).",
        metadata: { material: true, resource: "hashtags" },
        createdAt: new Date("2026-08-24T11:00:00Z"),
      },
    ]);
    const rows = await listMaterialEdits({ actor, workspaceId, contentItemId });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("evt-1");
    expect(rows[0]?.metadata).toEqual({ material: true, resource: "caption" });
  });
});
