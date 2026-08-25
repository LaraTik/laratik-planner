import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * captureError() is the production fan-out wrapper: every error
 * reports to BOTH the structured log stream (so Sentry-less
 * environments still have a recoverable signal) AND to Sentry (when
 * configured). These tests exercise both branches.
 */

// CJS require-interceptor helper. Vitest doesn't apply `vi.mock` to
// `require()` calls, so we patch `Module.prototype._load` directly.
// Type-erased because Node's `Module._load` is private API.
function patchRequire(replacement: (request: string) => unknown): () => void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require("node:module") as {
    _load: (request: string, ...rest: unknown[]) => unknown;
  };
  const original = Module._load;
  Module._load = function patched(this: unknown, request: string, ...rest: unknown[]) {
    if (request === "@sentry/nextjs") return replacement(request);
    return original.call(this, request, ...rest);
  };
  return () => {
    Module._load = original;
  };
}

describe("captureError (no DSN path)", () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    delete process.env["SENTRY_DSN"];
    delete process.env["SENTRY_RELEASE"];
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("emits a structured logError line with the scope as event", async () => {
    const { captureError } = await import("@/lib/observability/sentry");
    captureError("test.scope", new Error("boom"), { foo: "bar" });
    expect(console.error).toHaveBeenCalledTimes(1);
    const [line] = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = JSON.parse(line as string);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("test.scope");
    expect(parsed.foo).toBe("bar");
    // The Error is included under a sanitized key by logError.
    expect(parsed.err).toBeDefined();
  });

  it("never throws when Sentry is not configured", async () => {
    const { captureError } = await import("@/lib/observability/sentry");
    expect(() => captureError("test.scope", new Error("x"))).not.toThrow();
  });

  it("works with a non-Error throw value (string)", async () => {
    const { captureError } = await import("@/lib/observability/sentry");
    captureError("test.scope", "a string error", { kind: "string" });
    const [line] = (console.error as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const parsed = JSON.parse(line as string);
    expect(parsed.kind).toBe("string");
  });
});

describe("captureError (DSN + SDK-loaded path)", () => {
  const originalEnv = { ...process.env };
  let fakeSentry: {
    init: ReturnType<typeof vi.fn>;
    captureException: ReturnType<typeof vi.fn>;
    captureMessage: ReturnType<typeof vi.fn>;
    setUser: ReturnType<typeof vi.fn>;
  };
  let restoreRequire: () => void;

  beforeEach(async () => {
    process.env["SENTRY_DSN"] = "https://public@sentry.example.com/1";
    process.env["SENTRY_RELEASE"] = "test@1.0.0";
    process.env["SENTRY_ENVIRONMENT"] = "test";
    fakeSentry = {
      init: vi.fn(),
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      setUser: vi.fn(),
    };
    restoreRequire = patchRequire(() => fakeSentry);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    restoreRequire();
    vi.restoreAllMocks();
  });

  it("forwards the error to Sentry with the scope tag and the context as extra", async () => {
    const { captureError } = await import("@/lib/observability/sentry");
    const err = new Error("boom");
    captureError("auth.signin", err, { userId: "u-1", emailDomain: "agency.com" });

    expect(fakeSentry.captureException).toHaveBeenCalledTimes(1);
    const [capturedErr, capturedCtx] = fakeSentry.captureException.mock.calls[0]!;
    expect(capturedErr).toBe(err);
    const ctx = capturedCtx as { tags: Record<string, string>; extra: Record<string, unknown> };
    expect(ctx.tags).toEqual({ scope: "auth.signin" });
    expect(ctx.extra.userId).toBe("u-1");
    expect(ctx.extra.emailDomain).toBe("agency.com");
  });

  it("also emits a structured logError line (fan-out)", async () => {
    const { captureError } = await import("@/lib/observability/sentry");
    captureError("auth.signin", new Error("boom"), { userId: "u-1" });

    // logError uses console.error; we mocked it above. Verify the
    // fan-out: Sentry got the call AND the log line was emitted.
    expect(fakeSentry.captureException).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
