import "server-only";

import { and, asc, eq, inArray, lte, ne } from "drizzle-orm";
import { canWriteToWorkspace, hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { mediaAssets, storageObjects } from "@/lib/db/schema";
import { releaseCapacityAmount } from "@/lib/entitlements";
import { assertWithinBulkCap } from "@/lib/media/bulk-cap";
import { MediaPermissionError } from "@/lib/media/errors";

/**
 * Expunge trashed media assets whose retention window has passed.
 *
 * Bug fix (chore/audit-cloudflare-assets, 2026-09-22): pre-PR, trashed
 * media sat in the database indefinitely. `trashMediaAsset` marks the
 * asset `status="trashed"` with `delete_after = now() + 30d`, but
 * nothing ever read `delete_after` on media — the storage-cleanup
 * cron (`src/app/api/cron/storage-cleanup/route.ts`) only purges
 * `storage_objects.status = "soft_deleted"`, which a trashed media
 * asset's storage row never reaches. Quota bytes stayed reserved
 * forever and a long-lived agency could quietly accumulate.
 *
 * This function:
 *   1. Finds media assets where `status="trashed"` and
 *      `delete_after <= now()`. Bound by `limit` so the cron tick
 *      never does unbounded work.
 *   2. Soft-deletes each asset's storage rows (original + preview
 *      variant) by setting `status="soft_deleted"` and a fresh
 *      `delete_after = now() + 30d`. The existing storage-cleanup
 *      cron will hard-delete the bytes on the next run; the
 *      preview route (`/api/media/assets/[id]/preview`) and the
 *      signed-URL helper both check `storage_objects.status =
 *      "active"` so they immediately return null once we set
 *      `soft_deleted`.
 *   3. Releases the storage_bytes quota counter for the original
 *      AND preview variant in the same transaction. Quota
 *      accounting happens at upload time, so this is the only
 *      path that gives the bytes back.
 *   4. Hard-deletes the media_asset row. No need to keep it
 *      around — the trashed listing filters by status, so a row
 *      with status="trashed" only consumed index space.
 *
 * Returns the number of media assets expunged so the cron can log
 * a count. Errors are isolated per-asset so one corrupt row
 * doesn't stop the rest.
 */
export async function expungeExpiredTrashedMedia(
  limit = 100,
): Promise<{ media: number; storageObjects: number; bytesReleased: number }> {
  const rows = await db
    .select({
      assetId: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      originalStorageObjectId: mediaAssets.storageObjectId,
      previewStorageObjectId: mediaAssets.previewStorageObjectId,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.status, "trashed"), lte(mediaAssets.deleteAfter, new Date())))
    .orderBy(asc(mediaAssets.deleteAfter))
    .limit(Math.min(Math.max(limit, 1), 500));

  let mediaCount = 0;
  let storageObjectCount = 0;
  let bytesReleased = 0;
  for (const row of rows) {
    try {
      type Target = { id: string; byteSize: number | null };
      const storageObjectIds: string[] = [row.originalStorageObjectId];
      if (row.previewStorageObjectId) {
        storageObjectIds.push(row.previewStorageObjectId);
      }
      // Pull every storage_object we want to soft-delete so we can
      // release quota against the row's recorded byte size. The byte
      // size is read from `storage_objects.byte_size` (populated at
      // upload time by `validateStoredMediaObject`) — we never guess
      // or fall back to anything client-supplied, so a row whose
      // bytes were never validated simply doesn't contribute to the
      // quota release (better to leak a few bytes than to corrupt
      // the ledger). Every row IS still soft-deleted; the byte-size
      // filter only affects the release call.
      const storageRows = await db
        .select({ id: storageObjects.id, byteSize: storageObjects.byteSize })
        .from(storageObjects)
        .where(inArray(storageObjects.id, storageObjectIds));
      const targetsForQuotaRelease: Target[] = storageRows
        .filter((s): s is Target & { byteSize: number } => s.byteSize != null)
        .map((s) => ({ id: s.id, byteSize: s.byteSize }));
      const totalBytes = targetsForQuotaRelease.reduce((acc, t) => acc + (t.byteSize ?? 0), 0);
      await db.transaction(async (tx) => {
        // Soft-delete every storage row tied to this asset — both the
        // original and the preview variant. The cleanup cron's next
        // tick will hard-delete the bytes from R2. The 30-day
        // secondary retention window gives us a safety net if a
        // user immediately restores the asset; the FK from
        // `media_assets.preview_storage_object_id` is `set null`, so
        // the restore flow can't accidentally repoint to a soft-
        // deleted row (the row's `status = "active"` check in
        // `fetchPreviewForActor` blocks it).
        const now = new Date();
        for (const row2 of storageRows) {
          await tx
            .update(storageObjects)
            .set({
              status: "soft_deleted",
              deleteAfter: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
              updatedAt: now,
            })
            .where(eq(storageObjects.id, row2.id));
          storageObjectCount += 1;
        }
        // Release the reserved quota in the same transaction as the
        // status flip. If this fails, the row stays `soft_deleted`
        // and the quota stays reserved — i.e. we'd rather leak quota
        // than double-release. The releaseCapacityAmount guard
        // prevents the double-release at the cost of the leak; this
        // is the standard conservative pattern.
        if (totalBytes > 0) {
          await releaseCapacityAmount(tx, row.agencyId, [
            { resource: "storage_bytes", increase: totalBytes },
          ]);
          bytesReleased += totalBytes;
        }
        // Hard-delete the media_asset row. Any rows referencing it
        // via media_asset_links cascade because the FK is `set null`
        // on most link tables; comments + activity events don't
        // reference media_asset_id, so they're untouched.
        await tx.delete(mediaAssets).where(eq(mediaAssets.id, row.assetId));
        mediaCount += 1;
      });
    } catch (err) {
      // One corrupt row must not poison the rest of the batch.
      console.warn(
        "[media] expunge failed for trashed asset",
        row.assetId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return { media: mediaCount, storageObjects: storageObjectCount, bytesReleased };
}

export async function trashMediaAsset(actor: Actor, assetId: string) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  const now = new Date();
  const [updated] = await db
    .update(mediaAssets)
    .set({
      status: "trashed",
      trashedAt: now,
      deleteAfter: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      updatedBy: actor.id,
      updatedAt: now,
    })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

export async function restoreMediaAsset(actor: Actor, assetId: string) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  const [updated] = await db
    .update(mediaAssets)
    .set({
      status: "ready",
      trashedAt: null,
      deleteAfter: null,
      updatedBy: actor.id,
      updatedAt: new Date(),
    })
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.status, "trashed")))
    .returning();
  return updated ?? null;
}

