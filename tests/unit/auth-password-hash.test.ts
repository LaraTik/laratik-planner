import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Password helpers — exercise isPasswordStrong, hashPassword,
 * verifyPassword, setPassword, issuePasswordResetToken,
 * consumePasswordResetToken, and findUserByEmailAndPassword.
 *
 * bcrypt is the real module (small, fast, deterministic with the
 * fixed cost). The DB boundary is mocked.
 */

const serverEnvMock = vi.hoisted(() => ({
  AUTH_SECRET: "test-secret",
}));

vi.mock("@/lib/validation/env", () => ({ serverEnv: serverEnvMock }));

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { table: unknown; values: unknown }[];
  updateCalls: { table: unknown; set: unknown; where: unknown }[];
  deleteCalls: { table: unknown; where: unknown }[];
  transactionCalls: number;
  transactionPayloads: { sets: unknown[]; deletes: unknown[] }[];
};

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
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

  const deleteChain: Record<string, unknown> = {};
  deleteChain.where = vi.fn((where: unknown) => {
    state.deleteCalls.push({ table: "delete", where });
    return Promise.resolve();
  });
  const del = vi.fn(() => deleteChain);

  // Track the in-transaction operations to assert that the consume
  // helper does the user update + token delete in one transaction.
  const transaction = vi.fn(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
    state.transactionCalls += 1;
    const txSets: unknown[] = [];
    const txDeletes: unknown[] = [];
    const txUpdateChain: Record<string, unknown> = {
      set: vi.fn((set: unknown) => {
        txSets.push(set);
        return txUpdateChain;
      }),
      where: vi.fn(() => Promise.resolve()),
    };
    const txDeleteChain: Record<string, unknown> = {
      where: vi.fn((where: unknown) => {
        txDeletes.push(where);
        return Promise.resolve();
      }),
    };
    const txInsertChain: Record<string, unknown> = {
      values: vi.fn(() => Promise.resolve()),
    };
    const txSelectChain: Record<string, unknown> = {
      from: vi.fn(() => txSelectChain),
      where: vi.fn(() => txSelectChain),
      limit: vi.fn(() => Promise.resolve([])),
    };
    const txApi = {
      select: vi.fn(() => txSelectChain),
      insert: vi.fn(() => txInsertChain),
      update: vi.fn(() => txUpdateChain),
      delete: vi.fn(() => txDeleteChain),
    };
    const result = await cb(txApi);
    state.transactionPayloads.push({ sets: txSets, deletes: txDeletes });
    return result;
  });

  return { select, insert, update, delete: del, transaction, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = {
    selectResults: [],
    insertCalls: [],
    updateCalls: [],
    deleteCalls: [],
    transactionCalls: 0,
    transactionPayloads: [],
  };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const {
  hashPassword,
  verifyPassword,
  isPasswordStrong,
  setPassword,
  issuePasswordResetToken,
  consumePasswordResetToken,
  findUserByEmailAndPassword,
} = await import("@/lib/auth/password");

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.state.deleteCalls = [];
  dbMock.state.transactionCalls = 0;
  dbMock.state.transactionPayloads = [];
});

