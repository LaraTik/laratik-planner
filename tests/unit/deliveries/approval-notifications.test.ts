import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Approval notification fan-out in `decideApproval`.
 *
 * When a creative approval is granted, the content owner and the designer
 * both need to know. The existing `deliveries-service.test.ts` covers the
 * decision write but primes its Drizzle queue without the `itemMeta` row, so
 * the `if (itemMeta && decision === "approved")` branch never ran and ~125
 * lines of notification code stayed unexecuted.
 *
 * Two behaviours are load-bearing:
 *
 *   1. **`skipSelf`.** The reviewer who just approved must not be notified
 *      about their own decision. It does *not* de-duplicate the recipient
 *      list, so a user who is both owner and designer gets two emails — a
 *      real, pinned behaviour rather than an intended one.
 *   2. **The `ready_to_publish` notification is a second, separate fan-out**
 *      that only fires when the derived outcome actually reaches
 *      `ready_to_publish` — not on every approval.
 */

const dbMock = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const state = {
    selectResults,
    insertCalls: [] as Array<{ values: unknown }>,
    updateCalls: [] as Array<{ set: unknown }>,
  };
  function chain() {
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(selectResults.shift() ?? []);
        }
        if (prop === "for" || prop === "orderBy") return () => proxy;
        if (prop === "limit") {
          return () => {
            const rows = selectResults.shift() ?? [];
            return Promise.resolve(rows);
          };
        }
        return Reflect.get(t, prop);
      },
    });
    return proxy;
  }
  const select = vi.fn(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.innerJoin = () => c;
    c.where = () => chain();
    c.orderBy = () => chain();
    c.for = () => c;
    c.limit = () => {
      const rows = selectResults.shift() ?? [];
      return Promise.resolve(rows);
    };
    return c;
  });
  const insertChain: Record<string, unknown> = {};
  insertChain.values = (values: unknown) => {
    state.insertCalls.push({ values });
    return {
      returning: () => Promise.resolve([{ id: "new-id" }]),
      onConflictDoUpdate: () => insertChain,
    };
  };
  insertChain.onConflictDoUpdate = () => insertChain;
  insertChain.returning = () => Promise.resolve([{ id: "new-id" }]);
  const updateChain: Record<string, unknown> = {};
  updateChain.set = (set: unknown) => {
    state.updateCalls.push({ set });
    return updateChain;
  };
  updateChain.where = () => updateChain;
  const update = vi.fn(() => updateChain);
  const transaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
    cb({
      select,
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
      delete: vi.fn(() => ({ where: () => undefined })),
      // `decideApproval` takes a row lock before re-reading the request.
      execute: vi.fn(async () => []),
    }),
  );
  return { db: { select, insert: vi.fn(() => insertChain), update, transaction }, state };
});
vi.mock("@/lib/db", () => dbMock);

const policyMock = vi.hoisted(() => ({ hasWorkspaceRole: vi.fn(), requirePolicy: vi.fn() }));
vi.mock("@/lib/auth/policy", () => policyMock);

const notifyMock = vi.hoisted(() => ({
  enqueueApprovalNotification: vi.fn(),
  enqueueDeliveryNotification: vi.fn(),
  enqueueReadyToPublishNotification: vi.fn(),
  buildActionUrlForContentItem: vi.fn(() => "https://app.test/action"),
}));
vi.mock("@/lib/notifications/service", () => notifyMock);

const cacheMock = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cacheMock);

import { decideApproval } from "@/lib/deliveries/service";

const ACTOR = { id: "reviewer-1" };
const OWNER = "owner-1";
const DESIGNER = "designer-1";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const REQUEST_ID = "55555555-5555-4555-8555-555555555555";

/**
 * Prime the select queue in the order `decideApproval` issues it:
 * locked request → item workspace → item meta → approval mode.
 */
