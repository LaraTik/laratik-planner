import "server-only";

import { cache } from "react";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets, mediaFolders } from "@/lib/db/schema";
import { hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import { accessibleMediaWorkspaceIds } from "@/lib/media/access";
import { MediaPermissionError } from "@/lib/media/errors";
import { normalizeMediaFolderName } from "@/lib/media/folders";
import { buildMediaFolderTree, type MediaFolderTreeRow } from "@/lib/media/folder-tree";

const fetchAccessibleMediaFolders = cache(
  async (actor: Actor, agencyId: string, workspaceId: string) => {
    const accessible = await accessibleMediaWorkspaceIds(actor, agencyId);
    if (!accessible.includes(workspaceId)) return null;
    return db
      .select()
      .from(mediaFolders)
      .where(
        and(
          eq(mediaFolders.agencyId, agencyId),
          eq(mediaFolders.workspaceId, workspaceId),
          isNull(mediaFolders.archivedAt),
        ),
      )
      .orderBy(asc(mediaFolders.sortOrder), asc(mediaFolders.name));
  },
);

export async function listMediaFolders(
  actor: Actor,
  input: { agencyId: string; workspaceId: string },
) {
  return (await fetchAccessibleMediaFolders(actor, input.agencyId, input.workspaceId)) ?? [];
}

export async function listMediaFoldersTree(
  actor: Actor,
  input: { agencyId: string; workspaceId: string },
  preloadedFolders?: Awaited<ReturnType<typeof fetchAccessibleMediaFolders>>,
): Promise<MediaFolderTreeRow[]> {
  const folders =
    preloadedFolders ??
    (await fetchAccessibleMediaFolders(actor, input.agencyId, input.workspaceId));
  if (!folders || folders.length === 0) return [];

  const folderIds = folders.map((folder) => folder.id);
  const counts = await db
    .select({ folderId: mediaAssets.folderId, count: sql<number>`count(*)::int` })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.agencyId, input.agencyId),
        eq(mediaAssets.ownerWorkspaceId, input.workspaceId),
        inArray(mediaAssets.folderId, folderIds),
        inArray(mediaAssets.status, ["processing", "ready", "failed"]),
      ),
    )
    .groupBy(mediaAssets.folderId);
  const assetCountById = new Map<string, number>();
  for (const row of counts) {
    if (row.folderId) assetCountById.set(row.folderId, Number(row.count));
  }

  return buildMediaFolderTree(folders, assetCountById);
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
