import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { consumeOauthState, createPendingConnection } from "@/lib/social/repository";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { clientEnv } from "@/lib/validation/env";
import { buildLegacyCallbackUrl, buildPerAgencyCallbackUrl } from "@/lib/social/callback-url";
import {
  exchangeMetaCodeForShortLivedToken,
  exchangeShortLivedForLongLivedToken,
  discoverMetaPages,
} from "@/lib/social/providers/meta";
import { exchangeTikTokCodeForTokens, fetchTikTokProfile } from "@/lib/social/providers/tiktok";
import { revalidatePath } from "next/cache";
import { mutatingApiHeaders } from "@/lib/security/headers";

/**
 * Shared callback logic for both per-agency
 * (`/api/social/{provider}/callback/[agencySlug]`) and legacy
 * (`/api/social/{provider}/callback`) routes.
 *
 * Tenant isolation, in order of checks:
 *
 *   1. The `agencySlug` from the URL must resolve to a real agency.
 *      Otherwise the call is rejected before any DB work. (For the
 *      legacy route, this check is skipped — see the comment on
 *      `handleMetaCallbackLegacy`.)
 *   2. The `state` digest must resolve to an unconsumed, unexpired
 *      row in `social_oauth_state`.
 *   3. The state's `workspaceId` must belong to the agency the URL
 *      names. Cross-tenant replay is rejected.
 *   4. The agency's `agency_social_provider_config` row must exist
 *      and be enabled.
 *
 * Steps 1+3 are the new defense-in-depth (the agencySlag is in the
 * URL itself, not only in the state). They are what makes the
 * per-agency URL safer than the legacy global URL: even if a state
 * row were guessed, the URL would have to name the same agency.
 *
 * Token exchange happens with the agency's app secret. Tokens are
 * never written to the redirect URL, the response body, the audit
 * log, or the React tree. Connection credentials are sealed with
 * the per-agency DEK before they are persisted.
 */

export type CallbackAgencyResolver = (slug: string) => Promise<{ id: string } | null>;

const CHANNELS_PATH = /^\/app\/w\/[a-z0-9-]+\/channels$/;
const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats"];

function safeReturnPath(path: string): string {
  return CHANNELS_PATH.test(path) ? path : "/app";
}

function baseUrl(): string {
  return clientEnv.NEXT_PUBLIC_APP_URL;
}

function redirectWithError(
  returnPath: string,
  provider: "meta" | "tiktok",
  code: string,
  description?: string,
): NextResponse {
  const params = new URLSearchParams();
  if (provider === "meta") {
    params.set("meta_error", code);
    if (description) params.set("meta_error_description", description.slice(0, 200));
  } else {
    params.set("tiktok_error", code);
  }
  return NextResponse.redirect(new URL(`${returnPath}?${params.toString()}`, baseUrl()));
}

type StateRow = NonNullable<Awaited<ReturnType<typeof consumeOauthState>>>;

/**
 * Resolve the state row, asserting it belongs to the agency named
 * by the URL. Returns either the row (callers continue) or a
 * NextResponse redirect (callers return it directly).
 */
async function consumeStateForAgency(
  stateDigest: string,
  agencyIdFromUrl: string | null,
): Promise<
  { ok: true; row: StateRow; returnPath: string } | { ok: false; response: NextResponse }
> {
  const stateRow = await consumeOauthState(defaultDb, stateDigest);
  if (!stateRow) {
    return {
      ok: false,
      response: NextResponse.redirect(
        new URL("/app?meta_error=invalid_state&tiktok_error=invalid_state", baseUrl()),
      ),
    };
  }
  const returnPath = safeReturnPath(stateRow.returnPath);
  if (agencyIdFromUrl !== null) {
    // Defense-in-depth: the URL names an agency, so the state's
    // workspace MUST belong to that agency. Any other combination
    // is a cross-tenant replay attempt.
    const [ws] = await defaultDb
      .select({ agencyId: workspaces.agencyId })
      .from(workspaces)
      .where(eq(workspaces.id, stateRow.workspaceId))
      .limit(1);
    if (!ws || ws.agencyId !== agencyIdFromUrl) {
      // The state's provider column is `text` in the schema and
      // CHECK-constrained to ('meta', 'tiktok'). Narrow to the
      // union so `redirectWithError` accepts it.
      const provider = stateRow.provider === "meta" ? "meta" : "tiktok";
      return {
        ok: false,
        response: redirectWithError(returnPath, provider, "invalid_state"),
      };
    }
  }
  return { ok: true, row: stateRow, returnPath };
}

/**
 * Per-agency Meta callback. The caller passes the agencyId resolved
 * from the URL slug. If the URL names a real agency, the state's
 * workspace MUST belong to that agency.
 */
