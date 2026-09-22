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
import { fetchStorageObject } from "@/lib/storage/read-service";
import { downloadFilename } from "@/lib/media/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolve a delivery-linked private media asset only after checking both the
 * delivery link and the viewer's workspace role. The returned URL is short
 * lived; no provider credentials or object keys leave the server.
 */
export async function GET(
  request: NextRequest,
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
      title: mediaAssets.title,
      originalName: storageObjects.originalName,
      mimeType: storageObjects.mimeType,
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

  const remote = await fetchStorageObject({
    agencyId: row.agencyId,
    workspaceId: row.workspaceId,
    objectId: row.objectId,
    expiresInSeconds: 300,
    ...(request.headers.get("range") ? { headers: { Range: request.headers.get("range")! } } : {}),
  });
  if (!remote) return NextResponse.json({ error: "Delivery asset not found" }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const headers = new Headers({
    "Content-Type": row.mimeType,
    // Same cache policy as `/api/media/assets/[id]` (PR 1 + 2): a
    // planner scrolling back through their delivery history shouldn't
    // re-hit R2 on every nav. ETag is pass-through (below) so the
    // browser can revalidate cheaply when the object changes.
    // `Vary: Cookie` makes the browser revalidate on auth state
    // changes within the 24h window — `private` already implies
    // user-scoped, but explicit Vary prevents stale bytes across
    // role/visibility changes. The delivery download path stays
    // `no-store` so a download click never serves a stale body.
    "Cache-Control": download ? "private, no-store" : "private, max-age=86400",
    ...(download ? {} : { Vary: "Cookie" }),
    "X-Content-Type-Options": "nosniff",
  });
  if (download) {
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename(row.title, row.originalName, row.mimeType))}`,
    );
  }
  // Pass-through order: the explicit Content-Type is set first so it
  // wins — R2 returns its own `Content-Type` header but our row's
  // value is the authoritative one (validated by the upload
  // pipeline). Skipping `content-type` here is deliberate.
  for (const name of [
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const value = remote.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(remote.body, { status: remote.status, headers });
}
