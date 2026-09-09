import "server-only";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  deliveryVersions,
  mediaAssets,
  mediaAssetLinks,
  mediaShareCollectionItems,
  mediaShareCollections,
  storageObjects,
  workspaces,
} from "@/lib/db/schema";
import { hasWorkspaceRole, isAgencyAdmin, isAgencyMember, type Actor } from "@/lib/auth/policy";
import { fetchStorageObject } from "@/lib/storage/read-service";
import { exportMediaAssetsZip, type MediaZipSource } from "@/lib/exports/media-assets-zip";
import { createMediaShareToken, hashMediaShareToken, MEDIA_SHARE_TTL_MS } from "./share-token";
import { MediaPermissionError, mediaAssetForActor } from "./service";

export type CollectionSourceType = "delivery_version" | "library_selection";

type AssetRow = {
  asset: typeof mediaAssets.$inferSelect;
  object: typeof storageObjects.$inferSelect;
};

function requireReady(row: AssetRow): void {
  if (row.asset.status !== "ready" || row.object.status !== "active") {
    throw new MediaPermissionError(
      "Only ready media with active storage can be shared or downloaded.",
    );
  }
}

async function readableAssets(actor: Actor, assetIds: string[]): Promise<AssetRow[]> {
  const rows: AssetRow[] = [];
  const seen = new Set<string>();
  for (const assetId of assetIds) {
    if (seen.has(assetId)) continue;
    const row = await mediaAssetForActor(actor, assetId);
    if (!row) throw new MediaPermissionError("One or more media assets are not available.");
    requireReady(row);
    rows.push(row);
    seen.add(assetId);
  }
  return rows;
}

async function deliveryAssetIdsForActor(actor: Actor, deliveryVersionId: string) {
  const [source] = await db
    .select({
      deliveryVersionId: deliveryVersions.id,
      workspaceId: contentItems.workspaceId,
      agencyId: workspaces.agencyId,
    })
    .from(deliveryVersions)
    .innerJoin(contentItems, eq(contentItems.id, deliveryVersions.contentItemId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(eq(deliveryVersions.id, deliveryVersionId))
    .limit(1);
  if (
    !source ||
    !(await hasWorkspaceRole(actor, source.workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
    ]))
  ) {
    throw new MediaPermissionError("This delivery version is not available.");
  }
  const links = await db
    .select({ assetId: mediaAssetLinks.mediaAssetId })
    .from(mediaAssetLinks)
    .where(
      and(
        eq(mediaAssetLinks.agencyId, source.agencyId),
        eq(mediaAssetLinks.workspaceId, source.workspaceId),
        eq(mediaAssetLinks.targetType, "delivery"),
        eq(mediaAssetLinks.targetId, deliveryVersionId),
      ),
    )
    .orderBy(asc(mediaAssetLinks.createdAt), asc(mediaAssetLinks.id));
  return { source, assetIds: links.map((link) => link.assetId) };
}

export async function exportMediaAssetIdsZip(
  actor: Actor,
  assetIds: string[],
  filenameBase?: string,
) {
  const rows = await readableAssets(actor, assetIds);
  return exportRowsZip(rows, filenameBase);
}

export async function exportDeliveryVersionZip(actor: Actor, deliveryVersionId: string) {
  const { assetIds } = await deliveryAssetIdsForActor(actor, deliveryVersionId);
  const rows = await readableAssets(actor, assetIds);
  return exportRowsZip(rows, `delivery-v${await deliveryVersionNumber(deliveryVersionId)}`);
}

async function deliveryVersionNumber(id: string): Promise<number> {
  const [row] = await db
    .select({ versionNumber: deliveryVersions.versionNumber })
    .from(deliveryVersions)
    .where(eq(deliveryVersions.id, id))
    .limit(1);
  return row?.versionNumber ?? 1;
}

async function exportRowsZip(rows: AssetRow[], filenameBase?: string) {
  const sources: MediaZipSource[] = rows.map((row) => ({
    id: row.asset.id,
    title: row.asset.title,
    originalName: row.object.originalName,
    mimeType: row.object.mimeType,
    byteSize: row.object.byteSize,
    read: async () => {
      const response = await fetchStorageObject({
        agencyId: row.asset.agencyId,
        workspaceId: row.asset.ownerWorkspaceId,
        objectId: row.object.id,
        expiresInSeconds: 60,
      });
      if (!response) throw new Error("A media object is no longer available.");
      return Buffer.from(await response.arrayBuffer());
    },
  }));
  return exportMediaAssetsZip(sources, filenameBase);
}

export async function createMediaShareCollection(input: {
  actor: Actor;
  sourceType: CollectionSourceType;
  sourceId?: string;
  assetIds?: string[];
  title: string;
}) {
  let assetIds: string[];
  let workspaceId: string | null = null;
  if (input.sourceType === "delivery_version") {
    if (!input.sourceId) throw new MediaPermissionError("A delivery version is required.");
    const source = await deliveryAssetIdsForActor(input.actor, input.sourceId);
    assetIds = source.assetIds;
    workspaceId = source.source.workspaceId;
  } else {
    assetIds = input.assetIds ?? [];
  }
  const rows = await readableAssets(input.actor, assetIds);
  if (rows.length === 0) throw new MediaPermissionError("Select at least one ready media asset.");
  const agencyId = rows[0]!.asset.agencyId;
  if (rows.some((row) => row.asset.agencyId !== agencyId)) {
    throw new MediaPermissionError("Media from different agencies cannot be shared together.");
  }
  if (
    !workspaceId &&
    rows.every((row) => row.asset.ownerWorkspaceId === rows[0]!.asset.ownerWorkspaceId)
  ) {
    workspaceId = rows[0]!.asset.ownerWorkspaceId;
  }
  const token = createMediaShareToken();
  const expiresAt = new Date(Date.now() + MEDIA_SHARE_TTL_MS);
  const title = input.title.trim().slice(0, 160) || "Shared media";
  const created = await db.transaction(async (tx) => {
    const [collection] = await tx
      .insert(mediaShareCollections)
      .values({
        agencyId,
        ...(workspaceId ? { workspaceId } : {}),
        title,
        sourceType: input.sourceType,
        ...(input.sourceId ? { sourceId: input.sourceId } : {}),
        tokenHash: hashMediaShareToken(token),
        expiresAt,
        createdBy: input.actor.id,
      })
      .returning({ id: mediaShareCollections.id, expiresAt: mediaShareCollections.expiresAt });
    if (!collection) throw new Error("Media collection could not be created.");
    await tx.insert(mediaShareCollectionItems).values(
      rows.map((row, index) => ({
        collectionId: collection.id,
        mediaAssetId: row.asset.id,
        sortOrder: index,
      })),
    );
    return collection;
  });
  return { id: created.id, token, expiresAt: created.expiresAt };
}

export async function revokeMediaShareCollection(actor: Actor, collectionId: string) {
  const [collection] = await db
    .select({ id: mediaShareCollections.id, workspaceId: mediaShareCollections.workspaceId })
    .from(mediaShareCollections)
    .where(eq(mediaShareCollections.id, collectionId))
    .limit(1);
  if (!collection) return { revoked: false };
  const agency = await db
    .select({
      agencyId: mediaShareCollections.agencyId,
      createdBy: mediaShareCollections.createdBy,
    })
    .from(mediaShareCollections)
    .where(eq(mediaShareCollections.id, collectionId))
    .limit(1);
  const allowed = agency[0]
    ? agency[0].createdBy === actor.id ||
      (await isAgencyAdmin(actor, agency[0].agencyId)) ||
      (await isAgencyMember(actor, agency[0].agencyId))
    : false;
  if (!allowed) throw new MediaPermissionError();
  const [updated] = await db
    .update(mediaShareCollections)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(mediaShareCollections.id, collectionId), isNull(mediaShareCollections.revokedAt)))
    .returning({ id: mediaShareCollections.id });
  return { revoked: Boolean(updated) };
}

