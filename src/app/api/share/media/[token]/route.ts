import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { publicMediaAssetForToken, publicShareAssetResponse } from "@/features/media/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const unavailable = () =>
  NextResponse.json(
    { error: "This media link is unavailable." },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    },
  );

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 40 || token.length > 100) return unavailable();

  const ip = req.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
  const rate = await enforceRateLimit({
    scope: "media_public_view",
    subject: `${ip}:${token}`,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests; try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rate.retryAfterSeconds),
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }

  const row = await publicMediaAssetForToken(token);
  if (!row) return unavailable();
  const response = await publicShareAssetResponse(req, row);
  return response ?? unavailable();
}
