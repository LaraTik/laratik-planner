import { describe, expect, it } from "vitest";
import {
  getRequestId,
  getRequestLogs,
  pushRequestLog,
  REQUEST_LOG_BUFFER_LIMIT,
  runWithRequestContext,
} from "@/lib/observability/request-context";

describe("request-context (AsyncLocalStorage)", () => {
  it("returns undefined when no context is active", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("exposes the requestId set via runWithRequestContext", () => {
    runWithRequestContext({ requestId: "trace-1" }, () => {
      expect(getRequestId()).toBe("trace-1");
    });
  });

  it("propagates the id through async boundaries (await)", async () => {
    await runWithRequestContext({ requestId: "trace-await" }, async () => {
      await Promise.resolve();
      expect(getRequestId()).toBe("trace-await");
      await new Promise((r) => setTimeout(r, 0));
      expect(getRequestId()).toBe("trace-await");
    });
  });

  it("isolates nested contexts (inner shadows outer)", () => {
    runWithRequestContext({ requestId: "outer" }, () => {
      expect(getRequestId()).toBe("outer");
      runWithRequestContext({ requestId: "inner" }, () => {
        expect(getRequestId()).toBe("inner");
      });
      // After inner unwinds, the outer value is restored.
      expect(getRequestId()).toBe("outer");
    });
  });

  it("the context is undefined once the scope unwinds", () => {
    runWithRequestContext({ requestId: "x" }, () => {
      expect(getRequestId()).toBe("x");
    });
    expect(getRequestId()).toBeUndefined();
  });
});

describe("request-context log ring buffer", () => {
  const entry = (i: number) => ({
    ts: new Date(1_700_000_000_000 + i).toISOString(),
    level: "warn" as const,
    event: `evt-${i}`,
    ctx: { i },
  });

  it("returns an empty array outside a request scope", () => {
    expect(getRequestLogs()).toEqual([]);
  });

  it("is a no-op outside a request scope", () => {
    expect(() => pushRequestLog(entry(0))).not.toThrow();
    expect(getRequestLogs()).toEqual([]);
  });

  it("retains pushed entries in order", () => {
    runWithRequestContext({ requestId: "r" }, () => {
      pushRequestLog(entry(1));
      pushRequestLog(entry(2));
      const logs = getRequestLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0]?.event).toBe("evt-1");
      expect(logs[1]?.event).toBe("evt-2");
    });
  });

  it(`caps at ${REQUEST_LOG_BUFFER_LIMIT} entries, evicting oldest first`, () => {
    runWithRequestContext({ requestId: "r" }, () => {
      for (let i = 0; i < REQUEST_LOG_BUFFER_LIMIT + 25; i += 1) pushRequestLog(entry(i));
      const logs = getRequestLogs();
      expect(logs).toHaveLength(REQUEST_LOG_BUFFER_LIMIT);
      // The surviving window is the most recent one — the lines adjacent
      // to the failure are the useful ones.
      expect(logs[0]?.event).toBe(`evt-${25}`);
      expect(logs[logs.length - 1]?.event).toBe(`evt-${REQUEST_LOG_BUFFER_LIMIT + 24}`);
    });
  });

  it("getRequestLogs is non-destructive so a second capture sees the same window", () => {
    runWithRequestContext({ requestId: "r" }, () => {
      pushRequestLog(entry(1));
      expect(getRequestLogs()).toHaveLength(1);
      expect(getRequestLogs()).toHaveLength(1);
    });
  });

  it("isolates the buffer between requests", () => {
    runWithRequestContext({ requestId: "a" }, () => {
      pushRequestLog(entry(1));
      expect(getRequestLogs()).toHaveLength(1);
    });
    runWithRequestContext({ requestId: "b" }, () => {
      expect(getRequestLogs()).toEqual([]);
    });
  });
});
