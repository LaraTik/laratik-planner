import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import {
  contentItems,
  deliveryVersions,
  mediaAssetLinks,
  mediaAssets,
  storageObjects,
  workspaces,
} from "@/lib/db/schema";
import { createStorageObjectReadUrl } from "@/lib/storage/read-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolve a delivery-linked private media asset only after checking both the
 * delivery link and the viewer's workspace role. The returned URL is short
 * lived; no provider credentials or object keys leave the server.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Delivery asset not found" }, { status: 404 });
  }
  const [row] = await db
    .select({
      workspaceId: mediaAssetLinks.workspaceId,
      agencyId: mediaAssetLinks.agencyId,
      clientVisible: mediaAssetLinks.clientVisible,
      assetStatus: mediaAssets.status,
      objectId: storageObjects.id,
      objectStatus: storageObjects.status,
    })
    .from(mediaAssetLinks)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaAssetLinks.mediaAssetId))
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .innerJoin(deliveryVersions, eq(deliveryVersions.id, mediaAssetLinks.targetId))
    .innerJoin(contentItems, eq(contentItems.id, deliveryVersions.contentItemId))
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(
      and(
        eq(mediaAssetLinks.id, id),
        eq(mediaAssetLinks.targetType, "delivery"),
        eq(mediaAssetLinks.workspaceId, contentItems.workspaceId),
        eq(mediaAssetLinks.agencyId, workspaces.agencyId),
      ),
    )
    .limit(1);

  if (!row || row.assetStatus !== "ready" || row.objectStatus !== "active") {
    return NextResponse.json({ error: "Delivery asset not found" }, { status: 404 });
  }

  const actor = { id: session.user.id };
  const internalAccess = await hasWorkspaceRole(actor, row.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
    "viewer",
  ]);
  const clientAccess =
    row.clientVisible && (await hasWorkspaceRole(actor, row.workspaceId, ["client_reviewer"]));
  if (!internalAccess && !clientAccess) {
    return NextResponse.json({ error: "Delivery asset not found" }, { status: 404 });
  }

  const url = await createStorageObjectReadUrl({
    agencyId: row.agencyId,
    workspaceId: row.workspaceId,
    objectId: row.objectId,
    expiresInSeconds: 300,
  });
  if (!url) return NextResponse.json({ error: "Delivery asset not found" }, { status: 404 });

  return NextResponse.redirect(url, {
    status: 307,
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
