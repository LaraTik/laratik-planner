import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialOauthStates, workspaces } from "@/lib/db/schema";
import { consumeOauthState, createPendingConnection } from "@/lib/social/repository";
import {
  discoverMetaPages,
  exchangeMetaCodeForShortLivedToken,
  exchangeShortLivedForLongLivedToken,
} from "@/lib/social/providers/meta";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { clientEnv } from "@/lib/validation/env";
import { revalidatePath } from "next/cache";

/**
 * GET /api/social/meta/callback
 *
 * The Facebook Login for Business dialog redirects the browser here
 * with `?code=…&state=…` (or `?error=…` on a denied request). The
 * route:
 *
 *   1. Validates the `state` against the persisted `sha256` digest,
 *      consumes the row inside a single transaction, and rejects if
 *      the state is unknown, expired, or already used.
 *   2. Exchanges the `code` for a short-lived token, then for a
 *      long-lived user token.
 *   3. Discovers the Pages and linked Instagram accounts the token
 *      grants access to. Discovery reseals the credentials envelope
 *      (now including per-Page access tokens in
 *      `profileAccessTokens`) and `createPendingConnection` stores
 *      the connection as `status='pending_selection'`.
 *   4. Redirects back to the workspace's channels page where the
 *      account picker awaits. The picker reads the connection
 *      through the repository; the redirect target is the state
 *      row's `return_path` (constrained to the channels route by a
 *      CHECK constraint in the DB).
 *
 * Failure modes:
 *   - state mismatch / missing / expired → 400, redirect to /app
 *   - Meta exchange error → 302 to channels with an error query
 *     param (the picker renders the message)
 *   - connection insert failure → 302 to channels with an error
 *     query param (no tokens are ever in the redirect)
 *
 * Tokens are NEVER returned in the redirect URL or query string.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHANNELS_PATH = /^\/app\/w\/[a-z0-9-]+\/channels$/;

function safeReturnPath(path: string): string {
  if (!CHANNELS_PATH.test(path)) return "/app";
  return path;
}

function buildCallbackUrl(): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/api/social/meta/callback`;
}

function redirectWithError(returnPath: string, code: string, description?: string): NextResponse {
  const params = new URLSearchParams();
  params.set("meta_error", code);
  if (description) params.set("meta_error_description", description.slice(0, 200));
  return NextResponse.redirect(
    new URL(`${returnPath}?${params.toString()}`, clientEnv.NEXT_PUBLIC_APP_URL),
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (!state) {
    return NextResponse.redirect(new URL("/app", clientEnv.NEXT_PUBLIC_APP_URL));
  }
  const stateDigest = createHash("sha256").update(state).digest("hex");

  // 1) Consume the state row inside a single transaction so the
  // consumed_at stamp and the digest match are checked atomically.
  // `consumeOauthState` from the repository encapsulates this.
  const stateRow = await consumeOauthState(db, stateDigest);
  if (!stateRow) {
    return NextResponse.redirect(
      new URL(
        `/app?meta_error=${encodeURIComponent("invalid_state")}`,
        clientEnv.NEXT_PUBLIC_APP_URL,
      ),
    );
  }
  const returnPath = safeReturnPath(stateRow.returnPath);

  // 2) Reject a denied request.
  if (error) {
    return redirectWithError(returnPath, error, errorDescription ?? undefined);
  }
  if (!code) {
    return redirectWithError(returnPath, "missing_code");
  }

  // M4.6 — resolve per-agency provider config. The cookie state
  // row carries the workspaceId; we follow the FK to the
  // workspace's agencyId, then load the per-agency config row.
  const [ws] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, stateRow.workspaceId))
    .limit(1);
  if (!ws) {
    return redirectWithError(returnPath, "not_configured");
  }
  const config = await getAgencyProviderConfig(db, ws.agencyId, "meta");
  if (!("appId" in config)) {
    return redirectWithError(returnPath, "not_configured");
  }

  try {
    const short = await exchangeMetaCodeForShortLivedToken({
      appId: config.appId,
      appSecret: config.appSecret,
      code,
      redirectUri: buildCallbackUrl(),
      graphApiVersion: config.graphApiVersion,
    });
    const long = await exchangeShortLivedForLongLivedToken({
      appId: config.appId,
      appSecret: config.appSecret,
      shortLivedToken: short.access_token,
      graphApiVersion: config.graphApiVersion,
    });

    // 3) Discover Pages and (optionally) linked Instagram accounts.
    // The discovery call writes a per-Page access token map into
    // `profileAccessTokens`; the caller's `ConnectedProfile[]` is
    // token-free.
    const discovered = await discoverMetaPages({
      appId: config.appId,
      appSecret: config.appSecret,
      accessToken: long.accessToken,
      graphApiVersion: config.graphApiVersion,
    });

    // 4) Persist a pending connection. The provider_subject_id is a
    // stable hash of the user access token — there is no separate
    // "subject" in the OAuth response, and the long-lived token is
    // the canonical identity the Pages are anchored to. The
    // repository helper handles encryption under the hood.
    const subjectHash = createHash("sha256").update(long.accessToken).digest("hex").slice(0, 32);
    await createPendingConnection(db, {
      workspaceId: stateRow.workspaceId,
      provider: "meta",
      providerSubjectId: subjectHash,
      scopes: [
        "pages_show_list",
        "pages_read_engagement",
        "read_insights",
        "instagram_basic",
        "instagram_manage_insights",
      ],
      credentials: discovered.credentials,
      accessTokenExpiresAt: long.accessTokenExpiresAt,
      refreshTokenExpiresAt: null,
      connectedBy: stateRow.actorId,
    });
    revalidatePath(returnPath);
    return NextResponse.redirect(new URL(returnPath, clientEnv.NEXT_PUBLIC_APP_URL));
  } catch (caught) {
    // The M4 plan: errors surface as codes (`auth_expired`,
    // `rate_limited`, etc.), not the underlying message. We only
    // include the safe category in the redirect query.
    const code =
      caught instanceof Error && caught.name === "SocialProviderError"
        ? "provider_error"
        : "exchange_failed";
    return redirectWithError(returnPath, code);
  }
}

// `eq` is re-exported here for tree-shaking sanity; consumed in the
// repository helper. The import keeps the file shape consistent with
// other route handlers in the project.
void eq;
void socialOauthStates;
