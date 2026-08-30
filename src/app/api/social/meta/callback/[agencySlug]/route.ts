import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";
import { handleMetaCallbackForAgency } from "@/lib/social/callback-handler";

/**
 * GET /api/social/meta/callback/[agencySlug]
 *
 * Per-agency Facebook Login for Business callback. The agency
 * admin pastes this URL into their Meta app's "Valid OAuth Redirect
 * URIs" — each agency has their own URL.
 *
 * Defense-in-depth vs. the legacy `/api/social/meta/callback`:
 *   1. The URL names the agency. The state row's workspaceId must
 *      belong to that agency; cross-tenant replay is rejected.
 *   2. State is still single-use, sha256-hashed, 10-minute TTL.
 *   3. The token exchange uses the SAME per-agency URL the connect
 *      route used, so Meta's redirect_uri check passes.
 *
 * Failure modes (mirrors the legacy route):
 *   - Unknown agencySlug → 404 (404, not 400, so the failure does
 *     not echo any sensitive detail).
 *   - state mismatch / missing / expired → 400, redirect to /app
 *   - Cross-tenant state → redirect to channels with `invalid_state`
 *   - Meta exchange error → 302 to channels with `meta_error`
 *
 * Tokens are NEVER returned in the redirect URL or query string.
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
  return handleMetaCallbackForAgency(req, agency.id);
}