describe("isPasswordStrong", () => {
  it("accepts a password with 8+ chars, letter, and digit", () => {
    expect(isPasswordStrong("hunter22")).toBe(true);
    expect(isPasswordStrong("1234567a")).toBe(true);
  });

  it("rejects too-short passwords", () => {
    expect(isPasswordStrong("a1")).toBe(false);
  });

  it("rejects too-long passwords", () => {
    expect(isPasswordStrong("a1" + "x".repeat(200))).toBe(false);
  });

  it("rejects passwords without a letter", () => {
    expect(isPasswordStrong("12345678")).toBe(false);
  });

  it("rejects passwords without a digit", () => {
    expect(isPasswordStrong("abcdefgh")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isPasswordStrong(123 as unknown as string)).toBe(false);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("produces a bcrypt hash and verifies the same plaintext", async () => {
    const hash = await hashPassword("hunter2!!");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("hunter2!!", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});

describe("findUserByEmailAndPassword", () => {
  it("returns null when the user does not exist", async () => {
    dbMock.state.selectResults = [[]];
    expect(await findUserByEmailAndPassword("nobody@example.com", "x")).toBeNull();
  });

  it("returns null when the user has no passwordHash set", async () => {
    dbMock.state.selectResults = [
      [{ id: "u", email: "u@example.com", name: "U", passwordHash: null }],
    ];
    expect(await findUserByEmailAndPassword("u@example.com", "x")).toBeNull();
  });

  it("returns null when the password does not match", async () => {
    const hash = await hashPassword("right!!1");
    dbMock.state.selectResults = [
      [{ id: "u", email: "u@example.com", name: "U", passwordHash: hash }],
    ];
    expect(await findUserByEmailAndPassword("u@example.com", "wrong")).toBeNull();
  });

  it("returns the user on a correct match", async () => {
    const hash = await hashPassword("right!!1");
    dbMock.state.selectResults = [
      [{ id: "u", email: "u@example.com", name: "U", passwordHash: hash }],
    ];
    const out = await findUserByEmailAndPassword("  U@Example.COM ", "right!!1");
    expect(out).toEqual({ id: "u", email: "u@example.com", name: "U" });
  });
});

describe("setPassword", () => {
  it("rejects a weak password with a clear message", async () => {
    await expect(setPassword("user-1", "short")).rejects.toThrow(/at least 8/i);
  });

  it("updates the user row with a new bcrypt hash", async () => {
    await setPassword("user-1", "hunter22");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    const set = dbMock.state.updateCalls[0]?.set as Record<string, string>;
    expect(set["passwordHash"]).toMatch(/^\$2[aby]\$/);
  });
});

describe("issuePasswordResetToken", () => {
  it("returns null when the user does not exist", async () => {
    dbMock.state.selectResults = [[]];
    expect(await issuePasswordResetToken("nobody@example.com")).toBeNull();
  });

  it("issues a token, deletes prior tokens, and inserts a new row", async () => {
    dbMock.state.selectResults = [[{ id: "u-1" }]];

    const out = await issuePasswordResetToken("  Alice@Example.COM ");

    expect(out).not.toBeNull();
    expect(out!.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out!.expiresAt).toBeInstanceOf(Date);
    expect(dbMock.state.deleteCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      identifier: "password-reset:u-1",
    });
  });
});

describe("consumePasswordResetToken", () => {
  it("returns null for an empty/short token", async () => {
    expect(await consumePasswordResetToken("", "hunter22")).toBeNull();
    expect(await consumePasswordResetToken("short", "hunter22")).toBeNull();
  });

  it("returns null for a weak new password", async () => {
    expect(await consumePasswordResetToken("a".repeat(32), "weak")).toBeNull();
  });

  it("returns null when no verification row matches the hash", async () => {
    dbMock.state.selectResults = [[]];
    expect(await consumePasswordResetToken("a".repeat(32), "hunter22")).toBeNull();
  });

  it("returns null when the token is expired", async () => {
    dbMock.state.selectResults = [
      [{ identifier: "password-reset:u-1", token: "hash", expires: new Date(Date.now() - 1000) }],
    ];
    expect(await consumePasswordResetToken("a".repeat(32), "hunter22")).toBeNull();
  });

  it("updates the password and deletes the token in one transaction", async () => {
    dbMock.state.selectResults = [
      [{ identifier: "password-reset:u-1", token: "hash", expires: new Date(Date.now() + 60_000) }],
    ];

    const out = await consumePasswordResetToken("a".repeat(32), "hunter22");

    expect(out).toEqual({ userId: "u-1" });
    expect(dbMock.state.transactionCalls).toBe(1);
    const tx = dbMock.state.transactionPayloads[0]!;
    expect(tx.sets).toHaveLength(1);
    expect((tx.sets[0] as Record<string, string>)["passwordHash"]).toMatch(/^\$2[aby]\$/);
    expect(tx.deletes).toHaveLength(1);
  });
});
