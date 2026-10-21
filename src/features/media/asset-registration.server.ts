import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { canWriteToWorkspace, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  contentItems,
  mediaAssets,
  mediaFolders,
  storageObjects,
  workspaces,
} from "@/lib/db/schema";
import { MediaValidationError, validateStoredMediaObject } from "@/lib/media/validation";
import { quarantineMediaObject } from "@/lib/media/quarantine";
import { MediaPermissionError } from "@/lib/media/errors";
import {
  sanitizeAssetTitle,
  type MediaDimensions,
  type MediaSourceType,
} from "@/lib/media/contract";
import { linkMediaAssetToContentItem } from "./asset-links.server";
import { ensurePlanningMediaFolderPathPublic } from "@/lib/media/planning-folder-lifecycle";

const MEDIA_ASSET_STATUSES = ["processing", "ready", "failed", "trashed", "deleted"] as const;
type MediaAssetRowStatus = (typeof MEDIA_ASSET_STATUSES)[number];

/** The column is `text` plus a CHECK constraint; narrow it once, at the edge. */
function toRegisteredAsset(row: {
  id: string;
  storageObjectId: string;
  status: string;
  failureCode: string | null;
}): RegisteredMediaAsset {
  return {
    id: row.id,
    storageObjectId: row.storageObjectId,
    status: (MEDIA_ASSET_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as MediaAssetRowStatus)
      : "processing",
    failureCode: row.failureCode ?? null,
  };
}

/**
 * The shape every `registerUploadedMediaAsset` return path must honour.
 *
 * `status` is load-bearing for callers, not decoration: the browser only
 * promotes an upload into the delivery picker when the server says `ready`.
 * A return path that omits it reads as `undefined` and strands the user's
 * file at "processing" even though the row is perfectly healthy, so every
 * branch selects this projection rather than a narrower literal.
 */
export type RegisteredMediaAsset = {
  id: string;
  storageObjectId: string;
  status: MediaAssetRowStatus;
  failureCode: string | null;
};

const registeredAssetProjection = {
  id: mediaAssets.id,
  storageObjectId: mediaAssets.storageObjectId,
  status: mediaAssets.status,
  failureCode: mediaAssets.failureCode,
} as const;

/**
 * Storage reads are eventually consistent and briefly rate-limited, so a
 * transient blip must not decide an asset's fate on the first attempt.
 * `invalid_signature` is the one deterministic verdict and is never retried.
 *
 * After the last attempt the transient error is rethrown so the caller keeps
 * the row in `processing` for the cron `processPendingMediaAssets` sweep,
 * exactly as a non-retried transient failure would.
 */
const VALIDATION_RETRY_DELAYS_MS = [0, 250, 750] as const;

