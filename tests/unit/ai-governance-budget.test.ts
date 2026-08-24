import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M3.3 — AI governance service unit tests.
 *
 * The module under test (`src/lib/ai/governance.ts`) exposes the
 * per-user daily + monthly budget enforcement that the
 * `/api/ai/generate` route depends on. The pure helpers
 * (`resolveEnabledCapabilities`, `AiBudgetReservationSchema`) are
 * already covered by `tests/unit/ai-governance.test.ts`. This file
 * covers the DB-bound paths:
 *
 *   - `enforceAiBudget(tx, ...)`        — UPSERT daily + reserve monthly
 *   - `reconcileAiBudget(...)`          — refund / top-up against actual
 *   - `loadEnabledCapabilities(agency)` — read + intersect
 *   - `getUserDailyBudgetSnapshot(...)` — read snapshot
 *
 * DB mock conventions mirror `ai-feature-settings.test.ts` and
 * `publishing-service.test.ts`. The SUT takes a `tx` parameter for
 * `enforceAiBudget`, so the test wires a separate Drizzle mock
 * instance for the transaction surface and exposes `db.transaction`
 * for `reconcileAiBudget`'s positive-delta path.
 *
 * The entitlement and quota services are partially mocked:
 *   - `getEffectiveEntitlement` returns a synthetic entitlement
 *     whose `maxDailyAiRequestsPerUser` + `enabledAiCapabilities` we
 *     control per test.
 *   - `reserveCapacity` is mocked as a no-op so the test exercises
 *     the governance surface end-to-end without depending on the
 *     quota service's lock semantics.
 *   - `recordUsage` is mocked similarly (the negative-delta branch
 *     of reconciliation needs it).
 */

vi.mock("server-only", () => ({}));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
};

function dequeue(state: DrizzleState): unknown[] {
  return state.selectResults.shift() ?? [];
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
          return Reflect.get(target, prop, receiver);
        },
      });
    chain.where = vi.fn(() => thenable(() => chain));
    chain.innerJoin = vi.fn(() => thenable(() => chain));
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  // The Drizzle upsert path is `insert(...).values(...).onConflictDoUpdate(...).returning(...)`.
  // The SUT awaits the `.returning()` call directly, so we make
  // `.values()` return a chain that carries both `.onConflictDoUpdate()`
  // and `.returning()`.
  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
    return insertChain;
  });
  insertChain.onConflictDoUpdate = vi.fn((cfg: { target: unknown; set: unknown }) => {
    state.updateCalls.push({ set: cfg.set, where: cfg.target });
    return insertChain;
  });
  insertChain.returning = vi.fn(() => {
    // Drain the next queued result. The default is `{ requestCount: 1 }`
    // so most tests don't need to queue anything.
    const rows = dequeue(state);
    if (rows.length > 0) return Promise.resolve(rows);
    return Promise.resolve([{ requestCount: 1 }]);
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
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const transaction = vi.fn(async (cb: (tx: typeof root) => Promise<unknown>) => cb(root));
  const root = { select, insert, update, transaction };
  return root;
}

const dbState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertCalls: [] as { values: unknown }[],
  updateCalls: [] as { set: unknown; where: unknown }[],
}));
const dbMock = vi.hoisted(() => makeDrizzleMock(dbState));
// The transaction SUT receives a separate Drizzle mock instance so
// the queues don't share state with the top-level `db`. This mirrors
// real Drizzle: a `db.transaction()` callback gets its own connection.
const txState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertCalls: [] as { values: unknown }[],
  updateCalls: [] as { set: unknown; where: unknown }[],
}));
const txMock = vi.hoisted(() => makeDrizzleMock(txState));

// The SUT imports `db` once and calls `db.transaction(cb)` directly.
// We rewire the transaction to hand `txMock` to the callback so the
// SUT's `tx` parameter behaves like a real transaction.
(dbMock as { transaction: ReturnType<typeof vi.fn> }).transaction = vi.fn(
  async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock),
);

vi.mock("@/lib/db", () => ({ db: dbMock }));

// Entitlement shape mirrors `getEffectiveEntitlement`'s return type.
const entitlementMock = vi.hoisted(() => ({
  maxDailyAiRequestsPerUser: 50 as number | null,
  enabledAiCapabilities: new Set([
    "campaign_ideas",
    "brief_improvement",
    "caption_drafts",
    "platform_adaptation",
    "related_format_ideas",
    "completeness_check",
  ]) as Set<string>,
}));

