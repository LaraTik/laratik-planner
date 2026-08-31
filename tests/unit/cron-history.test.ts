import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 1 unit tests — `src/lib/cron/history.ts`.
 *
 * The route layer (`/api/cron/social-metrics/route.ts`) is the only
 * writer; the platform-admin Cron health page (Phase 2) and the
 * "Run now" audit hook (Phase 3) are the readers. This test pins
 * the contract for both directions:
 *
 *   - `recordCronTick` is best-effort: a wedged history table
 *     returns `null` and fans a tagged Sentry event instead of
 *     throwing. The cron itself never sees the failure.
 *   - The insert payload preserves every documented field
 *     (claimed / succeeded / failed / needsReauth / skipped /
 *     kekStatus / retention / errorText / triggeredBy / requestId).
 *   - Read helpers (latest / rollup / recent / active names)
 *     build the right Drizzle chain — `(cron_name, started_at DESC)`
 *     ordering, the right `gte(since)` for the rollup, the
 *     `limit(50)` cap on the recent list, and the `selectDistinct`
 *     on the active-names query.
 *
 * The DB is mocked with a fluent chain (the established pattern
 * in `tests/unit/agency-actions.test.ts`). The `captureError`
 * wrapper is mocked so the test can assert the Sentry fan-out
 * fires on failure without depending on the Sentry SDK.
 */

const mocks = vi.hoisted(() => {
  // Each `returning`, `limit`, `orderBy`, etc. returns a fresh
  // chain object. The test mutates the per-call resolved values
  // (returningRows, limitRows, etc.) before invoking the helper
  // so the chain yields the desired row.
  const returningRows: unknown[] = [];
  const limitRows: unknown[] = [];
  const selectDistinctRows: unknown[] = [];
  return {
    returningRows,
    limitRows,
    selectDistinctRows,
    captureError: vi.fn(),
  };
});

function buildInsertChain() {
  const returning = vi.fn(() => Promise.resolve(mocks.returningRows));
  // The values function is invoked with a single typed arg (the
  // insert payload). The typed parameter makes `.mock.calls[0]?.[0]`
  // resolve to `Record<string, unknown>` instead of `unknown`, so
  // the assertions can read fields off the payload without an
  // `as` cast. The `Object.keys` reference keeps the parameter
  // "used" so the strict no-unused-vars lint rule is satisfied
  // (the underscore-prefix convention is not configured for this
  // parameter set in the project).
  const values = vi.fn((payload: Record<string, unknown>) => {
    void Object.keys(payload);
    return { returning } as { returning: typeof returning };
  });
  const insert = vi.fn(() => ({ values }));
  return { insert, values, returning };
}

function buildSelectChain() {
  const limit = vi.fn(() => Promise.resolve(mocks.limitRows));
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy, limit });
  const from = vi.fn().mockReturnValue({ where, orderBy, limit });
  const select = vi.fn().mockReturnValue({ from });
  return { select, from, where, orderBy, limit };
}

function buildSelectDistinctChain() {
  const orderBy = vi.fn(() => Promise.resolve(mocks.selectDistinctRows));
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where, orderBy });
  const selectDistinct = vi.fn(() => ({ from }));
  return { selectDistinct, from, where, orderBy };
}

const insertChain = buildInsertChain();
const selectChain = buildSelectChain();
const selectDistinctChain = buildSelectDistinctChain();

// `db` is a single object whose `insert` / `select` / `selectDistinct`
// are stable function references. Each test resets the resolved
// rows and re-runs the chain.
const db = {
  insert: insertChain.insert,
  select: selectChain.select,
  selectDistinct: selectDistinctChain.selectDistinct,
};

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/observability/sentry", () => ({
  captureError: mocks.captureError,
}));
vi.mock("@/lib/observability/request-context", () => ({
  getRequestId: () => "req-test-1",
}));

// Import AFTER mocks so the module under test sees them.
const {
  recordCronTick,
  getLatestTickForCron,
  getTickRollup,
  getRecentTicksForCron,
  getActiveCronNames,
} = await import("@/lib/cron/history");

