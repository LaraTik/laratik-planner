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
  workspaces,
} from "@/lib/db/schema";
import { hashMediaShareToken } from "@/lib/media/share-token";
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
});
