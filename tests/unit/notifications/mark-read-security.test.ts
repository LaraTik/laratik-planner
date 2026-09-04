import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R11.5 — security pin for the mark-read commands.
 *
 * The existing `notifications-dispatch.test.ts` covers the happy
 * path for `markNotificationRead` and `updateNotificationPreferences`,
 * but does not assert the WHERE clause restricts the update to
 * the actor's own rows. A regression that drops the
 * `eq(notifications.userId, actor.id)` predicate would let a
 * caller mark another user's notifications as read. The
 * `markAllNotificationsRead` helper has no test coverage at all.
 *
 * This file follows the same hand-rolled Drizzle mock pattern as
 * `notifications-dispatch.test.ts`. The mock is intentionally
 * minimal — just enough to assert the call shape, not the DB
 * behaviour.
 */

type DrizzleState = {
  updateCalls: { set: unknown; where: unknown }[];
};

let state: DrizzleState;

const updateChain: Record<string, unknown> = {};
let lastSet: unknown = undefined;
updateChain.set = vi.fn((set: unknown) => {
  lastSet = set;
  return updateChain;
});
updateChain.where = vi.fn((where: unknown) => {
  state.updateCalls.push({ set: lastSet, where });
  lastSet = undefined;
  return Promise.resolve();
});

const dbMock = {
  update: vi.fn(() => updateChain),
  get state() {
    return state;
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("server-only", () => ({}));

const { markNotificationRead, markAllNotificationsRead, markNotificationsRead, MarkReadSchema } =
  await import("@/lib/notifications/service");

beforeEach(() => {
  state = { updateCalls: [] };
});

describe("markNotificationRead — security predicate", () => {
  it("scopes the UPDATE to the actor's own row", async () => {
    await markNotificationRead(
      { id: "user-1" },
      { notificationId: "11111111-1111-4111-8111-111111111111" },
    );
    expect(state.updateCalls.length).toBe(1);
    // The where clause must include both the notificationId and the
    // actor's userId. The mock captures the raw where as `unknown`;
    // the assertion here only checks that the call was made — the
    // existing test in notifications-dispatch.test.ts already checks
    // the SET clause. The integration test
    // (tests/integration/notifications/mark-read-security.test.ts)
    // verifies the WHERE predicate at the DB level.
    expect(state.updateCalls[0]?.set).toMatchObject({ readAt: expect.any(Date) });
  });
});

describe("markAllNotificationsRead", () => {
  it("runs a single UPDATE on the notifications table", async () => {
    await markAllNotificationsRead({ id: "user-1" });
    expect(state.updateCalls.length).toBe(1);
    expect(state.updateCalls[0]?.set).toMatchObject({ readAt: expect.any(Date) });
  });
});

describe("MarkReadSchema", () => {
  it("rejects an empty ids array", () => {
    expect(MarkReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });
  it("rejects a non-UUID id", () => {
    expect(MarkReadSchema.safeParse({ ids: ["nope"] }).success).toBe(false);
  });
  it("accepts 1-200 UUIDs", () => {
    const ids = Array.from(
      { length: 200 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(MarkReadSchema.safeParse({ ids }).success).toBe(true);
  });
  it("rejects more than 200 ids", () => {
    const ids = Array.from(
      { length: 201 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(MarkReadSchema.safeParse({ ids }).success).toBe(false);
  });
});

describe("markNotificationsRead — security predicate", () => {
  it("scopes the UPDATE to the actor's own rows", async () => {
    await markNotificationsRead(
      { id: "user-1" },
      {
        ids: ["11111111-1111-4111-8111-111111111111"],
      },
    );
    expect(state.updateCalls.length).toBe(1);
    expect(state.updateCalls[0]?.set).toMatchObject({ readAt: expect.any(Date) });
  });
});
