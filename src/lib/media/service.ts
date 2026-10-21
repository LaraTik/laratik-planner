import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencies,
  contentItems,
  deliveryVersions,
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
import { accessibleMediaWorkspaceIds, MEDIA_READ_ROLES } from "./access";
import { BRAND_KIT_FOLDER_NAME, mediaFormatFolderName } from "./folder-tree";

export { BRAND_KIT_FOLDER_NAME, POSTS_FOLDER_NAME } from "./folder-tree";
export type { MediaFolderKind, MediaFolderTreeRow } from "./folder-tree";
export { MediaPermissionError } from "./errors";

export type MediaSort = "name" | "uploadedAt" | "updatedAt";

type ListInput = {
  agencyId: string;
  workspaceId?: string;
  query?: string;
  kind?: string;
  folderId?: string | null;
  sharedOnly?: boolean;
  includeTrashed?: boolean;
  assetIds?: string[];
  sort?: MediaSort;
  page?: number;
  pageSize?: number;
  limit?: number;
};

async function mediaFolderDescendantIds(input: {
  agencyId: string;
  workspaceId: string;
  folderId: string;
}): Promise<string[]> {
  const folders = await db
    .select({ id: mediaFolders.id, parentId: mediaFolders.parentId })
    .from(mediaFolders)
    .where(
      and(
        eq(mediaFolders.agencyId, input.agencyId),
        eq(mediaFolders.workspaceId, input.workspaceId),
        isNull(mediaFolders.archivedAt),
      ),
    );
  if (!folders.some((folder) => folder.id === input.folderId)) return [];
  const descendantIds = new Set([input.folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && descendantIds.has(folder.parentId) && !descendantIds.has(folder.id)) {
        descendantIds.add(folder.id);
        changed = true;
      }
    }
  }
  return [...descendantIds];
}

type MediaAssetFilterInput = Omit<ListInput, "page" | "pageSize" | "limit">;

/** Keep list rows and pagination counts on the same authorization and filter rules. */
async function mediaAssetFilterConditions(
  actor: Actor,
  input: MediaAssetFilterInput,
): Promise<{ accessibleIds: string[]; conditions: SQL[] } | null> {
  if (!(await isAgencyMember(actor, input.agencyId))) return null;
  const accessibleIds = await accessibleMediaWorkspaceIds(actor, input.agencyId);
  if (accessibleIds.length === 0) return null;
  if (input.workspaceId && !accessibleIds.includes(input.workspaceId)) return null;

  const ownerScope = input.workspaceId
    ? or(eq(mediaAssets.ownerWorkspaceId, input.workspaceId), eq(mediaAssets.visibility, "agency"))
    : or(
        inArray(mediaAssets.ownerWorkspaceId, accessibleIds),
        eq(mediaAssets.visibility, "agency"),
      );
  const conditions: SQL[] = [
    eq(mediaAssets.agencyId, input.agencyId),
    ownerScope!,
    input.includeTrashed
      ? inArray(mediaAssets.status, ["processing", "ready", "failed", "trashed"])
      : inArray(mediaAssets.status, ["processing", "ready", "failed"]),
  ];

  if (input.kind) conditions.push(eq(storageObjects.kind, input.kind));
  if (input.folderId === null) conditions.push(isNull(mediaAssets.folderId));
  if (input.folderId) {
    const [selectedFolder] = input.workspaceId
      ? [{ workspaceId: input.workspaceId }]
      : await db
          .select({ workspaceId: mediaFolders.workspaceId })
          .from(mediaFolders)
          .where(
            and(
              eq(mediaFolders.id, input.folderId),
              eq(mediaFolders.agencyId, input.agencyId),
              isNull(mediaFolders.archivedAt),
            ),
          )
          .limit(1);
    const folderIds =
      selectedFolder && accessibleIds.includes(selectedFolder.workspaceId)
        ? await mediaFolderDescendantIds({
            agencyId: input.agencyId,
            workspaceId: selectedFolder.workspaceId,
            folderId: input.folderId,
          })
        : [];
    if (folderIds.length === 0) return null;
    conditions.push(inArray(mediaAssets.folderId, folderIds));
  }
  if (input.assetIds) {
    if (input.assetIds.length === 0) return null;
    conditions.push(inArray(mediaAssets.id, input.assetIds));
  }
  if (input.sharedOnly) conditions.push(eq(mediaAssets.visibility, "agency"));
  const query = input.query?.trim();
  if (query) {
    conditions.push(
      or(ilike(mediaAssets.title, `%${query}%`), ilike(storageObjects.originalName, `%${query}%`))!,
    );
  }

  return { accessibleIds, conditions };
}

