import "server-only";

import { SocialProviderError, providerRequest } from "@/lib/social/http";
import type { SocialCredentials } from "@/lib/social/crypto";
import type { ConnectedProfile } from "@/lib/social/types";
import { resolveMetaGraphVersion, type MetaGraphVersion } from "@/lib/meta/version";

// Analytics scopes requested in the Facebook Login for Business dialog.
// Keep this list separate from the Community scopes so an operator can
// reason about why a connection has analytics access without assuming that
// it can read or mutate customer conversations.
//
// `read_insights` was removed 2026-08-28: Meta deprecated it for
// new apps and rejects the dialog with `Invalid Scopes:
// read_insights` when the Login for Business config or the OAuth
// URL still includes it. The five read-only scopes cover every
// metric the social pipeline reads:
//   - `pages_show_list` + `pages_read_engagement` → Page metadata,
//     fan_count, page-level insights (impressions, reach, views,
//     post engagements)
//   - `pages_read_user_content` → Page feed and scheduled post reads
//   - `instagram_basic` + `instagram_manage_insights` → IG business
//     account metadata, followers/media counts, and IG account
//     insights (reach, profile_views, accounts_engaged,
//     total_interactions)
//
// Pre-flight verification on the Food Game IG and Just Halal tr IG
// accounts (run on the same `pages_show_list` + `pages_read_engagement`
// + `instagram_basic` + `instagram_manage_insights` set) confirmed
// all required endpoints return the expected shape; removing
// `read_insights` does not regress any data the pipeline reads.
export const META_ANALYTICS_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "instagram_basic",
  "instagram_manage_insights",
] as const;

/**
 * Community scopes for the current Facebook Login for Business flow.
 *
 * These permissions must also be enabled/approved in the Meta app and are
 * only useful after the customer reconnects the account. Requesting them is
 * necessary, but it is not evidence that Meta granted them; capability
 * validation still uses the persisted grant and live read checks.
 */
export const META_COMMUNITY_SCOPES = [
  "pages_manage_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_manage_comments",
  "instagram_manage_messages",
] as const;

/** Every scope requested by the Meta connection flow. */
export const META_SCOPES = [...META_ANALYTICS_SCOPES, ...META_COMMUNITY_SCOPES] as const;

export type MetaScope = (typeof META_SCOPES)[number];

const MAX_PAGES = 100;
const ANALYTICS_TASKS = new Set([
  "PROFILE_PLUS_ANALYZE",
  "MANAGE",
  "CREATE_CONTENT",
  "MODERATE",
  "EDIT_PROFILE",
  "EDIT_CONTENT",
]);

export function resolveGraphVersion(override: string | null | undefined): MetaGraphVersion {
  return resolveMetaGraphVersion(override);
}

export function graphBaseUrl(version?: string | null): string {
  return `https://graph.facebook.com/${resolveGraphVersion(version)}`;
}

function dialogBaseUrl(version?: string | null): string {
  // The Login for Business dialog version is always `v<major>.0` for the
  // current major. We derive it from the pinned graph version so a
  // future bump to `v26.0` does not require two separate changes.
  const v = resolveGraphVersion(version);
  return `https://www.facebook.com/${v}`;
}

export type BuildMetaAuthorizationUrlInput = {
  appId: string;
  loginConfigId: string;
  state: string;
  redirectUri: string;
  /** Per-agency Graph API version override. Null falls back to v26.0. */
  graphApiVersion?: string | null;
};

export function buildMetaAuthorizationUrl(input: BuildMetaAuthorizationUrlInput): string {
  const url = new URL(`${dialogBaseUrl(input.graphApiVersion)}/dialog/oauth`);
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("config_id", input.loginConfigId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", META_SCOPES.join(","));
  url.searchParams.set("auth_type", "rerequest");
  return url.toString();
}

export type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

export type MetaPermissionProbeResult = {
  permissions: Array<{ permission: string; status: string }>;
  requestId: string | null;
};

/**
 * Read only the permission names/statuses needed by the admin diagnostics
 * surface. The access token and provider payload never leave this module.
 */
export async function probeMetaPermissions(args: {
  accessToken: string;
  apiVersion?: string | null;
}): Promise<MetaPermissionProbeResult> {
  const url = new URL(`${graphBaseUrl(args.apiVersion)}/me/permissions`);
  url.searchParams.set("access_token", args.accessToken);
  const { body, requestId } = await providerRequest(url.toString());
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SocialProviderError("invalid_response", false, requestId);
  }
  const data =
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as { data?: unknown }).data)
      ? (parsed as { data: unknown[] }).data
      : null;
  if (!data) throw new SocialProviderError("invalid_response", false, requestId);
  const permissions = data.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const permission = (entry as { permission?: unknown }).permission;
    const status = (entry as { status?: unknown }).status;
    return typeof permission === "string" && typeof status === "string"
      ? [{ permission, status }]
      : [];
  });
  return { permissions, requestId };
}

