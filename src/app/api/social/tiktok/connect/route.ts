import { NextResponse, type NextRequest } from "next/server";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { createHash, randomBytes } from "node:crypto";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";
import { buildTikTokAuthorizationUrl, TIKTOK_SCOPES } from "@/lib/social/providers/tiktok";
import { createOauthState } from "@/lib/social/repository";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { buildPerAgencyCallbackUrl } from "@/lib/social/callback-url";
import { eq } from "drizzle-orm";

/**
 * POST /api/social/tiktok/connect
 *
 * Mirrors the Meta connect route. M4.6 — gated on the agency's
 * per-agency provider config (no env fallback by design). The route:
 *
 *   1. Verifies the actor is a workspace_manager.
 *   2. Resolves the agency's `agency_social_provider_config` row
 *      for `tiktok`. Returns 409 + `setupUrl` when missing.
 *   3. Generates 32 random bytes for `state`, persists the
 *      sha256 digest with a 10-minute expiry, and redirects to
 *      `https://www.tiktok.com/v2/auth/authorize/`.
 *
 * Tokens are NEVER in the URL, the response body, the audit log,
 * or the React tree.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHANNELS_PATH = /^\/app\/w\/[a-z0-9-]+\/channels$/;
const STATE_TTL_MS = 10 * 60_000;
const SETUP_URL = "/app/agency-settings/social/providers";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Sign in is required." },
      { status: 401, headers: mutatingApiHeaders() },
    );
  }
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) {
    return NextResponse.json(
      { error: "Agency not configured." },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  const form = await req.formData();
  const slug = String(form.get("slug") ?? "");
  if (!slug) {
    return NextResponse.json(
      { error: "Missing workspace slug." },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace not found." },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return NextResponse.json(
      { error: "Workspace manager access is required." },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }

  // M4.6 — per-agency config. No env fallback.
  const config = await getAgencyProviderConfig(db, context.agencyId, "tiktok");
  if (!("appId" in config)) {
    return NextResponse.json(
      {
        error: "Provider not configured for this agency",
        errorCode: "not_configured",
        setupUrl: SETUP_URL,
      },
      { status: 409, headers: mutatingApiHeaders() },
    );
  }
  if (!config.enabled) {
    return NextResponse.json(
      {
        error: "TikTok is disabled for this agency",
        errorCode: "provider_disabled",
        setupUrl: SETUP_URL,
      },
      { status: 409, headers: mutatingApiHeaders() },
    );
  }

  const state = randomBytes(32).toString("hex");
  const stateDigest = createHash("sha256").update(state).digest("hex");
  const returnPath = `/app/w/${workspace.slug}/channels`;
  if (!CHANNELS_PATH.test(returnPath)) {
    return NextResponse.json(
      { error: "Invalid return path." },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  await createOauthState(db, {
    stateDigest,
    provider: "tiktok",
    workspaceId: workspace.id,
    actorId: session.user.id,
    returnPath,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  // Per-agency callback URL — the agency admin pastes this exact
  // string into their TikTok app's "Redirect URL" field. The route
  // at `/api/social/tiktok/callback/[agencySlug]` resolves the
  // agency from the URL and asserts the state's workspaceId
  // belongs to that agency.
  const [agency] = await db
    .select({ slug: agencies.slug })
    .from(agencies)
    .where(eq(agencies.id, context.agencyId))
    .limit(1);
  if (!agency) {
    return NextResponse.json(
      { error: "Agency not found." },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
  const callbackUrl = buildPerAgencyCallbackUrl("tiktok", agency.slug);

  const url = buildTikTokAuthorizationUrl({
    clientKey: config.appId,
    state,
    redirectUri: callbackUrl,
    scopes: TIKTOK_SCOPES,
  });
  return NextResponse.json({ redirectTo: url }, { headers: mutatingApiHeaders() });
}
