import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  selectResults: [] as Row[][],
  returningResults: [] as Row[][],
  insertCount: 0,
  encrypted: [] as string[],
}));

const dbMock = vi.hoisted(() => {
  const selectChain: Record<string, unknown> = {};
  selectChain.from = vi.fn(() => selectChain);
  selectChain.where = vi.fn(() => selectChain);
  selectChain.orderBy = vi.fn(() => selectChain);
  selectChain.limit = vi.fn(() => Promise.resolve(state.selectResults.shift() ?? []));
  selectChain.then = vi.fn((resolve: (rows: Row[]) => unknown) =>
    resolve(state.selectResults.shift() ?? []),
  );

  const providerMutationChain: Record<string, unknown> = {};
  providerMutationChain.values = vi.fn(() => providerMutationChain);
  providerMutationChain.onConflictDoUpdate = vi.fn(() => providerMutationChain);
  providerMutationChain.returning = vi.fn(() =>
    Promise.resolve(state.returningResults.shift() ?? []),
  );
  const auditMutationChain: Record<string, unknown> = {};
  auditMutationChain.values = vi.fn(() => Promise.resolve());

  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => {
      state.insertCount += 1;
      return state.insertCount === 1 ? providerMutationChain : auditMutationChain;
    }),
    transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
  };
  return db;
});

const permissionsMock = vi.hoisted(() => ({
  requirePlatformPermission: vi.fn(async () => undefined),
}));

const cryptoMock = vi.hoisted(() => ({
  encryptSecret: vi.fn((value: string) => {
    state.encrypted.push(value);
    return {
      ciphertext: Buffer.from(`cipher:${value}`),
      lastFour: value.slice(-4),
      keyVersion: 1,
    };
  }),
  decryptSecret: vi.fn((value: Buffer) => value.toString("utf8").replace(/^cipher:/, "")),
}));

const limitMock = vi.hoisted(() => ({
  getLimitForResource: vi.fn<() => Promise<number | null>>(async () => 100),
}));

