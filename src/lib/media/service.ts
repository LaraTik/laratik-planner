import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  mediaAssets,
  mediaAssetLinks,
  mediaFolderReconcileLogs,
  mediaFolders,
  storageObjects,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { hasWorkspaceRole, isAgencyMember, type Actor } from "@/lib/auth/policy";
import { MEDIA_READ_ROLES } from "./access";
import { BRAND_KIT_FOLDER_NAME, mediaFormatFolderName } from "./folder-tree";

export { BRAND_KIT_FOLDER_NAME, POSTS_FOLDER_NAME } from "./folder-tree";
export type { MediaFolderKind, MediaFolderTreeRow } from "./folder-tree";
export { MediaPermissionError } from "./errors";

async function ensureMediaFolder(input: {
  agencyId: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdBy: string;
}): Promise<string> {
  const parentCondition = input.parentId
    ? eq(mediaFolders.parentId, input.parentId)
    : isNull(mediaFolders.parentId);
  const [existing] = await db
    .select({ id: mediaFolders.id })
    .from(mediaFolders)
    .where(
      and(
        eq(mediaFolders.agencyId, input.agencyId),
        eq(mediaFolders.workspaceId, input.workspaceId),
        parentCondition,
        eq(mediaFolders.name, input.name),
        isNull(mediaFolders.archivedAt),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(mediaFolders)
    .values({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      name: input.name,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing()
    .returning({ id: mediaFolders.id });
  if (created) return created.id;

  const [concurrent] = await db
    .select({ id: mediaFolders.id })
    .from(mediaFolders)
    .where(
      and(
        eq(mediaFolders.agencyId, input.agencyId),
        eq(mediaFolders.workspaceId, input.workspaceId),
        parentCondition,
        eq(mediaFolders.name, input.name),
        isNull(mediaFolders.archivedAt),
      ),
    )
    .limit(1);
  if (!concurrent) throw new Error("Planning media folder could not be created");
  return concurrent.id;
}

async function ensurePlanningMediaFolderPath(input: {
  agencyId: string;
  workspaceId: string;
  format: string;
  plannedPublishAt: Date;
  timezone: string;
  createdBy: string;
}): Promise<string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timezone,
    year: "numeric",
    month: "2-digit",
  })
    .formatToParts(input.plannedPublishAt)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
  let parentId = await ensureMediaFolder({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    parentId: null,
    name: "Posts",
    createdBy: input.createdBy,
  });
  for (const name of [mediaFormatFolderName(input.format), parts.year!, parts.month!]) {
    parentId = await ensureMediaFolder({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      parentId,
      name,
      createdBy: input.createdBy,
    });
  }
  return parentId;
}

export async function mediaAssetForActor(actor: Actor, assetId: string) {
  const [row] = await db
    .select({
      asset: mediaAssets,
      object: storageObjects,
      // PR 2: surface the preview variant's storage_object id so the
      // `/api/media/assets/[id]` route can kick off a backfill
      // when the variant is missing for legacy assets.
      previewStorageObjectId: mediaAssets.previewStorageObjectId,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row) return null;
  const ownerAccess = await hasWorkspaceRole(actor, row.asset.ownerWorkspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
  ]);
  if (ownerAccess) return row;
  if (row.asset.visibility === "agency" && (await isAgencyMember(actor, row.asset.agencyId))) {
    const [internal] = await db
      .select({ role: workspaceMembershipRoles.role })
      .from(workspaceMembershipRoles)
      .innerJoin(
        workspaceMemberships,
        eq(workspaceMemberships.id, workspaceMembershipRoles.workspaceMembershipId),
      )
      .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
      .where(
        and(
          eq(workspaceMemberships.userId, actor.id),
          eq(workspaceMemberships.status, "active"),
          eq(workspaces.agencyId, row.asset.agencyId),
          inArray(workspaceMembershipRoles.role, [...MEDIA_READ_ROLES]),
        ),
      )
      .limit(1);
    if (internal?.role) return row;
  }
  return null;
}

// ─── FEAT-MEDIA-LIBRARY-2026-09-16 — navigation primitives + bulk actions ─────
//
// Plan §3.5: linkedTargetsForMediaAsset,
// setMediaAssetTags, reconcileContentItemMediaFolders,
// ensureBrandMediaFolderPath, bulkMoveMediaAssets, bulkSetMediaAssetTags,
// bulkSetMediaAssetVisibility, duplicateMediaAssets.
// Trash, restore, and retention cleanup live in
// `src/features/media/trash-lifecycle.server.ts`.

/**
 * Resolve the `Posts / {Format} / {YYYY} / {MM}` chain for an idea
 * whose `plannedPublishAt` and `format` are known.
 *
 * Public so other services can compare an asset's current folder to
 * the expected path before triggering a reconcile (plan §5.1).
 */
export async function ensurePlanningMediaFolderPathPublic(input: {
  agencyId: string;
  workspaceId: string;
  format: string;
  plannedPublishAt: Date;
  timezone: string;
  createdBy: string;
}): Promise<string> {
  return ensurePlanningMediaFolderPath(input);
}

/**
 * Resolve the `Brand Kit` folder for a workspace. No further nesting
 * for v1 (plan §5.2). Brand-kind subfolders are a follow-up after we
 * see real usage.
 */
export async function ensureBrandMediaFolderPath(input: {
  agencyId: string;
  workspaceId: string;
  createdBy: string;
}): Promise<string> {
  return ensureMediaFolder({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    parentId: null,
    name: BRAND_KIT_FOLDER_NAME,
    createdBy: input.createdBy,
  });
}

// ─── Reconcile ──────────────────────────────────────────────────────────────

/**
 * Triggered when an idea's `plannedPublishAt` or `format` changes.
 * For every asset linked to that idea:
 *   - Compute the new derived folder.
 *   - If the asset's current folder matches the old derived path AND
 *     the asset's only link is this idea, move it to the new folder.
 *   - Write a `media_folder_reconcile_log` audit row in the same
 *     transaction.
 *
 * Returns the count of moved assets; callers revalidate the planning
 * page so a toast can fire.
 */
export async function reconcileContentItemMediaFolders(input: {
  actor: Actor;
  agencyId: string;
  workspaceId: string;
  contentItemId: string;
  prevPlannedPublishAt?: Date | null;
  nextPlannedPublishAt: Date;
  prevFormat?: string | null;
  nextFormat: string;
}): Promise<{ moved: number }> {
  const [contentItem] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      agencyId: workspaces.agencyId,
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
    return { moved: 0 };
  }

  const newFolderId = await ensurePlanningMediaFolderPath({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    format: input.nextFormat,
    plannedPublishAt: input.nextPlannedPublishAt,
    timezone: contentItem.timezone,
    createdBy: input.actor.id,
  });

  // Old derived folder (only matters if format/date actually moved).
  const oldFolderId =
    input.prevPlannedPublishAt && input.prevFormat
      ? await ensurePlanningMediaFolderPath({
          agencyId: input.agencyId,
          workspaceId: input.workspaceId,
          format: input.prevFormat,
          plannedPublishAt: input.prevPlannedPublishAt,
          timezone: contentItem.timezone,
          createdBy: input.actor.id,
        })
      : null;

  // If the old and new derived folder resolve to the same id, no-op.
  if (oldFolderId && oldFolderId === newFolderId) return { moved: 0 };

  // Fetch every asset linked to this idea.
  const links = await db
    .select({
      mediaAssetId: mediaAssetLinks.mediaAssetId,
      folderId: mediaAssets.folderId,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      assetStatus: mediaAssets.status,
    })
    .from(mediaAssetLinks)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaAssetLinks.mediaAssetId))
    .where(
      and(
        eq(mediaAssetLinks.targetType, "content_item"),
        eq(mediaAssetLinks.targetId, input.contentItemId),
      ),
    );

  // Per-asset: only move when the asset's *only* link is this idea AND
  // the current folder matches the old derived path (no manual override).
  const reason: "planned_publish_at_changed" | "format_changed" =
    input.prevFormat !== input.nextFormat && oldFolderId === newFolderId
      ? "format_changed"
      : "planned_publish_at_changed";

  const now = new Date();
  let moved = 0;
  await db.transaction(async (tx) => {
    for (const link of links) {
      if (link.assetStatus !== "ready" && link.assetStatus !== "processing") continue;
      // Skip assets whose current folder doesn't match the old derived
      // path — they've been moved manually or shared across ideas.
      if (oldFolderId && link.folderId !== oldFolderId) continue;
      // Skip assets linked to anything else (the move would be surprising).
      const otherRows = await tx
        .select({ otherCount: sql<number>`count(*)::int` })
        .from(mediaAssetLinks)
        .where(
          and(
            eq(mediaAssetLinks.mediaAssetId, link.mediaAssetId),
            sql`(${mediaAssetLinks.targetType} <> 'content_item' OR ${mediaAssetLinks.targetId} <> ${input.contentItemId})`,
          ),
        );
      const otherCount = otherRows[0]?.otherCount ?? 0;
      if (otherCount > 0) continue;

      const [updated] = await tx
        .update(mediaAssets)
        .set({
          folderId: newFolderId,
          updatedBy: input.actor.id,
          updatedAt: now,
        })
        .where(eq(mediaAssets.id, link.mediaAssetId))
        .returning({ id: mediaAssets.id });
      if (!updated) continue;
      await tx.insert(mediaFolderReconcileLogs).values({
        agencyId: input.agencyId,
        workspaceId: input.workspaceId,
        mediaAssetId: link.mediaAssetId,
        contentItemId: input.contentItemId,
        fromFolderId: oldFolderId,
        toFolderId: newFolderId,
        reason,
        actorId: input.actor.id,
      });
      moved += 1;
    }
  });
  return { moved };
}

