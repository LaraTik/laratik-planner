import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { buildTikTokAuthorizationUrl, TIKTOK_SCOPES } from "@/lib/social/providers/tiktok";
import { createOauthState } from "@/lib/social/repository";
import { clientEnv, serverEnv } from "@/lib/validation/env";

/**
 * POST /api/social/tiktok/connect
 *
 * Mirrors the Meta connect route. Gated on `SOCIAL_TIKTOK_ENABLED`
 * (the M4 seven-day gate). The route:
 *
 *   1. Verifies the actor is a workspace_manager.
 *   2. Refuses to start when `SOCIAL_TIKTOK_ENABLED=false`.
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

function buildCallbackUrl(): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/api/social/tiktok/callback`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }
  const actor = { id: session.user.id };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) {
    return NextResponse.json({ error: "Agency not configured." }, { status: 403 });
  }
  const form = await req.formData();
  const slug = String(form.get("slug") ?? "");
  if (!slug) {
    return NextResponse.json({ error: "Missing workspace slug." }, { status: 400 });
  }
  const workspace = await getAccessibleWorkspace(actor, slug, context.agencyId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, ["workspace_manager"]))) {
    return NextResponse.json({ error: "Workspace manager access is required." }, { status: 403 });
  }

  if (!serverEnv.SOCIAL_TIKTOK_ENABLED) {
    return NextResponse.json(
      { error: "TikTok integration is not yet enabled for this deployment." },
      { status: 503 },
    );
  }
  if (!serverEnv.TIKTOK_CLIENT_KEY) {
    return NextResponse.json({ error: "TikTok is not configured." }, { status: 503 });
  }

  const state = randomBytes(32).toString("hex");
  const stateDigest = createHash("sha256").update(state).digest("hex");
  const returnPath = `/app/w/${workspace.slug}/channels`;
  if (!CHANNELS_PATH.test(returnPath)) {
    return NextResponse.json({ error: "Invalid return path." }, { status: 400 });
  }
  await createOauthState(db, {
    stateDigest,
    provider: "tiktok",
    workspaceId: workspace.id,
    actorId: session.user.id,
    returnPath,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const url = buildTikTokAuthorizationUrl({
    clientKey: serverEnv.TIKTOK_CLIENT_KEY,
    state,
    redirectUri: buildCallbackUrl(),
    scopes: TIKTOK_SCOPES,
  });
  return NextResponse.json({ redirectTo: url });
}