describe("recordCronTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returningRows = [];
    mocks.limitRows = [];
    mocks.selectDistinctRows = [];
  });

  it("writes the documented payload and returns the new id", async () => {
    mocks.returningRows = [{ id: 42 }];
    const id = await recordCronTick({
      cronName: "social-metrics",
      startedAt: new Date("2026-08-31T12:00:00Z"),
      finishedAt: new Date("2026-08-31T12:00:05Z"),
      outcome: "success",
      claimed: 18,
      succeeded: 17,
      failed: 1,
      needsReauth: 0,
      skipped: 0,
      kekStatus: "ok",
      retention: { oauthStatesDeleted: 3, oldMetricsDeleted: 0 },
      errorText: null,
      triggeredBy: "cron",
    });
    expect(id).toBe(42);
    expect(insertChain.insert).toHaveBeenCalledTimes(1);
    const valuesArg = insertChain.values.mock.calls[0]?.[0];
    expect(valuesArg?.["cronName"]).toBe("social-metrics");
    expect(valuesArg?.["outcome"]).toBe("success");
    expect(valuesArg?.["claimed"]).toBe(18);
    expect(valuesArg?.["succeeded"]).toBe(17);
    expect(valuesArg?.["failed"]).toBe(1);
    expect(valuesArg?.["needsReauth"]).toBe(0);
    expect(valuesArg?.["skipped"]).toBe(0);
    expect(valuesArg?.["kekStatus"]).toBe("ok");
    expect(valuesArg?.["triggeredBy"]).toBe("cron");
    // requestId is sourced from the mocked request context
    expect(valuesArg?.["requestId"]).toBe("req-test-1");
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it("preserves the 'flag-off' short-circuit (outcome=skipped, all counters zero)", async () => {
    mocks.returningRows = [{ id: 7 }];
    const id = await recordCronTick({
      cronName: "social-metrics",
      startedAt: new Date(),
      finishedAt: new Date(),
      outcome: "skipped",
      claimed: 0,
      succeeded: 0,
      failed: 0,
      needsReauth: 0,
      skipped: 0,
      kekStatus: null,
      retention: {},
      errorText: null,
      triggeredBy: "cron",
    });
    expect(id).toBe(7);
    const valuesArg = insertChain.values.mock.calls[0]?.[0];
    expect(valuesArg?.["outcome"]).toBe("skipped");
    expect(valuesArg?.["claimed"]).toBe(0);
  });

  it("records exception outcome with the error text", async () => {
    mocks.returningRows = [{ id: 9 }];
    await recordCronTick({
      cronName: "social-metrics",
      startedAt: new Date(),
      finishedAt: new Date(),
      outcome: "error",
      claimed: 0,
      succeeded: 0,
      failed: 0,
      needsReauth: 0,
      skipped: 0,
      kekStatus: null,
      retention: {},
      errorText: "Meta Graph API: 503 service unavailable",
      triggeredBy: "cron",
    });
    const valuesArg = insertChain.values.mock.calls[0]?.[0];
    expect(valuesArg?.["outcome"]).toBe("error");
    expect(valuesArg?.["errorText"]).toBe("Meta Graph API: 503 service unavailable");
  });

  it("returns null and fans a tagged Sentry event when the insert throws", async () => {
    // Force the chain to throw on `.returning`.
    insertChain.returning.mockImplementationOnce(() => {
      throw new Error("relation 'cron_tick_history' does not exist");
    });
    const id = await recordCronTick({
      cronName: "social-metrics",
      startedAt: new Date(),
      finishedAt: new Date(),
      outcome: "success",
      claimed: 1,
      succeeded: 1,
      failed: 0,
      needsReauth: 0,
      skipped: 0,
      kekStatus: "ok",
      retention: {},
      errorText: null,
      triggeredBy: "cron",
    });
    expect(id).toBeNull();
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
    const [scope, err, ctx] = mocks.captureError.mock.calls[0] as [
      string,
      unknown,
      Record<string, unknown>,
    ];
    expect(scope).toBe("cron.history.write_failed");
    expect(err).toBeInstanceOf(Error);
    expect(ctx["cronName"]).toBe("social-metrics");
  });
});

