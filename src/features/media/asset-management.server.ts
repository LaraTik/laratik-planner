import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets, mediaFolders } from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/policy";
import { MediaPermissionError } from "@/lib/media/errors";
import { requireMediaManager } from "./authorization";

export async function moveMediaAsset(actor: Actor, assetId: string, folderId: string | null) {
  const row = await requireMediaManager(actor, assetId);
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
