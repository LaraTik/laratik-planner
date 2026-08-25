import { createHash } from "node:crypto";
import { addDays, addHours } from "date-fns";
import {
  providerRequest,
  SocialProviderError,
  isSocialProviderError,
  type ProviderRequestInit,
} from "../http";
import type {
  ConnectedProfile,
  ConnectedProfileRef,
  ProfileSnapshot,
  RefreshedCredentials,
  SocialProviderAdapter,
} from "../types";
import type { SocialCredentials } from "../crypto";
import { newRequestId } from "../http";

/**
 * M4 — TikTok provider.
 *
 * TikTok Login Kit for Web uses OAuth 2.0 with:
 *
 *   - `https://www.tiktok.com/v2/auth/authorize/` as the authorize URL
 *   - `https://open.tiktokapis.com/v2/oauth/token/` for code + refresh
 *   - 24-hour access tokens
 *   - 365-day refresh tokens that may rotate on every refresh
 *
 * The Display API v2 exposes `user.info.stats` for follower /
 * following / likes / video counts via the `user.info` endpoint.
 *
 * The provider code ships from day one but is gated by the
 * `SOCIAL_TIKTOK_ENABLED` server-side flag. Until Meta's seven-day
 * production observation window passes, every call to `discoverProfiles`
 * or `fetchSnapshot` short-circuits with an `auth_expired` error.
 */

export const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats"] as const;
export type TikTokScope = (typeof TIKTOK_SCOPES)[number];

const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const TIKTOK_USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";

void ((): void => {
  // M4.6 (hard cutover): the per-provider `STUB_DISABLED` adapter
  // is gone. The TikTok provider is gated per agency by the
  // `agency_social_provider_config` row's `enabled` column. The
  // cron worker now checks the agency config before calling into
  // the adapter (see `src/lib/social/sync.ts` -> `runOne`).
})();