export async function handleMetaCallbackForAgency(
  req: NextRequest,
  agencyId: string,
): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (!state) {
    return NextResponse.redirect(new URL("/app", baseUrl()));
  }
  const stateDigest = createHash("sha256").update(state).digest("hex");
  const consumed = await consumeStateForAgency(stateDigest, agencyId);
  if (!consumed.ok) return consumed.response;
  const { row: stateRow, returnPath } = consumed;
  if (error) return redirectWithError(returnPath, "meta", error, errorDescription ?? undefined);
  if (!code) return redirectWithError(returnPath, "meta", "missing_code");

  const config = await getAgencyProviderConfig(defaultDb, agencyId, "meta");
  if (!("appId" in config)) return redirectWithError(returnPath, "meta", "not_configured");

  try {
    // The token exchange requires the SAME `redirect_uri` the
    // original authorize call used. The connect route ALWAYS uses
    // the per-agency URL, so we send the per-agency URL here too.
    const perAgencyUrl = (() => {
      const m = url.pathname.match(/^\/api\/social\/meta\/callback\/([a-z0-9-]+)$/);
      if (!m) throw new Error("Per-agency URL parse failed");
      return buildPerAgencyCallbackUrl("meta", m[1]!);
    })();
    const short = await exchangeMetaCodeForShortLivedToken({
      appId: config.appId,
      appSecret: config.appSecret,
      code,
      redirectUri: perAgencyUrl,
      graphApiVersion: config.graphApiVersion,
    });
    const long = await exchangeShortLivedForLongLivedToken({
      appId: config.appId,
      appSecret: config.appSecret,
      shortLivedToken: short.access_token,
      graphApiVersion: config.graphApiVersion,
    });
    const discovered = await discoverMetaPages({
      appId: config.appId,
      appSecret: config.appSecret,
      accessToken: long.accessToken,
      graphApiVersion: config.graphApiVersion,
    });
    const subjectHash = createHash("sha256").update(long.accessToken).digest("hex").slice(0, 32);
    await createPendingConnection(defaultDb, {
      workspaceId: stateRow.workspaceId,
      provider: "meta",
      providerSubjectId: subjectHash,
      scopes: [
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
        "instagram_manage_insights",
      ],
      credentials: discovered.credentials,
      accessTokenExpiresAt: long.accessTokenExpiresAt,
      refreshTokenExpiresAt: null,
      connectedBy: stateRow.actorId,
      discoveredProfiles: discovered.profiles,
    });
    revalidatePath(returnPath);
    return NextResponse.redirect(new URL(returnPath, baseUrl()));
  } catch (caught) {
    const code =
      caught instanceof Error && caught.name === "SocialProviderError"
        ? "provider_error"
        : "exchange_failed";
    return redirectWithError(returnPath, "meta", code);
  }
}

/**
 * Per-agency TikTok callback.
 */
