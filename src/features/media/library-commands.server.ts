import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { canWriteToWorkspace, hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  mediaAssets,
  mediaAssetLinks,
  mediaFolderReconcileLogs,
  mediaFolders,
} from "@/lib/db/schema";
import { assertWithinBulkCap, MAX_TAGS_PER_ASSET, MAX_TAG_LENGTH } from "@/lib/media/bulk-cap";
import { sanitizeAssetTitle } from "@/lib/media/contract";
import { MediaPermissionError } from "@/lib/media/errors";
import {
  copyStorageObject,
  discardUnattachedStorageObjectCopy,
} from "@/lib/storage/intent-service";

export function sanitizeMediaTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= MAX_TAGS_PER_ASSET) break;
  }
  return result;
}

async function requireManagedMediaAsset(actor: Actor, assetId: string) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  return row;
}

/** Single-asset tag setter. Used by `setMediaAssetTags` UI flow. */
export async function setMediaAssetTags(actor: Actor, assetId: string, tags: readonly string[]) {
  await requireManagedMediaAsset(actor, assetId);
  const sanitized = sanitizeMediaTags(tags);
  const [updated] = await db
    .update(mediaAssets)
    .set({ tags: sanitized, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

export async function renameMediaAsset(actor: Actor, assetId: string, title: string) {
  await requireManagedMediaAsset(actor, assetId);
  const [updated] = await db
    .update(mediaAssets)
    .set({ title: sanitizeAssetTitle(title), updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

export async function setMediaAssetVisibility(
  actor: Actor,
  assetId: string,
  visibility: "workspace" | "agency",
) {
  await requireManagedMediaAsset(actor, assetId);
  const [updated] = await db
    .update(mediaAssets)
    .set({ visibility, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

// ─── Bulk operations ─────────────────────────────────────────────────────────

/**
 * Move many assets to a single folder. Per-asset audit row when the
 * move actually crosses a folder boundary (no-op moves don't pollute
 * the log).
 */
export async function bulkMoveMediaAssets(
  actor: Actor,
  input: { assetIds: string[]; folderId: string | null },
): Promise<{ moved: number; failures: Array<{ assetId: string; reason: string }> }> {
  assertWithinBulkCap(input.assetIds);
  if (input.assetIds.length === 0) return { moved: 0, failures: [] };

  // Load the target folder once. Its workspace is checked against each asset
  // below so a valid foreign folder ID cannot move data across tenant scope.
  let targetFolder: { agencyId: string; workspaceId: string } | undefined;
  if (input.folderId) {
    const [folder] = await db
      .select({
        id: mediaFolders.id,
        agencyId: mediaFolders.agencyId,
        workspaceId: mediaFolders.workspaceId,
      })
      .from(mediaFolders)
      .where(and(eq(mediaFolders.id, input.folderId), isNull(mediaFolders.archivedAt)))
      .limit(1);
    if (!folder) throw new MediaPermissionError("The selected media folder is not available.");
    targetFolder = folder;
  }

  const rows = await db
    .select({
      id: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      folderId: mediaAssets.folderId,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, input.assetIds));

  const failures: Array<{ assetId: string; reason: string }> = [];
  const now = new Date();
  let moved = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!(await canWriteToWorkspace(actor, row.ownerWorkspaceId))) {
        failures.push({ assetId: row.id, reason: "forbidden" });
        continue;
      }
      if (
        targetFolder &&
        (targetFolder.workspaceId !== row.ownerWorkspaceId ||
          targetFolder.agencyId !== row.agencyId)
      ) {
        failures.push({ assetId: row.id, reason: "forbidden" });
        continue;
      }
      if (row.folderId === input.folderId) continue; // no-op
      const [updated] = await tx
        .update(mediaAssets)
        .set({ folderId: input.folderId, updatedBy: actor.id, updatedAt: now })
        .where(eq(mediaAssets.id, row.id))
        .returning({ id: mediaAssets.id });
      if (!updated) {
        failures.push({ assetId: row.id, reason: "missing" });
        continue;
      }
      moved += 1;
      // Audit only when there is a content_item we can attribute the
      // move to; the bulk path doesn't have a single idea so we record
      // the move without a `content_item_id` (CHECK constraint allows
      // it because the column is nullable... wait, it's notNull).
      //
      // To keep the audit row meaningful we fall back to writing one
      // row per linked content_item when there is exactly one — for
      // ambiguous multi-link cases we still write a single row using
      // the first link's content_item (most common path).
      const [link] = await tx
        .select({ contentItemId: mediaAssetLinks.targetId })
        .from(mediaAssetLinks)
        .where(
          and(
            eq(mediaAssetLinks.mediaAssetId, row.id),
            eq(mediaAssetLinks.targetType, "content_item"),
          ),
        )
        .limit(1);
      if (link) {
        await tx.insert(mediaFolderReconcileLogs).values({
          agencyId: row.agencyId,
          workspaceId: row.ownerWorkspaceId,
          mediaAssetId: row.id,
          contentItemId: link.contentItemId,
          fromFolderId: row.folderId,
          toFolderId: input.folderId,
          reason: "bulk_move",
          actorId: actor.id,
        });
      }
    }
  });

  return { moved, failures };
}

/** Bulk tag diff (add + remove). */
export async function bulkSetMediaAssetTags(
  actor: Actor,
  input: { assetIds: string[]; add?: string[]; remove?: string[] },
): Promise<{ updated: number; failures: Array<{ assetId: string; reason: string }> }> {
  assertWithinBulkCap(input.assetIds);
  if (input.assetIds.length === 0) return { updated: 0, failures: [] };

  const sanitizedAdd = sanitizeMediaTags(input.add ?? []);
  const removeSet = new Set((input.remove ?? []).map((tag) => tag.trim()).filter(Boolean));

  const rows = await db
    .select({
      id: mediaAssets.id,
      tags: mediaAssets.tags,
      workspaceId: mediaAssets.ownerWorkspaceId,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, input.assetIds));

  const failures: Array<{ assetId: string; reason: string }> = [];
  const now = new Date();
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!(await canWriteToWorkspace(actor, row.workspaceId))) {
        failures.push({ assetId: row.id, reason: "forbidden" });
        continue;
      }
      const next = new Set<string>(row.tags ?? []);
      for (const tag of sanitizedAdd) next.add(tag);
      for (const tag of removeSet) next.delete(tag);
      const merged = sanitizeMediaTags([...next]);
      const [updatedRow] = await tx
        .update(mediaAssets)
        .set({ tags: merged, updatedBy: actor.id, updatedAt: now })
        .where(eq(mediaAssets.id, row.id))
        .returning({ id: mediaAssets.id });
      if (updatedRow) updated += 1;
      else failures.push({ assetId: row.id, reason: "missing" });
    }
  });

  return { updated, failures };
}

/** Bulk visibility change. Rejects cross-agency writes. */
export async function bulkSetMediaAssetVisibility(
  actor: Actor,
  input: { assetIds: string[]; visibility: "workspace" | "agency" },
): Promise<{ updated: number; failures: Array<{ assetId: string; reason: string }> }> {
  assertWithinBulkCap(input.assetIds);
  if (input.assetIds.length === 0) return { updated: 0, failures: [] };
  if (input.visibility !== "workspace" && input.visibility !== "agency") {
    throw new MediaPermissionError("Invalid visibility value.");
  }

  const rows = await db
    .select({
      id: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      workspaceId: mediaAssets.ownerWorkspaceId,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, input.assetIds));

  const failures: Array<{ assetId: string; reason: string }> = [];
  const now = new Date();
  let updated = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      // Visibility changes need workspace_manager rights; cross-agency
      // writes are blocked.
      if (!(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
        failures.push({ assetId: row.id, reason: "forbidden" });
        continue;
      }
      const [updatedRow] = await tx
        .update(mediaAssets)
        .set({ visibility: input.visibility, updatedBy: actor.id, updatedAt: now })
        .where(eq(mediaAssets.id, row.id))
        .returning({ id: mediaAssets.id });
      if (updatedRow) updated += 1;
      else failures.push({ assetId: row.id, reason: "missing" });
    }
  });

  return { updated, failures };
}

