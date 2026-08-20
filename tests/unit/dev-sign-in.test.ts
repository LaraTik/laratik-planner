import { describe, expect, it, vi, beforeEach } from "vitest";

// --- env mock (must be declared before any import that reads serverEnv) -------

const TEST_AUTH_SECRET = "a".repeat(64);

// Track the last encode() call so the JWT-shape test can assert on the
// payload that was passed (without actually round-tripping through the
// real JWE encoder, which is brittle in the test runtime).
let lastEncodeCall: { token: unknown; secret: unknown; salt: unknown; maxAge: unknown } | null =
  null;

vi.mock("next-auth/jwt", () => ({
  encode: vi.fn(
    async (args: { token: unknown; secret: unknown; salt: unknown; maxAge: unknown }) => {
      lastEncodeCall = args;
      // Return a stable, parseable token shape so callers that decode it
      // can still exercise the JWT path. header.payload.signature — all
      // base64url-safe.
      const header = Buffer.from(JSON.stringify({ alg: "mock" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify(args.token)).toString("base64url");
      return `${header}.${payload}.signature`;
    },
  ),
}));

vi.mock("@/lib/validation/env", () => ({
  serverEnv: {
    NODE_ENV: "test",
    AUTH_SECRET: TEST_AUTH_SECRET,
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    AUTH_URL: "http://localhost:3000",
    AUTH_TRUST_HOST: true,
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    SMTP_HOST: "",
    SMTP_PORT: 587,
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    SMTP_FROM: "",
    POSTGRES_USER: "",
    POSTGRES_PASSWORD: "",
    POSTGRES_DB: "",
    MINIMAX_API_KEY: "",
    MINIMAX_BASE_URL: "https://api.minimax.io/anthropic",
    MINIMAX_MODEL: "MiniMax-M3",
    AI_FEATURE_ENABLED: false,
    SENTRY_DSN: "",
    SENTRY_AUTH_TOKEN: "",
    SENTRY_ORG: "",
    SENTRY_PROJECT: "",
    CRON_SECRET: "",
    BOOTSTRAP_SETUP_TOKEN: "",
  },
  clientEnv: { NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));

// --- drizzle chain mock ----------------------------------------------------

type DrizzleMockState = {
  selectRows: Array<{ id: string; role: string; name: string }>;
  insertedUser: { id: string };
  updateCalled: boolean;
  insertCalled: boolean;
  selectCalled: boolean;
};

function makeDrizzleMock(state: DrizzleMockState) {
  const updateChain: Record<string, unknown> = {};
  updateChain.set = vi.fn(() => updateChain);
  updateChain.where = vi.fn(() => {
    state.updateCalled = true;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn(() => insertChain);
  insertChain.returning = vi.fn(() => {
    state.insertCalled = true;
    return Promise.resolve([state.insertedUser]);
  });
  const insert = vi.fn(() => insertChain);

  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn(() => selectChain);
  selectChain.limit = vi.fn(() => {
    state.selectCalled = true;
    return Promise.resolve(state.selectRows);
  });
  const select = vi.fn(() => selectChain);

  return { select, insert, update, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleMockState = {
    selectRows: [],
    insertedUser: { id: "00000000-0000-0000-0000-000000000001" },
    updateCalled: false,
    insertCalled: false,
    selectCalled: false,
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// --- import the unit under test (AFTER mocks are declared) ----------------

const { signInDevUser, DEV_SESSION_COOKIE_NAME, DEV_SESSION_MAX_AGE_SECONDS } =
  await import("@/lib/auth/dev-sign-in");
const { serverEnv } = await import("@/lib/validation/env");

// --- tests ----------------------------------------------------------------

beforeEach(() => {
  dbMock.state.selectRows = [];
  dbMock.state.insertedUser = { id: "00000000-0000-0000-0000-000000000001" };
  dbMock.state.updateCalled = false;
  dbMock.state.insertCalled = false;
  dbMock.state.selectCalled = false;
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  lastEncodeCall = null;
  // Reset the NODE_ENV back to "test" in case the production-guard test
  // mutated it. The original mock value is restored via defineProperty.
  Object.defineProperty(serverEnv, "NODE_ENV", {
    value: "test",
    writable: true,
    configurable: true,
  });
});

describe("signInDevUser", () => {
  it("exports the expected cookie name and 30-day max age", () => {
    expect(DEV_SESSION_COOKIE_NAME).toBe("authjs.session-token");
    expect(DEV_SESSION_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("refuses to run in production", async () => {
    // Simulate prod by overriding the env mock for this test only.
    Object.defineProperty(serverEnv, "NODE_ENV", { value: "production", configurable: true });

    const result = await signInDevUser({ email: "test@example.com" });

    expect(result).toEqual({ ok: false, error: "not_available_in_production" });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("rejects empty email", async () => {
    const result = await signInDevUser({ email: "" });
    expect(result).toEqual({ ok: false, error: "invalid_email" });
  });

  it("rejects email without @", async () => {
    const result = await signInDevUser({ email: "not-an-email" });
    expect(result).toEqual({ ok: false, error: "invalid_email" });
  });

  it("trims and lowercases the input email before lookup", async () => {
    dbMock.state.selectRows = [{ id: "user-1", role: "agency_admin", name: "Existing User" }];

    const result = await signInDevUser({ email: "  Alice@Example.COM  " });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe("alice@example.com");
      expect(result.name).toBe("Existing User");
      expect(result.role).toBe("agency_admin");
    }
    // Drizzle where receives the lowercased email via sql`lower(...) = ${email}`.
    // We can't directly inspect the parameterized SQL from a mock, but the
    // happy-path identity assertions above cover the lowercase path.
  });

  it("creates a new user when none exists, defaulting name to email prefix", async () => {
    dbMock.state.selectRows = []; // no existing user
    dbMock.state.insertedUser = { id: "new-user-id" };

    const result = await signInDevUser({ email: "newperson@example.com" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("new-user-id");
      expect(result.name).toBe("newperson");
      expect(result.role).toBe("agency_admin"); // default
      expect(result.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    }
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("uses the provided name when supplied on a new user", async () => {
    dbMock.state.selectRows = [];
    dbMock.state.insertedUser = { id: "new-user-id" };

    const result = await signInDevUser({
      email: "newperson@example.com",
      name: "Custom Name",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name).toBe("Custom Name");
    }
  });

  it('respects role: "user" on a new user (does not default to admin)', async () => {
    dbMock.state.selectRows = [];
    dbMock.state.insertedUser = { id: "u" };

    const result = await signInDevUser({
      email: "member@example.com",
      role: "user",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("user");
    }
  });

  it("does not update the role on an existing user when it matches", async () => {
    dbMock.state.selectRows = [{ id: "existing-1", role: "agency_admin", name: "Admin" }];

    const result = await signInDevUser({
      email: "admin@example.com",
      role: "agency_admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("existing-1");
      expect(result.role).toBe("agency_admin");
    }
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("updates the role on an existing user when the requested role differs", async () => {
    dbMock.state.selectRows = [{ id: "existing-1", role: "user", name: "Member" }];

    const result = await signInDevUser({
      email: "promote@example.com",
      role: "agency_admin",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe("existing-1");
      expect(result.role).toBe("agency_admin");
    }
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns a JWT that encodes sub, id, role, email, name", async () => {
    dbMock.state.selectRows = [{ id: "u-42", role: "agency_admin", name: "Forty Two" }];

    const result = await signInDevUser({ email: "forty@example.com" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The mock encoder returns a JWT-shaped string we can decode.
    const parts = result.token.split(".");
    expect(parts).toHaveLength(3);

    const payloadB64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf-8"));

    expect(payload.sub).toBe("u-42");
    expect(payload.id).toBe("u-42");
    expect(payload.role).toBe("agency_admin");
    expect(payload.email).toBe("forty@example.com");
    expect(payload.name).toBe("Forty Two");

    // The encode() call was made with the right secret + salt + maxAge.
    expect(lastEncodeCall).not.toBeNull();
    expect(lastEncodeCall!.secret).toBe(TEST_AUTH_SECRET);
    expect(lastEncodeCall!.salt).toBe("authjs.session-token");
    expect(lastEncodeCall!.maxAge).toBe(30 * 24 * 60 * 60);
  });
});
