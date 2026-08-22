import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Bootstrap tests — exercise the "invalid token", "already configured",
 * "first admin created" branches of bootstrapFirstAdmin.
 */

const serverEnvMock = vi.hoisted(() => ({
  BOOTSTRAP_SETUP_TOKEN: "test-bootstrap-token",
}));

vi.mock("@/lib/validation/env", () => ({ serverEnv: serverEnvMock }));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: string; values: unknown }[];
  insertReturningIds: { id: string }[];
  updateCalls: { table: string; set: unknown; where: unknown }[];
  executeCalls: { sql: unknown }[];
};

function makeDrizzleMock(state: DrizzleState) {
  function makeSelectChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    return chain;
  }
  const select = vi.fn(() => makeSelectChain());

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ table: "insert", values });
    const returningChain: Record<string, unknown> = {
      returning: vi.fn(() => {
        const row = state.insertReturningIds.shift() ?? { id: "default-id" };
        return Promise.resolve([row]);
      }),
      onConflictDoUpdate: vi.fn(() => Promise.resolve()),
      onConflictDoNothing: vi.fn(() => Promise.resolve()),
    };
    return returningChain;
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

  const transaction = vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
    const txSelect = vi.fn(() => makeSelectChain());
    const txInsertChain: Record<string, unknown> = {
      values: vi.fn((values: unknown) => {
        state.insertCalls.push({ table: "tx-insert", values });
        const returningChain: Record<string, unknown> = {
          returning: vi.fn(() => {
            const row = state.insertReturningIds.shift() ?? { id: "default-id" };
            return Promise.resolve([row]);
          }),
          onConflictDoUpdate: vi.fn(() => Promise.resolve()),
          onConflictDoNothing: vi.fn(() => Promise.resolve()),
        };
        return returningChain;
      }),
    };
    const txInsert = vi.fn(() => txInsertChain);
    const txUpdateChain: Record<string, unknown> = {
      set: vi.fn((set: unknown) => {
        state.updateCalls.push({ table: "tx-update", set, where: undefined });
        return txUpdateChain;
      }),
      where: vi.fn(() => Promise.resolve()),
    };
    const txUpdate = vi.fn(() => txUpdateChain);
    const txApi = {
      select: txSelect,
      insert: txInsert,
      update: txUpdate,
      execute: vi.fn(() => Promise.resolve()),
    };
    return cb(txApi);
  });

  return { select, insert, update, transaction, execute, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    insertCalls: [],
    insertReturningIds: [],
    updateCalls: [],
    executeCalls: [],
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const { bootstrapFirstAdmin } = await import("@/lib/auth/bootstrap");

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.insertReturningIds = [];
  dbMock.state.updateCalls = [];
  dbMock.state.executeCalls = [];
});

describe("bootstrapFirstAdmin", () => {
  const userId = "user-1";

  it("returns 'invalid_token' when no BOOTSTRAP_SETUP_TOKEN is configured", async () => {
    const previous = serverEnvMock.BOOTSTRAP_SETUP_TOKEN;
    serverEnvMock.BOOTSTRAP_SETUP_TOKEN = "";
    try {
      const result = await bootstrapFirstAdmin({
        userId,
        agencyName: "Acme",
        agencySlug: "acme",
        token: "anything",
      });
      expect(result).toEqual({ status: "invalid_token" });
    } finally {
      serverEnvMock.BOOTSTRAP_SETUP_TOKEN = previous;
    }
  });

  it("returns 'invalid_token' when the provided token does not match", async () => {
    const result = await bootstrapFirstAdmin({
      userId,
      agencyName: "Acme",
      agencySlug: "acme",
      token: "wrong",
    });
    expect(result).toEqual({ status: "invalid_token" });
  });

  it("returns 'already_configured' when an active agency admin already exists", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);

    const result = await bootstrapFirstAdmin({
      userId,
      agencyName: "Acme",
      agencySlug: "acme",
      token: "test-bootstrap-token",
    });
    expect(result).toEqual({ status: "already_configured", agencyId: "agency-1" });
  });

  it("creates the agency, the admin membership, promotes the user, and writes the lock on the happy path", async () => {
    // Inside the transaction:
    //   1. agencyMemberships select: no admin yet
    dbMock.state.selectResults.push([]);
    //   2. agencies select: no existing agency
    dbMock.state.selectResults.push([]);
    //   3. agencies insert: returns new agency id
    dbMock.state.insertReturningIds.push({ id: "agency-new" });
    //   4. agencyMemberships insert (onConflictDoUpdate)
    //   5. users update
    //   6. bootstrapLocks insert (onConflictDoNothing)

    const result = await bootstrapFirstAdmin({
      userId,
      agencyName: "Acme",
      agencySlug: "acme",
      token: "test-bootstrap-token",
    });

    expect(result).toEqual({ status: "bootstrapped", agencyId: "agency-new", userId });

    // Verify the agency insert used the provided name/slug
    const agencyInsert = dbMock.state.insertCalls.find(
      (c) => (c.values as Record<string, unknown>)["name"] === "Acme",
    );
    expect(agencyInsert).toBeDefined();
    expect(agencyInsert?.values).toMatchObject({ name: "Acme", slug: "acme" });

    // Verify the user was promoted to agency_admin
    const userUpdate = dbMock.state.updateCalls.find(
      (c) => (c.set as Record<string, unknown>)["role"] === "agency_admin",
    );
    expect(userUpdate).toBeDefined();
  });

  it("reuses an existing agency singleton when one already exists", async () => {
    // 1. No existing admin
    dbMock.state.selectResults.push([]);
    // 2. Agency singleton exists
    dbMock.state.selectResults.push([{ id: "agency-existing" }]);

    const result = await bootstrapFirstAdmin({
      userId,
      agencyName: "Acme",
      agencySlug: "acme",
      token: "test-bootstrap-token",
    });

    expect(result).toEqual({ status: "bootstrapped", agencyId: "agency-existing", userId });
    // No new agency insert
    const agencyInserts = dbMock.state.insertCalls.filter(
      (c) => (c.values as Record<string, unknown>)["name"] === "Acme",
    );
    expect(agencyInserts).toHaveLength(0);
  });
});
