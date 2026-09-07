import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  selectResults: [] as Row[][],
  returningResults: [] as Row[][],
}));

function makeChain() {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.for = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(state.selectResults.shift() ?? []));
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(state.returningResults.shift() ?? []));
  chain.set = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  return chain;
}

const dbMock = vi.hoisted(() => {
  const selectChain = makeChain();
  const mutationChain = makeChain();
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => mutationChain),
    update: vi.fn(() => mutationChain),
    transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
  };
  mutationChain.where = vi.fn(() => Promise.resolve());
  return db;
});

const adapterMock = vi.hoisted(() => ({
  createUploadIntent: vi.fn(async () => ({
    uploadUrl: "https://signed.example/upload",
    expiresAt: 1_800_000_000,
    requiredHeaders: { "Content-Type": "image/png" },
  })),
  completeUpload: vi.fn<
    () => Promise<{
      objectKey: string;
      contentLength: number;
      contentType: string;
      checksumSha256?: string;
    }>
  >(async () => ({
    objectKey: "unused",
    contentLength: 12,
    contentType: "image/png",
    checksumSha256: "checksum",
  })),
  createReadUrl: vi.fn(async () => "https://signed.example/read"),
  abortUpload: vi.fn(async () => undefined),
}));

const storageContextMock = vi.hoisted(() => ({
  keyPrefix: "agencies/agency-1",
  bucket: "planner-media",
  adapter: adapterMock,
}));

const capacityMock = vi.hoisted(() => ({
  reserveCapacity: vi.fn(async () => undefined),
  releaseCapacityAmount: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/storage/config", () => ({
  getAgencyStorageContext: vi.fn(async () => storageContextMock),
}));
vi.mock("@/lib/entitlements", () => capacityMock);

const {
  StorageIntentError,
  abortStorageUpload,
  completeStorageUpload,
  createStorageUploadIntent,
  expireStorageUploadIntents,
} = await import("@/lib/storage/intent-service");
const { createStorageObjectReadUrl } = await import("@/lib/storage/read-service");

const AGENCY_ID = "agency-1";
const WORKSPACE_ID = "workspace-1";
const USER_ID = "user-1";