export async function bulkTrashMediaAssets(
  actor: Actor,
  input: { assetIds: string[] },
): Promise<{ trashed: number; failures: Array<{ assetId: string; reason: string }> }> {
  assertWithinBulkCap(input.assetIds);
  if (input.assetIds.length === 0) return { trashed: 0, failures: [] };

  const rows = await db
    .select({
      id: mediaAssets.id,
      status: mediaAssets.status,
      workspaceId: mediaAssets.ownerWorkspaceId,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, input.assetIds));

  const failures: Array<{ assetId: string; reason: string }> = [];
  const now = new Date();
  const deleteAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let trashed = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!(await canWriteToWorkspace(actor, row.workspaceId))) {
        failures.push({ assetId: row.id, reason: "forbidden" });
        continue;
      }
      if (row.status === "trashed") continue;
      const [updated] = await tx
        .update(mediaAssets)
        .set({
          status: "trashed",
          trashedAt: now,
          deleteAfter,
          updatedBy: actor.id,
          updatedAt: now,
        })
        .where(and(eq(mediaAssets.id, row.id), ne(mediaAssets.status, "trashed")))
        .returning({ id: mediaAssets.id });
      if (updated) trashed += 1;
      else failures.push({ assetId: row.id, reason: "missing" });
    }
  });

  return { trashed, failures };
}

export async function bulkRestoreMediaAssets(
  actor: Actor,
  input: { assetIds: string[] },
): Promise<{ restored: number; failures: Array<{ assetId: string; reason: string }> }> {
  assertWithinBulkCap(input.assetIds);
  if (input.assetIds.length === 0) return { restored: 0, failures: [] };

  const rows = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, input.assetIds));

  const failures: Array<{ assetId: string; reason: string }> = [];
  const now = new Date();
  let restored = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!(await canWriteToWorkspace(actor, row.workspaceId))) {
        failures.push({ assetId: row.id, reason: "forbidden" });
        continue;
      }
      const [updated] = await tx
        .update(mediaAssets)
        .set({
          status: "ready",
          trashedAt: null,
          deleteAfter: null,
          updatedBy: actor.id,
          updatedAt: now,
        })
        .where(and(eq(mediaAssets.id, row.id), eq(mediaAssets.status, "trashed")))
        .returning({ id: mediaAssets.id });
      if (updated) restored += 1;
      else failures.push({ assetId: row.id, reason: "not_trashed" });
    }
  });

  return { restored, failures };
}