export async function handleTikTokCallbackForAgency(
  req: NextRequest,
  agencyId: string,
): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!state) {
    return NextResponse.redirect(new URL("/app", baseUrl()));
  }
  const stateDigest = createHash("sha256").update(state).digest("hex");
  const consumed = await consumeStateForAgency(stateDigest, agencyId);
  if (!consumed.ok) return consumed.response;
  const { row: stateRow, returnPath } = consumed;
  if (!code) return redirectWithError(returnPath, "tiktok", "missing_code");

  const config = await getAgencyProviderConfig(defaultDb, agencyId, "tiktok");
  if (!("appId" in config)) return redirectWithError(returnPath, "tiktok", "not_configured");

  try {
    const perAgencyUrl = (() => {
      const m = url.pathname.match(/^\/api\/social\/tiktok\/callback\/([a-z0-9-]+)$/);
      if (!m) throw new Error("Per-agency URL parse failed");
      return buildPerAgencyCallbackUrl("tiktok", m[1]!);
    })();
    const token = await exchangeTikTokCodeForTokens({
      clientKey: config.appId,
      clientSecret: config.appSecret,
      code,
      redirectUri: perAgencyUrl,
    });
    const profile = await fetchTikTokProfile(token.credentials.accessToken);
    const sealed = {
      accessToken: token.credentials.accessToken,
      ...(token.credentials.refreshToken ? { refreshToken: token.credentials.refreshToken } : {}),
    };
    await createPendingConnection(defaultDb, {
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
    return NextResponse.redirect(new URL(returnPath, baseUrl()));
  } catch (caught) {
    const code =
      caught instanceof Error && caught.name === "SocialProviderError"
        ? "provider_error"
        : "exchange_failed";
    return redirectWithError(returnPath, "tiktok", code);
  }
}

/**
 * Legacy global Meta callback. The token exchange must use the
 * legacy URL because the connect route may have started a flow
 * before the per-agency cutover with the legacy URL as the
 * `redirect_uri`.
 */
export async function handleMetaCallbackLegacy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (!state) {
    return NextResponse.redirect(new URL("/app", baseUrl()));
  }
  const stateDigest = createHash("sha256").update(state).digest("hex");
  // Legacy mode: agencyIdFromUrl is null. The state row's workspaceId
  // resolves the agency, just as before the per-agency cutover.
  const consumed = await consumeStateForAgency(stateDigest, null);
  if (!consumed.ok) return consumed.response;
  const { row: stateRow, returnPath } = consumed;
  if (error) return redirectWithError(returnPath, "meta", error, errorDescription ?? undefined);
  if (!code) return redirectWithError(returnPath, "meta", "missing_code");

  const [ws] = await defaultDb
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, stateRow.workspaceId))
    .limit(1);
  if (!ws) return redirectWithError(returnPath, "meta", "not_configured");
  const config = await getAgencyProviderConfig(defaultDb, ws.agencyId, "meta");
  if (!("appId" in config)) return redirectWithError(returnPath, "meta", "not_configured");

  try {
    const short = await exchangeMetaCodeForShortLivedToken({
      appId: config.appId,
      appSecret: config.appSecret,
      code,
      redirectUri: buildLegacyCallbackUrl("meta"),
      graphApiVersion: config.graphApiVersion,
    });
    const long = await exchangeShortLivedForLongLivedToken({
      appId: config.appId,
      appSecret: config.appSecret,
      shortLivedToken: short.access_token,
      graphApiVersion: config.graphApiVersion,
    });
    const discovered = await discoverMetaPages({
      appId: config.appId,
      appSecret: config.appSecret,
      accessToken: long.accessToken,
      graphApiVersion: config.graphApiVersion,
    });
    const subjectHash = createHash("sha256").update(long.accessToken).digest("hex").slice(0, 32);
    await createPendingConnection(defaultDb, {
      workspaceId: stateRow.workspaceId,
      provider: "meta",
      providerSubjectId: subjectHash,
      scopes: [
        "pages_show_list",
        "pages_read_engagement",
        "instagram_basic",
        "instagram_manage_insights",
      ],
      credentials: discovered.credentials,
      accessTokenExpiresAt: long.accessTokenExpiresAt,
      refreshTokenExpiresAt: null,
      connectedBy: stateRow.actorId,
      discoveredProfiles: discovered.profiles,
    });
    revalidatePath(returnPath);
    return NextResponse.redirect(new URL(returnPath, baseUrl()));
  } catch (caught) {
    const code =
      caught instanceof Error && caught.name === "SocialProviderError"
        ? "provider_error"
        : "exchange_failed";
    return redirectWithError(returnPath, "meta", code);
  }
}

/**
 * Legacy global TikTok callback. Same shape as Meta.
 */
export async function handleTikTokCallbackLegacy(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!state) {
    return NextResponse.redirect(new URL("/app", baseUrl()));
  }
  const stateDigest = createHash("sha256").update(state).digest("hex");
  const consumed = await consumeStateForAgency(stateDigest, null);
  if (!consumed.ok) return consumed.response;
  const { row: stateRow, returnPath } = consumed;
  if (!code) return redirectWithError(returnPath, "tiktok", "missing_code");

  const [ws] = await defaultDb
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, stateRow.workspaceId))
    .limit(1);
  if (!ws) return redirectWithError(returnPath, "tiktok", "not_configured");
  const config = await getAgencyProviderConfig(defaultDb, ws.agencyId, "tiktok");
  if (!("appId" in config)) return redirectWithError(returnPath, "tiktok", "not_configured");

  try {
    const token = await exchangeTikTokCodeForTokens({
      clientKey: config.appId,
      clientSecret: config.appSecret,
      code,
      redirectUri: buildLegacyCallbackUrl("tiktok"),
    });
    const profile = await fetchTikTokProfile(token.credentials.accessToken);
    const sealed = {
      accessToken: token.credentials.accessToken,
      ...(token.credentials.refreshToken ? { refreshToken: token.credentials.refreshToken } : {}),
    };
    await createPendingConnection(defaultDb, {
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
    return NextResponse.redirect(new URL(returnPath, baseUrl()));
  } catch (caught) {
    const code =
      caught instanceof Error && caught.name === "SocialProviderError"
        ? "provider_error"
        : "exchange_failed";
    return redirectWithError(returnPath, "tiktok", code);
  }
}

void mutatingApiHeaders;
