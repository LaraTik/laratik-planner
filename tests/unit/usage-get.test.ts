import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * TEST-08 (getUsage) — direct unit coverage of
 * `src/lib/usage/get-usage.ts`.
 *
 * The audit (`tmp/full-review/test-gaps.md`, finding TEST-08) called
 * out that `getUsage` is exercised only at the integration tier.
 * The function builds a `UsageSnapshot` from the counter set + the
 * effective limit per known resource.
 *
 * The unit-level guarantees we pin:
 *   - Every entry in `KNOWN_RESOURCES` has a row in the returned
 *     `counters`, `thresholds`, and `limits` objects (even if the
 *     counter row is missing → value 0).
 *   - When the limit is null, the level is "healthy" and `percent` is
 *     null (the no-plan-default branch).
 *   - The level reported for a resource is derived from
 *     `computeLevel(value, limit)`, not from any historical threshold
 *     event row.
 */

type Row = Record<string, unknown>;

const { limitMap, counterRows } = vi.hoisted(() => ({
  limitMap: new Map<string, number | null>(),
  counterRows: [] as Row[],
}));

function makeAwaitableChain(rows: Row[]) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: Row[]) => unknown) => resolve(rows),
    catch: (reject: (v: Row[]) => unknown) => reject(rows),
  };
  for (const m of ["select", "from", "where", "orderBy", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  return chain;
}

const dbMock = vi.hoisted(() => {
  return {
    select: vi.fn(() => makeAwaitableChain(counterRows)),
  };
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

vi.mock("@/lib/usage/get-limit-for-resource", () => ({
  getLimitForResource: vi.fn(async (_db: unknown, _agencyId: string, resource: string) => {
    return limitMap.get(resource) ?? null;
  }),
}));

const { getUsage, KNOWN_RESOURCES } = await import("@/lib/usage/get-usage");

const AGENCY_ID = "00000000-0000-0000-0000-0000000000bb";

beforeEach(() => {
  limitMap.clear();
  counterRows.length = 0;
  dbMock.select.mockClear();
});

// ─── Empty agency (no rows) ───────────────────────────────────────────

describe("getUsage: empty agency", () => {
  it("returns counters=0 for every known resource, limits from the per-resource map", async () => {
    const snapshot = await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    for (const r of KNOWN_RESOURCES) {
      expect(snapshot.counters[r]).toBe(0);
      expect(snapshot.thresholds[r]).toBeDefined();
      expect(snapshot.limits[r]).toBeNull();
    }
    for (const r of KNOWN_RESOURCES) {
      expect(snapshot.thresholds[r]!.level).toBe("healthy");
      expect(snapshot.thresholds[r]!.percent).toBeNull();
    }
  });
});

// ─── With limit, no counter row ───────────────────────────────────────

describe("getUsage: limit set, no counter row", () => {
  it("reports a healthy level when value=0 and limit>0", async () => {
    limitMap.set("workspaces", 10);
    const snapshot = await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    expect(snapshot.counters["workspaces"]).toBe(0);
    expect(snapshot.limits["workspaces"]).toBe(10);
    expect(snapshot.thresholds["workspaces"]!.level).toBe("healthy");
    // percent = 0/10 * 100 = 0
    expect(snapshot.thresholds["workspaces"]!.percent).toBe(0);
  });
});

// ─── Counter row present, limit present ───────────────────────────────

describe("getUsage: counter row + limit", () => {
  it("reports 'warning' when value crosses the 80% threshold", async () => {
    limitMap.set("workspaces", 10);
    // 8/10 = 80% — the first warning observation (per M2 spec:
    // `value >= 80% of limit` → warning). 9/10 = 90% would already
    // be "urgent"; 10/10 = 100% would be "over_limit".
    counterRows.push({
      agencyId: AGENCY_ID,
      resourceKey: "workspaces",
      currentValue: "8",
      lastRecordedAt: new Date(),
    });
    const snapshot = await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    expect(snapshot.counters["workspaces"]).toBe(8);
    expect(snapshot.limits["workspaces"]).toBe(10);
    expect(snapshot.thresholds["workspaces"]!.level).toBe("warning");
    expect(snapshot.thresholds["workspaces"]!.percent).toBe(80);
  });

  it("reports 'urgent' when value crosses the 90% threshold", async () => {
    limitMap.set("workspaces", 10);
    counterRows.push({
      agencyId: AGENCY_ID,
      resourceKey: "workspaces",
      currentValue: "9",
      lastRecordedAt: new Date(),
    });
    const snapshot = await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    expect(snapshot.thresholds["workspaces"]!.level).toBe("urgent");
    expect(snapshot.thresholds["workspaces"]!.percent).toBe(90);
  });

  it("reports 'over_limit' when value exceeds the limit", async () => {
    limitMap.set("workspaces", 10);
    counterRows.push({
      agencyId: AGENCY_ID,
      resourceKey: "workspaces",
      currentValue: "15",
      lastRecordedAt: new Date(),
    });
    const snapshot = await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    expect(snapshot.thresholds["workspaces"]!.level).toBe("over_limit");
    expect(snapshot.thresholds["workspaces"]!.percent).toBe(150);
  });
});

// ─── Null limit branch ───────────────────────────────────────────────

describe("getUsage: null limit branch", () => {
  it("reports level='healthy' and percent=null when limit is null", async () => {
    counterRows.push({
      agencyId: AGENCY_ID,
      resourceKey: "workspaces",
      currentValue: "5",
      lastRecordedAt: new Date(),
    });
    const snapshot = await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    expect(snapshot.limits["workspaces"]).toBeNull();
    expect(snapshot.thresholds["workspaces"]!.level).toBe("healthy");
    expect(snapshot.thresholds["workspaces"]!.percent).toBeNull();
  });
});

// ─── Snapshot shape contract ─────────────────────────────────────────

describe("getUsage: snapshot shape", () => {
  it("returns an object with counters, thresholds, limits — one entry per known resource", async () => {
    const snapshot = await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    expect(Object.keys(snapshot.counters).sort()).toEqual([...KNOWN_RESOURCES].sort());
    expect(Object.keys(snapshot.thresholds).sort()).toEqual([...KNOWN_RESOURCES].sort());
    expect(Object.keys(snapshot.limits).sort()).toEqual([...KNOWN_RESOURCES].sort());
  });

  it("issues exactly one counter SELECT (the counter-set read)", async () => {
    await getUsage(dbMock as unknown as Parameters<typeof getUsage>[0], AGENCY_ID);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });
});
