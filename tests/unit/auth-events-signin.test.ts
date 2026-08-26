import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * TEST-17 (GAP-FULL-REVIEW-2026-08-25) — happy-path coverage for the
 * `events.signIn` callback in src/lib/auth/config.ts.
 *
 * The pre-existing assertions in `auth-config.test.ts` (lines 233-254)
 * only verify the no-op branches: missing `user.id` returns early,
 * empty-user objects resolve without throwing. They cannot detect a
 * regression that turns the `db.update(users).set({ emailVerified:
 * COALESCE(...) }).where(and(eq(users.id, ...), isNull(...)))` branch
 * into a silent no-op.
 *
 * This file wires a hand-rolled Drizzle mock (mirroring the
 * `notifications-dispatch.test.ts` pattern) and exercises the real
 * happy path: a signed-in user with a real `id` triggers exactly one
 * `update(users)` call with the `emailVerified: COALESCE(...)`
 * assignment and the `id = ? AND emailVerified IS NULL` filter.
 *
 * The two no-op branches are duplicated here so the full
 * behaviour matrix lives in one place and the original
 * `auth-config.test.ts` can be slimmed down to the structural
 * assertions only.
 */

type UpdateCall = {
  table: unknown;
  set: unknown;
  where: unknown;
};

const dbState = {
  updateCalls: [] as UpdateCall[],
};

let lastSet: unknown = undefined;
const updateChain: Record<string, unknown> = {
  set: vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  }),
  where: vi.fn((where: unknown) => {
    dbState.updateCalls.push({ table: "update", set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  }),
};

const dbMock = {
  update: vi.fn(() => updateChain),
  get state() {
    return dbState;
  },
};

vi.mock("@/lib/db", () => ({ db: dbMock }));

// next-auth / providers / env / adapter — same mocks as
// auth-config.test.ts, because the events.signIn handler closes over
// the same authConfig object that the existing file builds.
const nextAuthMocks = vi.hoisted(() => {
  return {
    NextAuth: vi.fn((config: unknown) => {
      (globalThis as Record<string, unknown>).__lastNextAuthConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn(),
      };
    }),
    google: vi.fn((config: unknown) => ({ id: "google", ...(config as object) })),
    nodemailer: vi.fn((config: unknown) => ({ id: "nodemailer", ...(config as object) })),
    credentials: vi.fn((config: object) => ({ id: "credentials", ...config })),
  };
});

vi.mock("next-auth", () => ({
  default: nextAuthMocks.NextAuth,
  NextAuth: nextAuthMocks.NextAuth,
  Google: nextAuthMocks.google,
  Nodemailer: nextAuthMocks.nodemailer,
  Credentials: nextAuthMocks.credentials,
}));

vi.mock("next-auth/providers/nodemailer", () => ({
  default: nextAuthMocks.nodemailer,
}));
vi.mock("next-auth/providers/google", () => ({
  default: nextAuthMocks.google,
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: nextAuthMocks.credentials,
}));

const envValues: Record<string, unknown> = {
  AUTH_SECRET: "test-secret",
  AUTH_TRUST_HOST: true,
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_USER: "user@example.com",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "no-reply@example.com",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  AUTH_URL: "http://localhost:3000",
  NODE_ENV: "test",
  POSTGRES_USER: "",
  POSTGRES_PASSWORD: "",
  POSTGRES_DB: "",
  MINIMAX_API_KEY: "",
  MINIMAX_BASE_URL: "",
  MINIMAX_MODEL: "",
  AI_FEATURE_ENABLED: false,
  SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
  SENTRY_ORG: "",
  SENTRY_PROJECT: "",
  CRON_SECRET: "",
  BOOTSTRAP_SETUP_TOKEN: "",
};

vi.mock("@/lib/validation/env", () => ({
  serverEnv: new Proxy({}, { get: (_, key: string) => envValues[key] }),
}));

vi.mock("@auth/drizzle-adapter", () => ({
  DrizzleAdapter: vi.fn(() => ({ id: "adapter" })),
}));

// captureError + setUser are no-ops in this environment (SENTRY_DSN
// is empty above) but we still mock them so the catch branch can be
// asserted cleanly without reaching the structured log stream, and
// the new signIn → setUser wiring can be asserted with a spy.
const captureErrorMock = vi.fn();
const setUserMock = vi.fn();
vi.mock("@/lib/observability/sentry", () => ({
  captureError: captureErrorMock,
  setUser: setUserMock,
}));

