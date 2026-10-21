import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets, storageObjects } from "@/lib/db/schema";
import { quarantineMediaObject } from "@/lib/media/quarantine";
import { MediaValidationError, validateStoredMediaObject } from "@/lib/media/validation";

export { moveMediaAsset } from "./asset-management.server";
export { linkMediaAssetToContentItem, linkedTargetsForMediaAsset } from "./asset-links.server";
export {
  countMediaAssets,
  listMediaAssets,
  listMediaAssetsForContentItem,
  listMediaAssetsPage,
  MEDIA_PAGE_SIZE,
  MEDIA_PAGE_SIZE_OPTIONS,
  parseMediaPageSize,
} from "./asset-library-queries.server";
export { runMediaFolderBatch, type FolderImportReport } from "./folder-import.server";
export { importPublicMediaAsset } from "./import.server";
export { registerUploadedMediaAsset, type RegisteredMediaAsset } from "./asset-registration.server";
export {
  findDuplicateMediaAssets,
  getMediaFolderAudit,
  getMediaLibraryFilters,
  type MediaDuplicateAdvisory,
} from "./library-queries.server";
export { expungeExpiredTrashedMedia } from "./trash-lifecycle.server";
export {
  bulkRestoreMediaAssets,
  bulkTrashMediaAssets,
  restoreMediaAsset,
  trashMediaAsset,
} from "./trash-lifecycle.server";
export {
  archiveMediaFolder,
  createMediaFolder,
  listMediaFolders,
  listMediaFoldersTree,
  renameMediaFolder,
} from "./folders.server";
export {
  activeMediaShareForActor,
  createPublicMediaShare,
  publicMediaAssetForToken,
  revokePublicMediaShare,
} from "./sharing.server";
export { MediaPermissionError } from "@/lib/media/errors";
export {
  bulkMoveMediaAssets,
  bulkSetMediaAssetTags,
  bulkSetMediaAssetVisibility,
  duplicateMediaAssets,
  renameMediaAsset,
  sanitizeMediaTags,
  setMediaAssetVisibility,
  setMediaAssetTags,
} from "./library-commands.server";
export {
  ensureBrandMediaFolderPath,
  ensurePlanningMediaFolderPathPublic,
  mediaAssetForActor,
} from "@/lib/media/service";
export type { MediaSort } from "./asset-library-queries.server";

/** Promote uploads that were left pending after a transient storage read. */
export async function processPendingMediaAssets(limit = 50) {
  const rows = await db
    .select({
      assetId: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      workspaceId: mediaAssets.ownerWorkspaceId,
      objectId: storageObjects.id,
      contentType: storageObjects.mimeType,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(eq(mediaAssets.status, "processing"))
    .orderBy(asc(mediaAssets.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  let ready = 0;
  let failed = 0;
  let pending = 0;

  for (const row of rows) {
    try {
      const dimensions = await validateStoredMediaObject(row);
      if (dimensions) {
        try {
          await db
            .update(storageObjects)
            .set({ width: dimensions.width, height: dimensions.height, updatedAt: new Date() })
            .where(eq(storageObjects.id, row.objectId));
        } catch {
          // Optional metadata must not keep a verified upload pending.
        }
      }
      await db
        .update(mediaAssets)
        .set({ status: "ready", failureCode: null, updatedAt: new Date() })
        .where(and(eq(mediaAssets.id, row.assetId), eq(mediaAssets.status, "processing")));
      ready += 1;
    } catch (error) {
      if (error instanceof MediaValidationError && error.code === "invalid_signature") {
        await quarantineMediaObject({ agencyId: row.agencyId, objectId: row.objectId });
        await db
          .update(mediaAssets)
          .set({ status: "failed", failureCode: error.code, updatedAt: new Date() })
          .where(and(eq(mediaAssets.id, row.assetId), eq(mediaAssets.status, "processing")));
        failed += 1;
      } else {
        pending += 1;
      }
    }
  }

  return { checked: rows.length, ready, failed, pending } as const;
}