export async function publicMediaCollectionForToken(token: string) {
  const [collection] = await db
    .select({
      id: mediaShareCollections.id,
      title: mediaShareCollections.title,
      expiresAt: mediaShareCollections.expiresAt,
    })
    .from(mediaShareCollections)
    .where(
      and(
        eq(mediaShareCollections.tokenHash, hashMediaShareToken(token)),
        isNull(mediaShareCollections.revokedAt),
        gt(mediaShareCollections.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!collection) return null;
  const items = await db
    .select({
      itemId: mediaShareCollectionItems.id,
      sortOrder: mediaShareCollectionItems.sortOrder,
      asset: mediaAssets,
      object: storageObjects,
    })
    .from(mediaShareCollectionItems)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaShareCollectionItems.mediaAssetId))
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(
      and(
        eq(mediaShareCollectionItems.collectionId, collection.id),
        eq(mediaAssets.status, "ready"),
        eq(storageObjects.status, "active"),
      ),
    )
    .orderBy(asc(mediaShareCollectionItems.sortOrder), asc(mediaShareCollectionItems.id));
  return { ...collection, items };
}

export async function publicMediaCollectionAssetForToken(token: string, assetId: string) {
  const collection = await publicMediaCollectionForToken(token);
  if (!collection) return null;
  const item = collection.items.find((candidate) => candidate.asset.id === assetId);
  return item ? { collection, ...item } : null;
}

export async function exportPublicMediaCollectionZip(token: string) {
  const collection = await publicMediaCollectionForToken(token);
  if (!collection) return null;
  const rows: AssetRow[] = collection.items.map((item) => ({
    asset: item.asset,
    object: item.object,
  }));
  return exportRowsZip(rows, "shared-media");
}