describe("getLatestTickForCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limitRows = [];
  });

  it("builds (cron_name, started_at DESC) and maps the row to CronTickRow", async () => {
    const now = new Date("2026-08-31T12:00:00Z");
    mocks.limitRows = [
      {
        id: 11,
        cronName: "social-metrics",
        startedAt: now,
        finishedAt: now,
        outcome: "success",
        claimed: 4,
        succeeded: 4,
        failed: 0,
        needsReauth: 0,
        skipped: 0,
        kekStatus: "ok",
        errorText: null,
        triggeredBy: "cron",
        requestId: "req-1",
      },
    ];
    const row = await getLatestTickForCron("social-metrics");
    expect(row?.id).toBe(11);
    expect(row?.outcome).toBe("success");
    expect(selectChain.where).toHaveBeenCalledTimes(1);
    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(1);
  });

  it("returns null when no tick has been recorded", async () => {
    const row = await getLatestTickForCron("never-ticked");
    expect(row).toBeNull();
  });
});

describe("getTickRollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limitRows = [];
  });

  it("returns a zero rollup when no ticks fall in the window", async () => {
    const rollup = await getTickRollup("social-metrics", new Date());
    expect(rollup.ticks).toBe(0);
    expect(rollup.claimed).toBe(0);
    expect(rollup.lastErrorText).toBeNull();
  });

  it("aggregates claimed/succeeded/failed/needsReauth/skipped across the window", async () => {
    mocks.limitRows = [
      {
        outcome: "success",
        claimed: 10,
        succeeded: 9,
        failed: 1,
        needsReauth: 0,
        skipped: 0,
        errorText: null,
      },
      {
        outcome: "soft_deadline",
        claimed: 5,
        succeeded: 3,
        failed: 1,
        needsReauth: 1,
        skipped: 0,
        errorText: null,
      },
      {
        outcome: "error",
        claimed: 0,
        succeeded: 0,
        failed: 0,
        needsReauth: 0,
        skipped: 0,
        errorText: "Meta 503",
      },
      {
        outcome: "skipped",
        claimed: 0,
        succeeded: 0,
        failed: 0,
        needsReauth: 0,
        skipped: 0,
        errorText: null,
      },
    ];
    const rollup = await getTickRollup("social-metrics", new Date());
    expect(rollup.ticks).toBe(4);
    expect(rollup.claimed).toBe(15);
    expect(rollup.succeeded).toBe(12);
    expect(rollup.failed).toBe(2);
    expect(rollup.needsReauth).toBe(1);
    expect(rollup.successCount).toBe(1);
    expect(rollup.softDeadlineCount).toBe(1);
    expect(rollup.errorCount).toBe(1);
    expect(rollup.skippedFlagOffCount).toBe(1);
    expect(rollup.lastErrorText).toBe("Meta 503");
  });
});

describe("getRecentTicksForCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limitRows = [];
  });

  it("caps at 50 by default and returns the mapped rows", async () => {
    const now = new Date("2026-08-31T12:00:00Z");
    mocks.limitRows = [
      {
        id: 1,
        cronName: "social-metrics",
        startedAt: now,
        finishedAt: now,
        outcome: "success",
        claimed: 0,
        succeeded: 0,
        failed: 0,
        needsReauth: 0,
        skipped: 0,
        kekStatus: null,
        errorText: null,
        triggeredBy: "cron",
        requestId: null,
      },
    ];
    const rows = await getRecentTicksForCron("social-metrics");
    expect(rows).toHaveLength(1);
    expect(selectChain.limit).toHaveBeenCalledWith(50);
  });

  it("honors an explicit limit", async () => {
    mocks.limitRows = [];
    await getRecentTicksForCron("social-metrics", 10);
    expect(selectChain.limit).toHaveBeenCalledWith(10);
  });
});

describe("getActiveCronNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectDistinctRows = [];
  });

  it("returns the distinct cron names from the last-window", async () => {
    mocks.selectDistinctRows = [
      { cronName: "audit-retention" },
      { cronName: "outbox" },
      { cronName: "social-metrics" },
    ];
    const names = await getActiveCronNames(new Date());
    expect(names).toEqual(["audit-retention", "outbox", "social-metrics"]);
  });
});
