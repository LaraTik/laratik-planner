import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets, storageObjects, workspaces } from "@/lib/db/schema";
import { hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import { MediaPermissionError } from "@/lib/media/errors";

export async function requireMediaManager(actor: Actor, assetId: string) {
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

  if (!row || !(await hasWorkspaceRole(actor, row.asset.ownerWorkspaceId, ["workspace_manager"]))) {
    throw new MediaPermissionError();
  }

  return row;
}
