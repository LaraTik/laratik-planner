import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `onRequestError` is the single funnel for every server-side failure, so
 * these tests assert three things above all: the routeType → source
 * mapping is right, the persisted context is an *allowlist* that cannot
 * carry a credential, and the hook never throws (it is itself the
 * failure path).
 */

const appErrorsMock = vi.hoisted(() => ({ captureAppError: vi.fn() }));
const requestContextMock = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  getRequestLogs: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({ logError: vi.fn(), logWarn: vi.fn() }));

vi.mock("@/lib/observability/app-errors", () => appErrorsMock);
vi.mock("@/lib/observability/request-context", () => requestContextMock);
vi.mock("@/lib/observability/logger", () => loggerMock);
vi.mock("server-only", () => ({}));

import {
  buildRequestContext,
  handleRequestError,
  handleUncaughtException,
  handleUnhandledRejection,
  sourceForRouteType,
} from "@/lib/observability/on-request-error";

const noopSentry = vi.fn();
const capture = vi.fn().mockResolvedValue(undefined);

function req(overrides: Record<string, unknown> = {}) {
  return {
    path: "/api/tasks",
    method: "POST",
    headers: { "x-request-id": "req-abc" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  capture.mockResolvedValue(undefined);
  requestContextMock.getRequestId.mockReturnValue(undefined);
  requestContextMock.getRequestLogs.mockReturnValue([]);
});

describe("sourceForRouteType", () => {
  it("maps every documented routeType", () => {
    expect(sourceForRouteType("render")).toBe("server.render");
    expect(sourceForRouteType("route")).toBe("server.route");
    expect(sourceForRouteType("action")).toBe("server_action");
    expect(sourceForRouteType("proxy")).toBe("server.proxy");
  });

  it("defaults to server.route for an unknown or missing value", () => {
    expect(sourceForRouteType(undefined)).toBe("server.route");
  });
});

describe("buildRequestContext — allowlist", () => {
  it("records the framework context and the method/path", () => {
    const ctx = buildRequestContext(req(), {
      routerKind: "App Router",
      routeType: "route",
      routePath: "/api/tasks",
      renderSource: "react-server-components",
      revalidateReason: "on-demand",
      renderType: "dynamic",
    });
    expect(ctx).toMatchObject({
      routerKind: "App Router",
      routeType: "route",
      routePath: "/api/tasks",
      method: "POST",
      path: "/api/tasks",
    });
  });

  it("never carries a header value, only an allowlisted header NAME", () => {
    const ctx = buildRequestContext(
      req({
        headers: {
          "x-request-id": "req-abc",
          "user-agent": "Mozilla/5.0 (secret-ish fingerprint)",
          cookie: "authjs.session-token=super-secret",
          authorization: "Bearer sk-abcdefghij0123456789",
        },
      }),
      { routeType: "route" },
    );
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("sk-abcdefghij0123456789");
    expect(serialized).not.toContain("Mozilla");
    // The names are still useful for triage ("was this a cron call?").
    expect(ctx["headerNames"]).toEqual(["user-agent", "x-request-id"]);
  });

  it("omits cookie and authorization from the header name list", () => {
    const ctx = buildRequestContext(
      req({ headers: { cookie: "a=b", authorization: "Bearer x" } }),
      {},
    );
    expect(ctx["headerNames"]).toEqual([]);
  });

  it("tolerates a missing headers object", () => {
    expect(() => buildRequestContext({ path: "/x", method: "GET" } as never, {})).not.toThrow();
  });
});

describe("handleRequestError", () => {
  it("captures with the mapped source and the correlation id from the header", async () => {
    await handleRequestError(
      new Error("boom"),
      req(),
      { routeType: "route" },
      {
        capture,
        forwardToSentry: noopSentry,
      },
    );
    expect(capture).toHaveBeenCalledTimes(1);
    const arg = capture.mock.calls[0]![0];
    expect(arg.source).toBe("server.route");
    expect(arg.route).toBe("/api/tasks");
    expect(arg.method).toBe("POST");
    expect(arg.requestId).toBe("req-abc");
    expect(arg.routeType).toBe("route");
  });

  it("falls back to the AsyncLocalStorage id when the header is absent", async () => {
    requestContextMock.getRequestId.mockReturnValue("als-1");
    await handleRequestError(
      new Error("boom"),
      req({ headers: {} }),
      {},
      {
        capture,
        forwardToSentry: noopSentry,
      },
    );
    expect(capture.mock.calls[0]![0].requestId).toBe("als-1");
  });

  it("passes a digest when the error carries one, and omits it otherwise", async () => {
    const withDigest = Object.assign(new Error("boom"), { digest: "abc123" });
    await handleRequestError(
      withDigest,
      req(),
      { routeType: "render" },
      {
        capture,
        forwardToSentry: noopSentry,
      },
    );
    expect(capture.mock.calls[0]![0].digest).toBe("abc123");

    capture.mockClear();
    await handleRequestError(
      new Error("plain"),
      req(),
      { routeType: "render" },
      {
        capture,
        forwardToSentry: noopSentry,
      },
    );
    expect(capture.mock.calls[0]![0].digest).toBeUndefined();
  });

  it("hashes nothing itself — the user agent is handed over, never logged here", async () => {
    await handleRequestError(
      new Error("boom"),
      req({ headers: { "user-agent": "UA/1.0" } }),
      {},
      {
        capture,
        forwardToSentry: noopSentry,
      },
    );
    expect(capture.mock.calls[0]![0].userAgent).toBe("UA/1.0");
  });

  it("forwards to Sentry independently of the database write", async () => {
    const sentry = vi.fn();
    await handleRequestError(
      new Error("boom"),
      req(),
      { routeType: "action" },
      {
        capture,
        forwardToSentry: sentry,
      },
    );
    expect(sentry).toHaveBeenCalledTimes(1);
    expect(sentry.mock.calls[0]![2]).toEqual({ routeType: "action" });
  });

  it("still forwards to Sentry when the database write throws", async () => {
    const sentry = vi.fn();
    capture.mockRejectedValueOnce(new Error("db down"));
    await expect(
      handleRequestError(
        new Error("boom"),
        req(),
        { routeType: "route" },
        {
          capture,
          forwardToSentry: sentry,
        },
      ),
    ).resolves.toBeUndefined();
    expect(sentry).toHaveBeenCalledTimes(1);
    expect(loggerMock.logWarn).toHaveBeenCalledWith(
      "app_error.on_request_error_failed",
      expect.objectContaining({ route: "/api/tasks" }),
    );
  });

  it("never throws when Sentry forwarding fails", async () => {
    const sentry = vi.fn().mockImplementation(() => {
      throw new Error("sentry unreachable");
    });
    await expect(
      handleRequestError(
        new Error("boom"),
        req(),
        { routeType: "route" },
        {
          capture,
          forwardToSentry: sentry,
        },
      ),
    ).resolves.toBeUndefined();
    expect(loggerMock.logError).toHaveBeenCalledWith(
      "app_error.sentry_forward_failed",
      expect.anything(),
    );
  });

  it("never throws when the request object is malformed", async () => {
    await expect(
      handleRequestError(
        new Error("boom"),
        {} as never,
        {},
        { capture, forwardToSentry: noopSentry },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("handleUnhandledRejection", () => {
  it("captures with the server.unhandled source and a synthetic route", async () => {
    await handleUnhandledRejection(new Error("stray rejection"), capture);
    const arg = capture.mock.calls[0]![0];
    expect(arg.source).toBe("server.unhandled");
    expect(arg.route).toBe("(unhandled-rejection)");
    expect(arg.method).toBeUndefined();
  });

  it("does not reject when the capture fails", async () => {
    capture.mockRejectedValueOnce(new Error("db down"));
    await expect(handleUnhandledRejection("reason", capture)).resolves.toBeUndefined();
  });
});

describe("handleUncaughtException", () => {
  it("captures and then exits non-zero", () => {
    const exit = vi.fn();
    handleUncaughtException(new Error("fatal"), capture, exit);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]![0].source).toBe("server.unhandled");
    // The exit is the point — Docker restarts the container.
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits even when the capture throws", () => {
    const exit = vi.fn();
    capture.mockImplementationOnce(() => {
      throw new Error("capture exploded");
    });
    expect(() => handleUncaughtException(new Error("fatal"), capture, exit)).not.toThrow();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
