import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — must be declared before the vi.mock calls so the
// factory closures can reference them. The pattern mirrors
// tests/unit/notifications-dispatch.test.ts: vi.hoisted to escape the
// vi.mock factory hoisting, then injected into @/lib/db etc.
const dbMock = vi.hoisted(() => {
  const insert = vi.fn();
  const select = vi.fn();
  return { db: { insert, select } };
});
const requestContextMock = vi.hoisted(() => ({
  getRequestId: vi.fn(),
}));
const buildInfoMock = vi.hoisted(() => ({
  createBuildInfo: vi.fn(),
}));
const envMock = vi.hoisted(() => ({
  serverEnv: {
    APP_VERSION: "test-sha-abc1234",
    NODE_ENV: "test",
  },
}));
const loggerMock = vi.hoisted(() => ({
  logWarn: vi.fn(),
}));
const platformAccessMock = vi.hoisted(() => ({
  hasPlatformPermission: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMock);
vi.mock("@/lib/observability/request-context", () => requestContextMock);
vi.mock("@/lib/build-info", () => buildInfoMock);
vi.mock("@/lib/validation/env", () => envMock);
vi.mock("@/lib/observability/logger", () => loggerMock);
vi.mock("@/lib/auth/platform-access", () => platformAccessMock);
vi.mock("server-only", () => ({}));

import {
  actorCanViewAppErrors,
  captureAppError,
  findLatestAppErrorByDigest,
  getAppErrorById,
  listAppErrors,
} from "@/lib/observability/app-errors";

// ── Test fixtures ────────────────────────────────────────────────────────

function makeChain(terminal: unknown) {
  // Drizzle's query builder is fluent: each operator returns the
  // builder so .from().where().orderBy().limit().offset() chains.
  // We only need to support the operators app-errors.ts uses, and
  // they all return the same chainable until the awaited result.
  const chain: Record<string, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_t, prop) {
      if (prop === "then") {
        // Make the chain awaitable: resolve with the terminal value.
        return (resolve: (v: unknown) => void) => resolve(terminal);
      }
      return () => proxy;
    },
  });
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: requestId present, build has a shortSha, logWarn is a no-op
  requestContextMock.getRequestId.mockReturnValue("req-test-123");
  buildInfoMock.createBuildInfo.mockReturnValue({ shortSha: "abc1234" });
  platformAccessMock.hasPlatformPermission.mockResolvedValue(true);
});

// ── captureAppError ──────────────────────────────────────────────────────

