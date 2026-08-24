import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { buildMetaAuthorizationUrl } from "@/lib/social/providers/meta";
import { createOauthState } from "@/lib/social/repository";
import { clientEnv, serverEnv } from "@/lib/validation/env";

/**
 * POST /api/social/meta/connect
 *
 * Starts a Meta (Facebook Login for Business) OAuth flow. The route
 * authenticates the actor, authorizes them as a `workspace_manager`
 * for the workspace named in the body, and:
 *
 *   1. Generates 32 random bytes for `state`, persists only the
 *      sha256 digest (the raw value is never stored).
 *   2. Stores the state row with a 10-minute expiry, the actor's
 *      user id, the workspace id, and a constrained `return_path`
 *      matching `/app/w/[a-z0-9-]+/channels` (CHECK constraint
 *      enforces the same constraint in the DB).
 *   3. Returns a 302 redirect to the Facebook Login for Business
 *      dialog. The `state` travels in the URL; the dialog returns
 *      it to `/api/social/meta/callback` for consumption.
 *
 * Tokens are NEVER in the URL, the response body, the audit log, or
 * the React tree.
 *
 * Response on auth failure: 401.
 * Response on authorization failure: 403.
 * Response on missing workspace: 404.
 * Response on missing Meta configuration: 503.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_TTL_MS = 10 * 60 * 1000;

function buildCallbackUrl(): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/api/social/meta/callback`;
}

function buildReturnPath(slug: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error("Invalid workspace slug");
  }
  return `/app/w/${slug}/channels`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) {
    return NextResponse.json({ error: "Agency context required" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { slug?: string };
  if (typeof body.slug !== "string" || body.slug.length === 0) {
    return NextResponse.json({ error: "Missing workspace slug" }, { status: 400 });
  }
  const workspace = await getAccessibleWorkspace(actor, body.slug, context.agencyId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]))) {
    return NextResponse.json({ error: "Workspace manager role required" }, { status: 403 });
  }
  if (!serverEnv.META_APP_ID || !serverEnv.META_LOGIN_CONFIG_ID) {
    return NextResponse.json({ error: "Meta provider is not configured" }, { status: 503 });
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
  const authUrl = buildMetaAuthorizationUrl({
    appId: serverEnv.META_APP_ID,
    loginConfigId: serverEnv.META_LOGIN_CONFIG_ID,
    state,
    redirectUri: buildCallbackUrl(),
  });
  return NextResponse.json({ redirectUrl: authUrl });
}
