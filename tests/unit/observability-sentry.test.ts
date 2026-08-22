import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Sentry wrapper tests — exercise the no-DSN code path (the only path
 * that exists in dev/CI). When SENTRY_DSN is not set, every wrapper
 * function is a no-op and the SDK is never imported.
 *
 * The DSN-enabled path requires the @sentry/nextjs package to be
 * installed and a valid DSN, neither of which is set in unit tests.
 * For the SDK-loaded branches we intercept the SUT's CJS `require()`
 * by spying on Module.prototype.require so we can return a fake
 * SDK and exercise the init / capture branches.
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

describe("sentry wrapper (no DSN path)", () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    delete process.env["SENTRY_DSN"];
    delete process.env["SENTRY_RELEASE"];
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("isEnabled() returns false when SENTRY_DSN is unset", async () => {
    const mod = await import("@/lib/observability/sentry");
    expect(mod.isEnabled()).toBe(false);
  });

  it("captureException is a safe no-op", async () => {
    const mod = await import("@/lib/observability/sentry");
    expect(() => mod.captureException(new Error("boom"), { tag: "x" })).not.toThrow();
  });

  it("captureMessage is a safe no-op at every level", async () => {
    const mod = await import("@/lib/observability/sentry");
    expect(() => mod.captureMessage("info", "info")).not.toThrow();
    expect(() => mod.captureMessage("warn", "warning")).not.toThrow();
    expect(() => mod.captureMessage("err", "error")).not.toThrow();
  });

  it("setUser is a safe no-op (null and object)", async () => {
    const mod = await import("@/lib/observability/sentry");
    expect(() => mod.setUser(null)).not.toThrow();
    expect(() => mod.setUser({ id: "u1", email: "u1@example.com" })).not.toThrow();
  });
});

describe("sentry wrapper (DSN + SDK-loaded path)", () => {
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
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    restoreRequire();
    vi.restoreAllMocks();
  });

  it("isEnabled() returns true when SENTRY_DSN is set", async () => {
    const mod = await import("@/lib/observability/sentry");
    expect(mod.isEnabled()).toBe(true);
  });

  it("initialises the Sentry SDK on first call and re-uses the cached wrapper", async () => {
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("first"));
    expect(fakeSentry.init).toHaveBeenCalledTimes(1);
    expect(fakeSentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@sentry.example.com/1",
        release: "test@1.0.0",
        environment: "test",
        tracesSampleRate: expect.any(Number),
      }),
    );
    mod.captureException(new Error("second"));
    // init should NOT be called again — the wrapper is cached.
    expect(fakeSentry.init).toHaveBeenCalledTimes(1);
  });

  it("forwards captureException with context (ctx truthy branch)", async () => {
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("boom"), { tag: "x" });
    expect(fakeSentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: { tag: "x" } }),
    );
  });

  it("forwards captureException without context (ctx falsy branch)", async () => {
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("plain"));
    expect(fakeSentry.captureException).toHaveBeenLastCalledWith(expect.any(Error));
  });

  it("forwards captureMessage at every level", async () => {
    const mod = await import("@/lib/observability/sentry");
    mod.captureMessage("info", "info");
    mod.captureMessage("warn", "warning");
    mod.captureMessage("err", "error");
    expect(fakeSentry.captureMessage).toHaveBeenCalledWith("info", "info");
    expect(fakeSentry.captureMessage).toHaveBeenCalledWith("warn", "warning");
    expect(fakeSentry.captureMessage).toHaveBeenCalledWith("err", "error");
  });

  it("forwards setUser (null and object)", async () => {
    const mod = await import("@/lib/observability/sentry");
    mod.setUser(null);
    mod.setUser({ id: "u-1", email: "u@example.com" });
    expect(fakeSentry.setUser).toHaveBeenCalledWith(null);
    expect(fakeSentry.setUser).toHaveBeenCalledWith({
      id: "u-1",
      email: "u@example.com",
    });
  });

  it("omits the release key from Sentry.init when SENTRY_RELEASE is not set", async () => {
    process.env["SENTRY_RELEASE"] = "";
    vi.resetModules();
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("boom"));
    expect(fakeSentry.init).toHaveBeenCalledTimes(1);
    const initArg = fakeSentry.init.mock.calls[0]![0] as Record<string, unknown>;
    expect("release" in initArg).toBe(false);
  });

  it("falls back to NODE_ENV when SENTRY_ENVIRONMENT is not set", async () => {
    delete process.env["SENTRY_ENVIRONMENT"];
    vi.resetModules();
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("boom"));
    const initArg = fakeSentry.init.mock.calls[0]![0] as Record<string, unknown>;
    expect(initArg["environment"]).toBe(process.env["NODE_ENV"]);
  });
});

describe("sentry wrapper (DSN + SDK require throws)", () => {
  const originalEnv = { ...process.env };
  let restoreRequire: () => void;

  beforeEach(async () => {
    process.env["SENTRY_DSN"] = "https://public@sentry.example.com/1";
    restoreRequire = patchRequire(() => {
      throw new Error("module not installed");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    restoreRequire();
    vi.restoreAllMocks();
  });

  it("falls back to noopSentry (and logs a warning) when require throws", async () => {
    const mod = await import("@/lib/observability/sentry");
    expect(() => mod.captureException(new Error("boom"))).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[sentry]"));
  });
});
