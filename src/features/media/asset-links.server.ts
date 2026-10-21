import "server-only";

import { eq } from "drizzle-orm";
import { canWriteToWorkspace, isAgencyMember, type Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  agencies,
  contentItems,
  deliveryVersions,
  mediaAssetLinks,
  mediaAssets,
  type MediaAssetLink,
  workspaces,
} from "@/lib/db/schema";
import { MediaPermissionError } from "@/lib/media/errors";
import { workspaceBasePath } from "@/lib/urls";

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

/** Returns safe destination labels and links without exposing storage paths. */
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
  // Confirm the asset belongs to the actor's agency before reading any links.
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
          // If a joined workspace was removed, the app destination is the
          // only valid fallback; never emit a broken planning URL.
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