// ─── Filter extensions for `listMediaAssets` ────────────────────────────────

/**
 * Filter extensions used by the library URL state:
 *   - `tagIntersect`: array of tag names — assets must carry ALL of them.
 *   - `status`: array of status names; default = `['processing','ready','failed']`.
 *   - `inUse`: when true, only assets that have at least one
 *     `media_asset_link` row.
 *   - `unlinked`: when true, only assets without any link row.
 *
 * Both `inUse` and `unlinked` use the same EXISTS / NOT EXISTS predicate;
 * they're mutually exclusive at the URL layer.
 */
export type MediaAssetFilters = {
  tagIntersect?: string[];
  status?: ReadonlyArray<"processing" | "ready" | "failed" | "trashed">;
  inUse?: boolean;
  unlinked?: boolean;
};

/**
 * Inject `MediaAssetFilters` into a Drizzle `where` builder. Pulled out
 * of `listMediaAssets` so the bulk route and the API handlers can reuse
 * the same predicate shape.
 */
export function applyMediaAssetFilters(
  conditions: Parameters<typeof and>,
  filters: MediaAssetFilters,
): void {
  if (filters.status && filters.status.length > 0) {
    conditions.push(inArray(mediaAssets.status, [...filters.status]));
  }
  if (filters.tagIntersect && filters.tagIntersect.length > 0) {
    for (const tag of filters.tagIntersect) {
      conditions.push(sql`${tag} = ANY(${mediaAssets.tags})`);
    }
  }
  if (filters.inUse) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${mediaAssetLinks} WHERE ${mediaAssetLinks.mediaAssetId} = ${mediaAssets.id})`,
    );
  }
  if (filters.unlinked) {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM ${mediaAssetLinks} WHERE ${mediaAssetLinks.mediaAssetId} = ${mediaAssets.id})`,
    );
  }
}
