import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  mediaAssets,
  mediaFolders,
  mediaShareLinks,
  storageObjects,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { hashMediaShareToken } from "@/lib/media/share-token";
import {
  archiveMediaFolder,
  activeMediaShareForActor,
  bulkMoveMediaAssets,
  bulkRestoreMediaAssets,
  bulkSetMediaAssetTags,
  bulkSetMediaAssetVisibility,
  bulkTrashMediaAssets,
  createPublicMediaShare,
  createMediaFolder,
  duplicateMediaAssets,
  expungeExpiredTrashedMedia,
  listMediaFolders,
  listMediaFoldersTree,
  MediaPermissionError,
  publicMediaAssetForToken,
  renameMediaFolder,
  restoreMediaAsset,
  revokePublicMediaShare,
  setMediaAssetTags,
  trashMediaAsset,
} from "@/features/media/server";
import { expectPgConstraint } from "./_db-error";

vi.mock("@/lib/storage/intent-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/intent-service")>();
  return {
    ...actual,
    copyStorageObject: vi.fn(async (input: { sourceObjectId: string; userId: string }) => {
      const { db: database } = await import("@/lib/db");
      const { storageObjects: objects } = await import("@/lib/db/schema");
      const [source] = await database
        .select()
        .from(objects)
        .where(eq(objects.id, input.sourceObjectId));
      if (!source) throw new Error("Source object not found");
      const [copy] = await database
        .insert(objects)
        .values({
          agencyId: source.agencyId,
          workspaceId: source.workspaceId,
          provider: source.provider,
          bucket: source.bucket,
          objectKey: `${source.objectKey}-copy-${Date.now()}`,
          status: source.status,
          kind: source.kind,
          originalName: source.originalName,
          mimeType: source.mimeType,
          byteSize: source.byteSize,
          checksumSha256: source.checksumSha256,
          width: source.width,
          height: source.height,
          durationMs: source.durationMs,
          createdBy: input.userId,
        })
        .returning();
      return { objectId: copy!.id, objectKey: copy!.objectKey, size: copy!.byteSize };
    }),
    discardUnattachedStorageObjectCopy: vi.fn(async () => undefined),
  };
});

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

