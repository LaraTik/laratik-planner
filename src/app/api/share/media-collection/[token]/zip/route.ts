import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { exportPublicMediaCollectionZip } from "@/lib/media/collection-service";
import { MediaZipTooLargeError } from "@/lib/exports/media-assets-zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const ip = req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
  const rate = await enforceRateLimit({
    scope: "media_public_view",
    subject: `${ip}:${token}:zip`,
  });
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Too many requests; try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "Cache-Control": "no-store, max-age=0",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      },
    );
  try {
    const result = await exportPublicMediaCollectionZip(token);
    if (!result)
      return NextResponse.json({ error: "This media link is unavailable." }, { status: 404 });
    const body = new Uint8Array(result.buffer);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (error) {
    if (error instanceof MediaZipTooLargeError)
      return NextResponse.json(
        { error: "This collection is larger than the 500 MiB ZIP limit." },
        { status: 413 },
      );
    throw error;
  }
}