function primeDecision(options: {
  gate?: string;
  approvalMode?: string;
  contentOwnerId?: string | null;
  designerId?: string | null;
  status?: string;
}) {
  const request = {
    id: REQUEST_ID,
    status: "pending",
    contentItemId: ITEM_ID,
    gate: options.gate ?? "creative_internal",
    deliveryVersionId: "v-1",
  };
  // 1. the request (unlocked read)
  dbMock.state.selectResults.push([request]);
  // 2. the item, for the workspace + agency of the policy check
  dbMock.state.selectResults.push([{ workspaceId: "ws-1", agencyId: "agency-1" }]);
  // 3. the request again, this time under SELECT ... FOR UPDATE
  dbMock.state.selectResults.push([request]);
  // 4. the workspace approval mode
  dbMock.state.selectResults.push([{ approvalMode: options.approvalMode ?? "simple" }]);
  // 5. the item meta the notification titles are built from
  dbMock.state.selectResults.push([
    {
      title: "Launch teaser",
      // `in` rather than `??`: an explicit null means "unassigned" and must
      // not fall back to the default recipient.
      contentOwnerId: "contentOwnerId" in options ? options.contentOwnerId : OWNER,
      designerId: "designerId" in options ? options.designerId : DESIGNER,
    },
  ]);
}

const approvedRecipients = () =>
  notifyMock.enqueueApprovalNotification.mock.calls.map((c) => c[0].userId).sort();

const readyRecipients = () =>
  notifyMock.enqueueReadyToPublishNotification.mock.calls.map((c) => c[0].userId).sort();

beforeEach(() => {
  vi.clearAllMocks();
  // Clear the arrays in place. The mock closures captured the original
  // `selectResults` reference, so reassigning `state.selectResults` to a new
  // array here would leave the builders reading a queue the tests never fill.
  dbMock.state.selectResults.length = 0;
  dbMock.state.insertCalls.length = 0;
  dbMock.state.updateCalls.length = 0;
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.requirePolicy.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(true);
  policyMock.requirePolicy.mockResolvedValue(undefined);
  notifyMock.buildActionUrlForContentItem.mockReturnValue("https://app.test/action");
});

// ── skipSelf ─────────────────────────────────────────────────────────────

describe("approval notifications skip the reviewer", () => {
  it("notifies the owner and the designer on approval", async () => {
    primeDecision({ contentOwnerId: OWNER, designerId: DESIGNER });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    expect(approvedRecipients()).toEqual([DESIGNER, OWNER].sort());
  });

  it("does not notify the reviewer when the reviewer is the owner", async () => {
    // The owner who just approved their own post must not email themselves.
    primeDecision({ contentOwnerId: ACTOR.id, designerId: DESIGNER });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    expect(approvedRecipients()).toEqual([DESIGNER]);
  });

  it("does not notify the reviewer when the reviewer is the designer", async () => {
    primeDecision({ contentOwnerId: OWNER, designerId: ACTOR.id });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    expect(approvedRecipients()).toEqual([OWNER]);
  });

  it("enqueues twice when the owner and the designer are the same person", async () => {
    // DOCUMENTED BEHAVIOUR, not an endorsement. `skipSelf` filters the
    // reviewer out but does not de-duplicate, so a user who is both content
    // owner and designer receives two identical "creative approved" emails.
    // `skipSelf` also does not protect against this because the actor is a
    // third party here. Pinned so the behaviour is visible; if a fix lands to
    // de-duplicate, this test is the one that should be updated with it.
    primeDecision({ contentOwnerId: OWNER, designerId: OWNER });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    expect(approvedRecipients()).toEqual([OWNER, OWNER]);
  });

  it("skips an unassigned owner and an unassigned designer", async () => {
    primeDecision({ contentOwnerId: null, designerId: null });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    expect(notifyMock.enqueueApprovalNotification).not.toHaveBeenCalled();
  });
});

// ── payload ──────────────────────────────────────────────────────────────

