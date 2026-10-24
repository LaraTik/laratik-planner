import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { hasWorkspaceRole, isAgencyMember, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  mediaAssets,
  storageObjects,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { MEDIA_READ_ROLES } from "@/lib/media/access";

export async function mediaAssetForActor(actor: Actor, assetId: string) {
  const [row] = await db
    .select({
      asset: mediaAssets,
      object: storageObjects,
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
