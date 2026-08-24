import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for `src/lib/ai/provider-secret.ts` (M3.4 — AI in-DB secret).
 *
 * The service contract is:
 *   - `setManagedAiSecret(actor, agencyId, input)` — encrypts the
 *     key, writes the `ai_provider_secret` row, mirrors the
 *     `last_four` into `ai_feature_setting.masked_key_suffix`, and
 *     flips `enabled = true`. Idempotent.
 *   - `clearManagedAiSecret(actor, agencyId, input)` — deletes
 *     the ciphertext row, reverts the feature setting to
 *     `'environment'`. Does not change `enabled`.
 *   - `loadManagedAiSecret(agencyId)` — decrypts and returns the
 *     key, or `null` when not configured.
 *   - `hasManagedAiSecret(agencyId)` — boolean probe.
 *   - `getManagedSecretStatus(agencyId)` — typed snapshot of the
 *     feature setting.
 *
 * The encryption helper is exercised separately in
 * `tests/unit/secret-encryption.test.ts`. Here we mock it so the
 * service tests focus on the DB / policy / audit contract.
 */

vi.mock("server-only", () => ({}));

const encryptionMock = vi.hoisted(() => ({
  encryptForAgency: vi.fn((plaintext: string) => ({
    ciphertext: Buffer.from(`encrypted:${plaintext}`, "utf8"),
    keyVersion: 1,
    lastFour: plaintext.slice(-4).padStart(4, "*"),
  })),
  decryptForAgency: vi.fn((ciphertext: Buffer) => {
    const s = ciphertext.toString("utf8");
    if (!s.startsWith("encrypted:")) throw new Error("invalid");
    return s.slice("encrypted:".length);
  }),
  isValidApiKeyShape: vi.fn((input: string) => /^sk-[A-Za-z0-9_-]{8,}$/.test(input)),
  MissingEncryptionKeyError: class MissingEncryptionKeyError extends Error {
    constructor() {
      super("missing");
      this.name = "MissingEncryptionKeyError";
    }
  },
}));

vi.mock("@/lib/security/secrets", () => encryptionMock);

type DrizzleState = {
  selectResults: unknown[][];
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
};

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(state.selectResults.shift() ?? []));
    const thenable = (next: () => Record<string, unknown>) =>
      new Proxy(next(), {
        get(target, prop, receiver) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(state.selectResults.shift() ?? []);
          }
          if (prop === "limit") return target.limit;
          return Reflect.get(target, prop, receiver);
        },
      });
    chain.where = vi.fn(() => thenable(() => chain));
    chain.orderBy = vi.fn(() => thenable(() => chain));
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);

  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
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
    state.updateCalls.push({ set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const deleteChain: Record<string, unknown> = {};
  deleteChain.where = vi.fn(() => Promise.resolve());
  const del = vi.fn(() => deleteChain);

  const transaction = vi.fn(async (cb: (tx: typeof dbMock) => unknown) => cb(dbMock));
  return { select, insert, update, delete: del, transaction, state };
}

const dbMock = vi.hoisted(() =>
  makeDrizzleMock({
    selectResults: [],
    insertCalls: [],
    updateCalls: [],
  }),
);

vi.mock("@/lib/db", () => ({
  db: {
    ...dbMock,
    transaction: (...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dbMock.transaction as any)(...args),
  },
}));

const policyOverrides = vi.hoisted(() => ({
  isAgencyAdminResult: true as boolean,
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return {
    ...actual,
    isAgencyAdmin: vi.fn(async () => policyOverrides.isAgencyAdminResult),
  };
});

const {
  setManagedAiSecret,
  clearManagedAiSecret,
  loadManagedAiSecret,
  hasManagedAiSecret,
  getManagedSecretStatus,
  ManagedSecretError,
  SetManagedAiSecretSchema,
} = await import("@/lib/ai/provider-secret");

const AGENCY_ID = "00000000-0000-4000-8000-00000000a101";
const ACTOR_ID = "00000000-0000-4000-8000-00000000a102";

const actor = { id: ACTOR_ID };

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.transaction.mockClear();
  policyOverrides.isAgencyAdminResult = true;
  encryptionMock.encryptForAgency.mockClear();
  encryptionMock.decryptForAgency.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SetManagedAiSecretSchema", () => {
  it("accepts a typical sk-... key", () => {
    const parsed = SetManagedAiSecretSchema.parse({ apiKey: "sk-abcdef1234567890" });
    expect(parsed.apiKey).toBe("sk-abcdef1234567890");
  });

  it("rejects keys that are too short", () => {
    expect(() => SetManagedAiSecretSchema.parse({ apiKey: "sk-short" })).toThrow();
  });

  it("rejects keys without the sk- prefix", () => {
    expect(() => SetManagedAiSecretSchema.parse({ apiKey: "xx-abcdef1234567890" })).toThrow();
  });

  it("rejects non-string input", () => {
    expect(() => SetManagedAiSecretSchema.parse({ apiKey: 12345 })).toThrow();
  });
});

