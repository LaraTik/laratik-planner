import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaAssets, storageObjects } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{
    assetId: string;
    agencyId: string;
    workspaceId: string;
    objectId: string;
    contentType: string;
  }>,
  limit: 0,
  updates: [] as Array<{ table: unknown; values: unknown }>,
  validate: vi.fn(),
  quarantine: vi.fn<(input: unknown) => Promise<boolean>>(async () => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/policy", () => ({
  canWriteToWorkspace: vi.fn(async () => true),
  hasWorkspaceRole: vi.fn(async () => false),
  isAgencyAdmin: vi.fn(async () => false),
  isAgencyMember: vi.fn(async () => false),
}));
vi.mock("@/lib/media/validation", () => ({
  validateStoredMediaObject: (input: unknown) => mocks.validate(input),
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
  quarantineMediaObject: (input: unknown) => mocks.quarantine(input),
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: (value: number) => {
          mocks.limit = value;
          return Promise.resolve(mocks.rows);
        },
      };
      return query;
    },
    update: (table: unknown) => {
      const query = {
        set: (values: unknown) => {
          mocks.updates.push({ table, values });
          return query;
        },
        where: async () => [],
      };
      return query;
    },
  },
}));

import { MediaValidationError } from "@/lib/media/validation";
import { processPendingMediaAssets } from "@/features/media/server";

const rows = [
  {
    assetId: "asset-ready",
    agencyId: "agency-1",
    workspaceId: "workspace-1",
    objectId: "object-ready",
    contentType: "image/png",
  },
  {
    assetId: "asset-invalid",
    agencyId: "agency-1",
    workspaceId: "workspace-1",
    objectId: "object-invalid",
    contentType: "image/png",
  },
  {
    assetId: "asset-transient",
    agencyId: "agency-1",
    workspaceId: "workspace-1",
    objectId: "object-transient",
    contentType: "image/png",
  },
];

describe("processPendingMediaAssets", () => {
  beforeEach(() => {
    mocks.rows = rows;
    mocks.limit = 0;
    mocks.updates = [];
    mocks.validate.mockReset();
    mocks.validate.mockImplementation(async (input: { objectId: string }) => {
      if (input.objectId === "object-invalid") {
        throw new MediaValidationError("invalid_signature", "Invalid image signature.");
      }
      if (input.objectId === "object-transient") {
        throw new MediaValidationError("storage_unavailable", "Storage read failed.");
      }
      return { width: 800, height: 600 };
    });
    mocks.quarantine.mockClear();
  });

  it("promotes valid uploads, quarantines invalid ones, and leaves transient failures pending", async () => {
    const result = await processPendingMediaAssets(500);

    expect(result).toEqual({ checked: 3, ready: 1, failed: 1, pending: 1 });
    expect(mocks.limit).toBe(100);
    expect(mocks.quarantine).toHaveBeenCalledWith({
      agencyId: "agency-1",
      objectId: "object-invalid",
    });
    expect(mocks.updates).toContainEqual({
      table: storageObjects,
      values: expect.objectContaining({ width: 800, height: 600 }),
    });
    expect(mocks.updates).toContainEqual({
      table: mediaAssets,
      values: expect.objectContaining({ status: "ready", failureCode: null }),
    });
    expect(mocks.updates).toContainEqual({
      table: mediaAssets,
      values: expect.objectContaining({ status: "failed", failureCode: "invalid_signature" }),
    });
    expect(
      mocks.updates.some(
        (update) =>
          update.table === mediaAssets &&
          (update.values as { status?: string }).status === "pending",
      ),
    ).toBe(false);
  });
});