function intent(overrides: Row = {}): Row {
  return {
    id: "intent-1",
    agencyId: AGENCY_ID,
    workspaceId: WORKSPACE_ID,
    objectId: "object-1",
    objectKey: "agencies/agency-1/workspaces/workspace-1/assets/object-1.png",
    status: "reserved",
    kind: "image",
    contentType: "image/png",
    expectedByteSize: 12,
    reservedByteSize: 12,
    checksumSha256: "checksum",
    uploadExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

const validInput = {
  agencyId: AGENCY_ID,
  workspaceId: WORKSPACE_ID,
  userId: USER_ID,
  kind: "image" as const,
  extension: ".PNG",
  contentType: "image/png",
  expectedByteSize: 12,
  checksumSha256: "checksum",
  originalName: "cover.png",
};

beforeEach(() => {
  state.selectResults.length = 0;
  state.returningResults.length = 0;
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  dbMock.transaction.mockClear();
  capacityMock.reserveCapacity.mockClear();
  capacityMock.releaseCapacityAmount.mockClear();
  adapterMock.createUploadIntent.mockClear();
  adapterMock.completeUpload.mockClear();
  adapterMock.abortUpload.mockClear();
  adapterMock.completeUpload.mockResolvedValue({
    objectKey: validInput.workspaceId,
    contentLength: 12,
    contentType: "image/png",
    checksumSha256: "checksum",
  });
});

describe("createStorageUploadIntent", () => {
  it("validates size and MIME before resolving storage", async () => {
    await expect(
      createStorageUploadIntent({ ...validInput, expectedByteSize: 0 }),
    ).rejects.toMatchObject({
      code: "storage.object_verification_failed",
    });
    await expect(
      createStorageUploadIntent({ ...validInput, expectedByteSize: 1.5 }),
    ).rejects.toMatchObject({ code: "storage.object_verification_failed" });
    await expect(
      createStorageUploadIntent({ ...validInput, expectedByteSize: 11 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: "storage.object_verification_failed" });
    await expect(
      createStorageUploadIntent({ ...validInput, contentType: "application/x-msdownload" }),
    ).rejects.toMatchObject({ code: "storage.object_verification_failed" });
    expect(adapterMock.createUploadIntent).not.toHaveBeenCalled();
  });

  it("creates a prefixed object, reserves bytes, and returns a signed intent", async () => {
    state.selectResults.push([{ agencyId: AGENCY_ID }]);
    state.returningResults.push([{ id: "object-1" }], [{ id: "intent-1" }]);

    await expect(createStorageUploadIntent(validInput)).resolves.toMatchObject({
      objectId: "object-1",
      uploadIntentId: "intent-1",
      uploadUrl: "https://signed.example/upload",
      requiredHeaders: { "Content-Type": "image/png" },
    });
    expect(capacityMock.reserveCapacity).toHaveBeenCalledWith(dbMock, AGENCY_ID, [
      { resource: "storage_bytes", increase: 12 },
    ]);
    expect(adapterMock.createUploadIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: expect.stringContaining("agencies/agency-1/workspaces/workspace-1/assets/"),
        contentLength: 12,
        checksumSha256: "checksum",
      }),
    );
  });

  it("denies a workspace from another agency and maps quota errors", async () => {
    state.selectResults.push([{ agencyId: "agency-2" }]);
    await expect(createStorageUploadIntent(validInput)).rejects.toMatchObject({
      code: "storage.workspace_not_found",
    });

    state.selectResults.push([{ agencyId: AGENCY_ID }]);
    capacityMock.reserveCapacity.mockRejectedValueOnce(new Error("storage limit exceeded"));
    await expect(createStorageUploadIntent(validInput)).rejects.toMatchObject({
      code: "storage.quota_exceeded",
    });
  });
});

describe("completeStorageUpload", () => {
  it("returns idempotently for a completed intent and rejects missing/final intents", async () => {
    state.selectResults.push([intent({ status: "completed" })]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).resolves.toEqual({
      objectId: "object-1",
      objectKey: expect.stringContaining("agencies/agency-1/"),
      size: 12,
    });

    state.selectResults.push([]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "missing",
      }),
    ).rejects.toMatchObject({
      code: "storage.intent_not_found",
    });

    state.selectResults.push([intent({ status: "failed" })]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).rejects.toMatchObject({
      code: "storage.intent_already_final",
    });
  });

  it("releases an expired reservation", async () => {
    state.selectResults.push([intent({ uploadExpiresAt: new Date(Date.now() - 1_000) })]);
    state.selectResults.push([intent({ uploadExpiresAt: new Date(Date.now() - 1_000) })]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).rejects.toMatchObject({
      code: "storage.intent_expired",
    });
    expect(capacityMock.releaseCapacityAmount).toHaveBeenCalled();
  });

  it("rejects a cross-agency object key and deletes the remote object", async () => {
    state.selectResults.push([
      intent({ objectKey: "agencies/agency-2/workspaces/workspace-1/assets/object.png" }),
    ]);
    state.selectResults.push([
      intent({ objectKey: "agencies/agency-2/workspaces/workspace-1/assets/object.png" }),
    ]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).rejects.toMatchObject({
      code: "storage.object_verification_failed",
    });
    expect(adapterMock.abortUpload).toHaveBeenCalledWith({
      objectKey: "agencies/agency-2/workspaces/workspace-1/assets/object.png",
    });
  });

  it("verifies metadata/checksum and commits a valid upload", async () => {
    state.selectResults.push([intent()]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).resolves.toEqual({
      objectId: "object-1",
      objectKey: expect.stringContaining("agencies/agency-1/"),
      size: 12,
    });
    expect(dbMock.transaction).toHaveBeenCalled();

    state.selectResults.push([intent()]);
    adapterMock.completeUpload.mockResolvedValueOnce({
      objectKey: "wrong",
      contentLength: 99,
      contentType: "image/png",
    });
    state.selectResults.push([intent()]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).rejects.toMatchObject({
      code: "storage.object_verification_failed",
    });

    state.selectResults.push([intent()]);
    adapterMock.completeUpload.mockResolvedValueOnce({
      objectKey: "wrong",
      contentLength: 12,
      contentType: "image/png",
      checksumSha256: "wrong-checksum",
    });
    state.selectResults.push([intent()]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).rejects.toMatchObject({
      code: "storage.object_verification_failed",
    });
  });

  it("maps provider failures and supports explicit abort", async () => {
    state.selectResults.push([intent()]);
    adapterMock.completeUpload.mockRejectedValueOnce(new Error("provider unavailable"));
    state.selectResults.push([intent()]);
    await expect(
      completeStorageUpload({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        intentId: "intent-1",
      }),
    ).rejects.toMatchObject({
      code: "storage.object_verification_failed",
    });

    state.selectResults.push([intent()]);
    await abortStorageUpload({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      intentId: "intent-1",
    });
    expect(adapterMock.abortUpload).toHaveBeenCalled();
  });
});

