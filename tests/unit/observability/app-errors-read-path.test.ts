import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OBS-002 read path + burst limiter + retention.
 *
 * `tests/unit/observability-app-errors.test.ts` owns the `captureAppError`
 * write path and the simple reads. This file owns everything else in
 * `src/lib/observability/app-errors.ts`:
 *
 *   - the per-fingerprint burst limiter (`takeBurstSlot`, `sweepBurstWindows`,
 *     `rateLimitedOccurrenceCount`, `__resetBurstLimiter`) — the branch that
 *     keeps the table bounded while the occurrence count stays exact;
 *   - `listAppErrorGroups` (the triage queue) including the empty-`groupIds`
 *     short-circuit that must match *nothing*, not everything;
 *   - `triageAppErrorGroup` note handling and 500-char truncation;
 *   - `getAppErrorDiagnostics` (consumed by the MCP `diagnose` tool);
 *   - `getAppErrorHealth` (consumed by the error console);
 *   - `pruneAppErrorRetention` (30/90-day defaults and overrides).
 *
 * Mocking note: the Drizzle query builder is fluent, so each fake chain has to
 * be awaitable *and* support `.then(cb)`. Two of the five `getAppErrorDiagnostics`
 * queries use `.then(rows => rows.map(...))` before being awaited, so a
 * thenable that ignores the callback would silently return `undefined` instead
 * of the mapped array. `makeChain` below returns a real promise from `then`
 * so both `await chain` and `chain.then(cb)` behave correctly.
 */

const dbMock = vi.hoisted(() => {
  const insert = vi.fn();
  const select = vi.fn();
  // getAppErrorDiagnostics aggregates the distinct build/route/source sets
  // with `selectDistinct`, not `select`.
  const selectDistinct = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  return { db: { insert, select, selectDistinct, update, delete: del } };
});
const requestContextMock = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  getRequestLogs: vi.fn(),
}));
const buildInfoMock = vi.hoisted(() => ({
  createBuildInfo: vi.fn(),
}));
const envMock = vi.hoisted(() => ({
  serverEnv: { APP_VERSION: "test-sha-abc1234", NODE_ENV: "test" },
}));

vi.mock("@/lib/db", () => dbMock);
vi.mock("@/lib/observability/request-context", () => requestContextMock);
vi.mock("@/lib/build-info", () => buildInfoMock);
vi.mock("@/lib/validation/env", () => envMock);
vi.mock("@/lib/observability/logger", () => ({ logWarn: vi.fn() }));
vi.mock("server-only", () => ({}));

import {
  __resetBurstLimiter,
  captureAppError,
  getAppErrorDiagnostics,
  getAppErrorGroupByFingerprint,
  getAppErrorHealth,
  listAppErrorGroups,
  listAppErrors,
  pruneAppErrorRetention,
  rateLimitedOccurrenceCount,
  triageAppErrorGroup,
} from "@/lib/observability/app-errors";
import { appErrorEvents, appErrorGroups } from "@/lib/db/schema";

/** Row id the faked group upsert resolves to. */
const GROUP_ID = "11111111-1111-1111-1111-111111111111";

/**
 * A fluent, awaitable Drizzle stand-in.
 *
 * `then` returns a real promise so both `await chain` and
 * `chain.then(rows => rows.map(...))` resolve to the same value the
 * production code expects.
 */
function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

/** Group upsert returning a fixed id, plus a spy on the inserted values. */
function mockInserts(groupId: string | null = GROUP_ID) {
  const groupValues = vi.fn((payload: Record<string, unknown>) => {
    void Object.keys(payload);
    return {
      onConflictDoUpdate: () => ({
        returning: async () => (groupId ? [{ id: groupId }] : []),
      }),
    };
  });
  const eventValues = vi.fn().mockResolvedValue(undefined);
  dbMock.db.insert.mockImplementation((table: unknown) => {
    if (table === appErrorGroups) return { values: groupValues };
    return { values: eventValues };
  });
  return { groupValues, eventValues };
}

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GROUP_ID,
    fingerprint: "fp-1",
    errorName: "TypeError",
    sampleMessage: "boom",
    route: "/app/x",
    source: "app.error",
    occurrenceCount: 3,
    firstSeenAt: new Date("2026-01-01T00:00:00Z"),
    lastSeenAt: new Date("2026-01-02T00:00:00Z"),
    resolvedAt: null,
    triageNote: null,
    ...overrides,
  };
}

