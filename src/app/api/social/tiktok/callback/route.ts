import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { consumeOauthState, createPendingConnection } from "@/lib/social/repository";
import { exchangeTikTokCodeForTokens, fetchTikTokProfile } from "@/lib/social/providers/tiktok";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { clientEnv } from "@/lib/validation/env";
import { revalidatePath } from "next/cache";

/**
 * GET /api/social/tiktok/callback
 *
 * Mirrors the Meta callback. Consumes the one-time `social_oauth_state`
 * row, exchanges the code for access + refresh tokens, fetches the
 * profile, and persists a `pending_selection` connection.
 *
 * M4.6 — provider credentials come from the agency's per-agency
 * config row, not from env. The cookie state row's `workspaceId`
 * is the lookup key into the workspace's agency.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHANNELS_PATH = /^\/app\/w\/[a-z0-9-]+\/channels$/;
const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats"];

function buildCallbackUrl(): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/api/social/tiktok/callback`;
}

function safeReturnPath(path: string): string {
  return CHANNELS_PATH.test(path) ? path : "/app";
}

function redirectWithError(returnPath: string, code: string): NextResponse {
  const params = new URLSearchParams();
  params.set("tiktok_error", code);
  return NextResponse.redirect(
    new URL(`${returnPath}?${params.toString()}`, clientEnv.NEXT_PUBLIC_APP_URL),
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!state) {
    return NextResponse.redirect(new URL("/app", clientEnv.NEXT_PUBLIC_APP_URL));
  }
  const stateDigest = createHash("sha256").update(state).digest("hex");

  const stateRow = await consumeOauthState(db, stateDigest);
  if (!stateRow) {
    return NextResponse.redirect(
      new URL("/app?tiktok_error=invalid_state", clientEnv.NEXT_PUBLIC_APP_URL),
    );
  }
  const returnPath = safeReturnPath(stateRow.returnPath);
  if (!code) {
    return redirectWithError(returnPath, "missing_code");
  }

  // M4.6 — per-agency provider config. No env fallback.
  const [ws] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, stateRow.workspaceId))
    .limit(1);
  if (!ws) {
    return redirectWithError(returnPath, "not_configured");
  }
  const config = await getAgencyProviderConfig(db, ws.agencyId, "tiktok");
  if (!("appId" in config)) {
    return redirectWithError(returnPath, "not_configured");
  }

  try {
    const token = await exchangeTikTokCodeForTokens({
      clientKey: config.appId,
      clientSecret: config.appSecret,
      code,
      redirectUri: buildCallbackUrl(),
    });
    const profile = await fetchTikTokProfile(token.credentials.accessToken);
    // Refresh the profile so the adapter sees the up-to-date
    // credentials envelope (which now includes both tokens).
    const sealed = {
      accessToken: token.credentials.accessToken,
      ...(token.credentials.refreshToken ? { refreshToken: token.credentials.refreshToken } : {}),
    };
    await createPendingConnection(db, {
      workspaceId: stateRow.workspaceId,
      provider: "tiktok",
      providerSubjectId: profile.openId,
      scopes: TIKTOK_SCOPES,
      credentials: sealed,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      connectedBy: stateRow.actorId,
    });
    revalidatePath(returnPath);
    return NextResponse.redirect(new URL(returnPath, clientEnv.NEXT_PUBLIC_APP_URL));
  } catch (caught) {
    const code =
      caught instanceof Error && caught.name === "SocialProviderError"
        ? "provider_error"
        : "exchange_failed";
    return redirectWithError(returnPath, code);
  }
}
