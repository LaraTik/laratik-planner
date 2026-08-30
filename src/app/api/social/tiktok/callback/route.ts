import { type NextRequest } from "next/server";
import { handleTikTokCallbackLegacy } from "@/lib/social/callback-handler";

/**
 * GET /api/social/tiktok/callback
 *
 * Legacy global TikTok callback. New flows use
 * `/api/social/tiktok/callback/[agencySlug]`. This shim keeps
 * any in-flight flow started before the per-agency cutover
 * working without a re-paste.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleTikTokCallbackLegacy(req);
}
