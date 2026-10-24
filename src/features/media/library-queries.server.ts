import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { canWriteToWorkspace, isAgencyMember, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  mediaAssets,
  mediaFolderReconcileLogs,
  storageObjects,
  users,
  workspaces,
} from "@/lib/db/schema";
import type { MediaKind, MediaSourceType } from "@/lib/media/contract";
import { accessibleWorkspaceIdsForActor } from "@/lib/media/accessible-workspaces";
import { MediaPermissionError } from "@/lib/media/errors";

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

type MediaLibraryFiltersInput = {
  agencyId: string;
  workspaceId?: string | undefined;
};

type MediaFolderAuditInput = {
  agencyId: string;
  workspaceId: string;
  limit?: number | undefined;
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

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
  const selectDuplicate = {
    assetId: mediaAssets.id,
    title: mediaAssets.title,
    ownerWorkspaceId: mediaAssets.ownerWorkspaceId,
    workspaceName: workspaces.name,
    kind: storageObjects.kind,
    mimeType: storageObjects.mimeType,
    byteSize: storageObjects.byteSize,
    sourceType: mediaAssets.sourceType,
  };
  const baseConditions = [
    eq(mediaAssets.agencyId, workspace.agencyId),
    eq(mediaAssets.status, "ready"),
    eq(storageObjects.status, "active"),
    eq(storageObjects.kind, input.kind),
    eq(storageObjects.checksumSha256, input.checksumSha256),
    eq(workspaces.status, "active"),
  ];

  const sharedRows = await db
    .select(selectDuplicate)
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(and(...baseConditions, eq(mediaAssets.visibility, "agency")))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit);

  const sameWorkspaceRows = await db
    .select(selectDuplicate)
    .from(mediaAssets)
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(workspaces, eq(workspaces.id, mediaAssets.ownerWorkspaceId))
    .where(and(...baseConditions, eq(mediaAssets.ownerWorkspaceId, input.workspaceId)))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit);

  const unique = new Map<string, (typeof sharedRows)[number]>();
  for (const row of [...sameWorkspaceRows, ...sharedRows]) unique.set(row.assetId, row);
  return [...unique.values()].slice(0, limit).map((row) => ({
    ...row,
    kind: row.kind as MediaKind,
    sourceType: row.sourceType as MediaSourceType,
    sameWorkspace: row.ownerWorkspaceId === input.workspaceId,
  }));
}

export async function getMediaLibraryFilters(actor: Actor, input: MediaLibraryFiltersInput) {
  if (!(await isAgencyMember(actor, input.agencyId))) throw new MediaPermissionError();

  const accessibleWorkspaceIds = await accessibleWorkspaceIdsForActor(actor, input.agencyId);
  if (input.workspaceId && !accessibleWorkspaceIds.includes(input.workspaceId)) {
    throw new MediaPermissionError();
  }
  const scopeWorkspaceIds = input.workspaceId ? [input.workspaceId] : accessibleWorkspaceIds;

  const tagRows = await db
    .select({
      name: sql<string>`unnest(${mediaAssets.tags})`,
      count: sql<number>`count(*)::int`,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.agencyId, input.agencyId),
        inArray(mediaAssets.ownerWorkspaceId, scopeWorkspaceIds),
        inArray(mediaAssets.status, ["processing", "ready", "failed"]),
        sql`array_length(${mediaAssets.tags}, 1) > 0`,
      ),
    )
    .groupBy(sql`unnest(${mediaAssets.tags})`)
    .orderBy(sql`count(*) desc`)
    .limit(50);

  const uploaderRows = await db
    .select({
      id: users.id,
      name: users.name,
      count: sql<number>`count(${mediaAssets.id})::int`,
    })
    .from(mediaAssets)
    .innerJoin(users, eq(users.id, mediaAssets.createdBy))
    .where(
      and(
        eq(mediaAssets.agencyId, input.agencyId),
        inArray(mediaAssets.ownerWorkspaceId, scopeWorkspaceIds),
        inArray(mediaAssets.status, ["processing", "ready", "failed"]),
      ),
    )
    .groupBy(users.id, users.name)
    .orderBy(sql`count(${mediaAssets.id}) desc`)
    .limit(20);

  return { tags: tagRows, uploaders: uploaderRows };
}

export async function getMediaFolderAudit(actor: Actor, input: MediaFolderAuditInput) {
  const accessibleWorkspaceIds = await accessibleWorkspaceIdsForActor(actor, input.agencyId);
  if (!accessibleWorkspaceIds.includes(input.workspaceId)) throw new MediaPermissionError();

  const rows = await db
    .select({
      id: mediaFolderReconcileLogs.id,
      reason: mediaFolderReconcileLogs.reason,
      fromFolderId: mediaFolderReconcileLogs.fromFolderId,
      toFolderId: mediaFolderReconcileLogs.toFolderId,
      contentItemId: mediaFolderReconcileLogs.contentItemId,
      mediaAssetId: mediaFolderReconcileLogs.mediaAssetId,
      reconciledAt: mediaFolderReconcileLogs.reconciledAt,
      actorName: users.name,
    })
    .from(mediaFolderReconcileLogs)
    .leftJoin(users, eq(users.id, mediaFolderReconcileLogs.actorId))
    .where(
      and(
        eq(mediaFolderReconcileLogs.agencyId, input.agencyId),
        eq(mediaFolderReconcileLogs.workspaceId, input.workspaceId),
      ),
    )
    .orderBy(desc(mediaFolderReconcileLogs.reconciledAt))
    .limit(input.limit ?? 20);

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    fromFolderId: row.fromFolderId,
    toFolderId: row.toFolderId,
    contentItemId: row.contentItemId,
    mediaAssetId: row.mediaAssetId,
    reconciledAt: row.reconciledAt.toISOString(),
    actorName: row.actorName ?? "Unknown",
  }));
}