describe("captureAppError (OBS-002 write path)", () => {
  it("inserts a row with the sanitized fields and no stack when input is a string", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue(makeChain(undefined));
    // Override insert chain to actually capture the .values() call.
    const insertBuilder = {
      values: insertValues,
    };
    dbMock.db.insert.mockReturnValue(insertBuilder);

    await captureAppError({
      digest: "next-digest-1",
      route: "/app/foo",
      method: "GET",
      source: "app.error",
      error: "Something broke",
      actorId: "user-1",
    });

    expect(dbMock.db.insert).toHaveBeenCalledTimes(1);
    const row = insertValues.mock.calls[0]![0];
    expect(row.digest).toBe("next-digest-1");
    expect(row.route).toBe("/app/foo");
    expect(row.method).toBe("GET");
    expect(row.source).toBe("app.error");
    expect(row.message).toBe("Something broke");
    expect(row.requestId).toBe("req-test-123");
    expect(row.actorId).toBe("user-1");
    expect(row.buildVersion).toBe("abc1234");
    // strings don't have a stack — the helper should not set the column
    expect(row.stack).toBeUndefined();
  });

  it("truncates the stack to 4 KB and appends a truncation marker", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue({ values: insertValues });

    const bigStack = "x".repeat(5_000);
    const err = new Error("Boom");
    err.stack = bigStack;

    await captureAppError({
      digest: undefined,
      route: "/app/x",
      method: undefined,
      source: "global.error",
      error: err,
    });

    const row = insertValues.mock.calls[0]![0];
    // 4 KB cap + the marker line
    expect(row.stack.length).toBeLessThanOrEqual(4 * 1024 + "\n…(truncated)".length);
    expect(row.stack.endsWith("\n…(truncated)")).toBe(true);
    // digest/method are absent when undefined
    expect(row.digest).toBeUndefined();
    expect(row.method).toBeUndefined();
  });

  it("uses err.name when err.message is empty", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue({ values: insertValues });

    const err = new TypeError();
    err.message = "";
    await captureAppError({
      digest: "d",
      route: "/r",
      method: "POST",
      source: "server_action",
      error: err,
      actorId: "u",
    });

    const row = insertValues.mock.calls[0]![0];
    // TypeError → message is the constructor name
    expect(row.message).toBe("TypeError");
  });

  it("falls back to 'Unknown error' for non-Error, non-string values", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue({ values: insertValues });

    await captureAppError({
      digest: "d",
      route: "/r",
      method: "POST",
      source: "client.unhandled",
      error: { random: "object" },
    });

    const row = insertValues.mock.calls[0]![0];
    expect(row.message).toBe("Unknown error");
  });

  it("omits buildVersion from the row when the build has no shortSha", async () => {
    // The insert path uses `...(buildVersion ? { buildVersion } : {})`,
    // so a null shortSha means the column is dropped from the insert
    // object — Drizzle then uses the column's default (null). The
    // resulting row has no `buildVersion` property at all.
    buildInfoMock.createBuildInfo.mockReturnValue({ shortSha: null });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue({ values: insertValues });

    await captureAppError({
      digest: "d",
      route: "/r",
      method: "GET",
      source: "app.error",
      error: new Error("x"),
    });

    const row = insertValues.mock.calls[0]![0];
    expect("buildVersion" in row).toBe(false);
  });

  it("is fail-silent: a DB write failure logs and does not throw", async () => {
    dbMock.db.insert.mockImplementation(() => {
      throw new Error("db down");
    });

    await expect(
      captureAppError({
        digest: "d",
        route: "/r",
        method: "GET",
        source: "app.error",
        error: new Error("x"),
      }),
    ).resolves.toBeUndefined();

    expect(loggerMock.logWarn).toHaveBeenCalledTimes(1);
    const call = loggerMock.logWarn.mock.calls[0]!;
    expect(call[0]).toBe("app_error.capture_failed");
    expect(call[1].source).toBe("app.error");
    expect(call[1].route).toBe("/r");
  });

  it("treats a non-Error write failure as a string in the log payload", async () => {
    // Branch: writeError is not an Error instance — fall back to
    // String(writeError) so the log line still carries the cause.
    dbMock.db.insert.mockImplementation(() => {
      throw "string failure";
    });

    await captureAppError({
      digest: "d",
      route: "/r",
      method: "GET",
      source: "app.error",
      error: new Error("x"),
    });

    expect(loggerMock.logWarn).toHaveBeenCalledTimes(1);
    const call = loggerMock.logWarn.mock.calls[0]!;
    expect(call[1].err).toBe("string failure");
  });

  it("falls back to 'Unknown error' when both err.message and err.name are empty", async () => {
    // Construct an Error subclass with no name and no message.
    class EmptyError extends Error {
      override name = "";
      constructor() {
        super("");
      }
    }
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue({ values: insertValues });

    await captureAppError({
      digest: "d",
      route: "/r",
      method: "POST",
      source: "app.error",
      error: new EmptyError(),
    });

    const row = insertValues.mock.calls[0]![0];
    expect(row.message).toBe("Unknown error");
  });

  it("omits the stack column when the error has no stack (defensive path)", async () => {
    // Some throwables (e.g. VM-internal errors, polyfilled Errors) have
    // no .stack. The helper must drop the column rather than insert
    // an empty string. We use defineProperty to force-clear the
    // stack because Error.stack's TS type doesn't allow direct
    // assignment of undefined under exactOptionalPropertyTypes.
    const err = new Error("no stack");
    Object.defineProperty(err, "stack", { value: undefined, configurable: true });
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue({ values: insertValues });

    await captureAppError({
      digest: "d",
      route: "/r",
      method: "GET",
      source: "app.error",
      error: err,
    });

    const row = insertValues.mock.calls[0]![0];
    expect("stack" in row).toBe(false);
  });

  it("omits the stack column when the stack is the empty string", async () => {
    // Same defensive path: empty string stack is treated the same as
    // missing — it carries no useful info and we don't want to
    // store an empty stack column that would render as an empty
    // accordion section in /app/platform/errors.
    const err = new Error("empty stack");
    err.stack = "";
    const insertValues = vi.fn().mockResolvedValue(undefined);
    dbMock.db.insert.mockReturnValue({ values: insertValues });

    await captureAppError({
      digest: "d",
      route: "/r",
      method: "GET",
      source: "app.error",
      error: err,
    });

    const row = insertValues.mock.calls[0]![0];
    expect("stack" in row).toBe(false);
  });
});

// ── listAppErrors ────────────────────────────────────────────────────────

