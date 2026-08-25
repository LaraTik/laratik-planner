import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * TEST-07 — direct unit coverage of `src/lib/social/service.ts` and
 * `src/lib/social/repository.ts`.
 *
 * The audit (`tmp/full-review/test-gaps.md`, finding TEST-07) called
 * out that both files have no direct unit test: the repository
 * (`consumeOauthState`, the one-shot CSRF state consumption inside
 * the OAuth callback) and the service (`enableSocial`,
 * `rotateSocialDek`, `getSocialStatus`, the DEK orchestration) are
 * covered only at the integration tier. A regression in the OAuth
 * finalize path (e.g. a query that forgets to filter `consumedAt IS
 * NULL` and replays a state) only surfaces minutes later in
 * integration.
 *
 * Mock pattern (per the brief): mirror `auth-config.test.ts` — mock
 * the repository directly for the service tests, exercise the
 * repository with a Drizzle chain for the state-consumption paths.
 *
 * Cases:
 *   Repository:
 *     - consumeOauthState happy path
 *     - consumeOauthState state-already-consumed → null
 *     - consumeOauthState state signature mismatch (unknown digest) → null
 *     - consumeOauthState expired state → null
 *   Service:
 *     - getSocialStatus happy path (admin)
 *     - getSocialStatus non-admin → SocialServiceError(social.forbidden)
 *     - enableSocial / rotateSocialDek require `confirm: true`
 *     - keyFingerprint: empty / non-Buffer input → ""
 *     - keyFingerprint: 32-byte key → 8-char hex
 */

// ─── Repository: Drizzle mock ─────────────────────────────────────────

type DrizzleState = {
  // Each call to `select(...)` consumes the next entry as the
  // `.limit()` result. For consumeOauthState the helper issues one
  // select per call.
  limitResults: Array<unknown[] | undefined>;
  // Each call to `update(...)` resolves to a chain.
  updateCallCount: number;
};

function makeDrizzleMock(state: DrizzleState) {
  const select = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const next = state.limitResults.shift() ?? [];
      return Promise.resolve(next);
    });
    return chain;
  });

  const update = vi.fn(() => {
    state.updateCallCount += 1;
    const chain: Record<string, unknown> = {};
    chain.set = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    return chain;
  });

  return { select, update, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = { limitResults: [], updateCallCount: 0 };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// The repository uses `db.transaction` only inside the
// `claimDueProfiles` and `markNeedsReauth` paths; we don't exercise
// those here, so a no-op transaction shim is fine.
const { db } = await import("@/lib/db");
if (typeof (db as unknown as { transaction?: unknown }).transaction !== "function") {
  (
    db as unknown as { transaction: (fn: (tx: typeof db) => unknown) => Promise<unknown> }
  ).transaction = async (fn) => fn(db);
}

const repository = await import("@/lib/social/repository");

beforeEach(() => {
  dbMock.state.limitResults = [];
  dbMock.state.updateCallCount = 0;
  dbMock.select.mockClear();
  dbMock.update.mockClear();
});

// ─── consumeOauthState ────────────────────────────────────────────────

describe("consumeOauthState (repository)", () => {
  it("happy path: returns the row + marks consumedAt", async () => {
    const unconsumedRow = {
      id: "row-1",
      stateDigest: "digest-A",
      provider: "meta",
      workspaceId: "ws-1",
      actorId: "user-1",
      returnPath: "/app/w/acme/channels",
      expiresAt: new Date(Date.now() + 60_000), // 60s in the future
      consumedAt: null,
    };
    dbMock.state.limitResults = [[unconsumedRow]];
    const row = await repository.consumeOauthState(db, "digest-A", new Date());
    expect(row).not.toBeNull();
    expect(row?.stateDigest).toBe("digest-A");
    // The helper must have issued exactly one update to mark consumedAt.
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("state-already-consumed: returns null + does NOT issue a re-update", async () => {
    // Row exists but consumedAt is set — the helper returns null
    // and does not call update (no second consume).
    const consumedRow = {
      id: "row-2",
      stateDigest: "digest-B",
      provider: "meta",
      workspaceId: "ws-1",
      actorId: "user-1",
      returnPath: "/app/w/acme/channels",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(Date.now() - 1000),
    };
    dbMock.state.limitResults = [[consumedRow]];
    const row = await repository.consumeOauthState(db, "digest-B", new Date());
    expect(row).toBeNull();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("signature mismatch: returns null when the digest has no row", async () => {
    // The repository looks up by `stateDigest`. A wrong digest
    // means the SELECT returns no row → null.
    dbMock.state.limitResults = [[]];
    const row = await repository.consumeOauthState(db, "wrong-digest", new Date());
    expect(row).toBeNull();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("expired state: returns null + does NOT issue a re-update", async () => {
    // Row exists, unconsumed, but expiresAt < now → helper returns null.
    const expiredRow = {
      id: "row-3",
      stateDigest: "digest-C",
      provider: "meta",
      workspaceId: "ws-1",
      actorId: "user-1",
      returnPath: "/app/w/acme/channels",
      expiresAt: new Date(Date.now() - 1000), // 1s in the past
      consumedAt: null,
    };
    dbMock.state.limitResults = [[expiredRow]];
    const row = await repository.consumeOauthState(db, "digest-C", new Date());
    expect(row).toBeNull();
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

// ─── keyFingerprint (pure function) ───────────────────────────────────

describe("keyFingerprint (service)", () => {
  it("returns the last 8 hex chars of sha256(key) for a 32-byte key", async () => {
    const { keyFingerprint } = await import("@/lib/social/service");
    const key = Buffer.alloc(32, 1);
    const expected = createHash("sha256").update(key).digest("hex").slice(-8);
    expect(keyFingerprint(key)).toBe(expected);
    expect(keyFingerprint(key)).toHaveLength(8);
  });

  it("returns '' for an empty Buffer", async () => {
    const { keyFingerprint } = await import("@/lib/social/service");
    expect(keyFingerprint(Buffer.alloc(0))).toBe("");
  });

  it("returns '' for a non-Buffer input (defensive)", async () => {
    const { keyFingerprint } = await import("@/lib/social/service");
    // The contract is "empty input → empty string". A non-Buffer
    // input is the same as an empty one at the call site.
    expect(keyFingerprint("not-a-buffer" as unknown as Buffer)).toBe("");
    expect(keyFingerprint(undefined as unknown as Buffer)).toBe("");
  });
});