describe("setManagedAiSecret", () => {
  it("rejects when the actor is not an agency admin", async () => {
    policyOverrides.isAgencyAdminResult = false;
    await expect(
      setManagedAiSecret(actor, AGENCY_ID, { apiKey: "sk-abcdef1234567890" }),
    ).rejects.toThrow();
  });

  it("inserts a new secret + feature row + audit row on first write", async () => {
    // hasManagedAiSecret (returns null) → no DB read; the
    // transaction does 2 selects: existing secret (empty),
    // existing feature row (empty). Then 3 inserts: secret
    // row, feature row, audit row.
    dbMock.state.selectResults.push([]); // no existing secret
    dbMock.state.selectResults.push([]); // no existing feature row
    const result = await setManagedAiSecret(actor, AGENCY_ID, {
      apiKey: "sk-abcdef1234567890",
    });
    expect(result.lastFour).toBe("7890");
    expect(encryptionMock.encryptForAgency).toHaveBeenCalledWith("sk-abcdef1234567890");
    // 2 inserts: secret row, feature row, + 1 audit row
    expect(dbMock.insert).toHaveBeenCalledTimes(3);
    const values = dbMock.state.insertCalls.map((c) => c.values);
    expect(values[0]).toMatchObject({
      agencyId: AGENCY_ID,
      lastFour: "7890",
      keyVersion: 1,
      rotatedByUserId: ACTOR_ID,
    });
    expect(values[1]).toMatchObject({
      agencyId: AGENCY_ID,
      enabled: true,
      keySource: "managed_secret",
      maskedKeySuffix: "7890",
    });
    expect(values[2]).toMatchObject({
      action: "ai_secret.set",
      targetType: "agency",
      targetId: AGENCY_ID,
      outcome: "success",
      metadata: { lastFour: "7890", keyVersion: 1 },
    });
  });

  it("updates the existing secret and feature row on second write", async () => {
    dbMock.state.selectResults.push([{ agencyId: AGENCY_ID }]); // existing secret
    dbMock.state.selectResults.push([{ agencyId: AGENCY_ID }]); // existing feature row
    const result = await setManagedAiSecret(actor, AGENCY_ID, {
      apiKey: "sk-zzzzzzzzzzzzzzzz",
    });
    expect(result.lastFour).toBe("zzzz");
    expect(dbMock.update).toHaveBeenCalledTimes(2);
    expect(dbMock.insert).toHaveBeenCalledTimes(1); // audit row only
  });

  it("throws ManagedSecretError when the encryption key is missing", async () => {
    encryptionMock.encryptForAgency.mockImplementationOnce(() => {
      throw new encryptionMock.MissingEncryptionKeyError();
    });
    try {
      await setManagedAiSecret(actor, AGENCY_ID, {
        apiKey: "sk-abcdef1234567890",
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ManagedSecretError);
      expect((e as InstanceType<typeof ManagedSecretError>).code).toBe(
        "managed_secret.missing-key",
      );
    }
  });
});

describe("clearManagedAiSecret", () => {
  it("rejects when the actor is not an agency admin", async () => {
    policyOverrides.isAgencyAdminResult = false;
    await expect(
      clearManagedAiSecret(actor, AGENCY_ID, { reason: "off-rotation" }),
    ).rejects.toThrow();
  });

  it("deletes the secret row + reverts the feature setting + audit row", async () => {
    await clearManagedAiSecret(actor, AGENCY_ID, { reason: "off-rotation" });
    // 1 update (feature setting), 1 delete, 1 insert (audit row).
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const updateSet = dbMock.state.updateCalls[0]?.set;
    expect(updateSet).toMatchObject({
      keySource: "environment",
      maskedKeySuffix: null,
      updatedBy: ACTOR_ID,
    });
    // 1 insert (audit) — only the audit row
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    const audit = dbMock.state.insertCalls[0]?.values;
    expect(audit).toMatchObject({
      action: "ai_secret.clear",
      targetType: "agency",
      targetId: AGENCY_ID,
      outcome: "success",
      metadata: { reason: "off-rotation" },
    });
  });
});

describe("loadManagedAiSecret", () => {
  it("returns null when no secret row exists", async () => {
    dbMock.state.selectResults.push([]);
    const result = await loadManagedAiSecret(AGENCY_ID);
    expect(result).toBeNull();
  });

  it("decrypts the ciphertext and returns the key + lastFour", async () => {
    dbMock.state.selectResults.push([
      {
        ciphertext: Buffer.from("encrypted:sk-1234567890abcdef", "utf8"),
        keyVersion: 1,
        lastFour: "cdef",
      },
    ]);
    const result = await loadManagedAiSecret(AGENCY_ID);
    expect(result).toEqual({
      apiKey: "sk-1234567890abcdef",
      lastFour: "cdef",
      keyVersion: 1,
    });
  });
});

describe("hasManagedAiSecret", () => {
  it("returns false when no row exists", async () => {
    dbMock.state.selectResults.push([]);
    const result = await hasManagedAiSecret(AGENCY_ID);
    expect(result).toBe(false);
  });

  it("returns true when a row exists", async () => {
    dbMock.state.selectResults.push([{ agencyId: AGENCY_ID }]);
    const result = await hasManagedAiSecret(AGENCY_ID);
    expect(result).toBe(true);
  });
});

describe("getManagedSecretStatus", () => {
  it("returns 'missing' when the feature setting row does not exist", async () => {
    dbMock.state.selectResults.push([]);
    const result = await getManagedSecretStatus(AGENCY_ID);
    expect(result).toEqual({ keySource: "missing" });
  });

  it("returns 'managed_secret' when the feature setting says so", async () => {
    dbMock.state.selectResults.push([
      {
        keySource: "managed_secret",
        maskedKeySuffix: "cdef",
        enabled: true,
      },
    ]);
    const result = await getManagedSecretStatus(AGENCY_ID);
    expect(result).toEqual({
      keySource: "managed_secret",
      lastFour: "cdef",
      enabled: true,
    });
  });

  it("returns 'environment' when the feature setting is on the env key", async () => {
    dbMock.state.selectResults.push([
      {
        keySource: "environment",
        maskedKeySuffix: null,
        enabled: false,
      },
    ]);
    const result = await getManagedSecretStatus(AGENCY_ID);
    expect(result).toEqual({
      keySource: "environment",
      lastFour: null,
      enabled: false,
    });
  });
});
