import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Branch coverage for the module-load paths in `src/lib/validation/env.ts`.
 *
 * The env module reads `process.env` exactly once at import time. To
 * exercise the error branches (server schema parse failure, provider
 * configuration failure) and the `optionalInDev` ternary, each test
 *   - clears Vitest's module cache with `vi.resetModules()`,
 *   - sets the `process.env` shape it wants to exercise,
 *   - dynamically imports `@/lib/validation/env` afresh.
 *
 * Each test then snapshots the resulting `serverEnv` (success path) or
 * asserts the import throws with the expected error message (failure
 * paths). `process.env` is restored in `afterEach` so the next test
 * starts from a clean slate.
 *
 * The pre-existing happy-path env loading is covered by every other
 * test file that imports the module; we deliberately focus on the
 * branches that would otherwise be unreachable.
 */

const ENV_KEYS_TO_RESTORE = [
  "NODE_ENV",
  "SKIP_ENV_VALIDATION",
  "NEXT_PHASE",
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "AUTH_TRUST_HOST",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "MINIMAX_API_KEY",
  "MINIMAX_BASE_URL",
  "MINIMAX_MODEL",
  "AI_FEATURE_ENABLED",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SENTRY_DSN",
  "AGENCY_COOKIE_SECRET",
] as const;

const originalEnv: Record<string, string | undefined> = {};

/**
 * `process.env` is typed with `NODE_ENV` as the literal union
 * "development" | "production" | "test", and most other keys as
 * `string | undefined`. The two helpers below widen the type so the
 * tests can assign/delete arbitrary env-var values without TypeScript
 * flagging the assignment.
 */
function setEnv(key: string, value: string): void {
  (process.env as Record<string, string | undefined>)[key] = value;
}
function unsetEnv(key: string): void {
  delete (process.env as Record<string, string | undefined>)[key];
}

beforeEach(() => {
  for (const key of ENV_KEYS_TO_RESTORE) {
    originalEnv[key] = process.env[key];
  }
  for (const key of ENV_KEYS_TO_RESTORE) {
    unsetEnv(key);
  }
  setEnv("NODE_ENV", "test");
  // SKIP_ENV_VALIDATION is normally set in CI; clear it so the
  // production-only branches are reachable when NODE_ENV=production.
  unsetEnv("SKIP_ENV_VALIDATION");
  unsetEnv("NEXT_PHASE");
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS_TO_RESTORE) {
    const original = originalEnv[key];
    if (original === undefined) {
      unsetEnv(key);
    } else {
      setEnv(key, original);
    }
  }
});

async function importFreshEnv(): Promise<typeof import("./env")> {
  return await import("./env");
}

