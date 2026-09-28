import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  contentItems,
  mediaAssets,
  mediaAssetLinks,
  mediaFolders,
  storageObjects,
} from "@/lib/db/schema";

/**
 * Regression tests for `registerUploadedMediaAsset`'s return contract.
 *
 * The browser only promotes an upload into the delivery picker when the
 * server reports `status === "ready"`, so a return path that omits `status`
 * strands the user's file at "processing" even though the row is healthy.
 * Three of the four return paths used to return `{ id, storageObjectId }`
 * only, which is exactly what this file locks down.
 *
 * The DB mock keys rows on `getTableName(table)` rather than the table
 * object: each case resets the module registry to re-mock `@/lib/db`, which
 * gives the service a fresh copy of the schema and breaks identity keying.
 * Deriving the names here also keeps the keys honest if a table is renamed.
 */

const TABLE = {
  storageObjects: getTableName(storageObjects),
  contentItems: getTableName(contentItems),
  mediaFolders: getTableName(mediaFolders),
  mediaAssets: getTableName(mediaAssets),
  mediaAssetLinks: getTableName(mediaAssetLinks),
} as const;

const quarantine = vi.fn<(input: unknown) => Promise<boolean>>(async () => true);
const validate = vi.fn();
const storePreview = vi.fn<(input: unknown) => Promise<void>>(async () => undefined);

vi.mock("@/lib/auth/policy", () => ({
  canWriteToWorkspace: vi.fn(async () => true),
  hasWorkspaceRole: vi.fn(async () => false),
  isAgencyAdmin: vi.fn(async () => false),
  isAgencyMember: vi.fn(async () => false),
}));

vi.mock("@/lib/media/validation", () => ({
  validateStoredMediaObject: (input: unknown) => validate(input),
  MediaValidationError: class MediaValidationError extends Error {
    constructor(
      public readonly code: "invalid_signature" | "storage_unavailable" | "read_failed",
      message: string,
    ) {
      super(message);
      this.name = "MediaValidationError";
    }
  },
}));

vi.mock("@/lib/media/quarantine", () => ({
  quarantineMediaObject: (input: unknown) => quarantine(input),
}));

vi.mock("@/lib/media/thumbnails", () => ({
  storePreviewForAsset: (input: unknown) => storePreview(input),
}));

const ACTOR = { id: "00000000-0000-0000-0000-000000000001" } as never;
const AGENCY = "11111111-aaaa-aaaa-aaaa-111111111111";
const WORKSPACE = "22222222-bbbb-bbbb-bbbb-222222222222";
const OBJECT_ID = "33333333-cccc-cccc-cccc-333333333333";
const CONTENT_ITEM_ID = "44444444-dddd-dddd-dddd-444444444444";
const FOLDER_ID = "55555555-eeee-eeee-eeee-555555555555";
const ASSET_ID = "66666666-ffff-ffff-ffff-666666666666";

const STORAGE_OBJECT = {
  id: OBJECT_ID,
  agencyId: AGENCY,
  workspaceId: WORKSPACE,
  status: "active",
  mimeType: "image/png",
  byteSize: 8,
};

const CONTENT_ITEM = {
  id: CONTENT_ITEM_ID,
  workspaceId: WORKSPACE,
  agencyId: AGENCY,
  format: "image",
  plannedPublishAt: new Date("2026-03-04T09:00:00Z"),
  timezone: "Europe/Berlin",
};

function assetRow(status: string) {
  return {
    id: ASSET_ID,
    agencyId: AGENCY,
    ownerWorkspaceId: WORKSPACE,
    storageObjectId: OBJECT_ID,
    visibility: "workspace",
    status,
    failureCode: status === "ready" ? null : "validation_pending",
  };
}

type Rows = Map<string, unknown[]>;

function baseRows(assetStatus: string | null): Rows {
  return new Map<string, unknown[]>([
    [TABLE.storageObjects, [STORAGE_OBJECT]],
    [TABLE.contentItems, [CONTENT_ITEM]],
    [TABLE.mediaFolders, [{ id: FOLDER_ID }]],
    [TABLE.mediaAssets, assetStatus === null ? [] : [assetRow(assetStatus)]],
  ]);
}

function makeDb(
  rows: Rows,
  returningRows: unknown[][],
  inserts: { table: string; values: unknown }[],
  linkInsertError?: Error,
) {
  const select = (selection?: unknown) => {
    let table = "";
    // Emulate the SQL projection: a `select({ a, b })` returns only those
    // fields, so a caller that forgets to select `status` gets `undefined`
    // here exactly as it would in production. Without this the fixture rows
    // would smuggle every field through and the test would assert nothing.
    const project = (row: unknown) => {
      if (!selection || typeof selection !== "object" || Array.isArray(selection)) return row;
      const picked = row as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(selection as Record<string, unknown>)) out[key] = picked[key];
      return out;
    };
    const settle = () => Promise.resolve((rows.get(table) ?? []).map(project));
    const self: Record<string, unknown> = {
      from(next: unknown) {
        table = getTableName(next as never);
        return self;
      },
      innerJoin: () => self,
      where: () => self,
      orderBy: () => self,
      for: () => self,
      limit: () => settle(),
      offset: () => settle(),
    };
    self.then = (resolve: (r: unknown[]) => void) => resolve((rows.get(table) ?? []).map(project));
    return self;
  };
  const insert = (table: unknown) => {
    const name = getTableName(table as never);
    const self: Record<string, unknown> = {
      values: (values: unknown) => {
        inserts.push({ table: name, values });
        if (name === TABLE.mediaAssetLinks && linkInsertError) throw linkInsertError;
        return self;
      },
      onConflictDoNothing: () => self,
      onConflictDoUpdate: () => self,
      returning: () => {
        const result = returningRows.shift() ?? [];
        if (name === TABLE.mediaAssets && result.length > 0) rows.set(name, result);
        return Promise.resolve(result);
      },
    };
    return self;
  };
  const update = () => {
    const self: Record<string, unknown> = { set: () => self, where: () => Promise.resolve([]) };
    return self;
  };
  const db: Record<string, unknown> = { select, insert, update };
  db.transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return db;
}