export type ExchangeShortLivedInput = {
  appId: string;
  appSecret: string;
  code: string;
  redirectUri: string;
  graphApiVersion?: string | null;
};

/**
 * Exchange the OAuth `code` for a short-lived user access token. The
 * short-lived token is the input to the long-lived exchange below; it
 * is never persisted and never leaves the callback route.
 */
export async function exchangeMetaCodeForShortLivedToken(
  input: ExchangeShortLivedInput,
): Promise<MetaTokenResponse> {
  const body = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  const { body: responseText } = await providerRequest(
    `${graphBaseUrl(input.graphApiVersion)}/oauth/access_token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
  );
  return parseTokenResponse(responseText);
}

export type ExchangeLongLivedInput = {
  appId: string;
  appSecret: string;
  shortLivedToken: string;
  graphApiVersion?: string | null;
};

export type LongLivedTokenResult = {
  accessToken: string;
  accessTokenExpiresAt: Date | null;
  refreshToken?: undefined;
  refreshTokenExpiresAt: null;
};

/**
 * Exchange a short-lived token for a long-lived (~60-day) user access
 * token. The Meta flow does NOT use refresh tokens for the
 * Facebook-Login-for-Business user token; the long-lived token is
 * itself refreshed by calling this endpoint again before it expires.
 * The cron worker uses `refreshCredentials` (which calls this
 * function) to rotate before the 60-day window.
 */
export async function exchangeShortLivedForLongLivedToken(
  input: ExchangeLongLivedInput,
): Promise<LongLivedTokenResult> {
  const url = new URL(`${graphBaseUrl(input.graphApiVersion)}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", input.appId);
  url.searchParams.set("client_secret", input.appSecret);
  url.searchParams.set("fb_exchange_token", input.shortLivedToken);
  const { body: responseText } = await providerRequest(url.toString());
  const parsed = parseTokenResponse(responseText);
  return {
    accessToken: parsed.access_token,
    accessTokenExpiresAt: parsed.expires_in
      ? new Date(Date.now() + parsed.expires_in * 1000)
      : null,
    refreshTokenExpiresAt: null,
  };
}

function parseTokenResponse(text: string): MetaTokenResponse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as { access_token?: unknown }).access_token !== "string"
  ) {
    throw new SocialProviderError("invalid_response", false, null);
  }
  const value = raw as { access_token: string; expires_in?: unknown; token_type?: unknown };
  return {
    access_token: value.access_token,
    ...(typeof value.expires_in === "number" ? { expires_in: value.expires_in } : {}),
    ...(typeof value.token_type === "string" ? { token_type: value.token_type } : {}),
  };
}

// ─── /me/accounts pagination + Page discovery ─────────────────────────────

type MetaAccount = {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
  link?: string;
  followers_count?: number;
  fan_count?: number;
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
    media_count?: number;
  };
};

type MetaAccountsResponse = {
  data: MetaAccount[];
  paging?: { next?: string; cursors?: { after?: string } };
};

export type DiscoverMetaPagesInput = {
  appId: string;
  appSecret: string;
  accessToken: string;
  graphApiVersion?: string | null;
};

export type DiscoverMetaPagesResult = {
  profiles: ConnectedProfile[];
  credentials: SocialCredentials;
};

function hasAnalyticsPermission(page: MetaAccount): boolean {
  if (!page.tasks || page.tasks.length === 0) return false;
  return page.tasks.some((task) => ANALYTICS_TASKS.has(task));
}

function toPageProfile(page: MetaAccount): ConnectedProfile {
  return {
    providerAccountId: page.id,
    platform: "facebook",
    accountName: page.name,
    handle: null,
    profileUrl: page.link ?? null,
    avatarUrl: page.picture?.data?.url ?? null,
    parentProviderAccountId: null,
  };
}

