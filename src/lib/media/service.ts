import "server-only";
import { workspaceBasePath } from "@/lib/urls";
import { and, asc, desc, eq, ilike, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencies,
  contentItems,
  deliveryVersions,
  mediaAssets,
  mediaAssetLinks,
  type MediaAssetLink,
  mediaFolderReconcileLogs,
  mediaFolders,
  storageObjects,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import {
  canWriteToWorkspace,
  hasWorkspaceRole,
  isAgencyMember,
  type Actor,
} from "@/lib/auth/policy";
import {
  sanitizeAssetTitle,
  type MediaDimensions,
  type MediaKind,
  type MediaSourceType,
} from "./contract";
import { MediaValidationError, validateStoredMediaObject } from "./validation";
import { quarantineMediaObject } from "./quarantine";
import { MediaPermissionError } from "./errors";
import { accessibleMediaWorkspaceIds, MEDIA_READ_ROLES } from "./access";
import { BRAND_KIT_FOLDER_NAME, mediaFormatFolderName } from "./folder-tree";
import { assertWithinBulkCap, MAX_TAGS_PER_ASSET, MAX_TAG_LENGTH } from "./bulk-cap";
import { releaseCapacityAmount } from "@/lib/entitlements";

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

export async function listMediaAssets(actor: Actor, input: ListInput) {
  if (!(await isAgencyMember(actor, input.agencyId))) return [];
  const accessibleIds = await accessibleMediaWorkspaceIds(actor, input.agencyId);
  if (accessibleIds.length === 0) return [];
  if (input.workspaceId && !accessibleIds.includes(input.workspaceId)) return [];

  // A workspace view includes its own assets plus agency-shared assets from
  // the agency. The object is reused; this is a catalog visibility rule, not
  // a copy operation. The detail/download path applies the same agency-level
  // internal-role rule.
  const ownerScope = input.workspaceId
    ? or(eq(mediaAssets.ownerWorkspaceId, input.workspaceId), eq(mediaAssets.visibility, "agency"))
    : or(
        inArray(mediaAssets.ownerWorkspaceId, accessibleIds),
        eq(mediaAssets.visibility, "agency"),
      );

  const conditions = [
    eq(mediaAssets.agencyId, input.agencyId),
    ownerScope,
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
    if (folderIds.length === 0) return [];
    conditions.push(inArray(mediaAssets.folderId, folderIds));
  }
  if (input.assetIds) {
    if (input.assetIds.length === 0) return [];
    conditions.push(inArray(mediaAssets.id, input.assetIds));
  }
  if (input.sharedOnly) conditions.push(eq(mediaAssets.visibility, "agency"));
  const query = input.query?.trim();
  if (query) {
    conditions.push(
      or(ilike(mediaAssets.title, `%${query}%`), ilike(storageObjects.originalName, `%${query}%`))!,
    );
  }

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
  input: Omit<ListInput, "limit" | "offset" | "page" | "pageSize">,
): Promise<number> {
  if (!(await isAgencyMember(actor, input.agencyId))) return 0;
  const accessibleIds = await accessibleMediaWorkspaceIds(actor, input.agencyId);
  if (accessibleIds.length === 0) return 0;
  if (input.workspaceId && !accessibleIds.includes(input.workspaceId)) return 0;

  const ownerScope = input.workspaceId
    ? or(eq(mediaAssets.ownerWorkspaceId, input.workspaceId), eq(mediaAssets.visibility, "agency"))
    : or(
        inArray(mediaAssets.ownerWorkspaceId, accessibleIds),
        eq(mediaAssets.visibility, "agency"),
      );

  const conditions = [
    eq(mediaAssets.agencyId, input.agencyId),
    ownerScope,
    input.includeTrashed
      ? inArray(mediaAssets.status, ["processing", "ready", "failed", "trashed"])
      : inArray(mediaAssets.status, ["processing", "ready", "failed"]),
    inArray(mediaAssets.ownerWorkspaceId, input.workspaceId ? [input.workspaceId] : accessibleIds),
  ];

  if (input.query) {
    const pattern = `%${input.query.trim()}%`;
    conditions.push(
      or(ilike(mediaAssets.title, pattern), ilike(storageObjects.originalName, pattern))!,
    );
  }
  if (input.kind) {
    conditions.push(eq(storageObjects.kind, input.kind));
  }
  if (input.sharedOnly) {
    conditions.push(eq(mediaAssets.visibility, "agency"));
  }
  if (input.folderId === null) {
    conditions.push(isNull(mediaAssets.folderId));
  } else if (input.folderId) {
    conditions.push(eq(mediaAssets.folderId, input.folderId));
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(and(...conditions));
  return row?.count ?? 0;
}

export type MediaDuplicateAdvisory = {
  assetId: string;
  title: string;
  ownerWorkspaceId: string;
  workspaceName: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  sourceType: MediaSourceType;
  sameWorkspace: boolean;
};

/**
 * Return visible, ready assets with the same content checksum as a new
 * upload. This is advisory only: callers must still upload or explicitly
 * choose a future reuse/copy action. No source URLs or storage credentials
 * are exposed by this lookup.
 */
export async function findDuplicateMediaAssets(
  actor: Actor,
  input: { workspaceId: string; checksumSha256: string; kind: MediaKind; limit?: number },
): Promise<MediaDuplicateAdvisory[]> {
  if (!(await canWriteToWorkspace(actor, input.workspaceId))) {
    throw new MediaPermissionError("Read-only users cannot inspect upload duplicates.");
  }

  const [workspace] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.status, "active")))
    .limit(1);
  if (!workspace) return [];

  const rows = await db
    .select({
      assetId: mediaAssets.id,
      title: mediaAssets.title,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      workspaceName: workspaces.name,
      kind: storageObjects.kind,
      mimeType: storageObjects.mimeType,
      byteSize: storageObjects.byteSize,
      sourceType: mediaAssets.sourceType,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(
      and(
        eq(mediaAssets.agencyId, workspace.agencyId),
        eq(mediaAssets.status, "ready"),
        eq(mediaAssets.visibility, "agency"),
        eq(storageObjects.status, "active"),
        eq(storageObjects.kind, input.kind),
        eq(storageObjects.checksumSha256, input.checksumSha256),
        eq(workspaces.status, "active"),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 5, 1), 20));

  const sameWorkspaceRows = await db
    .select({
      assetId: mediaAssets.id,
      title: mediaAssets.title,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      workspaceName: workspaces.name,
      kind: storageObjects.kind,
      mimeType: storageObjects.mimeType,
      byteSize: storageObjects.byteSize,
      sourceType: mediaAssets.sourceType,
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(
      and(
        eq(mediaAssets.agencyId, workspace.agencyId),
        eq(mediaAssets.ownerWorkspaceId, input.workspaceId),
        eq(mediaAssets.status, "ready"),
        eq(storageObjects.status, "active"),
        eq(storageObjects.kind, input.kind),
        eq(storageObjects.checksumSha256, input.checksumSha256),
        eq(workspaces.status, "active"),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 5, 1), 20));

  const unique = new Map<string, (typeof rows)[number]>();
  for (const row of [...sameWorkspaceRows, ...rows]) unique.set(row.assetId, row);
  return [...unique.values()].slice(0, Math.min(Math.max(input.limit ?? 5, 1), 20)).map((row) => ({
    ...row,
    kind: row.kind as MediaKind,
    sourceType: row.sourceType as MediaSourceType,
    sameWorkspace: row.ownerWorkspaceId === input.workspaceId,
  }));
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

export async function linkMediaAssetToContentItem(
  actor: Actor,
  input: { assetId: string; contentItemId: string },
) {
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      agencyId: workspaces.agencyId,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item || !(await canWriteToWorkspace(actor, item.workspaceId))) {
    throw new MediaPermissionError("You do not have permission to attach media to this post.");
  }

  const [asset] = await db
    .select({
      id: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
      visibility: mediaAssets.visibility,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, input.assetId))
    .limit(1);
  if (
    !asset ||
    asset.agencyId !== item.agencyId ||
    (asset.ownerWorkspaceId !== item.workspaceId && asset.visibility !== "agency")
  ) {
    throw new MediaPermissionError("The selected media is not available for this post.");
  }

  const [link] = await db
    .insert(mediaAssetLinks)
    .values({
      agencyId: item.agencyId,
      workspaceId: item.workspaceId,
      mediaAssetId: input.assetId,
      targetType: "content_item",
      targetId: input.contentItemId,
      createdBy: actor.id,
    })
    .onConflictDoNothing()
    .returning();
  return link ?? null;
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
      selectedFolderId = await ensurePlanningMediaFolderPath({
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
          const { storePreviewForAsset } = await import("./thumbnails");
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

export async function renameMediaAsset(actor: Actor, assetId: string, title: string) {
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
    .set({ visibility, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
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
// ensureBrandMediaFolderPath, bulkMoveMediaAssets, bulkTrashMediaAssets,
// bulkRestoreMediaAssets, bulkSetMediaAssetTags,
// bulkSetMediaAssetVisibility, duplicateMediaAssets.
//
// `trashMediaAsset` already sets `delete_after = now() + 30d`; the cron
// extension lives in PR-2 per decision H.

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

/**
 * Inverse of `linkMediaAssetToContentItem`: returns every
 * `media_asset_link` row for an asset, with a human-readable label
 * and a workspace-deep link target. Privacy rule: if the actor is on
 * an agency-shared-only read, rows with `clientVisible=false` are
 * stripped from the result.
 */
export async function linkedTargetsForMediaAsset(
  actor: Actor,
  input: { agencyId: string; assetId: string },
): Promise<
  Array<{
    id: string;
    targetType: MediaAssetLink["targetType"];
    targetId: string;
    label: string;
    href: string;
    clientVisible: boolean;
    createdAt: Date;
  }>
> {
  if (!(await isAgencyMember(actor, input.agencyId))) return [];
  // Confirm the asset belongs to the actor's agency before reading
  // any links (defence in depth).
  const [asset] = await db
    .select({ id: mediaAssets.id, agencyId: mediaAssets.agencyId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, input.assetId))
    .limit(1);
  if (!asset || asset.agencyId !== input.agencyId) return [];

  const rows = await db
    .select({
      id: mediaAssetLinks.id,
      targetType: mediaAssetLinks.targetType,
      targetId: mediaAssetLinks.targetId,
      clientVisible: mediaAssetLinks.clientVisible,
      createdAt: mediaAssetLinks.createdAt,
      workspaceId: mediaAssetLinks.workspaceId,
      contentItemTitle: contentItems.title,
      contentItemWorkspaceSlug: workspaces.slug,
      // Canonical URLs carry the agency; a workspace slug alone is unique
      // only within an agency.
      contentItemWorkspaceAgencySlug: agencies.slug,
      deliveryVersionNumber: deliveryVersions.versionNumber,
    })
    .from(mediaAssetLinks)
    .leftJoin(contentItems, eq(contentItems.id, mediaAssetLinks.targetId))
    .leftJoin(deliveryVersions, eq(deliveryVersions.id, mediaAssetLinks.targetId))
    .leftJoin(workspaces, eq(workspaces.id, mediaAssetLinks.workspaceId))
    .leftJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(eq(mediaAssetLinks.mediaAssetId, input.assetId));

  const readableByAgency = await isAgencyMember(actor, input.agencyId);

  return rows
    .filter((row) => {
      // Internal agency members can see every link regardless of
      // clientVisible. A non-member (agency-shared-only viewer) sees
      // only the client-visible links.
      if (row.clientVisible) return true;
      return readableByAgency;
    })
    .map((row) => {
      const href = (() => {
        if (row.targetType === "content_item") {
          // The deep link requires both the workspace slug AND the
          // content item id. If the workspace slug is missing (the
          // joined row was deleted), we cannot construct a real URL
          // for this item — fall back to the workspace selector so
          // the user can still reach the planner. The legacy broken
          // shape that joins "planning" directly under "/app" has
          // never been routed; never write it.
          return row.contentItemWorkspaceSlug && row.contentItemWorkspaceAgencySlug
            ? `${workspaceBasePath(
                row.contentItemWorkspaceAgencySlug,
                row.contentItemWorkspaceSlug,
              )}/planning/${row.targetId}`
            : `/app`;
        }
        if (row.targetType === "delivery") {
          return row.contentItemWorkspaceSlug && row.contentItemWorkspaceAgencySlug
            ? `${workspaceBasePath(
                row.contentItemWorkspaceAgencySlug,
                row.contentItemWorkspaceSlug,
              )}/planning`
            : `/app`;
        }
        if (row.targetType === "comment") {
          return row.contentItemWorkspaceSlug && row.contentItemWorkspaceAgencySlug
            ? `${workspaceBasePath(
                row.contentItemWorkspaceAgencySlug,
                row.contentItemWorkspaceSlug,
              )}/planning`
            : `/app`;
        }
        return row.contentItemWorkspaceSlug && row.contentItemWorkspaceAgencySlug
          ? `${workspaceBasePath(
              row.contentItemWorkspaceAgencySlug,
              row.contentItemWorkspaceSlug,
            )}/brand-kit`
          : `/app/brand-kit`;
      })();
      const label =
        row.targetType === "content_item"
          ? (row.contentItemTitle ?? "Idea")
          : row.targetType === "delivery"
            ? `Delivery v${row.deliveryVersionNumber ?? "?"}`
            : row.targetType === "comment"
              ? "Comment"
              : "Brand asset";
      return {
        id: row.id,
        targetType: row.targetType,
        targetId: row.targetId,
        label,
        href,
        clientVisible: row.clientVisible,
        createdAt: row.createdAt,
      };
    });
}

/** Pure helper that powers `setMediaAssetTags` + the bulk variant. */
export function sanitizeMediaTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag || tag.length > MAX_TAG_LENGTH) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= MAX_TAGS_PER_ASSET) break;
  }
  return result;
}

/** Single-asset tag setter. Used by `setMediaAssetTags` UI flow. */
export async function setMediaAssetTags(actor: Actor, assetId: string, tags: readonly string[]) {
  const [row] = await db
    .select({ id: mediaAssets.id, workspaceId: mediaAssets.ownerWorkspaceId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!row || !(await hasWorkspaceRole(actor, row.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  const sanitized = sanitizeMediaTags(tags);
  const [updated] = await db
    .update(mediaAssets)
    .set({ tags: sanitized, updatedBy: actor.id, updatedAt: new Date() })
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

  // Validate the target folder once, before opening the transaction.
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

/** Bulk trash. Per-asset `delete_after = now() + 30d`. Idempotent. */
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
      if (row.status === "trashed") continue; // idempotent
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

/** Bulk restore. Idempotent (no-op when the asset isn't trashed). */
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

  await db.transaction(async (tx) => {
    for (const row of rows) {
      if (!(await canWriteToWorkspace(actor, row.ownerWorkspaceId))) {
        failures.push({ assetId: row.id, reason: "forbidden" });
        continue;
      }
      const [created] = await tx
        .insert(mediaAssets)
        .values({
          agencyId:
            (
              await tx
                .select({ agencyId: mediaAssets.agencyId })
                .from(mediaAssets)
                .where(eq(mediaAssets.id, row.id))
                .limit(1)
            )[0]?.agencyId ?? "",
          ownerWorkspaceId: row.ownerWorkspaceId,
          folderId: row.folderId,
          storageObjectId: row.storageObjectId,
          previewStorageObjectId: row.previewStorageObjectId,
          posterStorageObjectId: row.posterStorageObjectId,
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
      if (created) duplicated += 1;
      else failures.push({ assetId: row.id, reason: "missing" });
    }
  });

  return { duplicated, failures };
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