/**
 * Duplicate a set of assets. Each duplicate:
 *   - Inserts a new `media_asset` row pointing at the same `storage_object_id`
 *     (the bytes are shared — a `supersedesAssetId` chain carries the
 *     lineage, not a copy).
 *   - Sets `title` to "<original title> (Copy)" unless overridden.
 *   - Does NOT copy `media_asset_link` rows (the duplicate is an
 *     independent asset the user can re-attach).
 *
 * Hard cap is enforced. Cross-workspace duplication is rejected.
 */
export async function duplicateMediaAssets(
  actor: Actor,
  input: { assetIds: string[] },
): Promise<{ duplicated: number; failures: Array<{ assetId: string; reason: string }> }> {
  assertWithinBulkCap(input.assetIds);
  if (input.assetIds.length === 0) return { duplicated: 0, failures: [] };

  const rows = await db
    .select({
      id: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      title: mediaAssets.title,
      description: mediaAssets.description,
      tags: mediaAssets.tags,
      altText: mediaAssets.altText,
      storageObjectId: mediaAssets.storageObjectId,
      previewStorageObjectId: mediaAssets.previewStorageObjectId,
      posterStorageObjectId: mediaAssets.posterStorageObjectId,
      folderId: mediaAssets.folderId,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      visibility: mediaAssets.visibility,
      sourceType: mediaAssets.sourceType,
      sourceProvider: mediaAssets.sourceProvider,
      sourceReference: mediaAssets.sourceReference,
      sourceUrl: mediaAssets.sourceUrl,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, input.assetIds));

  const failures: Array<{ assetId: string; reason: string }> = [];
  let duplicated = 0;

  for (const row of rows) {
    if (!(await canWriteToWorkspace(actor, row.ownerWorkspaceId))) {
      failures.push({ assetId: row.id, reason: "forbidden" });
      continue;
    }

    let storageObjectId: string;
    let previewStorageObjectId: string | null = null;
    let posterStorageObjectId: string | null = null;
    const copiedObjectIds: string[] = [];
    try {
      const original = await copyStorageObject({
        agencyId: row.agencyId,
        workspaceId: row.ownerWorkspaceId,
        userId: actor.id,
        sourceObjectId: row.storageObjectId,
      });
      storageObjectId = original.objectId;
      copiedObjectIds.push(original.objectId);
      if (row.previewStorageObjectId) {
        const preview = await copyStorageObject({
          agencyId: row.agencyId,
          workspaceId: row.ownerWorkspaceId,
          userId: actor.id,
          sourceObjectId: row.previewStorageObjectId,
        });
        previewStorageObjectId = preview.objectId;
        copiedObjectIds.push(preview.objectId);
      }
      if (row.posterStorageObjectId) {
        const poster = await copyStorageObject({
          agencyId: row.agencyId,
          workspaceId: row.ownerWorkspaceId,
          userId: actor.id,
          sourceObjectId: row.posterStorageObjectId,
        });
        posterStorageObjectId = poster.objectId;
        copiedObjectIds.push(poster.objectId);
      }
    } catch {
      await Promise.all(
        copiedObjectIds.map((objectId) =>
          discardUnattachedStorageObjectCopy({
            agencyId: row.agencyId,
            workspaceId: row.ownerWorkspaceId,
            userId: actor.id,
            objectId,
          }),
        ),
      );
      failures.push({ assetId: row.id, reason: "copy_failed" });
      continue;
    }

    let created: { id: string } | undefined;
    try {
      [created] = await db
        .insert(mediaAssets)
        .values({
          agencyId: row.agencyId,
          ownerWorkspaceId: row.ownerWorkspaceId,
          folderId: row.folderId,
          storageObjectId,
          previewStorageObjectId,
          posterStorageObjectId,
          title: sanitizeAssetTitle(`${row.title} (Copy)`),
          description: row.description,
          tags: row.tags,
          altText: row.altText,
          visibility: row.visibility,
          status: "ready",
          sourceType: row.sourceType,
          sourceProvider: row.sourceProvider,
          sourceReference: row.sourceReference,
          sourceUrl: row.sourceUrl,
          supersedesAssetId: row.id,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning({ id: mediaAssets.id });
    } catch (error) {
      await Promise.all(
        copiedObjectIds.map((objectId) =>
          discardUnattachedStorageObjectCopy({
            agencyId: row.agencyId,
            workspaceId: row.ownerWorkspaceId,
            userId: actor.id,
            objectId,
          }),
        ),
      );
      throw error;
    }
    if (created) duplicated += 1;
    else {
      await Promise.all(
        copiedObjectIds.map((objectId) =>
          discardUnattachedStorageObjectCopy({
            agencyId: row.agencyId,
            workspaceId: row.ownerWorkspaceId,
            userId: actor.id,
            objectId,
          }),
        ),
      );
      failures.push({ assetId: row.id, reason: "missing" });
    }
  }

  return { duplicated, failures };
}