export async function listMediaAssets(actor: Actor, input: ListInput) {
  const filters = await mediaAssetFilterConditions(actor, input);
  if (!filters) return [];
  const { accessibleIds, conditions } = filters;

  const orderBy =
    input.sort === "uploadedAt"
      ? [desc(mediaAssets.createdAt), desc(mediaAssets.id)]
      : input.sort === "updatedAt"
        ? [desc(mediaAssets.updatedAt), desc(mediaAssets.id)]
        : [asc(sql`lower(${mediaAssets.title})`), asc(mediaAssets.createdAt), asc(mediaAssets.id)];
  const pageSize = Math.min(Math.max(input.pageSize ?? input.limit ?? 60, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const rows = await db
    .select({
      asset: mediaAssets,
      object: {
        id: storageObjects.id,
        originalName: storageObjects.originalName,
        mimeType: storageObjects.mimeType,
        byteSize: storageObjects.byteSize,
        width: storageObjects.width,
        height: storageObjects.height,
        durationMs: storageObjects.durationMs,
        kind: storageObjects.kind,
        status: storageObjects.status,
        // Preview variant pointer — surfaced by PR 2 so the grid /
        // gallery / planning preview can render the small WebP from
        // `/api/media/assets/[id]/preview` instead of streaming the
        // full original. Null for legacy assets without a preview;
        // the components fall back to the full URL in that case.
        previewStorageObjectId: mediaAssets.previewStorageObjectId,
      },
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      workspaceAgencySlug: agencies.slug,
      folder: {
        id: mediaFolders.id,
        name: mediaFolders.name,
      },
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .leftJoin(mediaFolders, eq(mediaFolders.id, mediaAssets.folderId))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  if (rows.length === 0) return rows.map((row) => ({ ...row, relatedContentItems: [] }));

  const relations = await db
    .select({
      assetId: mediaAssetLinks.mediaAssetId,
      contentItemId: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      plannedPublishAt: contentItems.plannedPublishAt,
      workspaceSlug: workspaces.slug,
      // Related items can sit in a different workspace — and therefore a
      // different agency — from the asset being viewed, so the link's agency
      // has to travel with the row rather than be assumed from the caller.
      workspaceAgencySlug: agencies.slug,
    })
    .from(mediaAssetLinks)
    .innerJoin(contentItems, eq(contentItems.id, mediaAssetLinks.targetId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(
      and(
        eq(mediaAssetLinks.agencyId, input.agencyId),
        eq(mediaAssetLinks.targetType, "content_item"),
        input.workspaceId
          ? eq(contentItems.workspaceId, input.workspaceId)
          : inArray(contentItems.workspaceId, accessibleIds),
        inArray(
          mediaAssetLinks.mediaAssetId,
          rows.map((row) => row.asset.id),
        ),
      ),
    );

  const deliveryRelations = await db
    .select({
      assetId: mediaAssetLinks.mediaAssetId,
      contentItemId: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      plannedPublishAt: contentItems.plannedPublishAt,
      workspaceSlug: workspaces.slug,
      workspaceAgencySlug: agencies.slug,
    })
    .from(mediaAssetLinks)
    .innerJoin(deliveryVersions, eq(deliveryVersions.id, mediaAssetLinks.targetId))
    .innerJoin(contentItems, eq(contentItems.id, deliveryVersions.contentItemId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(
      and(
        eq(mediaAssetLinks.agencyId, input.agencyId),
        eq(mediaAssetLinks.targetType, "delivery"),
        input.workspaceId
          ? eq(contentItems.workspaceId, input.workspaceId)
          : inArray(contentItems.workspaceId, accessibleIds),
        inArray(
          mediaAssetLinks.mediaAssetId,
          rows.map((row) => row.asset.id),
        ),
      ),
    );

  const relatedByAsset = new Map<string, (typeof relations)[number]>();
  const relationLists = new Map<string, (typeof relations)[number][]>();
  for (const relation of [...relations, ...deliveryRelations]) {
    const key = `${relation.assetId}:${relation.contentItemId}`;
    if (relatedByAsset.has(key)) continue;
    relatedByAsset.set(key, relation);
    const current = relationLists.get(relation.assetId) ?? [];
    current.push(relation);
    relationLists.set(relation.assetId, current);
  }

  return rows.map((row) => ({
    ...row,
    relatedContentItems: relationLists.get(row.asset.id) ?? [],
  }));
}

/**
 * Rows fetched per library page, shared by the agency route (`/app/media`)
 * and the workspace route (`/app/a/<agencySlug>/w/<slug>/media`) so the two
 * cannot drift apart.
 *
 * 12, not 24: the library is browsed as a gallery, and 24 full tiles is two
 * screens of scrolling before the operator reaches the pager. Operators who
 * want a denser view pass `?size=24` or `?size=48`; the selector in the filter
 * bar submits exactly that. The lower default also keeps first paint under ~12
 * preview fetches, and the signed-URL Cloudflare pipeline is bandwidth-bound —
 * a 48-row page routinely produced bursts of 401/proxy-redirect retries on a
 * cold cache.
 */
export const MEDIA_PAGE_SIZE = 12;

/**
 * Allow-list for the `?size=` override. A fixed set rather than a free-form
 * integer so a hand-edited URL cannot request an unbounded page, and so the
 * selector renders one chip per legal value.
 */
export const MEDIA_PAGE_SIZE_OPTIONS = [12, 24, 48] as const;

/**
 * Reads the `?size=` override, falling back to {@link MEDIA_PAGE_SIZE} for a
 * missing or non-matching value.
 *
 * Matches the raw string against the options rather than `parseInt`-ing it:
 * `parseInt("24.5")` is 24 and `parseInt("12abc")` is 12, so truncation would
 * silently turn a typo into a *different* legal page size. A value that is not
 * exactly one of the offered ones means nothing and falls back to the default.
 */
export function parseMediaPageSize(value: string | undefined): number {
  const raw = (value ?? "").trim();
  return MEDIA_PAGE_SIZE_OPTIONS.find((option) => String(option) === raw) ?? MEDIA_PAGE_SIZE;
}

export async function listMediaAssetsPage(actor: Actor, input: ListInput) {
  const pageSize = Math.min(Math.max(input.pageSize ?? input.limit ?? 48, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const [rows, total] = await Promise.all([
    listMediaAssets(actor, { ...input, page, pageSize: pageSize + 1 }),
    countMediaAssets(actor, input),
  ]);
  return {
    rows: rows.slice(0, pageSize),
    page,
    pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: rows.length > pageSize,
    total,
  };
}

/**
 * Count the rows that `listMediaAssets` would return for the given
 * filters. Same predicate shape, no offset/limit. Used by
 * `listMediaAssetsPage` to expose the total so the UI can render
 * "Select all matching N" affordances.
 */
export async function countMediaAssets(
  actor: Actor,
  input: MediaAssetFilterInput,
): Promise<number> {
  const filters = await mediaAssetFilterConditions(actor, input);
  if (!filters) return 0;
  const { conditions } = filters;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(and(...conditions));
  return row?.count ?? 0;
}

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

export async function listMediaAssetsForContentItem(
  actor: Actor,
  input: { agencyId: string; workspaceId: string; contentItemId: string; limit?: number },
) {
  const contentItemLinks = await db
    .select({ assetId: mediaAssetLinks.mediaAssetId })
    .from(mediaAssetLinks)
    .where(
      and(
        eq(mediaAssetLinks.agencyId, input.agencyId),
        eq(mediaAssetLinks.workspaceId, input.workspaceId),
        eq(mediaAssetLinks.targetType, "content_item"),
        eq(mediaAssetLinks.targetId, input.contentItemId),
      ),
    );
  const deliveryLinks = await db
    .select({ assetId: mediaAssetLinks.mediaAssetId })
    .from(mediaAssetLinks)
    .innerJoin(deliveryVersions, eq(deliveryVersions.id, mediaAssetLinks.targetId))
    .where(
      and(
        eq(mediaAssetLinks.agencyId, input.agencyId),
        eq(mediaAssetLinks.workspaceId, input.workspaceId),
        eq(mediaAssetLinks.targetType, "delivery"),
        eq(deliveryVersions.contentItemId, input.contentItemId),
      ),
    );
  const assetIds = [
    ...new Set([...contentItemLinks, ...deliveryLinks].map((link) => link.assetId)),
  ];
  return listMediaAssets(actor, {
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    assetIds,
    sort: "name",
    limit: input.limit ?? 100,
  });
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