const adapterMock = vi.hoisted(() => ({
  testConnection: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/auth/platform-access", () => permissionsMock);
vi.mock("@/lib/security/secrets", () => cryptoMock);
vi.mock("@/lib/usage/get-limit-for-resource", () => limitMock);
vi.mock("@/lib/storage/r2-adapter", () => ({
  R2ObjectStorageAdapter: vi.fn(() => adapterMock),
  StorageConfigurationError: class StorageConfigurationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "StorageConfigurationError";
    }
  },
}));

const {
  getAgencyStorageAdapter,
  getAgencyStorageContext,
  getAgencyStorageSummary,
  saveManagedR2Config,
  testR2Connection,
} = await import("@/lib/storage/config");
const { StorageConfigurationError } = await import("@/lib/storage/r2-adapter");

const actor = { id: "platform-user" };
const validConfig = {
  accountId: "account-1",
  endpoint: "https://account-1.r2.cloudflarestorage.com/",
  bucket: "planner-media",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  storageClass: "standard" as const,
};

function agencyConfig(overrides: Row = {}): Row {
  return {
    agencyId: "agency-1",
    mode: "managed",
    keyPrefix: "agencies/agency-1",
    endpointOverride: null,
    bucketOverride: null,
    enabled: true,
    status: "healthy",
    lastHealthCheckAt: null,
    lastHealthCheckOk: null,
    ...overrides,
  };
}

function platformConfig(overrides: Row = {}): Row {
  return {
    accountId: "account-1",
    endpoint: "https://account-1.r2.cloudflarestorage.com",
    bucket: "planner-media",
    accessKeyCiphertext: Buffer.from("cipher:access-key").toString("base64"),
    accessKeyKeyVersion: 1,
    secretAccessKeyCiphertext: Buffer.from("cipher:secret-key").toString("base64"),
    secretAccessKeyKeyVersion: 1,
    storageClass: "standard",
    status: "healthy",
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  state.selectResults.length = 0;
  state.returningResults.length = 0;
  state.insertCount = 0;
  state.encrypted.length = 0;
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.transaction.mockClear();
  permissionsMock.requirePlatformPermission.mockClear();
  permissionsMock.requirePlatformPermission.mockResolvedValue(undefined);
  cryptoMock.encryptSecret.mockClear();
  cryptoMock.decryptSecret.mockClear();
  adapterMock.testConnection.mockClear();
  adapterMock.testConnection.mockResolvedValue(undefined);
  limitMock.getLimitForResource.mockClear();
});

describe("testR2Connection and saveManagedR2Config", () => {
  it("validates input and runs the exact adapter probe", async () => {
    await expect(testR2Connection(validConfig)).resolves.toBeUndefined();
    expect(adapterMock.testConnection).toHaveBeenCalledTimes(1);
    await expect(testR2Connection({ endpoint: "http://insecure.example" })).rejects.toThrow();
  });

  it("requires platform permission and does not save a failed credential probe", async () => {
    permissionsMock.requirePlatformPermission.mockRejectedValueOnce(new Error("denied"));
    await expect(saveManagedR2Config(actor, validConfig)).rejects.toThrow("denied");
    expect(adapterMock.testConnection).not.toHaveBeenCalled();

    adapterMock.testConnection.mockRejectedValueOnce(new Error("provider down"));
    await expect(saveManagedR2Config(actor, validConfig)).rejects.toThrow("provider down");
    expect(cryptoMock.encryptSecret).not.toHaveBeenCalled();
  });

  it("encrypts credentials and records create/update audit events", async () => {
    state.selectResults.push([]);
    state.returningResults.push([{ id: "provider-1" }]);
    await expect(saveManagedR2Config(actor, validConfig)).resolves.toEqual({ id: "provider-1" });
    expect(state.encrypted).toEqual(["access-key", "secret-key"]);

    state.selectResults.push([{ id: "provider-1", status: "healthy" }]);
    state.returningResults.push([{ id: "provider-1" }]);
    state.insertCount = 0;
    await saveManagedR2Config(actor, validConfig);
    expect(dbMock.transaction).toHaveBeenCalledTimes(2);
    expect(permissionsMock.requirePlatformPermission).toHaveBeenCalledWith(
      actor,
      "platform.console.manage",
    );
  });
});

describe("getAgencyStorageContext", () => {
  it.each([
    ["missing", undefined, undefined],
    ["disabled", agencyConfig({ enabled: false }), undefined],
    ["provider missing", agencyConfig(), undefined],
    ["provider unhealthy", agencyConfig(), platformConfig({ status: "unhealthy" })],
    ["agency-owned", agencyConfig({ mode: "agency_owned" }), platformConfig()],
  ])("rejects %s storage state", async (label, agency, provider) => {
    expect(label).toBeTruthy();
    state.selectResults.push(agency ? [agency] : []);
    if (agency) state.selectResults.push(provider ? [provider] : []);
    await expect(getAgencyStorageContext("agency-1", dbMock as never)).rejects.toBeInstanceOf(
      StorageConfigurationError,
    );
  });

  it("decrypts the managed credentials and applies agency overrides", async () => {
    state.selectResults.push([
      agencyConfig({
        endpointOverride: "https://override.example",
        bucketOverride: "agency-media",
      }),
    ]);
    state.selectResults.push([platformConfig()]);
    const context = await getAgencyStorageContext("agency-1", dbMock as never);
    expect(context.bucket).toBe("agency-media");
    expect(context.keyPrefix).toBe("agencies/agency-1");
    expect(cryptoMock.decryptSecret).toHaveBeenCalledTimes(2);
    expect(context.adapter).toBe(adapterMock);
  });

  it("returns the resolved adapter through the convenience method", async () => {
    state.selectResults.push([agencyConfig()]);
    state.selectResults.push([platformConfig()]);
    await expect(getAgencyStorageAdapter("agency-1", dbMock as never)).resolves.toBe(adapterMock);
  });
});

describe("getAgencyStorageSummary", () => {
  it.each([
    [50, "healthy"],
    [80, "warning"],
    [90, "urgent"],
    [100, "over_limit"],
  ])("classifies %s%% storage usage as %s", async (used, warning) => {
    state.selectResults.push(
      [agencyConfig({ status: "healthy" })],
      [{ currentValue: String(used) }],
      [{ value: "7" }],
    );
    limitMock.getLimitForResource.mockResolvedValueOnce(100);
    await expect(getAgencyStorageSummary("agency-1", dbMock as never)).resolves.toMatchObject({
      usedBytes: used,
      reservedBytes: 7,
      quotaBytes: 100,
      percentUsed: used,
      warning,
    });
  });

  it("returns safe defaults for an unconfigured agency and an unlimited quota", async () => {
    state.selectResults.push([], [], [{ value: null }]);
    limitMock.getLimitForResource.mockResolvedValueOnce(null);
    await expect(getAgencyStorageSummary("agency-1", dbMock as never)).resolves.toMatchObject({
      enabled: false,
      status: "pending",
      usedBytes: 0,
      reservedBytes: 0,
      quotaBytes: null,
      percentUsed: 0,
      warning: "healthy",
    });
  });
});