export function buildTikTokAuthorizationUrl(input: {
  clientKey: string;
  state: string;
  redirectUri: string;
  scopes?: readonly TikTokScope[];
}): string {
  const url = new URL(TIKTOK_AUTHORIZE_URL);
  url.searchParams.set("client_key", input.clientKey);
  url.searchParams.set("scope", (input.scopes ?? TIKTOK_SCOPES).join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  refresh_expires_in?: number; // seconds
  open_id: string;
  scope?: string;
  token_type?: string;
};

async function postForm(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const form = new URLSearchParams(body).toString();
  const init: ProviderRequestInit = {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  };
  const res = await providerRequest(url, init);
  try {
    return JSON.parse(res.body) as TokenResponse;
  } catch {
    throw new SocialProviderError("invalid_response", false, res.requestId);
  }
}

export async function exchangeTikTokCodeForTokens(input: {
  clientKey: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{
  credentials: SocialCredentials;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
  openId: string;
}> {
  const res = await postForm(TIKTOK_TOKEN_URL, {
    client_key: input.clientKey,
    client_secret: input.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });
  if (!res.access_token) {
    throw new SocialProviderError("invalid_response", false, null);
  }
  const now = Date.now();
  return {
    credentials: {
      accessToken: res.access_token,
      ...(res.refresh_token ? { refreshToken: res.refresh_token } : {}),
    },
    accessTokenExpiresAt: new Date(now + res.expires_in * 1000),
    refreshTokenExpiresAt: res.refresh_expires_in
      ? new Date(now + res.refresh_expires_in * 1000)
      : null,
    openId: res.open_id,
  };
}

export async function refreshTikTokCredentials(input: {
  clientKey: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{
  credentials: SocialCredentials;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
  openId: string;
}> {
  const res = await postForm(TIKTOK_TOKEN_URL, {
    client_key: input.clientKey,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  if (!res.access_token) {
    throw new SocialProviderError("auth_expired", false, null);
  }
  const now = Date.now();
  return {
    credentials: {
      accessToken: res.access_token,
      ...(res.refresh_token ? { refreshToken: res.refresh_token } : {}),
    },
    accessTokenExpiresAt: new Date(now + res.expires_in * 1000),
    refreshTokenExpiresAt: res.refresh_expires_in
      ? new Date(now + res.refresh_expires_in * 1000)
      : null,
    openId: res.open_id,
  };
}

export async function fetchTikTokProfile(accessToken: string): Promise<{
  openId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  profileDeepLink: string | null;
  followerCount: number | null;
  followingCount: number | null;
  likesCount: number | null;
  mediaCount: number | null;
  isVerified: boolean;
}> {
  const url = new URL(TIKTOK_USER_INFO_URL);
  url.searchParams.set(
    "fields",
    "open_id,union_id,avatar_url,display_name,username,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count",
  );
  const res = await providerRequest(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  let parsed: { data?: { user?: Record<string, unknown> } };
  try {
    parsed = JSON.parse(res.body) as { data?: { user?: Record<string, unknown> } };
  } catch {
    throw new SocialProviderError("invalid_response", false, res.requestId);
  }
  const u = parsed.data?.user;
  if (!u) throw new SocialProviderError("invalid_response", false, res.requestId);
  return {
    openId: String(u.open_id ?? ""),
    displayName: String(u.display_name ?? ""),
    username: String(u.username ?? ""),
    avatarUrl: typeof u.avatar_url === "string" ? u.avatar_url : null,
    profileDeepLink: typeof u.profile_deep_link === "string" ? u.profile_deep_link : null,
    followerCount: typeof u.follower_count === "number" ? u.follower_count : null,
    followingCount: typeof u.following_count === "number" ? u.following_count : null,
    likesCount: typeof u.likes_count === "number" ? u.likes_count : null,
    mediaCount: typeof u.video_count === "number" ? u.video_count : null,
    isVerified: Boolean(u.is_verified),
  };
}

export const tiktokAdapter: SocialProviderAdapter = {
  provider: "tiktok",

  discoverProfiles: async (credentials, appCredentials) => {
    // The TikTok user-info endpoint authenticates with the user
    // access token alone; the app credentials are not used here
    // but the param is in the contract for interface symmetry.
    void appCredentials;
    const profile = await fetchTikTokProfile(credentials.accessToken);
    const connected: ConnectedProfile = {
      providerAccountId: profile.openId,
      platform: "tiktok",
      accountName: profile.displayName || profile.username,
      handle: profile.username || null,
      profileUrl: profile.profileDeepLink,
      avatarUrl: profile.avatarUrl,
      parentProviderAccountId: null,
    };
    return { profiles: [connected], credentials };
  },

  refreshCredentials: async (credentials, appCredentials) => {
    if (!credentials.refreshToken) {
      throw new SocialProviderError("auth_expired", false, null);
    }
    const refreshed = await refreshTikTokCredentials({
      clientKey: appCredentials.appId,
      clientSecret: appCredentials.appSecret,
      refreshToken: credentials.refreshToken,
    });
    const out: RefreshedCredentials = {
      credentials: refreshed.credentials,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
    };
    return out;
  },

  fetchSnapshot: async (profile: ConnectedProfileRef, credentials, appCredentials) => {
    // Same as `discoverProfiles` — user-info authenticates with the
    // access token, app credentials are not used. Param kept for
    // interface symmetry.
    void appCredentials;
    const p = await fetchTikTokProfile(credentials.accessToken);
    const observedAt = new Date();
    const sourceMetadata: Record<string, string | number | boolean | null> = {
      open_id: p.openId,
      is_verified: p.isVerified,
    };
    if (p.followerCount === null) {
      sourceMetadata.partial = true;
      sourceMetadata.reason = "user.info.stats denied";
    }
    // Compute a deterministic response hash so an operator can prove
    // the snapshot body was unchanged without retaining the body.
    const responseHash = createHash("sha256")
      .update(
        JSON.stringify({
          openId: p.openId,
          followerCount: p.followerCount,
          followingCount: p.followingCount,
          likesCount: p.likesCount,
          mediaCount: p.mediaCount,
        }),
      )
      .digest("hex");
    const snapshot: ProfileSnapshot = {
      observedAt,
      followerCount: p.followerCount,
      followingCount: p.followingCount,
      mediaCount: p.mediaCount,
      likesCount: p.likesCount,
      // TikTok's Display API does not expose reach / views / engaged /
      // interactions for the authorizing user; they remain null and
      // the chart shows them as gaps rather than zeros.
      reach: null,
      views: null,
      engagedAccounts: null,
      interactions: null,
      providerApiVersion: "v2",
      providerRequestId: newRequestId(),
      responseHash,
      sourceMetadata,
    };
    // Reference `profile` so the lint is happy even though we don't
    // currently need to filter by `providerAccountId`.
    void profile;
    return snapshot;
  },

  revoke: async (credentials, appCredentials) => {
    if (!credentials.refreshToken) return;
    try {
      await postForm(TIKTOK_REVOKE_URL, {
        client_key: appCredentials.appId,
        client_secret: appCredentials.appSecret,
        token: credentials.refreshToken,
      });
    } catch (err) {
      if (!isSocialProviderError(err)) {
        // Best-effort: surface in logs but do not throw, the local
        // state transition is the source of truth.
        console.error("[tiktok] revoke failed", err);
      }
    }
  },
};

// Helper retained for the cron worker's adapter registry.
//
// Hard cutover (M4.6): the platform-wide `SOCIAL_TIKTOK_ENABLED`
// flag is gone. The TikTok provider is gated per agency by the
// `agency_social_provider_config` row's `enabled` column. The
// adapter is always returned here; the cron path checks the agency
// config before calling into it.
export function tiktokAdapterOrDisabled(): SocialProviderAdapter {
  return tiktokAdapter;
}

// Backwards-compat re-export for the sync worker adapter registry.
export { tiktokAdapter as default };

// Date helpers used by callers of the refresh path. Not exported
// from this file's public surface; available for tests.
void addDays;
void addHours;
