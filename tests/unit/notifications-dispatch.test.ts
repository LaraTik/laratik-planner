import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FEAT-01 (GAP-FULL-REVIEW-2026-08-25) — outbox dispatcher coverage
 * for the 10 newly-wired notification kinds.
 *
 * Pre-fix the dispatcher only handled `comment_created`; the other
 * 10 §12 mandatory kinds never fired. The tests below pin the
 * per-kind enqueue + dispatch contract:
 *
 *  1. Each `enqueueXNotification` helper inserts an `outbox_event`
 *     row with the matching `eventType` and the recipient in the
 *     payload.
 *  2. The dispatcher's `fanOutSingleRecipient` path writes a
 *     `notification` row with the right `kind` and recipient.
 *  3. The `comment_created` path still works (regression guard).
 *
 * The test harness is a hand-rolled Drizzle chainable — the same
 * pattern `tests/unit/deliveries-service.test.ts` uses.
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

// R9 — `dispatchOutboxOnce` calls `updateTag` after a successful
// tick to invalidate the bell cache for every recipient. The
// mark-read action and the layout read path use the same tag
// (see `src/lib/notifications/cache.ts`). The cache module is
// a thin pass-through; the actual cache API lives in
// `next/cache`, which is server-only and unavailable in the
// test environment. We mock the two functions we use.
const cacheMock = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => cacheMock);
vi.mock("@/lib/notifications/cache", () => ({
  notificationsUserTag: (userId: string) => `notifications:user:${userId}`,
  getCachedNotificationsForUser: (actor: { id: string }, _limit: number) =>
    import("@/lib/notifications/service").then((m) =>
      m.listNotificationsForUser(actor, { limit: _limit }),
    ),
  getCachedUnreadCount: (actor: { id: string }) =>
    import("@/lib/notifications/service").then((m) => m.countUnreadNotifications(actor)),
}));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => true as boolean),
  requirePolicy: vi.fn(),
}));
vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, ...policyMock };
});

const {
  enqueueAssignmentNotification,
  enqueueClaimNotification,
  enqueueReleaseNotification,
  enqueueReviewRequestNotification,
  enqueueApprovalNotification,
  enqueueChangesRequestedNotification,
  enqueueReplyNotification,
  enqueueUnresolvedQuestionNotification,
  enqueueDeadlineNotification,
  enqueueDeliveryNotification,
  enqueueReadyToPublishNotification,
  dispatchOutboxOnce,
  OUTBOX_EVENT_TYPES,
  NotificationKindSchema,
  markNotificationRead,
  MarkReadOneSchema,
  updateNotificationPreferences,
} = await import("@/lib/notifications/service");

beforeEach(() => {
  cacheMock.updateTag.mockClear();
  state = {
    selectResults: [],
    insertCalls: [],
    insertReturningIds: [],
    updateCalls: [],
    deleteCalls: [],
    executeCalls: [],
    transactionCalls: 0,
  };
});

describe("OUTBOX_EVENT_TYPES (FEAT-01)", () => {
  it("includes all 11 mandatory §12 kinds + comment_created", () => {
    expect(OUTBOX_EVENT_TYPES).toContain("comment_created");
    expect(OUTBOX_EVENT_TYPES).toContain("assignment");
    expect(OUTBOX_EVENT_TYPES).toContain("claim");
    expect(OUTBOX_EVENT_TYPES).toContain("release");
    expect(OUTBOX_EVENT_TYPES).toContain("review_request");
    expect(OUTBOX_EVENT_TYPES).toContain("approval");
    expect(OUTBOX_EVENT_TYPES).toContain("changes_requested");
    expect(OUTBOX_EVENT_TYPES).toContain("reply");
    expect(OUTBOX_EVENT_TYPES).toContain("unresolved_question");
    expect(OUTBOX_EVENT_TYPES).toContain("deadline");
    expect(OUTBOX_EVENT_TYPES).toContain("delivery");
    expect(OUTBOX_EVENT_TYPES).toContain("ready_to_publish");
  });
});

