import "server-only";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentItems,
  deliveryVersions,
  mediaAssets,
  mediaAssetLinks,
  mediaFolders,
  mediaShareLinks,
  securityAuditEvents,
  storageObjects,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import {
  canWriteToWorkspace,
  hasWorkspaceRole,
  isAgencyAdmin,
  isAgencyMember,
  type Actor,
} from "@/lib/auth/policy";
import {
  redactMediaSourceUrl,
  sanitizeAssetTitle,
  titleFromFilename,
  type MediaKind,
  type MediaSourceType,
} from "./contract";
import { fetchPublicMedia, MediaSourceError } from "./source";
import { MediaValidationError, validateStoredMediaObject } from "./validation";
import { quarantineMediaObject } from "./quarantine";
import {
  abortStorageUpload,
  completeStorageUpload,
  createStorageUploadIntent,
} from "@/lib/storage/intent-service";
import { createMediaShareToken, hashMediaShareToken, MEDIA_SHARE_TTL_MS } from "./share-token";
import { normalizeMediaFolderName } from "./folders";

const MEDIA_READ_ROLES = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
] as const;

export class MediaPermissionError extends Error {
  constructor(message = "You do not have permission to manage this media.") {
    super(message);
    this.name = "MediaPermissionError";
  }
}

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