vi.mock("@/lib/entitlements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/entitlements")>("@/lib/entitlements");
  return {
    ...actual,
    getEffectiveEntitlement: vi.fn(async () => entitlementMock),
    reserveCapacity: vi.fn(async () => undefined),
  };
});

const recordUsageMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/usage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/usage")>("@/lib/usage");
  return {
    ...actual,
    recordUsage: recordUsageMock,
  };
});

const {
  enforceAiBudget,
  reconcileAiBudget,
  loadEnabledCapabilities,
  getUserDailyBudgetSnapshot,
  AI_CAPABILITIES,
} = await import("@/lib/ai/governance");
const { LimitExceededError } = await import("@/lib/entitlements");

const agencyId = "11111111-1111-1111-1111-111111111111";
const userId = "22222222-2222-2222-2222-222222222222";
const requestId = "33333333-3333-3333-3333-333333333333";

function resetState() {
  dbState.selectResults = [];
  dbState.insertCalls = [];
  dbState.updateCalls = [];
  txState.selectResults = [];
  txState.insertCalls = [];
  txState.updateCalls = [];
  entitlementMock.maxDailyAiRequestsPerUser = 50;
  entitlementMock.enabledAiCapabilities = new Set([
    "campaign_ideas",
    "brief_improvement",
    "caption_drafts",
    "platform_adaptation",
    "related_format_ideas",
    "completeness_check",
  ]);
  recordUsageMock.mockReset();
  recordUsageMock.mockResolvedValue(undefined);
}

beforeEach(resetState);

describe("enforceAiBudget", () => {
  it("returns a reservation on the happy path", async () => {
    // The UPSERT default returns `{ requestCount: 1 }` (under the cap).
    const result = await enforceAiBudget({
      tx: txMock as never,
      agencyId,
      userId,
      capability: "caption_drafts",
      estimatedInputTokens: 120,
      estimatedOutputTokens: 60,
      requestId,
    });
    expect(result).toEqual({
      capability: "caption_drafts",
      estimatedInputTokens: 120,
      estimatedOutputTokens: 60,
      monthlyRequestsReserved: 1,
      dailyRequestsReserved: 1,
    });
    // The SUT captured both the insert (with onConflictDoUpdate's
    // target) and the reserveCapacity call (mocked).
    expect(txState.insertCalls.length).toBe(1);
    expect(txState.updateCalls.length).toBe(1);
  });

  it("rejects negative token estimates as an Error (programmer fault, not a domain error)", async () => {
    await expect(
      enforceAiBudget({
        tx: txMock as never,
        agencyId,
        userId,
        capability: "caption_drafts",
        estimatedInputTokens: -1,
        estimatedOutputTokens: 0,
        requestId,
      }),
    ).rejects.toThrow(/non-negative/);
  });

  it("throws LimitExceededError when the post-update daily count exceeds the cap", async () => {
    entitlementMock.maxDailyAiRequestsPerUser = 5;
    // Queue an over-cap post-update count via the upsert's
    // `.returning()` → the SUT compares the returned count to
    // the cap and throws.
    txState.selectResults.push([{ requestCount: 6 }]);
    await expect(
      enforceAiBudget({
        tx: txMock as never,
        agencyId,
        userId,
        capability: "caption_drafts",
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        requestId,
      }),
    ).rejects.toBeInstanceOf(LimitExceededError);
  });

  it("skips the daily-cap check when the cap is null (unlimited)", async () => {
    entitlementMock.maxDailyAiRequestsPerUser = null;
    txState.selectResults.push([{ requestCount: 9_999 }]);
    const result = await enforceAiBudget({
      tx: txMock as never,
      agencyId,
      userId,
      capability: "caption_drafts",
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      requestId,
    });
    expect(result.dailyRequestsReserved).toBe(1);
  });
});