describe("approval notification payload", () => {
  it("names the item and the gate in the title and body", async () => {
    primeDecision({ contentOwnerId: OWNER, designerId: DESIGNER, gate: "creative_internal" });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });

    const payload = notifyMock.enqueueApprovalNotification.mock.calls[0]![0] as {
      userId: string;
      workspaceId: string;
      contentItemId: string;
      title: string;
      body: string;
      messageKey: string;
      messageParams: { title: string };
    };
    expect(payload.userId).toBeTruthy();
    expect(payload.workspaceId).toBe("ws-1");
    expect(payload.contentItemId).toBe(ITEM_ID);
    expect(payload.title).toContain("Launch teaser");
    // The body tells the recipient which gate cleared, so they know whether
    // they still owe a client sign-off.
    expect(payload.body).toContain("creative_internal");
    expect(payload.messageKey).toBe("notifications.events.delivery_approved");
    expect(payload.messageParams).toEqual({ title: "Launch teaser" });
  });

  it("enqueues through the same transaction handle so the mail cannot outlive a rolled-back decision", async () => {
    primeDecision({ contentOwnerId: OWNER, designerId: DESIGNER });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    // Second argument is the tx: passing nothing would let a notification be
    // written even if the decision update is rolled back.
    expect(notifyMock.enqueueApprovalNotification.mock.calls[0]![1]).toBeDefined();
  });
});

// ── ready_to_publish is a separate, conditional fan-out ──────────────────

describe("ready-to-publish notification", () => {
  it("fires once the derived outcome reaches ready_to_publish", async () => {
    primeDecision({ contentOwnerId: OWNER, designerId: DESIGNER });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    // internal_only + creative_internal approval completes the gate.
    expect(readyRecipients().length).toBeGreaterThan(0);
    const payload = notifyMock.enqueueReadyToPublishNotification.mock.calls[0]![0] as {
      title: string;
      contentItemId: string;
    };
    expect(payload.title).toContain("Launch teaser");
    expect(payload.contentItemId).toBe(ITEM_ID);
  });

  it("does not fire when the internal approval only opens the client gate", async () => {
    // internal_then_client means the item is NOT ready to publish yet; sending
    // this notification would tell the team to ship before client sign-off.
    primeDecision({
      contentOwnerId: OWNER,
      designerId: DESIGNER,
      approvalMode: "internal_then_client",
    });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    expect(notifyMock.enqueueReadyToPublishNotification).not.toHaveBeenCalled();
  });

  it("does not fire on changes_requested", async () => {
    primeDecision({ contentOwnerId: OWNER, designerId: DESIGNER });
    await decideApproval(ACTOR, {
      approvalRequestId: REQUEST_ID,
      decision: "changes_requested",
      feedback: "Needs a different crop.",
    });
    expect(notifyMock.enqueueApprovalNotification).not.toHaveBeenCalled();
    expect(notifyMock.enqueueReadyToPublishNotification).not.toHaveBeenCalled();
  });

  it("applies skipSelf to the ready-to-publish fan-out too", async () => {
    primeDecision({ contentOwnerId: ACTOR.id, designerId: ACTOR.id });
    await decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" });
    expect(notifyMock.enqueueReadyToPublishNotification).not.toHaveBeenCalled();
  });
});

// ── no itemMeta row ──────────────────────────────────────────────────────

describe("a missing item-meta row does not throw", () => {
  it("still records the decision and skips the notifications", async () => {
    // The notification fan-out is guarded on `itemMeta` because the approval
    // request row is locked first; losing the meta row (deleted item) must
    // not roll back an otherwise valid decision.
    const request = {
      id: REQUEST_ID,
      status: "pending",
      contentItemId: ITEM_ID,
      gate: "creative_internal",
      deliveryVersionId: "v-1",
    };
    dbMock.state.selectResults.push([request]);
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([request]);
    dbMock.state.selectResults.push([{ approvalMode: "simple" }]);
    dbMock.state.selectResults.push([]);

    await expect(
      decideApproval(ACTOR, { approvalRequestId: REQUEST_ID, decision: "approved" }),
    ).resolves.toEqual({ ok: true });
    expect(notifyMock.enqueueApprovalNotification).not.toHaveBeenCalled();
  });
});
