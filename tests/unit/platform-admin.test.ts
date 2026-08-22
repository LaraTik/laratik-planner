import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Platform-admin helper tests (Milestone 1.1).
 *
 * `isPlatformAdmin(actor)` and `requirePlatformAdmin(actor)` are the
 * single source of truth for "is this user a platform administrator?".
 * Platform authority is **separate from** agency authority: a user can
 * be an active platform admin without being a member of any agency,
 * and a user can be an active agency admin without being a platform
 * admin.
 *
 * Following the pattern from `auth-policy.test.ts`:
 *  - mock `@/lib/db` with a chainable select that returns rows we queue
 *  - branch coverage is the goal; we don't assert SQL shape
 */

type DrizzleState = {
  // Each call to `select()` consumes the next entry as the LIMIT result.
  // `null` means "the chain's limit() rejects" (DB error path).
  limitResults: Array<unknown[] | Error | undefined>;
};

function makeDrizzleMock(state: DrizzleState) {
  const select = vi.fn(() => {
    // Each call to `db.select(...)` returns a fresh chain so per-test
    // overrides of `.limit` (the DB-error path) don't leak across
    // tests.
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const next = state.limitResults.shift();
      if (next === undefined) return Promise.resolve([]);
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next);
    });
    return chain;
  });
  return { select, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = { limitResults: [] };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const platformAdmin = await import("@/lib/auth/platform-admin");
const policy = await import("@/lib/auth/policy");

const actor = { id: "user-1" };

beforeEach(() => {
  dbMock.state.limitResults = [];
  dbMock.select.mockClear();
});

describe("isPlatformAdmin", () => {
  it("returns true for a user in platform_administrator with revoked_at IS NULL", async () => {
    // SELECT 1 FROM platform_administrator WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1
    dbMock.state.limitResults = [[{ x: 1 }]];
    expect(await platformAdmin.isPlatformAdmin(actor)).toBe(true);
  });

  it("returns false for a user not in platform_administrator", async () => {
    dbMock.state.limitResults = [[]];
    expect(await platformAdmin.isPlatformAdmin(actor)).toBe(false);
  });

  it("returns false for a user whose platform_administrator row has revoked_at IS NOT NULL", async () => {
    // The query filters `revoked_at IS NULL`, so a revoked admin returns
    // no row. We simulate that by returning an empty result set.
    dbMock.state.limitResults = [[]];
    expect(await platformAdmin.isPlatformAdmin(actor)).toBe(false);
  });

  it("returns false if the actor's user row was deleted (FK cascade → row gone)", async () => {
    // platform_administrator.user_id REFERENCES "user"(id) ON DELETE CASCADE,
    // so deleting the user deletes the platform-admin row. The helper
    // just sees no row and returns false.
    dbMock.state.limitResults = [[]];
    expect(await platformAdmin.isPlatformAdmin({ id: "deleted-user" })).toBe(false);
  });

  it("returns false when the DB query throws (defensive: never crash the request)", async () => {
    // Queue a rejected promise for the limit() result.
    dbMock.state.limitResults = [new Error("simulated DB failure")];
    expect(await platformAdmin.isPlatformAdmin(actor)).toBe(false);
  });
});

describe("requirePlatformAdmin", () => {
  it("throws PermissionDeniedError when the actor is not a platform admin", async () => {
    dbMock.state.limitResults = [[]];
    await expect(platformAdmin.requirePlatformAdmin(actor)).rejects.toBeInstanceOf(
      policy.PermissionDeniedError,
    );
  });

  it("uses the action code 'platform-admin-required' on the thrown error", async () => {
    dbMock.state.limitResults = [[]];
    try {
      await platformAdmin.requirePlatformAdmin(actor);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(policy.PermissionDeniedError);
      expect((err as InstanceType<typeof policy.PermissionDeniedError>).action).toBe(
        "platform-admin-required",
      );
    }
  });

  it("resolves silently when the actor is a live platform admin", async () => {
    dbMock.state.limitResults = [[{ x: 1 }]];
    await expect(platformAdmin.requirePlatformAdmin(actor)).resolves.toBeUndefined();
  });
});
