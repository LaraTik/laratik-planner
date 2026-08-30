import { type NextRequest } from "next/server";
import { handleMetaCallbackLegacy } from "@/lib/social/callback-handler";

/**
 * GET /api/social/meta/callback
 *
 * Legacy global Meta callback. New flows use
 * `/api/social/meta/callback/[agencySlug]` (see the per-agency
 * route file). This shim accepts the same `?code=&state=` payload
 * and runs the same code-exchange path so any in-flight flow that
 * started before the per-agency cutover continues to work.
 *
 * Existing connections (already in the DB) keep working without
 * a re-paste. New flows should use the per-agency URL — the
 * agency config page surfaces it as a copy-to-clipboard value.
 *
 * Tokens are NEVER returned in the redirect URL or query string.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleMetaCallbackLegacy(req);
}