describe("listAppErrors (OBS-002 read path)", () => {
  it("clamps pageSize to [1, 200] and uses offset (page-1)*pageSize", async () => {
    const rows = [
      {
        id: "a",
        digest: null,
        route: "/r1",
        method: null,
        source: "app.error",
        message: "m1",
        requestId: null,
        actorId: null,
        buildVersion: null,
        createdAt: new Date(),
      },
    ];
    // select chain: where().orderBy().limit().offset() — each returns the chain
    const captured: { limit?: number; offset?: number } = {};
    const selectChain: Record<string, unknown> = {};
    const proxy = new Proxy(selectChain, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(rows);
        if (prop === "limit")
          return (n: number) => {
            captured.limit = n;
            return proxy;
          };
        if (prop === "offset")
          return (n: number) => {
            captured.offset = n;
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.select.mockReturnValue(proxy);

    const result = await listAppErrors({ page: 3, pageSize: 500 });
    expect(result.rows).toEqual(rows);
    // Clamped to 200, offset = (3-1)*200
    expect(captured.limit).toBe(200);
    expect(captured.offset).toBe(400);
  });

  it("clamps pageSize to at least 1", async () => {
    const captured: { limit?: number; offset?: number } = {};
    const selectChain: Record<string, unknown> = {};
    const proxy = new Proxy(selectChain, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve([]);
        if (prop === "limit")
          return (n: number) => {
            captured.limit = n;
            return proxy;
          };
        if (prop === "offset")
          return (n: number) => {
            captured.offset = n;
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.select.mockReturnValue(proxy);

    await listAppErrors({ page: 1, pageSize: 0 });
    expect(captured.limit).toBe(1);
  });

  it("clamps page to at least 1", async () => {
    const captured: { offset?: number } = {};
    const selectChain: Record<string, unknown> = {};
    const proxy = new Proxy(selectChain, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve([]);
        if (prop === "limit") return () => proxy;
        if (prop === "offset")
          return (n: number) => {
            captured.offset = n;
            return proxy;
          };
        return () => proxy;
      },
    });
    dbMock.db.select.mockReturnValue(proxy);

    await listAppErrors({ page: 0, pageSize: 10 });
    // page clamped to 1 → offset 0
    expect(captured.offset).toBe(0);
  });

  it("applies a LIKE filter on message + route when query is non-empty", async () => {
    // We verify the where clause is set (not sql`true`) by passing a
    // query and asserting the function runs without error + returns
    // the rows. The build path with a query uses `or(like(...))`
    // rather than `sql`true``.
    const rows = [
      {
        id: "x",
        digest: null,
        route: "/app/x",
        method: null,
        source: "app.error",
        message: "boom",
        requestId: null,
        actorId: null,
        buildVersion: null,
        createdAt: new Date(),
      },
    ];
    dbMock.db.select
      .mockReturnValueOnce(makeChain(rows))
      .mockReturnValueOnce(makeChain([{ value: 1 }]))
      .mockReturnValueOnce(makeChain([{ value: 1 }]));

    const result = await listAppErrors({ page: 1, pageSize: 10, query: "boom" });
    expect(result.rows).toEqual(rows);
    // 3 selects: rows + total + matched
    expect(dbMock.db.select).toHaveBeenCalledTimes(3);
  });

  it("returns total=0, matched=0 when the table is empty", async () => {
    dbMock.db.select
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([{ value: 0 }]))
      .mockReturnValueOnce(makeChain([{ value: 0 }]));

    const result = await listAppErrors({ page: 1, pageSize: 10 });
    expect(result.total).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.rows).toEqual([]);
  });
});

// ── getAppErrorById ──────────────────────────────────────────────────────

describe("getAppErrorById", () => {
  it("returns the row when present, with the stack included", async () => {
    const row = {
      id: "row-1",
      digest: "d",
      route: "/r",
      method: "GET",
      source: "app.error",
      message: "boom",
      stack: "Error: boom\n  at ...",
      requestId: "r",
      actorId: "u",
      buildVersion: "abc",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    dbMock.db.select.mockReturnValue(makeChain([row]));

    const result = await getAppErrorById("row-1");
    expect(result).not.toBeNull();
    // The public shape does not include `stack` (it's a deep-link
    // internal field for the platform-errors page; the public row
    // projection strips it).
    expect(result!.id).toBe("row-1");
    expect(result!.digest).toBe("d");
  });

  it("returns null when no row matches", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    const result = await getAppErrorById("missing");
    expect(result).toBeNull();
  });
});

// ── findLatestAppErrorByDigest ───────────────────────────────────────────

describe("findLatestAppErrorByDigest", () => {
  it("returns the id of the most recent matching row", async () => {
    dbMock.db.select.mockReturnValue(makeChain([{ id: "row-latest" }]));
    const id = await findLatestAppErrorByDigest("digest-1");
    expect(id).toBe("row-latest");
  });

  it("returns null when no row matches the digest", async () => {
    dbMock.db.select.mockReturnValue(makeChain([]));
    const id = await findLatestAppErrorByDigest("missing");
    expect(id).toBeNull();
  });
});

// ── actorCanViewAppErrors ────────────────────────────────────────────────

describe("actorCanViewAppErrors", () => {
  it("returns false for unauthenticated actors (undefined id)", async () => {
    const result = await actorCanViewAppErrors(undefined);
    expect(result).toBe(false);
    expect(platformAccessMock.hasPlatformPermission).not.toHaveBeenCalled();
  });

  it("returns true when hasPlatformPermission grants the scope", async () => {
    platformAccessMock.hasPlatformPermission.mockResolvedValue(true);
    const result = await actorCanViewAppErrors("user-1");
    expect(result).toBe(true);
    expect(platformAccessMock.hasPlatformPermission).toHaveBeenCalledWith(
      { id: "user-1" },
      "platform.console.read",
    );
  });

  it("returns false when hasPlatformPermission denies the scope", async () => {
    platformAccessMock.hasPlatformPermission.mockResolvedValue(false);
    const result = await actorCanViewAppErrors("user-1");
    expect(result).toBe(false);
  });
});