async function accessibleWorkspaceIds(actor: Actor, agencyId: string): Promise<string[]> {
  if (await isAgencyAdmin(actor, agencyId)) {
    const rows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.agencyId, agencyId));
    return rows.map((row) => row.id);
  }
  const rows = await db
    .select({ id: workspaceMemberships.workspaceId })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .innerJoin(
      workspaceMembershipRoles,
      eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
    )
    .where(
      and(
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaces.agencyId, agencyId),
        eq(workspaces.status, "active"),
        inArray(workspaceMembershipRoles.role, [...MEDIA_READ_ROLES]),
      ),
    );
  return [...new Set(rows.map((row) => row.id))];
}

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
  const accessibleIds = await accessibleWorkspaceIds(actor, input.agencyId);
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
      },
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      folder: {
        id: mediaFolders.id,
        name: mediaFolders.name,
      },
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
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
    })
    .from(mediaAssetLinks)
    .innerJoin(contentItems, eq(contentItems.id, mediaAssetLinks.targetId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
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
    })
    .from(mediaAssetLinks)
    .innerJoin(deliveryVersions, eq(deliveryVersions.id, mediaAssetLinks.targetId))
    .innerJoin(contentItems, eq(contentItems.id, deliveryVersions.contentItemId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
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

export async function listMediaAssetsPage(actor: Actor, input: ListInput) {
  const pageSize = Math.min(Math.max(input.pageSize ?? input.limit ?? 48, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const rows = await listMediaAssets(actor, { ...input, page, pageSize: pageSize + 1 });
  return {
    rows: rows.slice(0, pageSize),
    page,
    pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: rows.length > pageSize,
  };
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

function mediaFormatFolderName(format: string): string {
  return format
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
}) {
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

  const [existing] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.storageObjectId, input.storageObjectId))
    .limit(1);
  if (existing) return existing;

  const sourceType = input.sourceType ?? "browser_file";
  let status: "processing" | "ready" | "failed" = "processing";
  let failureCode: string | undefined = "validation_pending";
  let dimensions: { width: number; height: number } | null = null;
  if (sourceType === "legacy") {
    status = "ready";
    failureCode = undefined;
  } else {
    try {
      dimensions = await validateStoredMediaObject({
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
      return asset;
    }

    // A concurrent request may have won the unique storage-object race.
    const [alreadyRegistered] = await db
      .select({ id: mediaAssets.id })
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
      return alreadyRegistered;
    }
    throw new Error("Media asset could not be registered");
  } catch (error) {
    // Never leave a completed storage object active when catalog registration
    // fails. If another request registered it concurrently, preserve that
    // winner and avoid quarantining its live object.
    const [alreadyRegistered] = await db
      .select({ id: mediaAssets.id })
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
      return alreadyRegistered;
    }
    await quarantineMediaObject({ agencyId: input.agencyId, objectId: input.storageObjectId });
    throw error;
  }
}

/** Cron-safe promotion for objects whose provider was temporarily unavailable. */
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

async function mediaAssetForManagement(assetId: string) {
  const [row] = await db
    .select({
      asset: mediaAssets,
      object: storageObjects,
      workspace: { id: workspaces.id, agencyId: workspaces.agencyId },
    })
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  return row ?? null;
}

async function assertMediaManager(actor: Actor, assetId: string) {
  const row = await mediaAssetForManagement(assetId);
  if (!row || !(await hasWorkspaceRole(actor, row.asset.ownerWorkspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }
  return row;
}

export async function listMediaFolders(
  actor: Actor,
  input: { agencyId: string; workspaceId: string },
) {
  const accessible = await accessibleWorkspaceIds(actor, input.agencyId);
  if (!accessible.includes(input.workspaceId)) return [];
  return db
    .select()
    .from(mediaFolders)
    .where(
      and(
        eq(mediaFolders.agencyId, input.agencyId),
        eq(mediaFolders.workspaceId, input.workspaceId),
        isNull(mediaFolders.archivedAt),
      ),
    )
    .orderBy(asc(mediaFolders.sortOrder), asc(mediaFolders.name));
}

export async function createMediaFolder(
  actor: Actor,
  input: { agencyId: string; workspaceId: string; name: string; parentId?: string | null },
) {
  if (!(await hasWorkspaceRole(actor, input.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError("Only workspace managers can manage media folders.");
  }
  const name = normalizeMediaFolderName(input.name);
  if (!name) throw new MediaPermissionError("The folder name is invalid.");
  const parentId = input.parentId ?? null;
  if (parentId) {
    const [parent] = await db
      .select({ id: mediaFolders.id })
      .from(mediaFolders)
      .where(
        and(
          eq(mediaFolders.id, parentId),
          eq(mediaFolders.agencyId, input.agencyId),
          eq(mediaFolders.workspaceId, input.workspaceId),
          isNull(mediaFolders.archivedAt),
        ),
      )
      .limit(1);
    if (!parent) throw new MediaPermissionError("The parent media folder is not available.");
  }
  const [folder] = await db
    .insert(mediaFolders)
    .values({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      ...(parentId ? { parentId } : {}),
      name,
      createdBy: actor.id,
    })
    .returning();
  return folder ?? null;
}

export async function renameMediaFolder(actor: Actor, folderId: string, name: string) {
  const [folder] = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.id, folderId))
    .limit(1);
  if (!folder || !(await hasWorkspaceRole(actor, folder.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError("Only workspace managers can manage media folders.");
  }
  const trimmed = normalizeMediaFolderName(name);
  if (!trimmed) throw new MediaPermissionError("The folder name is invalid.");
  const [updated] = await db
    .update(mediaFolders)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(mediaFolders.id, folderId), isNull(mediaFolders.archivedAt)))
    .returning();
  return updated ?? null;
}

export async function archiveMediaFolder(actor: Actor, folderId: string) {
  const [folder] = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.id, folderId))
    .limit(1);
  if (!folder || !(await hasWorkspaceRole(actor, folder.workspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError("Only workspace managers can manage media folders.");
  }
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const folders = await tx
      .select({ id: mediaFolders.id, parentId: mediaFolders.parentId })
      .from(mediaFolders)
      .where(
        and(
          eq(mediaFolders.workspaceId, folder.workspaceId),
          eq(mediaFolders.agencyId, folder.agencyId),
          isNull(mediaFolders.archivedAt),
        ),
      );
    const descendantIds = new Set([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of folders) {
        if (
          candidate.parentId &&
          descendantIds.has(candidate.parentId) &&
          !descendantIds.has(candidate.id)
        ) {
          descendantIds.add(candidate.id);
          changed = true;
        }
      }
    }
    const ids = [...descendantIds];
    const archived = await tx
      .update(mediaFolders)
      .set({ archivedAt: now, archivedBy: actor.id, updatedAt: now })
      .where(inArray(mediaFolders.id, ids))
      .returning();
    if (archived.length > 0) {
      await tx
        .update(mediaAssets)
        .set({ folderId: null, updatedBy: actor.id, updatedAt: now })
        .where(inArray(mediaAssets.folderId, ids));
    }
    return archived.find((candidate) => candidate.id === folderId);
  });
  return updated ?? null;
}

export async function moveMediaAsset(actor: Actor, assetId: string, folderId: string | null) {
  const row = await assertMediaManager(actor, assetId);
  if (folderId) {
    const [folder] = await db
      .select({ id: mediaFolders.id })
      .from(mediaFolders)
      .where(
        and(
          eq(mediaFolders.id, folderId),
          eq(mediaFolders.agencyId, row.asset.agencyId),
          eq(mediaFolders.workspaceId, row.asset.ownerWorkspaceId),
          isNull(mediaFolders.archivedAt),
        ),
      )
      .limit(1);
    if (!folder) throw new MediaPermissionError("The selected media folder is not available.");
  }
  const [updated] = await db
    .update(mediaAssets)
    .set({ folderId, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(mediaAssets.id, assetId))
    .returning();
  return updated ?? null;
}

export async function activeMediaShareForActor(actor: Actor, assetId: string) {
  const row = await assertMediaManager(actor, assetId);
  const [share] = await db
    .select({ id: mediaShareLinks.id, expiresAt: mediaShareLinks.expiresAt })
    .from(mediaShareLinks)
    .where(
      and(
        eq(mediaShareLinks.mediaAssetId, assetId),
        isNull(mediaShareLinks.revokedAt),
        gt(mediaShareLinks.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return { asset: row.asset, share: share ?? null };
}

export async function createPublicMediaShare(actor: Actor, assetId: string) {
  const row = await assertMediaManager(actor, assetId);
  if (
    row.asset.status !== "ready" ||
    row.object.status !== "active" ||
    row.object.kind !== "image"
  ) {
    throw new MediaPermissionError("Only ready images can be shared publicly.");
  }

  const token = createMediaShareToken();
  const expiresAt = new Date(Date.now() + MEDIA_SHARE_TTL_MS);
  const now = new Date();
  const share = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-share:${assetId}`}))`);
    await tx
      .update(mediaShareLinks)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(mediaShareLinks.mediaAssetId, assetId), isNull(mediaShareLinks.revokedAt)));
    const [created] = await tx
      .insert(mediaShareLinks)
      .values({
        mediaAssetId: assetId,
        tokenHash: hashMediaShareToken(token),
        expiresAt,
        createdBy: actor.id,
      })
      .returning({ id: mediaShareLinks.id, expiresAt: mediaShareLinks.expiresAt });
    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "media.public_share.create",
      targetType: "media_asset",
      targetId: assetId,
      outcome: "success",
      metadata: { expiresAt: expiresAt.toISOString(), rotated: true },
    });
    return created;
  });
  if (!share) throw new Error("Public media link could not be created");
  return { token, expiresAt: share.expiresAt };
}