describe("env server schema (coercion branches)", () => {
  it("defaults NODE_ENV to development when unset", async () => {
    unsetEnv("NODE_ENV");
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.NODE_ENV).toBe("development");
  });

  it("accepts NODE_ENV = production", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("DATABASE_URL", "postgres://example.com/db");
    setEnv("AUTH_SECRET", "x".repeat(32));
    setEnv("GOOGLE_CLIENT_ID", "id");
    setEnv("GOOGLE_CLIENT_SECRET", "secret");
    setEnv("AGENCY_COOKIE_SECRET", "x".repeat(64));
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.NODE_ENV).toBe("production");
  });

  it("coerces SMTP_PORT from a string to a number with default 587", async () => {
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.SMTP_PORT).toBe(587);
    setEnv("SMTP_PORT", "2525");
    vi.resetModules();
    const reloaded = await importFreshEnv();
    expect(reloaded.serverEnv.SMTP_PORT).toBe(2525);
  });

  it("coerces AUTH_TRUST_HOST to a boolean (true / false)", async () => {
    setEnv("AUTH_TRUST_HOST", "true");
    vi.resetModules();
    const a = await importFreshEnv();
    expect(a.serverEnv.AUTH_TRUST_HOST).toBe(true);

    setEnv("AUTH_TRUST_HOST", "false");
    vi.resetModules();
    const b = await importFreshEnv();
    expect(b.serverEnv.AUTH_TRUST_HOST).toBe(false);

    unsetEnv("AUTH_TRUST_HOST");
    vi.resetModules();
    const c = await importFreshEnv();
    expect(c.serverEnv.AUTH_TRUST_HOST).toBe(false);
  });

  it("coerces AI_FEATURE_ENABLED to a boolean (true / false / unset)", async () => {
    setEnv("AI_FEATURE_ENABLED", "true");
    vi.resetModules();
    const a = await importFreshEnv();
    expect(a.serverEnv.AI_FEATURE_ENABLED).toBe(true);

    setEnv("AI_FEATURE_ENABLED", "1");
    vi.resetModules();
    const b = await importFreshEnv();
    expect(b.serverEnv.AI_FEATURE_ENABLED).toBe(true);

    setEnv("AI_FEATURE_ENABLED", "false");
    vi.resetModules();
    const c = await importFreshEnv();
    expect(c.serverEnv.AI_FEATURE_ENABLED).toBe(false);

    unsetEnv("AI_FEATURE_ENABLED");
    vi.resetModules();
    const d = await importFreshEnv();
    expect(d.serverEnv.AI_FEATURE_ENABLED).toBe(false);
  });

  it("uses default MINIMAX_BASE_URL when unset", async () => {
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.MINIMAX_BASE_URL).toBe("https://api.minimax.io/anthropic");
  });

  it("uses default MINIMAX_MODEL when unset", async () => {
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.MINIMAX_MODEL).toBe("MiniMax-M3");
  });

  it("defaults NEXT_PUBLIC_APP_URL via the client schema default", async () => {
    unsetEnv("NEXT_PUBLIC_APP_URL");
    const { clientEnv } = await importFreshEnv();
    expect(clientEnv.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("treats stringOrEmpty fields as empty strings when unset", async () => {
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.SMTP_HOST).toBe("");
    expect(serverEnv.SMTP_USER).toBe("");
    expect(serverEnv.SMTP_PASSWORD).toBe("");
    expect(serverEnv.SMTP_FROM).toBe("");
    expect(serverEnv.MINIMAX_API_KEY).toBe("");
    expect(serverEnv.GOOGLE_CLIENT_ID).toBe("");
    expect(serverEnv.GOOGLE_CLIENT_SECRET).toBe("");
  });
});

describe("env module-level failure branches", () => {
  it("throws 'Invalid server environment' when the server schema parse fails", async () => {
    // Force a parse failure: NODE_ENV=production requires DATABASE_URL
    // to be a valid URL — set it to something that's not a URL.
    setEnv("NODE_ENV", "production");
    setEnv("DATABASE_URL", "not-a-url");
    setEnv("AUTH_SECRET", "x".repeat(32));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(importFreshEnv()).rejects.toThrow(/Invalid server environment/);
    errorSpy.mockRestore();
  });

  it("throws 'Invalid provider configuration' when production has no auth provider", async () => {
    // Production with all required server fields valid, but no Google
    // OAuth or SMTP — `validateProviderConfiguration` should report
    // an issue and the module should throw at line 142.
    setEnv("NODE_ENV", "production");
    setEnv("DATABASE_URL", "postgres://example.com/db");
    setEnv("AUTH_SECRET", "x".repeat(32));
    setEnv("AGENCY_COOKIE_SECRET", "x".repeat(64));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(importFreshEnv()).rejects.toThrow(/Invalid provider configuration/);
    errorSpy.mockRestore();
  });

  it("SKIP_ENV_VALIDATION makes the production schema parse non-strict", async () => {
    // With SKIP_ENV_VALIDATION=true, DATABASE_URL becomes optional
    // even in production, so a missing DATABASE_URL does not throw.
    setEnv("SKIP_ENV_VALIDATION", "true");
    setEnv("NODE_ENV", "production");
    // No DATABASE_URL, no AUTH_SECRET — would normally fail.
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.DATABASE_URL).toBeUndefined();
  });

  it("accepts a complete production config without throwing", async () => {
    setEnv("NODE_ENV", "production");
    setEnv("DATABASE_URL", "postgres://example.com/db");
    setEnv("AUTH_SECRET", "x".repeat(32));
    setEnv("GOOGLE_CLIENT_ID", "id");
    setEnv("GOOGLE_CLIENT_SECRET", "secret");
    setEnv("AGENCY_COOKIE_SECRET", "x".repeat(64));
    const { serverEnv } = await importFreshEnv();
    expect(serverEnv.NODE_ENV).toBe("production");
    expect(serverEnv.GOOGLE_CLIENT_ID).toBe("id");
  });
});