async function validateStoredMediaObjectWithRetry(input: {
  agencyId: string;
  workspaceId: string;
  objectId: string;
  contentType: string;
}): Promise<MediaDimensions | null> {
  let lastError: unknown;
  for (const delay of VALIDATION_RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await validateStoredMediaObject(input);
    } catch (error) {
      if (error instanceof MediaValidationError && error.code === "invalid_signature") throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function registerUploadedMediaAsset(input: {
  actor: Actor;
  agencyId: string;
  workspaceId: string;
  storageObjectId: string;
  title: string;
  folderId?: string | null;
  contentItemId?: string;
  visibility?: "workspace" | "agency";
  sourceType?: MediaSourceType;
  sourceProvider?: string;
  sourceReference?: string;
  sourceUrl?: string;
  sourceModifiedAt?: Date;
}): Promise<RegisteredMediaAsset> {
  if (!(await canWriteToWorkspace(input.actor, input.workspaceId))) {
    throw new MediaPermissionError("Read-only users cannot add media.");
  }
  const [object] = await db
    .select()
    .from(storageObjects)
    .where(
      and(
        eq(storageObjects.id, input.storageObjectId),
        eq(storageObjects.agencyId, input.agencyId),
        eq(storageObjects.workspaceId, input.workspaceId),
        eq(storageObjects.status, "active"),
      ),
    )
    .limit(1);
  if (!object) throw new MediaPermissionError("The uploaded object is not available.");

  let selectedFolderId = input.folderId ?? null;
  if (input.contentItemId) {
    const [contentItem] = await db
      .select({
        id: contentItems.id,
        workspaceId: contentItems.workspaceId,
        agencyId: workspaces.agencyId,
        format: contentItems.format,
        plannedPublishAt: contentItems.plannedPublishAt,
        timezone: workspaces.timezone,
      })
      .from(contentItems)
      .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);
    if (
      !contentItem ||
      contentItem.workspaceId !== input.workspaceId ||
      contentItem.agencyId !== input.agencyId
    ) {
      throw new MediaPermissionError("The selected content item is not available.");
    }
    if (!selectedFolderId) {
      selectedFolderId = await ensurePlanningMediaFolderPathPublic({
        agencyId: input.agencyId,
        workspaceId: input.workspaceId,
        format: contentItem.format,
        plannedPublishAt: contentItem.plannedPublishAt,
        timezone: contentItem.timezone,
        createdBy: input.actor.id,
      });
    }
  }

  if (selectedFolderId) {
    const [folder] = await db
      .select({ id: mediaFolders.id })
      .from(mediaFolders)
      .where(
        and(
          eq(mediaFolders.id, selectedFolderId),
          eq(mediaFolders.agencyId, input.agencyId),
          eq(mediaFolders.workspaceId, input.workspaceId),
          isNull(mediaFolders.archivedAt),
        ),
      )
      .limit(1);
    if (!folder) throw new MediaPermissionError("The selected media folder is not available.");
  }

  // The object may already be catalogued — a retried register, a duplicate
  // submission, or the recovery link below. Re-project the full row so the
  // caller sees the true status, and re-assert the content-item link: a
  // previous attempt can have committed the asset and then failed the link,
  // and returning early without re-linking is what orphans it.
  const [existing] = await db
    .select(registeredAssetProjection)
    .from(mediaAssets)
    .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
    .limit(1);
  if (existing) {
    if (input.contentItemId) {
      await linkMediaAssetToContentItem(input.actor, {
        assetId: existing.id,
        contentItemId: input.contentItemId,
      });
    }
    return toRegisteredAsset(existing);
  }

  const sourceType = input.sourceType ?? "browser_file";
  let status: "processing" | "ready" | "failed" = "processing";
  let failureCode: string | undefined = "validation_pending";
  let dimensions: { width: number; height: number } | null = null;
  if (sourceType === "legacy") {
    status = "ready";
    failureCode = undefined;
  } else {
    try {
      dimensions = await validateStoredMediaObjectWithRetry({
        agencyId: input.agencyId,
        workspaceId: input.workspaceId,
        objectId: object.id,
        contentType: object.mimeType,
      });
      status = "ready";
      failureCode = undefined;
    } catch (error) {
      if (error instanceof MediaValidationError && error.code === "invalid_signature") {
        await quarantineMediaObject({ agencyId: input.agencyId, objectId: object.id });
        status = "failed";
        failureCode = error.code;
      }
      // Anything else is a transient provider read that survived the inline
      // retries. The row deliberately stays `processing` / `validation_pending`
      // so the cron `processPendingMediaAssets` sweep promotes it once storage
      // recovers — the same end state as a single un-retried attempt.
    }
  }

  if (dimensions) {
    try {
      await db
        .update(storageObjects)
        .set({ width: dimensions.width, height: dimensions.height, updatedAt: new Date() })
        .where(eq(storageObjects.id, object.id));
    } catch {
      // Dimensions are optional metadata; a temporary update failure must not
      // turn an otherwise verified asset into a failed upload.
    }
  }

  try {
    const [asset] = await db
      .insert(mediaAssets)
      .values({
        agencyId: input.agencyId,
        ownerWorkspaceId: input.workspaceId,
        storageObjectId: input.storageObjectId,
        ...(selectedFolderId ? { folderId: selectedFolderId } : {}),
        title: sanitizeAssetTitle(input.title),
        visibility: input.visibility ?? "workspace",
        status,
        ...(failureCode ? { failureCode } : {}),
        sourceType,
        ...(input.sourceProvider ? { sourceProvider: input.sourceProvider } : {}),
        ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
        ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
        ...(input.sourceModifiedAt ? { sourceModifiedAt: input.sourceModifiedAt } : {}),
        createdBy: input.actor.id,
        updatedBy: input.actor.id,
      })
      .onConflictDoNothing({ target: mediaAssets.storageObjectId })
      .returning();
    if (asset) {
      if (input.contentItemId) {
        await linkMediaAssetToContentItem(input.actor, {
          assetId: asset.id,
          contentItemId: input.contentItemId,
        });
      }
      // PR 2 / Tier 2 (perf/media): generate a 480px WebP preview as a
      // progressive enhancement. A failure here must NOT fail the
      // upload — the asset is already registered, the gallery will
      // fall back to the full URL via the legacy code path in
      // `mediaAssetForActor` (previewStorageObjectId stays null).
      if (status === "ready") {
        try {
          const { storePreviewForAsset } = await import("@/lib/media/thumbnails");
          await storePreviewForAsset(input.actor, {
            assetId: asset.id,
            agencyId: input.agencyId,
            workspaceId: input.workspaceId,
            storageObjectId: input.storageObjectId,
            sourceMimeType: object.mimeType,
            ...(dimensions
              ? { sourceWidth: dimensions.width, sourceHeight: dimensions.height }
              : {}),
          });
        } catch (previewError) {
          // Logged but never rethrown. The `.catch` inside
          // `storePreviewForAsset` already swallows the noisy cases
          // (unsupported mime, decode error, R2 outage); anything
          // that bubbles here is a real bug, but the asset row is
          // already committed, so logging is the right balance.
          console.warn("[media] preview generation failed; asset registered without variant", {
            assetId: asset.id,
            err: previewError instanceof Error ? previewError.message : String(previewError),
          });
        }
      }
      return toRegisteredAsset(asset);
    }

    // A concurrent request may have won the unique storage-object race.
    // Re-project the full row so the caller learns the real status rather
    // than an `undefined` that reads as "processing".
    const [alreadyRegistered] = await db
      .select(registeredAssetProjection)
      .from(mediaAssets)
      .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
      .limit(1);
    if (alreadyRegistered) {
      if (input.contentItemId) {
        await linkMediaAssetToContentItem(input.actor, {
          assetId: alreadyRegistered.id,
          contentItemId: input.contentItemId,
        });
      }
      return toRegisteredAsset(alreadyRegistered);
    }
    throw new Error("Media asset could not be registered");
  } catch (error) {
    // Never leave a completed storage object active when catalog registration
    // fails. If another request registered it concurrently, preserve that
    // winner and avoid quarantining its live object.
    const [alreadyRegistered] = await db
      .select(registeredAssetProjection)
      .from(mediaAssets)
      .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
      .limit(1);
    if (alreadyRegistered) {
      // The asset row is already committed, so a failure to re-assert the
      // link must not escape: doing so would skip the quarantine below and
      // replace the real error with a second copy of itself. Surface the
      // committed asset so the client can show it, and let the caller's own
      // retry re-run the (idempotent) link.
      if (input.contentItemId) {
        await linkMediaAssetToContentItem(input.actor, {
          assetId: alreadyRegistered.id,
          contentItemId: input.contentItemId,
        });
      }
      return toRegisteredAsset(alreadyRegistered);
    }
    await quarantineMediaObject({ agencyId: input.agencyId, objectId: input.storageObjectId });
    throw error;
  }
}
