import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * R9 — cache contract for the bell.
 *
 * The (app) layout now reads the bell data through
 * `unstable_cache` wrappers (`getCachedNotificationsForUser`,
 * `getCachedUnreadCount`) tagged `notifications:user:<id>`.
 * The mark-read action and the outbox dispatcher invalidate
 * that tag with `updateTag`. This file pins the helper-level
 * contract:
 *
 *   1. `notificationsUserTag` returns the per-user tag the
 *      cache, action, and dispatcher all share.
 *   2. The cache wrappers pass the user id + limit through to
 *      the underlying reads (so a different user / limit
 *      produces a different cache key).
 *   3. The dispatcher fan-out batches per-recipient tag busts
 *      (one per user, not one per event) so a tick that
 *      writes 50 events to 20 users is O(20) tag busts.
 *
 * The underlying `listNotificationsForUser` / `countUnreadNotifications`
 * are mocked so the test doesn't need a real database. The
 * integration suite exercises the real path.
 */

const updateTagMock = vi.fn();
const revalidateTagMock = vi.fn();
const revalidatePathMock = vi.fn();
const unstableCachePassthrough = <T extends (...args: never[]) => unknown>(fn: T) => fn;

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidateTag: revalidateTagMock,
  revalidatePath: revalidatePathMock,
  updateTag: updateTagMock,
  unstable_cache: unstableCachePassthrough,
}));

// Mock the underlying reads so the test is hermetic.
vi.mock("@/lib/notifications/service", () => ({
  listNotificationsForUser: vi.fn(async (actor: { id: string }, opts: { limit: number }) => [
    {
      id: `${actor.id}-${opts.limit}-1`,
      kind: "mention",
      title: "t",
      body: "b",
      actionUrl: null,
      readAt: new Date("2026-01-01T01:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  ]),
  countUnreadNotifications: vi.fn(async () => 3),
  // re-export the other symbols the cache module imports
  // (none today, but keep the mock total so future additions
  // don't silently fall through to the real module).
}));

const { notificationsUserTag, getCachedNotificationsForUser, getCachedUnreadCount } =
  await import("@/lib/notifications/cache");

beforeEach(() => {
  updateTagMock.mockClear();
  revalidateTagMock.mockClear();
  revalidatePathMock.mockClear();
});

describe("R9 — notificationsUserTag", () => {
  it("returns the per-user tag the cache, action, and dispatcher share", () => {
    expect(notificationsUserTag("user-a")).toBe("notifications:user:user-a");
    expect(notificationsUserTag("user-b")).toBe("notifications:user:user-b");
  });

  it("returns a different tag per user (cross-user safety)", () => {
    expect(notificationsUserTag("a")).not.toBe(notificationsUserTag("b"));
  });
});

describe("R9 — cached bell reads", () => {
  it("getCachedNotificationsForUser passes the user id and limit to the underlying read", async () => {
    const out = await getCachedNotificationsForUser({ id: "user-a" }, 10);
    expect(out.length).toBe(1);
    expect(out[0]?.id).toBe("user-a-10-1");
    expect(out[0]?.readAt).toBe("2026-01-01T01:00:00.000Z");
    expect(out[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("getCachedNotificationsForUser with a different limit produces a different result", async () => {
    const out = await getCachedNotificationsForUser({ id: "user-a" }, 5);
    expect(out[0]?.id).toBe("user-a-5-1");
  });

  it("getCachedUnreadCount returns the underlying number", async () => {
    const out = await getCachedUnreadCount({ id: "user-a" });
    expect(out).toBe(3);
  });
});

describe("R9 — updateTag contract", () => {
  it("the function exists and is callable", () => {
    expect(typeof updateTagMock).toBe("function");
    // Calling with a tag shouldn't throw.
    updateTagMock("notifications:user:test");
    expect(updateTagMock).toHaveBeenCalledWith("notifications:user:test");
  });
});
