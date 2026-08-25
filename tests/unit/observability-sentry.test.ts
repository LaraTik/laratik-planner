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

  it("does NOT call Sentry.init from the wrapper (it is init'd once in instrumentation.ts)", async () => {
    // The wrapper relies on the SDK being already initialised by
    // `sentry.server.config.ts` (loaded via `instrumentation.ts`).
    // A second `Sentry.init` in the same process is a known footgun
    // — silent no-op + warning. This test pins that contract.
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("first"));
    expect(fakeSentry.init).toHaveBeenCalledTimes(0);
    mod.captureException(new Error("second"));
    // init should never be called from the wrapper.
    expect(fakeSentry.init).toHaveBeenCalledTimes(0);
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

  it("omits the release key from Sentry.init when SENTRY_RELEASE is not set (no-op now)", async () => {
    // Kept as a placeholder so the test list reflects that the
    // wrapper no longer touches SENTRY_RELEASE / SENTRY_ENVIRONMENT
    // — both are read by `sentry.server.config.ts` instead.
    process.env["SENTRY_RELEASE"] = "";
    vi.resetModules();
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("boom"));
    expect(fakeSentry.init).toHaveBeenCalledTimes(0);
  });

  it("falls back to NODE_ENV when SENTRY_ENVIRONMENT is not set (no-op now)", async () => {
    // The wrapper no longer reads SENTRY_ENVIRONMENT; the
    // `sentry.server.config.ts` init reads it. This test pins
    // the contract so a future refactor that re-adds a
    // wrapper-side Sentry.init must update this test in lockstep.
    delete process.env["SENTRY_ENVIRONMENT"];
    vi.resetModules();
    const mod = await import("@/lib/observability/sentry");
    mod.captureException(new Error("boom"));
    expect(fakeSentry.init).toHaveBeenCalledTimes(0);
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

  it("falls back to noopSentry silently when require throws", async () => {
    // The wrapper no longer logs a warning on init failure — the
    // SDK is expected to be present whenever SENTRY_DSN is set,
    // and a missing Sentry package in a DSN-configured environment
    // is an operator error (visible at module load via the
    // `require` exception). Logging it again here is noise.
    const mod = await import("@/lib/observability/sentry");
    expect(() => mod.captureException(new Error("boom"))).not.toThrow();
    // No warning is emitted any more.
    expect(console.warn).not.toHaveBeenCalled();
  });
});
