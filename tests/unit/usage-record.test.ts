import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * TEST-08 (recordUsage) — direct unit coverage of
 * `src/lib/usage/record-usage.ts`.
 *
 * The audit (`tmp/full-review/test-gaps.md`, finding TEST-08) called
 * out that `recordUsage` is exercised only at the integration tier.
 * The function has a non-trivial floor-validation branch (next value
 * must be >= 0) and a per-day threshold-event emission path; both
 * are unit-testable with a Drizzle mock.
 *
 * Mock pattern: a `db.transaction(fn)` shim that calls `fn(tx)` with
 * a thenable chain mock. The chain is awaitable (so `await
 * tx.select(...).from(...).where(...).for("update")` resolves to
 * whatever rows the test queued) AND chainable (so further
 * `.for(...)` / `.limit(...)` / `.returning(...)` work).
 */

type Row = Record<string, unknown>;

function makeAwaitableChain(rows: Row[] = []) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: Row[]) => unknown) => resolve(rows),
    catch: (reject: (v: Row[]) => unknown) => reject(rows),
  };
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "from",
    "innerJoin",
    "where",
    "for",
    "limit",
    "orderBy",
    "set",
    "values",
    "returning",
    "onConflictDoNothing",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown; catch: unknown };
}

const dbMock = vi.hoisted(() => {
  let nextRows: Row[] = [];
  const calls: string[] = [];
  return {
    calls,
    setNextRows(rows: Row[]) {
      nextRows = rows;
    },
    transaction: vi.fn(async (fn: (tx: ReturnType<typeof makeAwaitableChain>) => unknown) => {
      const tx = makeAwaitableChain(nextRows);
      return fn(tx);
    }),
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// The module pulls in `getLimitForResource` from a sibling file. We
// mock it to return a constant limit so the threshold-event path is
// reachable in the test.
vi.mock("@/lib/usage/get-limit-for-resource", () => ({
  getLimitForResource: vi.fn(async () => 100),
}));

const { recordUsage } = await import("@/lib/usage/record-usage");
const { InvalidUsageDeltaError } = await import("@/lib/usage/types");

const AGENCY_ID = "00000000-0000-0000-0000-0000000000aa";
const RESOURCE = "workspaces";

beforeEach(() => {
  dbMock.calls.length = 0;
  dbMock.setNextRows([]);
  dbMock.transaction.mockClear();
});

// ─── Floor / delta validation ──────────────────────────────────────────

describe("recordUsage: floor / delta validation", () => {
  it("throws on a non-finite delta (programming bug, not a runtime condition)", async () => {
    await expect(
      recordUsage(dbMock as unknown as Parameters<typeof recordUsage>[0], AGENCY_ID, RESOURCE, NaN),
    ).rejects.toThrow(/delta must be a finite integer/);
    // The transaction must not have been opened — the validation
    // fires before the tx.
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("throws on a non-integer delta (programming bug, not a runtime condition)", async () => {
    await expect(
      recordUsage(dbMock as unknown as Parameters<typeof recordUsage>[0], AGENCY_ID, RESOURCE, 1.5),
    ).rejects.toThrow(/delta must be a finite integer/);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("throws on a negative delta when no existing row (currentValue is 0)", async () => {
    // The tx select chain resolves to an empty array (no existing
    // row) → currentValue=0, nextValue=0+(-1)=-1 →
    // InvalidUsageDeltaError.
    dbMock.setNextRows([]);
    await expect(
      recordUsage(dbMock as unknown as Parameters<typeof recordUsage>[0], AGENCY_ID, RESOURCE, -1),
    ).rejects.toBeInstanceOf(InvalidUsageDeltaError);
  });
});

// ─── Happy path: insert new row ───────────────────────────────────────

describe("recordUsage: insert path (no existing row)", () => {
  it("returns nextValue=5 when no existing row + delta=+5", async () => {
    dbMock.setNextRows([]);
    await expect(
      recordUsage(dbMock as unknown as Parameters<typeof recordUsage>[0], AGENCY_ID, RESOURCE, 5),
    ).resolves.toBe(5);
    // The transaction was opened.
    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
  });
});

// ─── Happy path: update existing row ──────────────────────────────────

describe("recordUsage: update path (existing row)", () => {
  it("returns nextValue=13 when existing value=10 + delta=+3", async () => {
    dbMock.setNextRows([{ value: 10, lastRecordedAt: new Date() }]);
    await expect(
      recordUsage(dbMock as unknown as Parameters<typeof recordUsage>[0], AGENCY_ID, RESOURCE, 3),
    ).resolves.toBe(13);
  });
});

// ─── Threshold event emission ─────────────────────────────────────────

describe("recordUsage: threshold-event emission", () => {
  it("emits a threshold event row when the new level crosses healthy → warning", async () => {
    // Existing value=0; limit=100 (from the mock). delta=80 →
    // nextValue=80, percent=80% → computeLevel returns "warning"
    // (the 80% warning threshold). The helper should emit a
    // threshold_event row, so the chain's `insert` method is called.
    dbMock.setNextRows([{ value: 0, lastRecordedAt: new Date() }]);
    const tx = makeAwaitableChain([{ value: 0, lastRecordedAt: new Date() }]);
    dbMock.transaction.mockImplementationOnce(async (fn) => fn(tx));
    await recordUsage(
      dbMock as unknown as Parameters<typeof recordUsage>[0],
      AGENCY_ID,
      RESOURCE,
      80,
    );
    // The helper should have called .insert (for either the counter
    // row OR the threshold event row) AND .onConflictDoNothing (the
    // threshold event dedupe gate).
    expect(tx.insert).toHaveBeenCalled();
    expect(tx.onConflictDoNothing).toHaveBeenCalled();
  });

  it("does NOT emit a threshold event when the level stays at healthy", async () => {
    // Existing value=0; limit=100; delta=10 → nextValue=10,
    // percent=10% → healthy → no event.
    const tx = makeAwaitableChain([{ value: 0, lastRecordedAt: new Date() }]);
    dbMock.transaction.mockImplementationOnce(async (fn) => fn(tx));
    await recordUsage(
      dbMock as unknown as Parameters<typeof recordUsage>[0],
      AGENCY_ID,
      RESOURCE,
      10,
    );
    // No threshold event means no `.onConflictDoNothing` call (the
    // insert of the threshold event is the only path that uses
    // `.onConflictDoNothing`).
    expect(tx.onConflictDoNothing).not.toHaveBeenCalled();
  });
});
