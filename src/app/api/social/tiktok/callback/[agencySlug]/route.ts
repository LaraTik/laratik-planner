import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";
import { handleTikTokCallbackForAgency } from "@/lib/social/callback-handler";

/**
 * GET /api/social/tiktok/callback/[agencySlug]
 *
 * Per-agency TikTok Display API callback. Each agency admin pastes
 * this URL into their TikTok app's "Redirect URL" field.
 *
 * Defense-in-depth is identical to the Meta per-agency callback.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agencySlug: string }> },
) {
  const { agencySlug } = await params;
  if (!SLUG_PATTERN.test(agencySlug)) {
    return NextResponse.json(
      { error: "Invalid agency slug" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const [agency] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(eq(agencies.slug, agencySlug))
    .limit(1);
  if (!agency) {
    return NextResponse.json(
      { error: "Unknown agency" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  return handleTikTokCallbackForAgency(req, agency.id);
}