/** Fresh module graph per test so each case gets its own db mock. */
async function importService(
  rows: Rows,
  returningRows: unknown[][] = [[]],
  linkInsertError?: Error,
) {
  const inserts: { table: string; values: unknown }[] = [];
  vi.doMock("@/lib/db", () => ({ db: makeDb(rows, returningRows, inserts, linkInsertError) }));
  vi.resetModules();
  const service = await import("@/lib/media/service");
  return { service, inserts };
}

function baseInput() {
  return {
    actor: ACTOR,
    agencyId: AGENCY,
    workspaceId: WORKSPACE,
    storageObjectId: OBJECT_ID,
    title: "hero.png",
    folderId: FOLDER_ID,
  };
}

describe("registerUploadedMediaAsset return contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validate.mockResolvedValue({ width: 800, height: 600 });
    storePreview.mockResolvedValue(undefined);
    quarantine.mockResolvedValue(true);
  });

  it("returns a ready status on a fresh, validated registration", async () => {
    const { service } = await importService(baseRows(null), [[assetRow("ready")]]);

    const result = await service.registerUploadedMediaAsset(baseInput());

    expect(result).toMatchObject({
      id: ASSET_ID,
      storageObjectId: OBJECT_ID,
      status: "ready",
      failureCode: null,
    });
  });

  it("reports the true status when the object is already registered", async () => {
    const { service } = await importService(baseRows("ready"));

    const result = await service.registerUploadedMediaAsset({
      ...baseInput(),
      contentItemId: CONTENT_ITEM_ID,
    });

    expect(result.status).toBe("ready");
    expect(result.id).toBe(ASSET_ID);
    expect(result.storageObjectId).toBe(OBJECT_ID);
    expect(result.failureCode).toBeNull();
  });

  it("re-asserts the content-item link when returning an already-registered asset", async () => {
    const { service, inserts } = await importService(baseRows("ready"));

    await service.registerUploadedMediaAsset({ ...baseInput(), contentItemId: CONTENT_ITEM_ID });

    const linkInsert = inserts.find((entry) => entry.table === TABLE.mediaAssetLinks) as
      { values: { mediaAssetId: string; targetId: string; targetType: string } } | undefined;

    // The pre-fix early return skipped the link entirely, which is how an
    // asset could end up committed-but-unattached with no way to recover.
    expect(linkInsert).toBeDefined();
    expect(linkInsert?.values).toMatchObject({
      mediaAssetId: ASSET_ID,
      targetId: CONTENT_ITEM_ID,
      targetType: "content_item",
    });
  });

  it("does not claim success when linking fails after the asset is committed", async () => {
    const linkError = new Error("content-item link failed");
    const { service } = await importService(baseRows(null), [[assetRow("ready")]], linkError);

    await expect(
      service.registerUploadedMediaAsset({ ...baseInput(), contentItemId: CONTENT_ITEM_ID }),
    ).rejects.toThrow("content-item link failed");
    expect(quarantine).not.toHaveBeenCalled();
  });

  it("keeps an asset processing and does not quarantine when validation fails transiently", async () => {
    const { service } = await importService(baseRows(null), [[assetRow("processing")]]);
    const { MediaValidationError } = await import("@/lib/media/validation");
    validate.mockRejectedValue(
      new MediaValidationError("storage_unavailable", "The media object could not be read."),
    );

    const result = await service.registerUploadedMediaAsset(baseInput());

    // Transient reads are retried inline before the row is left for cron.
    expect(validate).toHaveBeenCalledTimes(3);
    expect(quarantine).not.toHaveBeenCalled();
    expect(result.status).toBe("processing");
  });

  it("quarantines and fails an asset whose signature is definitively invalid", async () => {
    const { service } = await importService(baseRows(null), [[assetRow("failed")]]);
    const { MediaValidationError } = await import("@/lib/media/validation");
    validate.mockRejectedValue(
      new MediaValidationError("invalid_signature", "The media content does not match."),
    );

    const result = await service.registerUploadedMediaAsset(baseInput());

    expect(quarantine).toHaveBeenCalledWith({ agencyId: AGENCY, objectId: OBJECT_ID });
    expect(result.status).toBe("failed");
    // A deterministic verdict must not be retried.
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