describe("media sharing and folder database contract", () => {
  let userId: string;
  let agencyId: string;
  let workspaceId: string;
  let assetId: string;
  let storageObjectId: string;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE media_share_link, media_asset, media_folder, storage_object, workspace, agency, "user" RESTART IDENTITY CASCADE`,
    );

    const [user] = await db
      .insert(users)
      .values({ email: "media-manager@sharing.test", displayName: "Media Manager" })
      .returning();
    const [agency] = await db
      .insert(agencies)
      .values({ name: "Sharing Agency", slug: "sharing" })
      .returning();
    const [workspace] = await db
      .insert(workspaces)
      .values({ agencyId: agency!.id, name: "Main", slug: "main", createdBy: user!.id })
      .returning();
    const [object] = await db
      .insert(storageObjects)
      .values({
        agencyId: agency!.id,
        workspaceId: workspace!.id,
        bucket: "fixture",
        objectKey: "fixture/image.png",
        kind: "image",
        mimeType: "image/png",
        originalName: "image.png",
        byteSize: 4,
        createdBy: user!.id,
      })
      .returning();
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        agencyId: agency!.id,
        ownerWorkspaceId: workspace!.id,
        storageObjectId: object!.id,
        title: "Shared image",
        status: "ready",
        sourceType: "browser_file",
        createdBy: user!.id,
        updatedBy: user!.id,
      })
      .returning();
    const [membership] = await db
      .insert(workspaceMemberships)
      .values({ workspaceId: workspace!.id, userId: user!.id, status: "active" })
      .returning();
    await db.insert(workspaceMembershipRoles).values({
      workspaceMembershipId: membership!.id,
      role: "workspace_manager",
    });

    userId = user!.id;
    agencyId = agency!.id;
    workspaceId = workspace!.id;
    assetId = asset!.id;
    storageObjectId = object!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("scopes folders to workspaces and allows names to repeat under different parents", async () => {
    const [folder] = await db
      .insert(mediaFolders)
      .values({ agencyId, workspaceId, name: "Campaign", createdBy: userId })
      .returning();
    expect(folder?.workspaceId).toBe(workspaceId);
    expect(folder?.name).toBe("Campaign");

    await expectPgConstraint(
      db
        .insert(mediaFolders)
        .values({ agencyId, workspaceId, name: "Campaign", createdBy: userId }),
      "media_folder_workspace_parent_name_active_uniq",
    );

    const [archive] = await db
      .insert(mediaFolders)
      .values({ agencyId, workspaceId, name: "Archive", createdBy: userId })
      .returning();
    const [campaignAssets] = await db
      .insert(mediaFolders)
      .values({
        agencyId,
        workspaceId,
        parentId: folder!.id,
        name: "Assets",
        createdBy: userId,
      })
      .returning();
    const [archiveAssets] = await db
      .insert(mediaFolders)
      .values({
        agencyId,
        workspaceId,
        parentId: archive!.id,
        name: "Assets",
        createdBy: userId,
      })
      .returning();
    expect(campaignAssets?.parentId).toBe(folder?.id);
    expect(archiveAssets?.parentId).toBe(archive?.id);
  });

  it("stores only token hashes and permits one active link per image", async () => {
    const token = "A".repeat(43);
    const [link] = await db
      .insert(mediaShareLinks)
      .values({
        mediaAssetId: assetId,
        tokenHash: hashMediaShareToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdBy: userId,
      })
      .returning();
    expect(link?.tokenHash).toBe(hashMediaShareToken(token));
    expect(link?.tokenHash).not.toBe(token);

    await expectPgConstraint(
      db.insert(mediaShareLinks).values({
        mediaAssetId: assetId,
        tokenHash: hashMediaShareToken("B".repeat(43)),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdBy: userId,
      }),
      "media_share_link_active_asset_uniq",
    );

    await db
      .update(mediaShareLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(mediaShareLinks.mediaAssetId, assetId), eq(mediaShareLinks.id, link!.id)));
    const activeLinks = await db
      .select()
      .from(mediaShareLinks)
      .where(eq(mediaShareLinks.mediaAssetId, assetId));
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]?.revokedAt).not.toBeNull();
  });

  it("creates, rotates, reads, and revokes public shares through the feature service", async () => {
    const actor = { id: userId };
    const first = await createPublicMediaShare(actor, assetId);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const [storedFirst] = await db
      .select()
      .from(mediaShareLinks)
      .where(eq(mediaShareLinks.mediaAssetId, assetId));
    expect(storedFirst?.tokenHash).toBe(hashMediaShareToken(first.token));
    expect(storedFirst?.tokenHash).not.toBe(first.token);
    expect((await activeMediaShareForActor(actor, assetId)).share?.id).toBe(storedFirst?.id);
    expect((await publicMediaAssetForToken(first.token))?.asset.id).toBe(assetId);

    const second = await createPublicMediaShare(actor, assetId);
    const links = await db
      .select()
      .from(mediaShareLinks)
      .where(eq(mediaShareLinks.mediaAssetId, assetId));
    expect(links).toHaveLength(2);
    expect(links.filter((link) => link.revokedAt === null)).toHaveLength(1);
    expect(await publicMediaAssetForToken(first.token)).toBeNull();
    expect((await activeMediaShareForActor(actor, assetId)).share?.expiresAt).toEqual(
      second.expiresAt,
    );

    await expect(revokePublicMediaShare(actor, assetId)).resolves.toEqual({ revoked: true });
    expect(await publicMediaAssetForToken(second.token)).toBeNull();
    await expect(revokePublicMediaShare(actor, assetId)).resolves.toEqual({ revoked: false });
  });

  it("denies a non-member access to share management", async () => {
    const [outsider] = await db
      .insert(users)
      .values({ email: "media-outsider@sharing.test", displayName: "Outsider" })
      .returning();

    await expect(createPublicMediaShare({ id: outsider!.id }, assetId)).rejects.toBeInstanceOf(
      MediaPermissionError,
    );
    await expect(
      createMediaFolder({ id: outsider!.id }, { agencyId, workspaceId, name: "Private" }),
    ).rejects.toBeInstanceOf(MediaPermissionError);
  });

  it("lists and renames folders, then archives descendants and unlinks their assets", async () => {
    const actor = { id: userId };
    const root = await createMediaFolder(actor, {
      agencyId,
      workspaceId,
      name: " Campaign ",
    });
    expect(root?.name).toBe("Campaign");
    const child = await createMediaFolder(actor, {
      agencyId,
      workspaceId,
      name: " Assets ",
      parentId: root!.id,
    });
    const renamed = await renameMediaFolder(actor, child!.id, "Final Assets");
    expect(renamed?.name).toBe("Final Assets");

    await db.update(mediaAssets).set({ folderId: child!.id }).where(eq(mediaAssets.id, assetId));
    const visible = await listMediaFolders(actor, { agencyId, workspaceId });
    expect(visible.map((folder) => folder.id)).toEqual([root!.id, child!.id]);
    const tree = await listMediaFoldersTree(actor, { agencyId, workspaceId }, visible);
    expect(tree.find((folder) => folder.id === child!.id)?.name).toBe("Final Assets");
    expect(tree.find((folder) => folder.id === root!.id)?.descendantAssetCount).toBe(1);

    await expect(archiveMediaFolder(actor, root!.id)).resolves.toMatchObject({ id: root!.id });
    const afterArchive = await db
      .select()
      .from(mediaFolders)
      .where(eq(mediaFolders.workspaceId, workspaceId));
    expect(afterArchive).toHaveLength(2);
    expect(afterArchive.every((folder) => folder.archivedAt !== null)).toBe(true);
    const [asset] = await db
      .select({ folderId: mediaAssets.folderId })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, assetId));
    expect(asset?.folderId).toBeNull();
    await expect(listMediaFolders(actor, { agencyId, workspaceId })).resolves.toEqual([]);
  });

  it("expunges expired trashed assets and soft-deletes original and preview storage", async () => {
    const [preview] = await db
      .insert(storageObjects)
      .values({
        agencyId,
        workspaceId,
        bucket: "fixture",
        objectKey: "fixture/image-preview.webp",
        kind: "image",
        mimeType: "image/webp",
        originalName: "image-preview.webp",
        byteSize: 7,
        createdBy: userId,
      })
      .returning();
    const expiredAt = new Date(Date.now() - 60_000);
    await db
      .update(mediaAssets)
      .set({
        status: "trashed",
        trashedAt: expiredAt,
        deleteAfter: expiredAt,
        previewStorageObjectId: preview!.id,
      })
      .where(eq(mediaAssets.id, assetId));

    await expect(expungeExpiredTrashedMedia(10)).resolves.toEqual({
      media: 1,
      storageObjects: 2,
      bytesReleased: 11,
    });
    await expect(
      db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)),
    ).resolves.toHaveLength(0);
    const storedRows = await db
      .select({ status: storageObjects.status, deleteAfter: storageObjects.deleteAfter })
      .from(storageObjects)
      .where(sql`${storageObjects.id} in (${storageObjectId}, ${preview!.id})`);
    expect(storedRows).toHaveLength(2);
    expect(storedRows.every((row) => row.status === "soft_deleted" && row.deleteAfter)).toBe(true);
  });

  it("preserves manager-only single-asset trash and restore with the 30-day retention", async () => {
    const actor = { id: userId };
    const [outsider] = await db
      .insert(users)
      .values({ email: "media-trash-outsider@sharing.test", displayName: "Outsider" })
      .returning();
    const trashed = await trashMediaAsset(actor, assetId);
    expect(trashed?.status).toBe("trashed");
    expect(trashed?.trashedAt).toBeInstanceOf(Date);
    expect(trashed?.deleteAfter?.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    await expect(restoreMediaAsset(actor, assetId)).resolves.toMatchObject({
      status: "ready",
      trashedAt: null,
      deleteAfter: null,
    });

    await expect(trashMediaAsset({ id: outsider!.id }, assetId)).rejects.toBeInstanceOf(
      MediaPermissionError,
    );
  });

  it("keeps bulk trash and restore idempotent and reports per-asset denial", async () => {
    const actor = { id: userId };
    const [outsider] = await db
      .insert(users)
      .values({ email: "media-bulk-trash-outsider@sharing.test", displayName: "Outsider" })
      .returning();
    await expect(bulkTrashMediaAssets(actor, { assetIds: [assetId] })).resolves.toEqual({
      trashed: 1,
      failures: [],
    });
    await expect(bulkTrashMediaAssets(actor, { assetIds: [assetId] })).resolves.toEqual({
      trashed: 0,
      failures: [],
    });
    await expect(bulkRestoreMediaAssets(actor, { assetIds: [assetId] })).resolves.toEqual({
      restored: 1,
      failures: [],
    });
    await expect(
      bulkTrashMediaAssets({ id: outsider!.id }, { assetIds: [assetId] }),
    ).resolves.toEqual({ trashed: 0, failures: [{ assetId, reason: "forbidden" }] });
  });

  it("moves, tags, and changes visibility through the library commands", async () => {
    const actor = { id: userId };
    const folder = await createMediaFolder(actor, { agencyId, workspaceId, name: "Campaign" });
    await expect(
      bulkMoveMediaAssets(actor, { assetIds: [assetId], folderId: folder!.id }),
    ).resolves.toEqual({ moved: 1, failures: [] });

    await expect(
      setMediaAssetTags(actor, assetId, [" hero ", "hero", " campaign "]),
    ).resolves.toMatchObject({ tags: ["hero", "campaign"] });
    await expect(
      bulkSetMediaAssetTags(actor, {
        assetIds: [assetId],
        add: ["campaign", "calendar"],
        remove: ["hero"],
      }),
    ).resolves.toEqual({ updated: 1, failures: [] });
    await expect(
      bulkSetMediaAssetVisibility(actor, { assetIds: [assetId], visibility: "agency" }),
    ).resolves.toEqual({ updated: 1, failures: [] });

    const [original] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    expect(original).toMatchObject({
      folderId: folder!.id,
      tags: ["campaign", "calendar"],
      visibility: "agency",
    });

    expect(original).toBeDefined();
  });

  it("does not move an asset into a folder owned by another workspace", async () => {
    const [foreignWorkspace] = await db
      .insert(workspaces)
      .values({ agencyId, name: "Foreign", slug: "foreign", createdBy: userId })
      .returning();
    const [foreignFolder] = await db
      .insert(mediaFolders)
      .values({
        agencyId,
        workspaceId: foreignWorkspace!.id,
        name: "Private",
        createdBy: userId,
      })
      .returning();

    await expect(
      bulkMoveMediaAssets({ id: userId }, { assetIds: [assetId], folderId: foreignFolder!.id }),
    ).resolves.toEqual({ moved: 0, failures: [{ assetId, reason: "forbidden" }] });
    const [asset] = await db
      .select({ folderId: mediaAssets.folderId })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, assetId));
    expect(asset?.folderId).toBeNull();
  });

  it("duplicates metadata while creating a separately owned storage object", async () => {
    await expect(duplicateMediaAssets({ id: userId }, { assetIds: [assetId] })).resolves.toEqual({
      duplicated: 1,
      failures: [],
    });
    const [original] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    const [copy] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.supersedesAssetId, assetId));
    expect(copy).toMatchObject({
      title: "Shared image (Copy)",
      folderId: original!.folderId,
      tags: original!.tags,
    });
    expect(copy?.storageObjectId).not.toBe(original?.storageObjectId);
  });
});