/** Capture one error with a caller-supplied message so each call fingerprints differently. */
async function capture(message: string, route = "/app/x") {
  await captureAppError({ route, method: "GET", source: "app.error", error: new Error(message) });
}

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` only clears call history — a pending `mockReturnValueOnce`
  // queue survives it and would shift the next test's query ordering. Drain
  // every builder mock explicitly so each test starts from a clean queue.
  dbMock.db.insert.mockReset();
  dbMock.db.select.mockReset();
  dbMock.db.selectDistinct.mockReset();
  dbMock.db.update.mockReset();
  dbMock.db.delete.mockReset();
  delete process.env["APP_ERROR_BURST_LIMIT"];
  requestContextMock.getRequestId.mockReturnValue("req-1");
  requestContextMock.getRequestLogs.mockReturnValue([]);
  buildInfoMock.createBuildInfo.mockReturnValue({ shortSha: "abc1234" });
  __resetBurstLimiter();
});

// ── Burst limiter ────────────────────────────────────────────────────────

describe("burst limiter", () => {
  it("caps the event row but keeps the group count exact", async () => {
    // The documented contract: past the cap only `occurrence_count` moves and
    // the individual event row is skipped, so the count stays exact while the
    // table stays bounded.
    process.env["APP_ERROR_BURST_LIMIT"] = "2";
    const { groupValues, eventValues } = mockInserts();

    await capture("same message");
    await capture("same message");
    await capture("same message");

    // 3 group upserts (count is exact) but only 2 event rows.
    expect(groupValues).toHaveBeenCalledTimes(3);
    expect(eventValues).toHaveBeenCalledTimes(2);
    expect(rateLimitedOccurrenceCount()).toBe(1);
  });

  it("counts each suppressed occurrence", async () => {
    process.env["APP_ERROR_BURST_LIMIT"] = "1";
    mockInserts();
    await capture("same");
    await capture("same");
    await capture("same");
    await capture("same");
    expect(rateLimitedOccurrenceCount()).toBe(3);
  });

  it("caps per fingerprint, not globally", async () => {
    // Two different errors each get their own allowance.
    process.env["APP_ERROR_BURST_LIMIT"] = "1";
    const { eventValues } = mockInserts();
    await capture("error A");
    await capture("error B");
    await capture("error A"); // capped
    expect(eventValues).toHaveBeenCalledTimes(2);
    expect(rateLimitedOccurrenceCount()).toBe(1);
  });

  it("a limit of 0 suppresses every event row", async () => {
    process.env["APP_ERROR_BURST_LIMIT"] = "0";
    const { groupValues, eventValues } = mockInserts();
    await capture("m");
    expect(groupValues).toHaveBeenCalledTimes(1);
    expect(eventValues).not.toHaveBeenCalled();
    expect(rateLimitedOccurrenceCount()).toBe(1);
  });

  it("falls back to the default of 20 for an unparseable limit", async () => {
    // `Number("not-a-number")` is NaN → not finite → default 20.
    process.env["APP_ERROR_BURST_LIMIT"] = "not-a-number";
    const { eventValues } = mockInserts();
    for (let i = 0; i < 20; i += 1) await capture("same");
    expect(eventValues).toHaveBeenCalledTimes(20);
    await capture("same");
    expect(eventValues).toHaveBeenCalledTimes(20);
    expect(rateLimitedOccurrenceCount()).toBe(1);
  });

  it("ignores a negative limit and uses the default", async () => {
    process.env["APP_ERROR_BURST_LIMIT"] = "-5";
    const { eventValues } = mockInserts();
    for (let i = 0; i < 20; i += 1) await capture("same");
    expect(eventValues).toHaveBeenCalledTimes(20);
  });

  it("floors a fractional limit", async () => {
    process.env["APP_ERROR_BURST_LIMIT"] = "2.9";
    const { eventValues } = mockInserts();
    await capture("same");
    await capture("same");
    await capture("same");
    // floored to 2 → third call is capped
    expect(eventValues).toHaveBeenCalledTimes(2);
    expect(rateLimitedOccurrenceCount()).toBe(1);
  });

  it("opens a fresh window after the burst period elapses", async () => {
    // The window is 60s wide. Advancing the fake clock past it must restore
    // the full allowance instead of staying permanently capped.
    process.env["APP_ERROR_BURST_LIMIT"] = "1";
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);
    mockInserts();
    await capture("same");
    expect(rateLimitedOccurrenceCount()).toBe(0);

    nowSpy.mockReturnValue(1_000 + 60_000);
    await capture("same");
    // A new window opened, so this one was NOT capped.
    expect(rateLimitedOccurrenceCount()).toBe(0);
    nowSpy.mockRestore();
  });

  it("sweeps stale windows once the map grows past 1000 entries", async () => {
    // `sweepBurstWindows` only runs its delete loop at >= 1000 entries, so
    // drive 1001 distinct fingerprints with a limit high enough that nothing
    // is capped — the counters then prove the sweep path executed without
    // throwing and the limiter keeps working afterwards.
    process.env["APP_ERROR_BURST_LIMIT"] = "100000";
    mockInserts();
    for (let i = 0; i < 1001; i += 1) {
      await capture(`error ${i}`);
    }
    expect(rateLimitedOccurrenceCount()).toBe(0);
  });

  it("__resetBurstLimiter clears both the windows and the capped counter", async () => {
    process.env["APP_ERROR_BURST_LIMIT"] = "1";
    mockInserts();
    await capture("same");
    await capture("same");
    expect(rateLimitedOccurrenceCount()).toBe(1);
    __resetBurstLimiter();
    expect(rateLimitedOccurrenceCount()).toBe(0);
  });

  it("evicts entries older than two windows once the map is large", async () => {
    // The sweep exists so a long-lived process cannot grow the map without
    // bound. It only runs its delete loop at >= 1000 entries, so fill the map
    // at T, jump past two windows, then push it over the threshold and prove
    // the limiter keeps working afterwards.
    process.env["APP_ERROR_BURST_LIMIT"] = "100000";
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);
    mockInserts();

    for (let i = 0; i < 1000; i += 1) await capture(`error ${i}`);
    // 1000 entries, all created at T: the sweep runs but nothing is old enough.
    nowSpy.mockReturnValue(1_000 + 3 * 60_000);
    // The 1001st capture crosses the threshold and sweeps the stale entries.
    await capture("error 0 again");

    // The limiter still functions after the eviction pass.
    await capture("post-sweep");
    expect(rateLimitedOccurrenceCount()).toBe(0);
    nowSpy.mockRestore();
  });
});

// ── Context assembly and user-agent hashing ──────────────────────────────

describe("captureAppError context + user agent", () => {
  it("attaches a bounded copy of the request log buffer", async () => {
    requestContextMock.getRequestLogs.mockReturnValue([
      { ts: "2026-01-01T00:00:00.000Z", level: "error", event: "boom", ctx: { a: 1 } },
      { ts: "2026-01-01T00:00:01.000Z", level: "warn", event: "meh", ctx: {} },
    ]);
    const { eventValues } = mockInserts();

    await captureAppError({
      route: "/app/x",
      method: "GET",
      source: "app.error",
      error: new Error("boom"),
      context: { tenantId: "t-1" },
    });

    const row = eventValues.mock.calls[0]![0];
    // Caller context is preserved…
    expect(row.context.tenantId).toBe("t-1");
    // …and the sanitized log buffer rides along as a trimmed projection.
    expect(row.context.logs).toEqual([
      { ts: "2026-01-01T00:00:00.000Z", level: "error", event: "boom", ctx: { a: 1 } },
      { ts: "2026-01-01T00:00:01.000Z", level: "warn", event: "meh", ctx: {} },
    ]);
  });

  it("omits the logs key when the buffer is empty", async () => {
    requestContextMock.getRequestLogs.mockReturnValue([]);
    const { eventValues } = mockInserts();
    await capture("no logs");
    expect("logs" in eventValues.mock.calls[0]![0].context).toBe(false);
  });

  it("stores a truncated SHA-256 of the user agent, never the raw string", async () => {
    const { eventValues } = mockInserts();
    const rawUa = "Mozilla/5.0 (Macintosh) secret-fingerprint";

    await captureAppError({
      route: "/app/x",
      method: "GET",
      source: "app.error",
      error: new Error("boom"),
      userAgent: rawUa,
    });

    const row = eventValues.mock.calls[0]![0];
    expect(row.userAgentHash).toMatch(/^[0-9a-f]{32}$/);
    // A raw UA is a stable cross-session identifier, so it must never land.
    expect(JSON.stringify(row)).not.toContain(rawUa);
  });

  it("omits the hash entirely when no user agent is supplied", async () => {
    const { eventValues } = mockInserts();
    await capture("no ua");
    expect("userAgentHash" in eventValues.mock.calls[0]![0]).toBe(false);
  });

  it("keeps the requestId supplied by the caller over the ambient one", async () => {
    requestContextMock.getRequestId.mockReturnValue("ambient");
    const { eventValues } = mockInserts();
    await captureAppError({
      route: "/app/x",
      method: "GET",
      source: "app.error",
      error: new Error("boom"),
      requestId: "explicit",
    });
    expect(eventValues.mock.calls[0]![0].requestId).toBe("explicit");
  });

  it("records the Next.js onRequestError route metadata", async () => {
    const { eventValues } = mockInserts();
    await captureAppError({
      route: "/app/x",
      method: "POST",
      source: "server_action",
      error: new Error("boom"),
      routeType: "action",
      routePath: "/app/x/action",
    });
    const row = eventValues.mock.calls[0]![0];
    expect(row.routeType).toBe("action");
    expect(row.routePath).toBe("/app/x/action");
  });
});

// ── listAppErrors resolved filter ────────────────────────────────────────

describe("listAppErrors triage filter", () => {
  /** Capture the predicate handed to `.where()` for each of the three queries. */
  function capturePredicates(rows: unknown[]) {
    const wheres: unknown[] = [];
    let call = 0;
    dbMock.db.select.mockImplementation(() => {
      const terminal = call === 0 ? rows : [{ value: rows.length }];
      call += 1;
      const target: Record<string, unknown> = {};
      const proxy = new Proxy(target, {
        get(_t, prop) {
          if (prop === "then") {
            return (onFulfilled?: (v: unknown) => unknown) =>
              Promise.resolve(terminal).then(onFulfilled);
          }
          if (prop === "where")
            return (clause: unknown) => {
              wheres.push(clause);
              return proxy;
            };
          return () => proxy;
        },
      });
      return proxy;
    });
    return wheres;
  }

  it("builds a different predicate for resolved, unresolved, and unfiltered", async () => {
    const unfiltered = capturePredicates([]);
    await listAppErrors({ page: 1, pageSize: 10 });
    const noneClause = unfiltered[0];

    const resolved = capturePredicates([]);
    await listAppErrors({ page: 1, pageSize: 10, resolved: true });
    const resolvedClause = resolved[0];

    const unresolved = capturePredicates([]);
    await listAppErrors({ page: 1, pageSize: 10, resolved: false });
    const unresolvedClause = unresolved[0];

    // An event inherits its group's triage state, so resolved and
    // unresolved must be distinct predicates — and both must differ from
    // the no-filter case.
    expect(resolvedClause).not.toBe(noneClause);
    expect(unresolvedClause).not.toBe(noneClause);
    expect(resolvedClause).not.toBe(unresolvedClause);
  });

  it("still returns rows alongside the triage predicate", async () => {
    const rows = [
      {
        id: "a",
        digest: null,
        route: "/r",
        method: null,
        source: "app.error",
        message: "m",
        requestId: null,
        actorId: null,
        buildVersion: null,
        groupId: GROUP_ID,
        routeType: null,
        createdAt: new Date(),
      },
    ];
    capturePredicates(rows);
    const result = await listAppErrors({
      page: 1,
      pageSize: 10,
      resolved: true,
      groupId: GROUP_ID,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.matched).toBe(1);
  });
});

// ── listAppErrorGroups ───────────────────────────────────────────────────

describe("listAppErrorGroups", () => {
  it("clamps limit into [1, 200]", async () => {
    const captured: number[] = [];
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve([groupRow()]).then(onFulfilled);
        }
        if (prop === "limit")
          return (n: number) => {
            captured.push(n);
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.select.mockReturnValue(proxy);

    await listAppErrorGroups({ limit: 0 });
    await listAppErrorGroups({ limit: 5000 });
    expect(captured).toEqual([1, 200]);
  });

  it("returns an empty list without querying when groupIds is an empty array", async () => {
    // The explicit-empty case must match nothing. Returning every group here
    // would leak other tenants' triage queue into the diagnostics MCP.
    const result = await listAppErrorGroups({ limit: 10, groupIds: [] });
    expect(result).toEqual([]);
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });

  it("applies a filter combination without throwing", async () => {
    dbMock.db.select.mockReturnValue(makeChain([groupRow()]));
    const since = new Date("2026-01-01T00:00:00Z");
    const before = new Date("2026-02-01T00:00:00Z");

    const result = await listAppErrorGroups({
      limit: 10,
      since,
      before,
      source: "app.error",
      routePrefix: "/app",
      query: "boom",
      groupIds: [GROUP_ID],
      resolved: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.fingerprint).toBe("fp-1");
  });

  it("treats a whitespace-only query as no filter", async () => {
    dbMock.db.select.mockReturnValue(makeChain([groupRow()]));
    const result = await listAppErrorGroups({ limit: 10, query: "   " });
    expect(result).toHaveLength(1);
  });

  it("handles resolved:false and the no-filter case", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    expect(await listAppErrorGroups({ limit: 10, resolved: false })).toEqual([]);
    expect(await listAppErrorGroups({ limit: 10 })).toEqual([]);
  });
});

// ── getAppErrorGroupByFingerprint ────────────────────────────────────────

describe("getAppErrorGroupByFingerprint", () => {
  it("returns the row when the fingerprint exists", async () => {
    dbMock.db.select.mockReturnValue(makeChain([groupRow()]));
    const row = await getAppErrorGroupByFingerprint("fp-1");
    expect(row?.fingerprint).toBe("fp-1");
    expect(row?.occurrenceCount).toBe(3);
  });

  it("returns null for an unknown fingerprint", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    expect(await getAppErrorGroupByFingerprint("nope")).toBeNull();
  });
});

// ── triageAppErrorGroup ──────────────────────────────────────────────────

describe("triageAppErrorGroup", () => {
  it("resolves a group and stores the note", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve([groupRow({ resolvedAt: new Date() })]).then(onFulfilled);
        }
        if (prop === "set")
          return (payload: Record<string, unknown>) => {
            sets.push(payload);
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.update.mockReturnValue(proxy);

    const row = await triageAppErrorGroup({
      fingerprint: "fp-1",
      action: "resolve",
      note: " fixed ",
    });
    expect(row).not.toBeNull();
    // The note is trimmed before storage.
    expect(sets[0]!.triageNote).toBe("fixed");
    expect(sets[0]!.resolvedAt).toBeDefined();
    expect(sets[0]!.resolvedAt).not.toBeNull();
  });

  it("leaves the existing note untouched when resolve is called without one", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve([groupRow()]).then(onFulfilled);
        }
        if (prop === "set")
          return (payload: Record<string, unknown>) => {
            sets.push(payload);
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.update.mockReturnValue(proxy);

    await triageAppErrorGroup({ fingerprint: "fp-1", action: "resolve" });
    // No `triageNote` key at all → the column is not overwritten, so an
    // operator can resolve without destroying why it was previously triaged.
    expect("triageNote" in sets[0]!).toBe(false);
  });

  it("reopen clears resolvedAt", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve([groupRow()]).then(onFulfilled);
        }
        if (prop === "set")
          return (payload: Record<string, unknown>) => {
            sets.push(payload);
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.update.mockReturnValue(proxy);

    await triageAppErrorGroup({ fingerprint: "fp-1", action: "reopen" });
    expect(sets[0]!.resolvedAt).toBeNull();
    expect("triageNote" in sets[0]!).toBe(false);
  });

  it("truncates a note longer than 500 characters", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve([groupRow()]).then(onFulfilled);
        }
        if (prop === "set")
          return (payload: Record<string, unknown>) => {
            sets.push(payload);
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.update.mockReturnValue(proxy);

    await triageAppErrorGroup({
      fingerprint: "fp-1",
      action: "resolve",
      note: "n".repeat(900),
    });
    expect((sets[0]!.triageNote as string).length).toBe(500);
  });

  it("treats a whitespace-only note as absent", async () => {
    const sets: Array<Record<string, unknown>> = [];
    const target: Record<string, unknown> = {};
    const proxy = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") {
          return (onFulfilled?: (v: unknown) => unknown) =>
            Promise.resolve([groupRow()]).then(onFulfilled);
        }
        if (prop === "set")
          return (payload: Record<string, unknown>) => {
            sets.push(payload);
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.update.mockReturnValue(proxy);

    await triageAppErrorGroup({ fingerprint: "fp-1", action: "resolve", note: "   " });
    expect("triageNote" in sets[0]!).toBe(false);
  });

  it("returns null when the fingerprint matches no group", async () => {
    dbMock.db.update.mockReturnValue(makeChain([]));
    expect(await triageAppErrorGroup({ fingerprint: "gone", action: "resolve" })).toBeNull();
  });
});

// ── getAppErrorDiagnostics ───────────────────────────────────────────────

describe("getAppErrorDiagnostics", () => {
  /**
   * `getAppErrorDiagnostics` resolves the group first (one `select`), then
   * fans out five aggregates: the distinct build/route/source sets use
   * `selectDistinct`, the hourly histogram and the recent sample use `select`.
   * A call counter dispatches on order because the hourly and recent queries
   * both go through `select` and must return different rows.
   */
  function mockDiagnosticsQueries(
    rows: {
      builds: Array<{ buildVersion: string | null }>;
      routes: Array<{ route: string }>;
      sources: Array<{ source: string }>;
      hourly: Array<{ hour: string; count: number }>;
      recent: unknown[];
    },
    group: unknown[] | null,
  ) {
    let selectCall = 0;
    dbMock.db.select.mockImplementation(() => {
      const call = selectCall;
      selectCall += 1;
      if (call === 0) return makeChain(group);
      if (call === 1) return makeChain(rows.hourly);
      return makeChain(rows.recent);
    });
    dbMock.db.selectDistinct
      .mockReturnValueOnce(makeChain(rows.builds))
      .mockReturnValueOnce(makeChain(rows.routes))
      .mockReturnValueOnce(makeChain(rows.sources));
  }

  it("returns null for an unknown fingerprint without querying events", async () => {
    dbMock.db.select.mockReturnValueOnce(makeChain([]));
    expect(await getAppErrorDiagnostics("nope")).toBeNull();
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
  });

  it("assembles builds, routes, sources, hourly buckets and recent occurrences", async () => {
    mockDiagnosticsQueries(
      {
        builds: [{ buildVersion: "aaa1111" }, { buildVersion: "bbb2222" }],
        routes: [{ route: "/app/x" }, { route: "/app/y" }],
        sources: [{ source: "app.error" }],
        hourly: [
          { hour: "2026-01-01T00:00:00Z", count: 2 },
          { hour: "2026-01-01T01:00:00Z", count: 1 },
        ],
        recent: [{ id: "e1" }, { id: "e2" }],
      },
      [groupRow()],
    );

    const diag = await getAppErrorDiagnostics("fp-1");
    expect(diag).not.toBeNull();
    expect(diag!.group.id).toBe(GROUP_ID);
    expect(diag!.builds).toEqual(["aaa1111", "bbb2222"]);
    expect(diag!.routes).toEqual(["/app/x", "/app/y"]);
    expect(diag!.sources).toEqual(["app.error"]);
    expect(diag!.hourly).toHaveLength(2);
    expect(diag!.recent).toHaveLength(2);
    expect(diag!.cappedOccurrences).toBe(0);
  });

  it("drops null build versions from the builds list", async () => {
    // Rows written before a deploy had a build recorded carry a null
    // `buildVersion`; the aggregate must not surface them as `null` strings.
    mockDiagnosticsQueries(
      {
        builds: [{ buildVersion: "aaa1111" }, { buildVersion: null }],
        routes: [],
        sources: [],
        hourly: [],
        recent: [],
      },
      [groupRow()],
    );

    const diag = await getAppErrorDiagnostics("fp-1");
    expect(diag!.builds).toEqual(["aaa1111"]);
  });

  it("clamps sampleLimit into [1, 20] and defaults to 5", async () => {
    // Each call issues three `select` queries: group, hourly, recent. The
    // `recent` query is the one carrying `.limit(sampleLimit)`, so the
    // counter dispatches modulo 3 and records only that chain's limit.
    const limits: number[] = [];
    const recentChain = (() => {
      const target: Record<string, unknown> = {};
      const proxy = new Proxy(target, {
        get(_t, prop) {
          if (prop === "then") {
            return (onFulfilled?: (v: unknown) => unknown) => Promise.resolve([]).then(onFulfilled);
          }
          if (prop === "limit")
            return (n: number) => {
              limits.push(n);
              return proxy;
            };
          return () => proxy;
        },
      });
      return proxy;
    })();

    let call = 0;
    dbMock.db.select.mockImplementation(() => {
      call += 1;
      const idx = call % 3;
      if (idx === 1) return makeChain([groupRow()]);
      if (idx === 2) return makeChain([]);
      return recentChain;
    });
    dbMock.db.selectDistinct.mockReturnValue(makeChain([]));

    await getAppErrorDiagnostics("fp-1");
    expect(limits.at(-1)).toBe(5);

    limits.length = 0;
    await getAppErrorDiagnostics("fp-1", { sampleLimit: 500 });
    expect(limits.at(-1)).toBe(20);

    limits.length = 0;
    await getAppErrorDiagnostics("fp-1", { sampleLimit: 0 });
    expect(limits.at(-1)).toBe(1);
  });

  it("threads a `since` option through without throwing", async () => {
    mockDiagnosticsQueries({ builds: [], routes: [], sources: [], hourly: [], recent: [] }, [
      groupRow(),
    ]);
    const diag = await getAppErrorDiagnostics("fp-1", { since: new Date("2026-01-01T00:00:00Z") });
    expect(diag).not.toBeNull();
  });

  it("reports the process-wide capped occurrence count", async () => {
    process.env["APP_ERROR_BURST_LIMIT"] = "0";
    mockInserts();
    await capture("m");
    expect(rateLimitedOccurrenceCount()).toBe(1);

    mockDiagnosticsQueries({ builds: [], routes: [], sources: [], hourly: [], recent: [] }, [
      groupRow(),
    ]);
    const diag = await getAppErrorDiagnostics("fp-1");
    expect(diag!.cappedOccurrences).toBe(1);
  });
});

// ── getAppErrorHealth ────────────────────────────────────────────────────

describe("getAppErrorHealth", () => {
  /** lastHour, last24h, then topGroups. */
  function mockHealth(hour: number, day: number, top: unknown[]) {
    dbMock.db.select
      .mockReturnValueOnce(makeChain([{ value: hour }]))
      .mockReturnValueOnce(makeChain([{ value: day }]))
      .mockReturnValueOnce(makeChain(top));
  }

  it("reports both windows and the top unresolved groups", async () => {
    mockHealth(4, 9, [
      {
        fingerprint: "fp-1",
        occurrenceCount: 7,
        sampleMessage: "boom",
        route: "/app/x",
        lastSeenAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    const health = await getAppErrorHealth();
    expect(health.ok).toBe(true);
    expect(health.db).toBe("reachable");
    expect(health.lastHour).toBe(4);
    expect(health.last24h).toBe(9);
    expect(health.version).toBe("abc1234");
    expect(health.environment).toBe("test");
    expect(health.cappedOccurrences).toBe(0);
    expect(health.topGroups).toHaveLength(1);
    expect(health.topGroups[0]!.fingerprint).toBe("fp-1");
  });

  it("caps topGroups at three rows", async () => {
    const captured: number[] = [];
    const topRows = Array.from({ length: 5 }, (_, i) => ({
      fingerprint: `fp-${i}`,
      occurrenceCount: i,
      sampleMessage: "m",
      route: "/r",
      lastSeenAt: new Date(),
    }));
    const topChain = (() => {
      const target: Record<string, unknown> = {};
      const proxy = new Proxy(target, {
        get(_t, prop) {
          if (prop === "then") {
            return (onFulfilled?: (v: unknown) => unknown) =>
              Promise.resolve(topRows).then(onFulfilled);
          }
          if (prop === "limit")
            return (n: number) => {
              captured.push(n);
              return proxy;
            };
          return () => proxy;
        },
      });
      return proxy;
    })();

    dbMock.db.select
      .mockReturnValueOnce(makeChain([{ value: 1 }]))
      .mockReturnValueOnce(makeChain([{ value: 2 }]))
      .mockReturnValueOnce(topChain);

    await getAppErrorHealth();
    expect(captured).toEqual([3]);
  });

  it("returns a null version when the build has no short SHA", async () => {
    buildInfoMock.createBuildInfo.mockReturnValue({ shortSha: null });
    mockHealth(0, 0, []);
    const health = await getAppErrorHealth();
    expect(health.version).toBeNull();
    expect(health.topGroups).toEqual([]);
  });
});

// ── pruneAppErrorRetention ───────────────────────────────────────────────

describe("pruneAppErrorRetention", () => {
  function mockDeletes(events: string[], groups: string[]) {
    const wheres: unknown[] = [];
    dbMock.db.delete.mockImplementation((table: unknown) => {
      const result = table === appErrorEvents ? events : groups;
      const target: Record<string, unknown> = {};
      const proxy = new Proxy(target, {
        get(_t, prop) {
          if (prop === "then") {
            return (onFulfilled?: (v: unknown) => unknown) =>
              Promise.resolve(result.map((id) => ({ id }))).then(onFulfilled);
          }
          if (prop === "where")
            return (clause: unknown) => {
              wheres.push(clause);
              return proxy;
            };
          return () => proxy;
        },
      });
      return proxy;
    });
    return wheres;
  }

  it("defaults to 30-day events and 90-day groups", async () => {
    const wheres = mockDeletes(["e1", "e2"], ["g1"]);
    const before = Date.now();

    const result = await pruneAppErrorRetention();

    expect(result).toEqual({ eventsDeleted: 2, groupsDeleted: 1 });
    // One delete per table, and the group delete must carry the
    // "only once resolved" guard — an unresolved group is the thing an
    // operator still needs, so it must never age out silently.
    expect(dbMock.db.delete).toHaveBeenCalledTimes(2);
    expect(wheres).toHaveLength(2);
    expect(before).toBeGreaterThan(0);
  });

  it("returns zeroes when nothing aged out", async () => {
    mockDeletes([], []);
    expect(await pruneAppErrorRetention()).toEqual({ eventsDeleted: 0, groupsDeleted: 0 });
  });

  it("honours custom event and group day overrides", async () => {
    mockDeletes(["e1"], ["g1", "g2"]);
    const result = await pruneAppErrorRetention({ eventDays: 1, groupDays: 2 });
    expect(result).toEqual({ eventsDeleted: 1, groupsDeleted: 2 });
    expect(dbMock.db.delete).toHaveBeenCalledTimes(2);
  });
});
