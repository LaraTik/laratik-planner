import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { isAgencyMember, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { mediaAssets, mediaFolderReconcileLogs, users } from "@/lib/db/schema";
import { accessibleWorkspaceIdsForActor } from "@/lib/media/accessible-workspaces";
import { MediaPermissionError } from "@/lib/media/errors";

type MediaLibraryFiltersInput = {
  agencyId: string;
  workspaceId?: string | undefined;
};

type MediaFolderAuditInput = {
  agencyId: string;
  workspaceId: string;
  limit?: number | undefined;
};

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
