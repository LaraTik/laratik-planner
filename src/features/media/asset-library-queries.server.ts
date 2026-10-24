import "server-only";

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { isAgencyMember, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  agencies,
  contentItems,
  deliveryVersions,
  mediaAssets,
  mediaAssetLinks,
  mediaFolders,
  storageObjects,
  workspaces,
} from "@/lib/db/schema";
import { accessibleMediaWorkspaceIds } from "@/lib/media/access";
import type { MediaLibraryItem } from "@/lib/media/types";

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

export async function listMediaAssets(actor: Actor, input: ListInput): Promise<MediaLibraryItem[]> {
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
