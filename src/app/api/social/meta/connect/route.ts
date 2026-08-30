import { NextResponse, type NextRequest } from "next/server";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { createHash, randomBytes } from "node:crypto";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";
import { buildMetaAuthorizationUrl } from "@/lib/social/providers/meta";
import { createOauthState } from "@/lib/social/repository";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { buildPerAgencyCallbackUrl } from "@/lib/social/callback-url";
import { eq } from "drizzle-orm";

/**
 * POST /api/social/meta/connect
 *
 * Starts a Meta (Facebook Login for Business) OAuth flow. The route
 * authenticates the actor, authorizes them as a `workspace_manager`
 * for the workspace named in the body, and:
 *
 *   1. Resolves the agency's `agency_social_provider_config` row
 *      (M4.6 hard cutover — env reads are gone). The row carries
 *      the app id + sealed app secret + login config id.
 *   2. Generates 32 random bytes for `state`, persists only the
 *      sha256 digest (the raw value is never stored).
 *   3. Stores the state row with a 10-minute expiry, the actor's
 *      user id, the workspace id, and a constrained `return_path`
 *      matching `/app/w/[a-z0-9-]+/channels` (CHECK constraint
 *      enforces the same constraint in the DB).
 *   4. Returns a 302 redirect to the Facebook Login for Business
 *      dialog. The `state` travels in the URL; the dialog returns
 *      it to `/api/social/meta/callback` for consumption.
 *
 * Tokens are NEVER in the URL, the response body, the audit log, or
 * the React tree.
 *
 * Response on auth failure: 401.
 * Response on authorization failure: 403.
 * Response on missing workspace: 404.
 * Response on missing provider config: 409 + `setupUrl` pointer.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_TTL_MS = 10 * 60 * 1000;
const SETUP_URL = "/app/agency-settings/social/providers";

function buildReturnPath(slug: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Invalid workspace slug");
  }
  return `/app/w/${slug}/channels`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  }
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) {
    return NextResponse.json(
      { error: "Agency context required" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  const contentType = req.headers.get("content-type") ?? "";
  // The client (`/app/w/[slug]/channels` page) submits a native HTML
  // form with a hidden `<input name="slug">`, which arrives as
  // `application/x-www-form-urlencoded`. Future fetch-based clients
  // may submit JSON. Accept BOTH shapes so the route works with
  // the current form and any future programmatic caller.
  // Pre-2026-08-28 bug: the route only read `req.json()` which fails
  // silently on form-encoded bodies (the `.catch(() => ({}))` fallback
  // returns `{}`), so `body.slug` was always undefined → 400
  // "Missing workspace slug" every time the workspace manager clicked
  // "Connect Meta". The /api/bootstrap/admin route already uses this
  // same dispatch pattern; mirror it here.
  const slug = contentType.includes("application/json")
    ? ((await req.json().catch(() => ({}))) as { slug?: string }).slug
    : String((await req.formData().catch(() => new FormData())).get("slug") ?? "");
  if (typeof slug !== "string" || slug.length === 0) {
    return NextResponse.json(
      { error: "Missing workspace slug" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]))) {
    return NextResponse.json(
      { error: "Workspace manager role required" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }

  // M4.6 — resolve per-agency provider config. No env fallback by
  // design (hard cutover). When the row is missing, the user is
  // pointed at the agency-settings page rather than seeing a
  // generic 503.
  const config = await getAgencyProviderConfig(db, context.agencyId, "meta");
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
  if (!config.loginConfigId) {
    return NextResponse.json(
      {
        error: "Meta Login for Business config ID is missing for this agency",
        errorCode: "missing_login_config",
        setupUrl: SETUP_URL,
      },
      { status: 409, headers: mutatingApiHeaders() },
    );
  }
  if (!config.enabled) {
    return NextResponse.json(
      {
        error: "Meta is disabled for this agency",
        errorCode: "provider_disabled",
        setupUrl: SETUP_URL,
      },
      { status: 409, headers: mutatingApiHeaders() },
    );
  }

  const state = randomBytes(32).toString("hex");
  const stateDigest = createHash("sha256").update(state).digest("hex");
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  await createOauthState(db, {
    stateDigest,
    provider: "meta",
    workspaceId: workspace.id,
    actorId: actor.id,
    returnPath: buildReturnPath(workspace.slug),
    expiresAt,
  });
  // Per-agency callback URL — the agency admin pastes this exact
  // string into their Meta app's "Valid OAuth Redirect URIs". The
  // route at `/api/social/meta/callback/[agencySlug]` resolves the
  // agency from the URL and asserts the state's workspaceId
  // belongs to that agency (defense in depth on top of the
  // single-use state token).
  const [agency] = await db
    .select({ slug: agencies.slug })
    .from(agencies)
    .where(eq(agencies.id, context.agencyId))
    .limit(1);
  if (!agency) {
    return NextResponse.json(
      { error: "Agency not found" },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
  const callbackUrl = buildPerAgencyCallbackUrl("meta", agency.slug);
  const authUrl = buildMetaAuthorizationUrl({
    appId: config.appId,
    loginConfigId: config.loginConfigId,
    state,
    redirectUri: callbackUrl,
    graphApiVersion: config.graphApiVersion,
  });
  return NextResponse.json({ redirectUrl: authUrl }, { headers: mutatingApiHeaders() });
}
