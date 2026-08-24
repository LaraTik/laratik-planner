import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { consumeOauthState, createPendingConnection } from "@/lib/social/repository";
import { exchangeTikTokCodeForTokens, fetchTikTokProfile } from "@/lib/social/providers/tiktok";
import { clientEnv, serverEnv } from "@/lib/validation/env";
import { revalidatePath } from "next/cache";

/**
 * GET /api/social/tiktok/callback
 *
 * Mirrors the Meta callback. Consumes the one-time `social_oauth_state`
 * row, exchanges the code for access + refresh tokens, fetches the
 * profile, and persists a `pending_selection` connection.
 *
 * The TikTok adapter is gated by `SOCIAL_TIKTOK_ENABLED`. Until the
 * seven-day Meta observation window passes, this route returns 503
 * with a sanitized error — even if the env flag is off.
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
  if (!serverEnv.SOCIAL_TIKTOK_ENABLED) {
    return NextResponse.json(
      { error: "TikTok integration is not yet enabled for this deployment." },
      { status: 503 },
    );
  }
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
  if (!serverEnv.TIKTOK_CLIENT_KEY || !serverEnv.TIKTOK_CLIENT_SECRET) {
    return redirectWithError(returnPath, "not_configured");
  }

  try {
    const token = await exchangeTikTokCodeForTokens({
      clientKey: serverEnv.TIKTOK_CLIENT_KEY,
      clientSecret: serverEnv.TIKTOK_CLIENT_SECRET,
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