describe("NotificationKindSchema (FEAT-01)", () => {
  it.each([
    "assignment",
    "review_request",
    "approval",
    "changes_requested",
    "mention",
    "reply",
    "unresolved_question",
    "deadline",
    "delivery",
    "ready_to_publish",
    "system",
  ] as const)("accepts the %s kind", (kind) => {
    expect(NotificationKindSchema.safeParse(kind).success).toBe(true);
  });
});

describe("enqueueXNotification (FEAT-01)", () => {
  it.each([
    ["enqueueAssignmentNotification", enqueueAssignmentNotification, "assignment"] as const,
    ["enqueueClaimNotification", enqueueClaimNotification, "claim"] as const,
    ["enqueueReleaseNotification", enqueueReleaseNotification, "release"] as const,
    [
      "enqueueReviewRequestNotification",
      enqueueReviewRequestNotification,
      "review_request",
    ] as const,
    ["enqueueApprovalNotification", enqueueApprovalNotification, "approval"] as const,
    [
      "enqueueChangesRequestedNotification",
      enqueueChangesRequestedNotification,
      "changes_requested",
    ] as const,
    ["enqueueReplyNotification", enqueueReplyNotification, "reply"] as const,
    [
      "enqueueUnresolvedQuestionNotification",
      enqueueUnresolvedQuestionNotification,
      "unresolved_question",
    ] as const,
    ["enqueueDeadlineNotification", enqueueDeadlineNotification, "deadline"] as const,
    ["enqueueDeliveryNotification", enqueueDeliveryNotification, "delivery"] as const,
    [
      "enqueueReadyToPublishNotification",
      enqueueReadyToPublishNotification,
      "ready_to_publish",
    ] as const,
  ])("%s inserts an outbox event with eventType=%s", async (label, fn, eventType) => {
    state.insertReturningIds.push({ id: "evt-1" });
    const out = await fn({
      userId: "user-1",
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      title: `Title for ${label}`,
      body: `Body for ${label}`,
    });
    expect(out).toBe("evt-1");
    // The outbox insert records the eventType + payload.
    const outboxInsert = state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["eventType"] === eventType,
    );
    expect(outboxInsert, `${label} did not insert an outbox row`).toBeDefined();
    const payload = (outboxInsert!.values as Record<string, unknown>)["payload"] as Record<
      string,
      unknown
    >;
    expect(payload["userId"]).toBe("user-1");
    expect(payload["workspaceId"]).toBe("ws-1");
    expect(payload["contentItemId"]).toBe("ci-1");
    expect(payload["eventType"]).toBe(eventType);
  });
});

