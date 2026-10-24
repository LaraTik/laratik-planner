import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { downloadFilename } from "@/lib/media/contract";
import { fetchStorageObject } from "@/lib/storage/read-service";

type PublicMediaObject = {
  asset: {
    agencyId: string;
    ownerWorkspaceId: string;
    title: string;
  };
  object: {
    id: string;
    mimeType: string;
    originalName: string | null;
  };
};

/**
 * Proxy a publicly shared object through storage using the same range and
 * response security contract for single-asset and collection links.
 */
export async function publicShareAssetResponse(req: NextRequest, row: PublicMediaObject) {
  const range = req.headers.get("range");
  const remote = await fetchStorageObject({
    agencyId: row.asset.agencyId,
    workspaceId: row.asset.ownerWorkspaceId,
    objectId: row.object.id,
    expiresInSeconds: 60,
    ...(range ? { headers: { Range: range } } : {}),
  });
  if (!remote) return null;

  const download = req.nextUrl.searchParams.get("download") === "1";
  const headers = new Headers({
    "Content-Type": row.object.mimeType,
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Content-Security-Policy": "default-src 'none'",
    "Content-Disposition": download
      ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename(row.asset.title, row.object.originalName, row.object.mimeType))}`
      : "inline",
  });
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
