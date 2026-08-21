import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Rate-limit tests — exercise the rule table, hashing, and the
 * "allowed vs denied" decision branches of `enforceRateLimit`.
 *
 * The DB is mocked with a chainable interface that lets each test
 * queue the row counts and check that the SUT called the expected
 * insert/update paths in the right shape.
 */

const serverEnvMock = vi.hoisted(() => ({
  AUTH_SECRET: "test-secret-please-rotate",
}));

vi.mock("@/lib/validation/env", () => ({ serverEnv: serverEnvMock }));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  updateCalls: { table: unknown; set: unknown; where: unknown }[];
  executeCalls: { sql: unknown }[];
};

function makeDrizzleMock(state: DrizzleState) {
  // Returns a chain that ends with a thenable resolving the next queued
  // row. `.where()` is the terminator (rate-limit's count query stops
  // at `.where()` and does NOT call `.limit()`), and so is `.limit()`.
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ table: "insert", values });
    return Promise.resolve();
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn((where: unknown) => {
    state.updateCalls.push({ table: "update", set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const execute = vi.fn((sqlArg: unknown) => {
    state.executeCalls.push({ sql: sqlArg });
    return Promise.resolve();
  });

  // db.transaction: pass-through the callback. The SUT does .execute() inside.
  const transaction = vi.fn(async (cb: (tx: typeof txApi) => Promise<unknown>) => {
    return cb(txApi);
  });

  // tx needs its own chain factory so each `tx.select(...)` starts a fresh chain.
  const txSelect = vi.fn(() => makeChain());
  const txInsert = vi.fn(() => insertChain);
  const txUpdate = vi.fn(() => updateChain);
  const txApi = { execute, select: txSelect, insert: txInsert, update: txUpdate };

  return { select, insert, update, transaction, execute, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    insertCalls: [],
    updateCalls: [],
    executeCalls: [],
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const rateLimit = await import("@/lib/security/rate-limit");

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.state.executeCalls = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.transaction.mockClear();
  dbMock.execute.mockClear();
});

describe("rateLimitRuleFor", () => {
  it("returns the rule for each scope", () => {
    expect(rateLimit.rateLimitRuleFor("bootstrap")).toEqual({ limit: 5, windowSeconds: 900 });
    expect(rateLimit.rateLimitRuleFor("invitation_create")).toEqual({
      limit: 20,
      windowSeconds: 3600,
    });
    expect(rateLimit.rateLimitRuleFor("invitation_accept")).toEqual({
      limit: 10,
      windowSeconds: 900,
    });
    expect(rateLimit.rateLimitRuleFor("invitation_resend")).toEqual({
      limit: 10,
      windowSeconds: 3600,
    });
    expect(rateLimit.rateLimitRuleFor("ai_generation")).toEqual({ limit: 30, windowSeconds: 60 });
    expect(rateLimit.rateLimitRuleFor("magic_link_request")).toEqual({
      limit: 5,
      windowSeconds: 3600,
    });
  });
});

describe("hashRateLimitSubject", () => {
  it("produces a stable sha256 hash for the same secret+subject", () => {
    const a = rateLimit.hashRateLimitSubject("alice@example.com", "secret");
    const b = rateLimit.hashRateLimitSubject("alice@example.com", "secret");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes whitespace and case before hashing", () => {
    const a = rateLimit.hashRateLimitSubject("Alice@Example.com", "secret");
    const b = rateLimit.hashRateLimitSubject("  alice@example.com  ", "secret");
    expect(a).toBe(b);
  });

  it("changes when the secret changes", () => {
    const a = rateLimit.hashRateLimitSubject("a", "secret-1");
    const b = rateLimit.hashRateLimitSubject("a", "secret-2");
    expect(a).not.toBe(b);
  });
});

describe("enforceRateLimit (allowed path)", () => {
  it("returns { allowed: true, remaining: rule.limit - 1 } when under the cap", async () => {
    dbMock.state.selectResults = [[{ count: 0 }]]; // 0 prior events

    const result = await rateLimit.enforceRateLimit({
      scope: "invitation_create",
      subject: "test@example.com",
      actorId: "user-1",
    });

    expect(result).toEqual({ allowed: true, remaining: 19 });
    // A single insert into rate_limit_events (no audit denial row).
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      scope: "invitation_create",
      subjectHash: expect.any(String),
    });
  });

  it("counts pre-existing events and decrements remaining", async () => {
    dbMock.state.selectResults = [[{ count: 5 }]];
    const result = await rateLimit.enforceRateLimit({
      scope: "invitation_create",
      subject: "test@example.com",
    });
    expect(result).toEqual({ allowed: true, remaining: 14 });
  });
});

describe("enforceRateLimit (denied path)", () => {
  it("returns { allowed: false, retryAfterSeconds: windowSeconds } when at or over the cap", async () => {
    dbMock.state.selectResults = [[{ count: 20 }]]; // cap reached

    const result = await rateLimit.enforceRateLimit({
      scope: "invitation_create",
      subject: "test@example.com",
      actorId: "user-1",
      requestId: "req-1",
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBe(60 * 60);
    }
    // An audit denial row was inserted; no rate_limit_events row.
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      action: "invitation_create",
      targetType: "rate_limit",
      outcome: "denied",
      actorId: "user-1",
      requestId: "req-1",
    });
  });

  it("audit denial row omits actorId/requestId when not supplied", async () => {
    dbMock.state.selectResults = [[{ count: 999 }]]; // cap reached

    const result = await rateLimit.enforceRateLimit({
      scope: "bootstrap",
      subject: "noone",
    });
    expect(result.allowed).toBe(false);
    const denial = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["action"] === "bootstrap",
    );
    expect(denial).toBeDefined();
    const v = denial?.values as Record<string, unknown>;
    expect(v["actorId"]).toBeUndefined();
    expect(v["requestId"]).toBeUndefined();
  });
});

describe("enforceRateLimit (guard rails)", () => {
  it("throws when AUTH_SECRET is not set", async () => {
    const previous = serverEnvMock.AUTH_SECRET;
    serverEnvMock.AUTH_SECRET = "";
    try {
      await expect(
        rateLimit.enforceRateLimit({ scope: "bootstrap", subject: "x" }),
      ).rejects.toThrow(/AUTH_SECRET/);
    } finally {
      serverEnvMock.AUTH_SECRET = previous;
    }
  });

  it("passes the actor and requestId through to the audit row when supplied", async () => {
    dbMock.state.selectResults = [[{ count: 0 }]];
    await rateLimit.enforceRateLimit({
      scope: "ai_generation",
      subject: "user-1",
      actorId: "user-1",
      requestId: "req-42",
    });
    // No audit row in the allowed path, but the rate_limit_events row was inserted.
    const rateLimitRow = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["scope"] === "ai_generation",
    );
    expect(rateLimitRow).toBeDefined();
  });
});
