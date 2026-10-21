import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  createPublicMediaShare,
  createMediaFolder,
  listMediaFolders,
  listMediaFoldersTree,
  MediaPermissionError,
  publicMediaAssetForToken,
  renameMediaFolder,
  revokePublicMediaShare,
} from "@/features/media/server";
import { expectPgConstraint } from "./_db-error";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

describe("media sharing and folder database contract", () => {
  let userId: string;
  let agencyId: string;
  let workspaceId: string;
  let assetId: string;

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
});