export async function revokePublicMediaShare(actor: Actor, assetId: string) {
  await assertMediaManager(actor, assetId);
  const now = new Date();
  const updated = await db
    .update(mediaShareLinks)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(mediaShareLinks.mediaAssetId, assetId), isNull(mediaShareLinks.revokedAt)))
    .returning({ id: mediaShareLinks.id });
  if (updated.length > 0) {
    await db.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "media.public_share.revoke",
      targetType: "media_asset",
      targetId: assetId,
      outcome: "success",
    });
  }
  return { revoked: updated.length > 0 };
}

export async function publicMediaAssetForToken(token: string) {
  const tokenHash = hashMediaShareToken(token);
  const [row] = await db
    .select({ asset: mediaAssets, object: storageObjects })
    .from(mediaShareLinks)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaShareLinks.mediaAssetId))
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(
      and(
        eq(mediaShareLinks.tokenHash, tokenHash),
        isNull(mediaShareLinks.revokedAt),
        gt(mediaShareLinks.expiresAt, new Date()),
        eq(mediaAssets.status, "ready"),
        eq(storageObjects.status, "active"),
        eq(storageObjects.kind, "image"),
      ),
    )
    .limit(1);
  return row ?? null;
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
    .select({ asset: mediaAssets, object: storageObjects })
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

export async function importPublicMediaAsset(input: {
  actor: Actor;
  agencyId: string;
  workspaceId: string;
  url: string;
  title?: string;
  contentItemId?: string;
  visibility?: "workspace" | "agency";
}) {
  if (!(await canWriteToWorkspace(input.actor, input.workspaceId))) {
    throw new MediaPermissionError("Read-only users cannot import media.");
  }
  const source = await fetchPublicMedia({ url: input.url });
  let sourceName = "";
  try {
    const pathname = new URL(source.finalUrl).pathname;
    const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
    sourceName = decodeURIComponent(lastSegment);
  } catch {
    // The source fetch already validated the URL; an unusable path is simply
    // treated as an unnamed import rather than becoming a title with query
    // credentials or encoded path syntax.
  }
  const safeSourceUrl = redactMediaSourceUrl(source.finalUrl);
  const lastModifiedHeader = source.response.headers.get("last-modified");
  const sourceModifiedAt = lastModifiedHeader ? new Date(lastModifiedHeader) : null;
  const signed = await createStorageUploadIntent({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    userId: input.actor.id,
    kind: source.kind,
    extension: source.extension,
    contentType: source.contentType,
    expectedByteSize: source.byteSize,
    ...(sourceName ? { originalName: sourceName } : {}),
  });
  try {
    const response = await fetch(signed.uploadUrl, {
      method: "PUT",
      body: source.response.body,
      headers: {
        ...(signed.requiredHeaders ?? {}),
        "Content-Length": String(source.byteSize),
      },
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    if (!response.ok) throw new MediaSourceError("fetch_failed", "The file could not be stored.");
    const completed = await completeStorageUpload({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      intentId: signed.uploadIntentId,
    });
    return registerUploadedMediaAsset({
      actor: input.actor,
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      storageObjectId: completed.objectId,
      title: input.title ?? (sourceName ? titleFromFilename(sourceName) : "Imported media"),
      ...(input.contentItemId ? { contentItemId: input.contentItemId } : {}),
      ...(input.visibility ? { visibility: input.visibility } : {}),
      sourceType:
        source.provider === "google_drive"
          ? "google_drive"
          : source.provider === "onedrive"
            ? "onedrive"
            : "external_url",
      sourceProvider: source.provider,
      ...(safeSourceUrl ? { sourceReference: safeSourceUrl, sourceUrl: safeSourceUrl } : {}),
      ...(sourceModifiedAt && Number.isFinite(sourceModifiedAt.getTime())
        ? { sourceModifiedAt }
        : {}),
    });
  } catch (error) {
    await abortStorageUpload({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      intentId: signed.uploadIntentId,
    });
    throw error;
  }
}