describe("dispatchOutboxOnce (FEAT-01) — per-kind fan-out", () => {
  // We need the dispatcher to actually find a row, then process it
  // for the right kind. We pre-stage the outbox_events SELECT to
  // return one row of the right shape; the dispatcher's `tx` chain
  // for the second select (notificationPreferences) returns [] so
  // the preference default of inAppEnabled=true kicks in.
  function stageOutboxEvent(eventType: string, payload: Record<string, unknown>) {
    state.selectResults.push([{ id: "evt-1", eventType, payload }]);
    // The notification_preferences select inside fanOutSingleRecipient / maybeNotify
    // returns [] so the default inAppEnabled=true wins.
    state.selectResults.push([]);
  }

  it.each([
    ["assignment", "assignment"],
    ["claim", "assignment"],
    ["release", "assignment"],
    ["review_request", "review_request"],
    ["approval", "approval"],
    ["changes_requested", "changes_requested"],
    ["reply", "reply"],
    ["unresolved_question", "unresolved_question"],
    ["deadline", "deadline"],
    ["delivery", "delivery"],
    ["ready_to_publish", "ready_to_publish"],
  ] as const)("writes a notification row for eventType=%s (kind=%s)", async (eventType, kind) => {
    stageOutboxEvent(eventType, {
      userId: "user-1",
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      title: `T-${eventType}`,
      body: `B-${eventType}`,
    });
    const result = await dispatchOutboxOnce({ maxEvents: 10 });
    expect(result.processed).toBe(1);
    // Find the notification insert.
    const notifInsert = state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["kind"] === kind,
    );
    expect(notifInsert, `no notification row for kind=${kind}`).toBeDefined();
    const values = notifInsert!.values as Record<string, unknown>;
    expect(values["userId"]).toBe("user-1");
    expect(values["contentItemId"]).toBe("ci-1");
    expect(values["workspaceId"]).toBe("ws-1");
    expect(values["title"]).toBe(`T-${eventType}`);
  });

  it("marks the outbox event processed on success", async () => {
    stageOutboxEvent("approval", {
      userId: "user-1",
      workspaceId: "ws-1",
      contentItemId: "ci-1",
      title: "T",
      body: "B",
    });
    await dispatchOutboxOnce({ maxEvents: 10 });
    const update = state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["processedAt"] instanceof Date,
    );
    expect(update, "expected processedAt update").toBeDefined();
  });

  it("invalidates every mentioned user's bell cache", async () => {
    state.selectResults.push([
      {
        id: "evt-mentions",
        eventType: "comment_created",
        payload: {
          commentId: "comment-1",
          contentItemId: "ci-1",
          authorId: "author-1",
          workspaceId: "ws-1",
          mentionedUserIds: ["user-1", "user-2", "user-1"],
        },
      },
    ]);
    state.selectResults.push([]);
    state.selectResults.push([]);
    await dispatchOutboxOnce({ maxEvents: 10 });
    expect(cacheMock.updateTag).toHaveBeenCalledWith("notifications:user:user-1");
    expect(cacheMock.updateTag).toHaveBeenCalledWith("notifications:user:user-2");
    expect(cacheMock.updateTag).toHaveBeenCalledTimes(2);
  });

  it("notifies the content owner and designer for publication outcomes", async () => {
    state.selectResults.push([
      {
        id: "evt-publication",
        eventType: "publication_recorded",
        payload: { contentItemId: "ci-1", channelStatus: "published" },
      },
    ]);
    state.selectResults.push([
      { workspaceId: "ws-1", contentOwnerId: "owner-1", designerId: "designer-1" },
    ]);
    state.selectResults.push([]);
    state.selectResults.push([{ id: "ws-1", slug: "workspace" }]);
    state.selectResults.push([]);
    state.selectResults.push([{ id: "ws-1", slug: "workspace" }]);
    await dispatchOutboxOnce({ maxEvents: 10 });
    const recipients = state.insertCalls
      .map((call) => (call.values as Record<string, unknown>)?.userId)
      .filter((id): id is string => typeof id === "string");
    expect(recipients).toEqual(expect.arrayContaining(["owner-1", "designer-1"]));
  });

  it("skips unknown event types without throwing", async () => {
    state.selectResults.push([
      { id: "evt-1", eventType: "future_kind_we_dont_handle_yet", payload: { userId: "u" } },
    ]);
    const result = await dispatchOutboxOnce({ maxEvents: 10 });
    expect(result.processed).toBe(1);
    // The update still runs (so the queue doesn't retry forever).
    const update = state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["processedAt"] instanceof Date,
    );
    expect(update).toBeDefined();
  });
});

describe("markNotificationRead (FEAT-07) — singular §14 command", () => {
  it("rejects non-UUID input", () => {
    expect(MarkReadOneSchema.safeParse({ notificationId: "nope" }).success).toBe(false);
  });
  it("runs an UPDATE on the notification row", async () => {
    await markNotificationRead(
      { id: "user-1" },
      { notificationId: "11111111-1111-4111-8111-111111111111" },
    );
    expect(state.updateCalls.length).toBe(1);
    expect(state.updateCalls[0]?.set).toMatchObject({ readAt: expect.any(Date) });
  });
});

