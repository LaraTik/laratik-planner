import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { fetchStorageObject } from "@/lib/storage/read-service";
import { downloadFilename } from "@/lib/media/contract";
import { publicMediaCollectionAssetForToken } from "@/lib/media/collection-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unavailable() {
  return NextResponse.json(
    { error: "This media link is unavailable." },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; assetId: string }> },
) {
  const { token, assetId } = await params;
  if (!token || token.length < 40 || token.length > 100) return unavailable();
  const ip = req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
  const rate = await enforceRateLimit({ scope: "media_public_view", subject: `${ip}:${token}` });
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Too many requests; try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  const row = await publicMediaCollectionAssetForToken(token, assetId);
  if (!row) return unavailable();
  const remote = await fetchStorageObject({
    agencyId: row.asset.agencyId,
    workspaceId: row.asset.ownerWorkspaceId,
    objectId: row.object.id,
    expiresInSeconds: 60,
    ...(req.headers.get("range") ? { headers: { Range: req.headers.get("range")! } } : {}),
  });
  if (!remote) return unavailable();
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