const { authConfig } = await import("@/lib/auth/config");

beforeEach(() => {
  dbState.updateCalls.length = 0;
  lastSet = undefined;
  captureErrorMock.mockReset();
  setUserMock.mockReset();
});

describe("events.signIn stamps emailVerified for unverified users", () => {
  it("is a function on authConfig.events", () => {
    expect(typeof authConfig.events?.signIn).toBe("function");
  });

  it("is a no-op when the user object is missing", async () => {
    const handler = authConfig.events?.signIn;
    expect(handler).toBeDefined();
    await expect(handler!({} as never)).resolves.toBeUndefined();
    await expect(handler!({ user: {} as never } as never)).resolves.toBeUndefined();
    await expect(handler!({ user: { id: "" } as never } as never)).resolves.toBeUndefined();
    expect(dbState.updateCalls).toEqual([]);
  });

  it("issues a single db.update(users) with COALESCE and the (id, isNull) filter for a real user id", async () => {
    const handler = authConfig.events?.signIn;
    expect(handler).toBeDefined();
    await handler!({ user: { id: "user-real" } } as never);

    expect(dbState.updateCalls).toHaveLength(1);
    const call = dbState.updateCalls[0]!;

    // The set clause is `COALESCE(emailVerified, NOW())` and the
    // where clause is a Drizzle `and(eq(...), isNull(...))`. Walk
    // the chunks (the public Drizzle introspection API) and collect
    // the literal segments so we can assert on the structural
    // contract without depending on the string form (which Drizzle
    // formats with placeholders that change across versions).
    //
    // The Drizzle column/table graph is circular (PgUUID → PgTable
    // → PgColumn → ...), so the walker caps depth and tracks
    // already-seen nodes to terminate the recursion.
    const collectSegments = (node: unknown, depth = 0, seen = new WeakSet<object>()): string[] => {
      if (node === null || node === undefined) return [];
      if (typeof node === "string") return [node];
      if (typeof node !== "object") return [];
      if (depth > 4) return [];
      if (seen.has(node as object)) return [];
      seen.add(node as object);
      const obj = node as Record<string, unknown> & {
        value?: unknown;
        queryChunks?: unknown[];
      };
      if (Array.isArray(obj.value)) {
        return obj.value.flatMap((v) => collectSegments(v, depth + 1, seen));
      }
      if (Array.isArray(obj.queryChunks)) {
        return (obj.queryChunks as unknown[]).flatMap((c) => collectSegments(c, depth + 1, seen));
      }
      // Generic object (e.g. the `{ emailVerified: <SQL> }` set
      // envelope) — recurse into each property value so the
      // embedded SQL is reached. Depth cap + WeakSet break the
      // column↔table cycles.
      return Object.values(obj).flatMap((v) => collectSegments(v, depth + 1, seen));
    };
    const setSql = collectSegments(call.set).join("");
    expect(setSql).toMatch(/COALESCE/);
    expect(setSql).toMatch(/NOW\(\)/);

    const whereSql = collectSegments(call.where).join("");
    expect(whereSql).toContain("user-real");
    expect(whereSql).toMatch(/is null/i);
  });

  it("swallows DB errors and reports to captureError instead of throwing", async () => {
    // Replace the chain to force a rejection on the first .where call.
    updateChain.where = vi.fn(() => {
      throw new Error("db down");
    });

    const handler = authConfig.events?.signIn;
    expect(handler).toBeDefined();
    await expect(handler!({ user: { id: "user-explode" } } as never)).resolves.toBeUndefined();
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock.mock.calls[0]?.[0]).toBe(
      "auth.events.signIn.email_verified_stamp_failed",
    );
  });
});

describe("events.signIn tags the Sentry user context", () => {
  it("calls setUser with the user id + email + username on every successful sign-in", async () => {
    const handler = authConfig.events?.signIn;
    expect(handler).toBeDefined();
    await handler!({
      user: {
        id: "user-1",
        email: "u1@laratik.com",
        name: "U One",
      },
    } as never);
    expect(setUserMock).toHaveBeenCalledTimes(1);
    expect(setUserMock).toHaveBeenCalledWith({
      id: "user-1",
      email: "u1@laratik.com",
      username: "U One",
    });
  });

  it("skips setUser when the user has no id (NextAuth's pre-user-lookup path)", async () => {
    const handler = authConfig.events?.signIn;
    expect(handler).toBeDefined();
    await handler!({ user: {} } as never);
    expect(setUserMock).not.toHaveBeenCalled();
  });
});