describe("updateNotificationPreferences (FEAT-07) — §14 contract alias", () => {
  it("upserts one preference row per kind in the matrix", async () => {
    // R4: 11 kinds × 1 insert each (the system row also takes the
    // daily-digest value). The mock returns the id "pref-N" for
    // every insert so the loop doesn't short-circuit.
    for (let i = 0; i < 11; i++) state.insertReturningIds.push({ id: `pref-${i}` });
    const prefs = {
      assignment: { inAppEnabled: true, emailEnabled: false },
      review_request: { inAppEnabled: true, emailEnabled: false },
      approval: { inAppEnabled: true, emailEnabled: false },
      changes_requested: { inAppEnabled: true, emailEnabled: false },
      reply: { inAppEnabled: true, emailEnabled: false },
      unresolved_question: { inAppEnabled: true, emailEnabled: false },
      deadline: { inAppEnabled: true, emailEnabled: false },
      delivery: { inAppEnabled: true, emailEnabled: false },
      ready_to_publish: { inAppEnabled: true, emailEnabled: false },
      mention: { inAppEnabled: true, emailEnabled: true },
      system: { inAppEnabled: true, emailEnabled: false },
    } as const;
    await updateNotificationPreferences("user-1", { prefs, dailyDigest: true });
    const inserts = state.insertCalls.filter((c) => c.table === "insert");
    expect(inserts.length).toBe(11);
  });
});

// ─── FEAT-10 — email dispatcher (GAP-FULL-REVIEW-2026-08-25) ──────────────
const { dispatchEmailOnce } = await import("@/lib/notifications/service");

describe("dispatchEmailOnce (FEAT-10)", () => {
  // The dispatcher needs:
  //   1. A list of unprocessed outbox rows (the first select).
  //   2. A read of notification_preferences (returns [] so the
  //      default email_enabled=false skips the row).
  //   3. (When opted in) a read of the user's email address.
  function stageUnprocessedEvent(eventType: string, payload: Record<string, unknown>) {
    state.selectResults.push([{ id: "evt-1", eventType, payload }]);
  }

  it("skips rows when the user has not opted into email for the kind", async () => {
    stageUnprocessedEvent("assignment", { userId: "user-1", title: "T", body: "B" });
    // The first select inside shouldEmailUserFor returns [] → emailEnabled defaults to false.
    state.selectResults.push([]);
    const result = await dispatchEmailOnce({ maxEvents: 10 });
    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("marks email state processed on skip + non-existent user", async () => {
    stageUnprocessedEvent("assignment", { userId: "user-1", title: "T", body: "B" });
    // shouldEmailUserFor: []
    state.selectResults.push([]);
    await dispatchEmailOnce({ maxEvents: 10 });
    const update = state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["emailProcessedAt"] instanceof Date,
    );
    expect(update).toBeDefined();
  });

  it("handles rows with no userId by marking them processed and skipping", async () => {
    state.selectResults.push([
      { id: "evt-1", eventType: "assignment", payload: { title: "T", body: "B" } },
    ]);
    const result = await dispatchEmailOnce({ maxEvents: 10 });
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("comment_created mention uses the slug-based actionUrl from the payload", async () => {
    // Regression guard: the discussion service now writes a
    // slug-based actionUrl into the outbox payload so the
    // notification's click-through lands on the real
    // /app/w/{slug}/planning/{id}#discussion route. The
    // dispatcher must pass that actionUrl through unchanged.
    state.selectResults.push([
      {
        id: "evt-1",
        eventType: "comment_created",
        payload: {
          commentId: "cm-1",
          contentItemId: "ci-1",
          authorId: "u-author",
          workspaceId: "ws-1",
          mentionedUserIds: ["u-mentioned"],
          visibility: "internal",
          actionUrl: "/app/w/just-halal/planning/ci-1#discussion",
        },
      },
    ]);
    // notificationPreferences default inAppEnabled=true
    state.selectResults.push([]);
    // shouldEmailUserFor: []
    state.selectResults.push([]);
    const result = await dispatchOutboxOnce({ maxEvents: 10 });
    expect(result.processed).toBe(1);
    const notifInsert = state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["kind"] === "mention",
    );
    expect(notifInsert, "no mention notification row inserted").toBeDefined();
    expect((notifInsert!.values as Record<string, unknown>)["actionUrl"]).toBe(
      "/app/w/just-halal/planning/ci-1#discussion",
    );
  });
});