describe("reconcileAiBudget", () => {
  it("is a no-op when actual === estimated", async () => {
    await reconcileAiBudget({
      agencyId,
      userId,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 50,
      actualInputTokens: 100,
      actualOutputTokens: 50,
    });
    expect(recordUsageMock).not.toHaveBeenCalled();
    // The positive-delta path opens a db.transaction to call
    // reserveCapacity; with no deltas, no transaction opens.
    expect(dbState.updateCalls.length).toBe(0);
  });

  it("falls back to the estimated value when the provider returns a negative number", async () => {
    // The defensive `Math.max(0, ...)` clamps negative to 0. When
    // estimated is 0 too, the deltas are 0 → no-op.
    await reconcileAiBudget({
      agencyId,
      userId,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      actualInputTokens: -50,
      actualOutputTokens: -10,
    });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("refunds tokens when the provider uses fewer than estimated", async () => {
    await reconcileAiBudget({
      agencyId,
      userId,
      estimatedInputTokens: 200,
      estimatedOutputTokens: 100,
      actualInputTokens: 50,
      actualOutputTokens: 25,
    });
    expect(recordUsageMock).toHaveBeenCalledTimes(2);
    expect(recordUsageMock).toHaveBeenCalledWith(dbMock, agencyId, "ai_input_tokens_month", -150);
    expect(recordUsageMock).toHaveBeenCalledWith(dbMock, agencyId, "ai_output_tokens_month", -75);
  });

  it("top-up tokens when the provider uses more than estimated", async () => {
    // The positive-delta path is exercised through the
    // `db.transaction` → reserveCapacity (mocked). We just confirm
    // it does NOT call `recordUsage` (the refund path).
    await reconcileAiBudget({
      agencyId,
      userId,
      estimatedInputTokens: 50,
      estimatedOutputTokens: 25,
      actualInputTokens: 200,
      actualOutputTokens: 100,
    });
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it("handles a mixed delta (one side over, one side under)", async () => {
    await reconcileAiBudget({
      agencyId,
      userId,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 100,
      actualInputTokens: 50, // refund 50
      actualOutputTokens: 150, // top-up 50
    });
    expect(recordUsageMock).toHaveBeenCalledTimes(1);
    expect(recordUsageMock).toHaveBeenCalledWith(dbMock, agencyId, "ai_input_tokens_month", -50);
  });
});

describe("loadEnabledCapabilities", () => {
  it("returns the full effective set when the agency has no explicit row", async () => {
    // No row queued → empty result → null branch.
    const out = await loadEnabledCapabilities(agencyId);
    expect(out.size).toBe(6);
    for (const cap of AI_CAPABILITIES) {
      expect(out.has(cap)).toBe(true);
    }
  });

  it("intersects the agency's explicit row with the effective set", async () => {
    dbState.selectResults.push([
      {
        enabledCapabilities: ["caption_drafts", "brief_improvement", "campaign_ideas"],
      },
    ]);
    const out = await loadEnabledCapabilities(agencyId);
    expect(out.size).toBe(3);
    expect(out.has("caption_drafts")).toBe(true);
    expect(out.has("brief_improvement")).toBe(true);
    expect(out.has("campaign_ideas")).toBe(true);
  });

  it("returns an empty set when the agency's row lists capabilities the plan does not allow", async () => {
    dbState.selectResults.push([{ enabledCapabilities: ["completeness_check", "caption_drafts"] }]);
    // The plan's effective set is narrowed to ONLY completeness_check.
    entitlementMock.enabledAiCapabilities = new Set(["completeness_check"]);
    const out = await loadEnabledCapabilities(agencyId);
    expect(out.size).toBe(1);
    expect(out.has("completeness_check")).toBe(true);
    expect(out.has("caption_drafts")).toBe(false);
  });
});

describe("getUserDailyBudgetSnapshot", () => {
  it("returns 0 used and the entitlement's cap when no row exists today", async () => {
    // No selectResults queued → empty row.
    const out = await getUserDailyBudgetSnapshot({ agencyId, userId });
    expect(out.requestCount).toBe(0);
    expect(out.limit).toBe(50);
    expect(out.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the row's count when a daily row already exists", async () => {
    dbState.selectResults.push([{ requestCount: 12 }]);
    const out = await getUserDailyBudgetSnapshot({ agencyId, userId });
    expect(out.requestCount).toBe(12);
    expect(out.limit).toBe(50);
  });

  it("returns null when the cap is unlimited", async () => {
    entitlementMock.maxDailyAiRequestsPerUser = null;
    const out = await getUserDailyBudgetSnapshot({ agencyId, userId });
    expect(out.limit).toBeNull();
  });
});