describe("expireStorageUploadIntents", () => {
  it("expires every returned reservation and honors the batch limit", async () => {
    state.selectResults.push([
      { agencyId: AGENCY_ID, workspaceId: WORKSPACE_ID, id: "intent-1" },
      { agencyId: AGENCY_ID, workspaceId: WORKSPACE_ID, id: "intent-2" },
    ]);
    state.selectResults.push([intent({ id: "intent-1" })]);
    state.selectResults.push([intent({ id: "intent-2" })]);
    await expect(expireStorageUploadIntents(2)).resolves.toBe(2);
    expect(capacityMock.releaseCapacityAmount).toHaveBeenCalledTimes(2);
    expect(adapterMock.abortUpload).toHaveBeenCalledTimes(2);
  });
});

describe("createStorageObjectReadUrl", () => {
  it("returns null for missing or inactive objects", async () => {
    state.selectResults.push([]);
    await expect(
      createStorageObjectReadUrl({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        objectId: "missing",
      }),
    ).resolves.toBeNull();
    expect(adapterMock.createReadUrl).not.toHaveBeenCalled();
  });

  it("enforces the configured bucket before signing a read URL", async () => {
    state.selectResults.push([{ objectKey: "key", bucket: "another-bucket" }]);
    await expect(
      createStorageObjectReadUrl({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        objectId: "object-1",
      }),
    ).resolves.toBeNull();
  });

  it("signs only an active object in the authorized agency/workspace", async () => {
    state.selectResults.push([{ objectKey: "agencies/agency-1/key", bucket: "planner-media" }]);
    await expect(
      createStorageObjectReadUrl({
        agencyId: AGENCY_ID,
        workspaceId: WORKSPACE_ID,
        objectId: "object-1",
        expiresInSeconds: 120,
      }),
    ).resolves.toBe("https://signed.example/read");
    expect(adapterMock.createReadUrl).toHaveBeenCalledWith({
      objectKey: "agencies/agency-1/key",
      expiresInSeconds: 120,
    });

    state.selectResults.push([{ objectKey: "agencies/agency-1/key", bucket: "planner-media" }]);
    await createStorageObjectReadUrl({
      agencyId: AGENCY_ID,
      workspaceId: WORKSPACE_ID,
      objectId: "object-1",
      expiresInSeconds: 0,
    });
    expect(adapterMock.createReadUrl).toHaveBeenLastCalledWith({
      objectKey: "agencies/agency-1/key",
    });
  });
});

it("exposes a stable typed error", () => {
  const error = new StorageIntentError("storage.intent_not_found", "not found");
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("StorageIntentError");
  expect(error.code).toBe("storage.intent_not_found");
});
