import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencyMemberships,
  agencies,
  contentItems,
  mediaAssetLinks,
  mediaAssets,
  mediaFolderReconcileLogs,
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
  ensurePlanningMediaFolderPathPublic,
  duplicateMediaAssets,
  expungeExpiredTrashedMedia,
  findDuplicateMediaAssets,
  getMediaFolderAudit,
  getMediaLibraryFilters,
  linkMediaAssetToContentItem,
  linkedTargetsForMediaAsset,
  listMediaFolders,
  listMediaFoldersTree,
  listMediaAssetsPage,
  mediaAssetForActor,
  MediaPermissionError,
  publicMediaAssetForToken,
  renameMediaAsset,
  renameMediaFolder,
  reconcileContentItemMediaFolders,
  registerUploadedMediaAsset,
  restoreMediaAsset,
  revokePublicMediaShare,
  setMediaAssetTags,
  setMediaAssetVisibility,
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

vi.mock("@/lib/media/thumbnails", () => ({
  storePreviewForAsset: vi.fn(async () => undefined),
}));

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
    await db.insert(agencyMemberships).values({
      agencyId: agency!.id,
      userId: user!.id,
      status: "active",
    });
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

  it("denies folder audit reads for another workspace in the same agency", async () => {
    const [otherWorkspace] = await db
      .insert(workspaces)
      .values({ agencyId, name: "Other", slug: "other", createdBy: userId })
      .returning({ id: workspaces.id });

    await expect(
      getMediaFolderAudit({ id: userId }, { agencyId, workspaceId: otherWorkspace!.id }),
    ).rejects.toBeInstanceOf(MediaPermissionError);
  });

  it("returns tag and uploader facets for the authorized workspace", async () => {
    await db
      .update(mediaAssets)
      .set({ tags: ["launch", "video"] })
      .where(eq(mediaAssets.id, assetId));

    const filters = await getMediaLibraryFilters({ id: userId }, { agencyId, workspaceId });

    expect(filters.tags).toHaveLength(2);
    expect(filters.tags).toEqual(
      expect.arrayContaining([
        { name: "launch", count: 1 },
        { name: "video", count: 1 },
      ]),
    );
    expect(filters.uploaders).toHaveLength(1);
    expect(filters.uploaders[0]).toMatchObject({ id: userId, count: 1 });
  });

  it("returns workspace and agency-shared duplicate advisories with workspace priority", async () => {
    const checksumSha256 = "a".repeat(64);
    await db
      .update(storageObjects)
      .set({ checksumSha256 })
      .where(eq(storageObjects.id, storageObjectId));

    const [otherWorkspace] = await db
      .insert(workspaces)
      .values({ agencyId, name: "Other", slug: "other", createdBy: userId })
      .returning();
    const [sharedObject] = await db
      .insert(storageObjects)
      .values({
        agencyId,
        workspaceId: otherWorkspace!.id,
        bucket: "fixture",
        objectKey: "fixture/shared-duplicate.png",
        kind: "image",
        mimeType: "image/png",
        originalName: "shared-duplicate.png",
        byteSize: 9,
        checksumSha256,
        status: "active",
        createdBy: userId,
      })
      .returning();
    const [sharedAsset] = await db
      .insert(mediaAssets)
      .values({
        agencyId,
        ownerWorkspaceId: otherWorkspace!.id,
        storageObjectId: sharedObject!.id,
        title: "Agency duplicate",
        status: "ready",
        visibility: "agency",
        sourceType: "browser_file",
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    const duplicates = await findDuplicateMediaAssets(
      { id: userId },
      { workspaceId, checksumSha256, kind: "image" },
    );
    expect(duplicates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ assetId, sameWorkspace: true }),
        expect.objectContaining({
          assetId: sharedAsset!.id,
          ownerWorkspaceId: otherWorkspace!.id,
          sameWorkspace: false,
        }),
      ]),
    );
    await expect(
      findDuplicateMediaAssets(
        { id: userId },
        { workspaceId, checksumSha256, kind: "image", limit: 1 },
      ),
    ).resolves.toMatchObject([{ assetId, sameWorkspace: true }]);

    const [outsider] = await db
      .insert(users)
      .values({ email: "media-duplicate-outsider@sharing.test", displayName: "Outsider" })
      .returning();
    await expect(
      findDuplicateMediaAssets(
        { id: outsider!.id },
        { workspaceId, checksumSha256, kind: "image" },
      ),
    ).rejects.toBeInstanceOf(MediaPermissionError);
  });

  it("links assets to content idempotently and projects the canonical planner destination", async () => {
    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: "November launch",
        format: "static_post",
        plannedPublishAt: new Date("2026-11-01T12:00:00Z"),
        contentOwnerId: userId,
        createdBy: userId,
      })
      .returning();
    const actor = { id: userId };

    const firstLink = await linkMediaAssetToContentItem(actor, {
      assetId,
      contentItemId: item!.id,
    });
    const duplicateLink = await linkMediaAssetToContentItem(actor, {
      assetId,
      contentItemId: item!.id,
    });
    expect(firstLink).toMatchObject({
      mediaAssetId: assetId,
      targetType: "content_item",
      targetId: item!.id,
    });
    expect(duplicateLink).toBeNull();
    await expect(linkedTargetsForMediaAsset(actor, { agencyId, assetId })).resolves.toEqual([
      expect.objectContaining({
        id: firstLink!.id,
        label: "November launch",
        href: `/app/a/sharing/w/main/planning/${item!.id}`,
        clientVisible: false,
      }),
    ]);

    const [outsider] = await db
      .insert(users)
      .values({ email: "media-link-outsider@sharing.test", displayName: "Outsider" })
      .returning();
    await expect(
      linkMediaAssetToContentItem({ id: outsider!.id }, { assetId, contentItemId: item!.id }),
    ).rejects.toBeInstanceOf(MediaPermissionError);

    const storedLinks = await db
      .select()
      .from(mediaAssetLinks)
      .where(eq(mediaAssetLinks.mediaAssetId, assetId));
    expect(storedLinks).toHaveLength(1);
  });

  it("moves a single-linked asset with its planned folder and records the move", async () => {
    const previousDate = new Date("2026-11-01T12:00:00Z");
    const nextDate = new Date("2026-12-01T12:00:00Z");
    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: "Scheduled launch",
        format: "static_post",
        plannedPublishAt: previousDate,
        contentOwnerId: userId,
        createdBy: userId,
      })
      .returning();
    const oldFolderId = await ensurePlanningMediaFolderPathPublic({
      agencyId,
      workspaceId,
      format: "static_post",
      plannedPublishAt: previousDate,
      timezone: "UTC",
      createdBy: userId,
    });
    const newFolderId = await ensurePlanningMediaFolderPathPublic({
      agencyId,
      workspaceId,
      format: "static_post",
      plannedPublishAt: nextDate,
      timezone: "UTC",
      createdBy: userId,
    });
    await db.update(mediaAssets).set({ folderId: oldFolderId }).where(eq(mediaAssets.id, assetId));
    await linkMediaAssetToContentItem({ id: userId }, { assetId, contentItemId: item!.id });

    await expect(
      reconcileContentItemMediaFolders({
        actor: { id: userId },
        agencyId,
        workspaceId,
        contentItemId: item!.id,
        prevPlannedPublishAt: previousDate,
        nextPlannedPublishAt: nextDate,
        prevFormat: "static_post",
        nextFormat: "static_post",
      }),
    ).resolves.toEqual({ moved: 1 });

    const [asset] = await db
      .select({ folderId: mediaAssets.folderId })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, assetId));
    const [audit] = await db
      .select()
      .from(mediaFolderReconcileLogs)
      .where(eq(mediaFolderReconcileLogs.contentItemId, item!.id));
    expect(asset?.folderId).toBe(newFolderId);
    expect(audit).toMatchObject({
      mediaAssetId: assetId,
      fromFolderId: oldFolderId,
      toFolderId: newFolderId,
      reason: "planned_publish_at_changed",
      actorId: userId,
    });
  });

  it("leaves shared assets and cross-tenant content untouched during folder reconciliation", async () => {
    const previousDate = new Date("2026-11-01T12:00:00Z");
    const nextDate = new Date("2026-12-01T12:00:00Z");
    const [item] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: "Shared launch asset",
        format: "static_post",
        plannedPublishAt: previousDate,
        contentOwnerId: userId,
        createdBy: userId,
      })
      .returning();
    const [otherItem] = await db
      .insert(contentItems)
      .values({
        workspaceId,
        title: "Another asset use",
        format: "static_post",
        plannedPublishAt: previousDate,
        contentOwnerId: userId,
        createdBy: userId,
      })
      .returning();
    const oldFolderId = await ensurePlanningMediaFolderPathPublic({
      agencyId,
      workspaceId,
      format: "static_post",
      plannedPublishAt: previousDate,
      timezone: "UTC",
      createdBy: userId,
    });
    await db.update(mediaAssets).set({ folderId: oldFolderId }).where(eq(mediaAssets.id, assetId));
    await linkMediaAssetToContentItem({ id: userId }, { assetId, contentItemId: item!.id });
    await linkMediaAssetToContentItem({ id: userId }, { assetId, contentItemId: otherItem!.id });

    await expect(
      reconcileContentItemMediaFolders({
        actor: { id: userId },
        agencyId,
        workspaceId,
        contentItemId: item!.id,
        prevPlannedPublishAt: previousDate,
        nextPlannedPublishAt: nextDate,
        prevFormat: "static_post",
        nextFormat: "static_post",
      }),
    ).resolves.toEqual({ moved: 0 });
    await expect(
      reconcileContentItemMediaFolders({
        actor: { id: userId },
        agencyId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        workspaceId,
        contentItemId: item!.id,
        prevPlannedPublishAt: previousDate,
        nextPlannedPublishAt: nextDate,
        prevFormat: "static_post",
        nextFormat: "static_post",
      }),
    ).resolves.toEqual({ moved: 0 });

    const [asset] = await db
      .select({ folderId: mediaAssets.folderId })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, assetId));
    const auditRows = await db
      .select()
      .from(mediaFolderReconcileLogs)
      .where(eq(mediaFolderReconcileLogs.contentItemId, item!.id));
    expect(asset?.folderId).toBe(oldFolderId);
    expect(auditRows).toHaveLength(0);
  });

  it("loads asset storage details only for an authorized workspace actor", async () => {
    await expect(mediaAssetForActor({ id: userId }, assetId)).resolves.toMatchObject({
      asset: { id: assetId, ownerWorkspaceId: workspaceId },
      object: { id: storageObjectId },
      previewStorageObjectId: null,
    });

    const [outsider] = await db
      .insert(users)
      .values({ email: "media-access-outsider@sharing.test", displayName: "Outsider" })
      .returning();
    await expect(mediaAssetForActor({ id: outsider!.id }, assetId)).resolves.toBeNull();
  });

  it("keeps library pagination totals aligned with agency-shared visible rows", async () => {
    const [otherWorkspace] = await db
      .insert(workspaces)
      .values({ agencyId, name: "Other", slug: "other", createdBy: userId })
      .returning();
    const [sharedObject] = await db
      .insert(storageObjects)
      .values({
        agencyId,
        workspaceId: otherWorkspace!.id,
        bucket: "fixture",
        objectKey: "fixture/count-shared.png",
        kind: "image",
        mimeType: "image/png",
        originalName: "count-shared.png",
        byteSize: 10,
        status: "active",
        createdBy: userId,
      })
      .returning();
    await db.insert(mediaAssets).values({
      agencyId,
      ownerWorkspaceId: otherWorkspace!.id,
      storageObjectId: sharedObject!.id,
      title: "Shared with main workspace",
      status: "ready",
      visibility: "agency",
      sourceType: "browser_file",
      createdBy: userId,
      updatedBy: userId,
    });

    const page = await listMediaAssetsPage(
      { id: userId },
      { agencyId, workspaceId, kind: "image", page: 1, pageSize: 10 },
    );

    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(2);
  });

  it("registers an uploaded object once and returns its persisted status", async () => {
    const [object] = await db
      .insert(storageObjects)
      .values({
        agencyId,
        workspaceId,
        bucket: "fixture",
        objectKey: "fixture/registration.png",
        kind: "image",
        mimeType: "image/png",
        originalName: "registration.png",
        byteSize: 12,
        createdBy: userId,
      })
      .returning();

    const input = {
      actor: { id: userId },
      agencyId,
      workspaceId,
      storageObjectId: object!.id,
      title: "Registration image",
      sourceType: "legacy" as const,
    };
    const first = await registerUploadedMediaAsset(input);
    const retry = await registerUploadedMediaAsset(input);

    expect(first).toMatchObject({ status: "ready", failureCode: null });
    expect(retry).toEqual(first);
    const persisted = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.storageObjectId, object!.id));
    expect(persisted).toHaveLength(1);
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
    await expect(
      listMediaAssetsPage(actor, {
        agencyId,
        workspaceId,
        folderId: root!.id,
        kind: "image",
        page: 1,
      }),
    ).resolves.toMatchObject({ total: 1 });
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
    const [outsider] = await db
      .insert(users)
      .values({ email: "media-library-outsider@sharing.test", displayName: "Outsider" })
      .returning();
    const folder = await createMediaFolder(actor, { agencyId, workspaceId, name: "Campaign" });
    await expect(
      bulkMoveMediaAssets(actor, { assetIds: [assetId], folderId: folder!.id }),
    ).resolves.toEqual({ moved: 1, failures: [] });

    await expect(
      setMediaAssetTags(actor, assetId, [" hero ", "hero", " campaign "]),
    ).resolves.toMatchObject({ tags: ["hero", "campaign"] });
    await expect(renameMediaAsset(actor, assetId, "  Catalog image  ")).resolves.toMatchObject({
      title: "Catalog image",
    });
    await expect(setMediaAssetVisibility(actor, assetId, "workspace")).resolves.toMatchObject({
      visibility: "workspace",
    });
    await expect(
      renameMediaAsset({ id: outsider!.id }, assetId, "Unauthorized"),
    ).rejects.toBeInstanceOf(MediaPermissionError);
    await expect(
      setMediaAssetVisibility({ id: outsider!.id }, assetId, "agency"),
    ).rejects.toBeInstanceOf(MediaPermissionError);
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