function toInstagramProfile(
  ig: NonNullable<MetaAccount["instagram_business_account"]>,
  pageId: string,
): ConnectedProfile {
  return {
    providerAccountId: ig.id,
    platform: "instagram",
    accountName: ig.name ?? ig.username ?? ig.id,
    handle: ig.username ?? null,
    profileUrl: ig.username ? `https://instagram.com/${ig.username}` : null,
    avatarUrl: ig.profile_picture_url ?? null,
    parentProviderAccountId: pageId,
  };
}

/**
 * Discover the Pages the actor manages plus each Page's linked
 * Instagram business account. Pages with only ADVERTISE / CREATE_AD
 * tasks are filtered. The returned credentials include a
 * `profileAccessTokens` map keyed by both the Page external ID and
 * the Instagram external ID (same value) so the snapshot worker can
 * read either with one access token.
 */
export async function discoverMetaPages(
  input: DiscoverMetaPagesInput,
): Promise<DiscoverMetaPagesResult> {
  const profiles: ConnectedProfile[] = [];
  const profileAccessTokens: Record<string, string> = {};
  const fields = [
    "id",
    "name",
    "access_token",
    "tasks",
    "picture",
    "link",
    "followers_count",
    "fan_count",
    "instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}",
  ].join(",");

  const firstUrl = new URL(`${graphBaseUrl(input.graphApiVersion)}/me/accounts`);
  firstUrl.searchParams.set("fields", fields);
  firstUrl.searchParams.set("limit", "100");
  firstUrl.searchParams.set("access_token", input.accessToken);

  let nextUrl: string | null = firstUrl.toString();
  let pagesFetched = 0;
  while (nextUrl && pagesFetched < MAX_PAGES) {
    const { body } = await providerRequest(nextUrl);
    let parsed: MetaAccountsResponse;
    try {
      parsed = JSON.parse(body) as MetaAccountsResponse;
    } catch {
      throw new SocialProviderError("invalid_response", false, null);
    }
    if (!Array.isArray(parsed.data)) {
      throw new SocialProviderError("invalid_response", false, null);
    }
    for (const page of parsed.data ?? []) {
      if (!hasAnalyticsPermission(page)) continue;
      profiles.push(toPageProfile(page));
      profileAccessTokens[page.id] = page.access_token;
      if (page.instagram_business_account) {
        const ig = page.instagram_business_account;
        profiles.push(toInstagramProfile(ig, page.id));
        // Same access token backs the Instagram endpoint; key under
        // the IG id too so the snapshot worker can resolve by either.
        profileAccessTokens[ig.id] = page.access_token;
      }
      pagesFetched += 1;
      if (pagesFetched >= MAX_PAGES) break;
    }
    nextUrl = parsed.paging?.next ?? null;
  }
  return {
    profiles,
    credentials: {
      accessToken: input.accessToken,
      profileAccessTokens,
    },
  };
}

/**
 * Resolve a Page token from the connection's token map or acquire and cache
 * one for legacy connections that predate per-profile token persistence.
 */
const pageAccessTokenCache = new Map<string, { token: string; expires: number }>();

export async function acquirePageAccessToken(
  credentials: SocialCredentials,
  pageId: string,
  apiVersion: string,
): Promise<string> {
  const stored = credentials.profileAccessTokens?.[pageId];
  if (stored) return stored;

  const cached = pageAccessTokenCache.get(pageId);
  if (cached && cached.expires > Date.now()) return cached.token;

  const url = new URL(`${graphBaseUrl(apiVersion)}/${pageId}`);
  url.searchParams.set("fields", "access_token");
  url.searchParams.set("access_token", credentials.accessToken);
  const { body } = await providerRequest(url.toString());
  let parsed: { access_token?: string };
  try {
    parsed = JSON.parse(body) as { access_token?: string };
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
  if (typeof parsed.access_token !== "string" || parsed.access_token.length === 0) {
    throw new SocialProviderError("permission_denied", false, null);
  }
  pageAccessTokenCache.set(pageId, {
    token: parsed.access_token,
    expires: Number.MAX_SAFE_INTEGER,
  });
  return parsed.access_token;
}
