import "server-only";
import { createHash } from "node:crypto";
import { isSocialProviderError, providerRequest, SocialProviderError } from "@/lib/social/http";
import type { SocialCredentials } from "@/lib/social/crypto";
import type {
  ConnectedProfile,
  RefreshedCredentials,
  SocialProviderAdapter,
} from "@/lib/social/types";

/**
 * M2 — Meta (Facebook Login for Business) provider adapter.
 *
 * Implements the four-method `SocialProviderAdapter` contract from
 * `src/lib/social/types.ts`. The Meta provider is the first production
 * adapter; TikTok ships in M4.
 *
 * Safety properties concentrated in this file:
 *
 *   - The only scopes sent to Facebook are the read-only set in
 *     `META_SCOPES`. No publish / manage / ads scope ever appears in
 *     the authorization URL.
 *   - `providerRequest` enforces the 10s timeout, 1 MiB body cap,
 *     2-retry cap on 429/502/503/504, and full-jitter 4s ceiling
 *     defined in `src/lib/social/http.ts`. The provider functions
 *     here are thin on top.
 *   - Every error is a `SocialProviderError` with one of the six
 *     codes declared in `http.ts`. The error message is the code
 *     itself; URLs, headers, tokens, and bodies are never included.
 *   - The Page access token returned by `/me/accounts` is moved off
 *     the `ConnectedProfile` list and into the `profileAccessTokens`
 *     map on `SocialCredentials`. The picker server component only
 *     ever sees the token-free profile list.
 *   - Only Pages that hold `PROFILE_PLUS_ANALYZE` (or full-control
 *     tasks `MANAGE` / `CREATE_CONTENT`) appear in the result. Pages
 *     that only have `ADVERTISE` are filtered out because they
 *     cannot back a read-only analytics connection.
 *   - `instagram_business_account` is mapped to an Instagram
 *     `ConnectedProfile` with `parentProviderAccountId` set to the
 *     Page's external ID, and the same Page access token is keyed in
 *     `profileAccessTokens` under both the Page ID and the IG ID
 *     so the snapshot worker can read the IG endpoint with one
 *     access token.
 *   - Paging follows `cursors.after`; the loop terminates when the
 *     response has no `paging.next` or has produced 100 Pages.
 *   - The Graph API version is read from
 *     `META_GRAPH_API_VERSION` (default `v25.0`).
 */

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
] as const;

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

type MetaGraphVersion = `v${number}.${number}`;
const DEFAULT_GRAPH_VERSION: MetaGraphVersion = "v25.0";

function resolveGraphVersion(override: string | null | undefined): MetaGraphVersion {
  if (override && /^v\d+\.\d+$/.test(override)) {
    return override as MetaGraphVersion;
  }
  return DEFAULT_GRAPH_VERSION;
}

function graphBaseUrl(version?: string | null): string {
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
  /** Per-agency Graph API version override. Null falls back to v25.0. */
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
    for (const page of parsed.data) {
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

// ─── Snapshot worker helpers (Task 7) ─────────────────────────────────────

export type MetaPageSnapshot = {
  observedAt: Date;
  followerCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  likesCount: number | null;
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
  providerApiVersion: string;
  providerRequestId: string | null;
  responseHash: string;
  sourceMetadata: Record<string, string | number | boolean | null>;
};

import { createHash as _createHash } from "node:crypto";
import type { ProfileSnapshot, ConnectedProfileRef } from "@/lib/social/types";

function hashSnapshot(parts: Array<string | number | null | undefined>): string {
  const h = _createHash("sha256");
  for (const p of parts) {
    h.update(String(p ?? ""));
    h.update("\u0001");
  }
  return h.digest("hex");
}

type PageDetailsResponse = {
  id: string;
  fan_count?: number;
  followers_count?: number;
};

type IgBusinessResponse = {
  id: string;
  followers_count?: number;
  media_count?: number;
  follows_count?: number;
  name?: string;
  username?: string;
};

type PageInsightsResponse = {
  data: Array<{
    name: string;
    period: string;
    values: Array<{ value: number; end_time?: string }>;
  }>;
};

export async function fetchMetaFacebookPageSnapshot(args: {
  accessToken: string;
  pageId: string;
  apiVersion: string;
  requestIdHint: string;
}): Promise<MetaPageSnapshot> {
  const { accessToken, pageId, apiVersion, requestIdHint } = args;
  const fields = "id,fan_count,followers_count";
  const url = new URL(`${graphBaseUrl()}/${pageId}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const { body, requestId } = await providerRequest(url.toString());
  let parsed: PageDetailsResponse;
  try {
    parsed = JSON.parse(body) as PageDetailsResponse;
  } catch {
    throw new SocialProviderError("invalid_response", false, requestId);
  }
  const follower =
    typeof parsed.fan_count === "number"
      ? parsed.fan_count
      : typeof parsed.followers_count === "number"
        ? parsed.followers_count
        : null;
  // Page-level daily reach/views are surfaced via the page_insights
  // endpoint. We attempt the call and treat empty datasets as `null`,
  // never `0` — the plan calls out "missing/empty insight datasets
  // become `null`, never zero".
  const insights = await fetchMetaPageDailyInsights({
    accessToken,
    pageId,
    apiVersion,
  }).catch(() => null);
  const sourceMetadata: Record<string, string | number | boolean | null> = {
    partial: follower === null,
  };
  if (follower === null) sourceMetadata.reason = "fan_count_unavailable";
  const observedAt = new Date();
  const hash = hashSnapshot([
    apiVersion,
    requestIdHint,
    pageId,
    follower,
    insights?.reach ?? null,
    insights?.views ?? null,
  ]);
  return {
    observedAt,
    followerCount: follower,
    followingCount: null,
    mediaCount: null,
    likesCount: null,
    reach: insights?.reach ?? null,
    views: insights?.views ?? null,
    engagedAccounts: insights?.engagedAccounts ?? null,
    interactions: insights?.interactions ?? null,
    providerApiVersion: apiVersion,
    providerRequestId: requestId,
    responseHash: hash,
    sourceMetadata,
  };
}

async function fetchMetaPageDailyInsights(args: {
  accessToken: string;
  pageId: string;
  apiVersion: string;
}): Promise<{
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
} | null> {
  const url = new URL(`${graphBaseUrl(args.apiVersion)}/${args.pageId}/insights`);
  url.searchParams.set("metric", "page_impressions_unique,page_views,page_post_engagements");
  url.searchParams.set("period", "day");
  url.searchParams.set("access_token", args.accessToken);
  let parsed: PageInsightsResponse;
  try {
    const { body } = await providerRequest(url.toString());
    parsed = JSON.parse(body) as PageInsightsResponse;
  } catch (err) {
    if (isSocialProviderError(err) && err.code === "permission_denied") return null;
    throw err;
  }
  const find = (name: string) => parsed.data.find((m) => m.name === name)?.values?.[0]?.value;
  return {
    reach:
      typeof find("page_impressions_unique") === "number"
        ? (find("page_impressions_unique") as number)
        : null,
    views: typeof find("page_views") === "number" ? (find("page_views") as number) : null,
    engagedAccounts: null, // Page-level engagement is rarely available as a single number
    interactions:
      typeof find("page_post_engagements") === "number"
        ? (find("page_post_engagements") as number)
        : null,
  };
}

export async function fetchMetaInstagramSnapshot(args: {
  accessToken: string;
  igUserId: string;
  apiVersion: string;
  requestIdHint: string;
}): Promise<MetaPageSnapshot> {
  const { accessToken, igUserId, apiVersion, requestIdHint } = args;
  const url = new URL(`${graphBaseUrl(apiVersion)}/${igUserId}`);
  url.searchParams.set("fields", "followers_count,media_count,follows_count,username,name");
  url.searchParams.set("access_token", accessToken);
  const { body, requestId } = await providerRequest(url.toString());
  let parsed: IgBusinessResponse;
  try {
    parsed = JSON.parse(body) as IgBusinessResponse;
  } catch {
    throw new SocialProviderError("invalid_response", false, requestId);
  }
  const follower = typeof parsed.followers_count === "number" ? parsed.followers_count : null;
  const media = typeof parsed.media_count === "number" ? parsed.media_count : null;
  const following = typeof parsed.follows_count === "number" ? parsed.follows_count : null;
  // Account-level daily insights: views, reach, engaged accounts,
  // interactions. Empty datasets are `null`, never `0`.
  const insights = await fetchMetaIgAccountDailyInsights({
    accessToken,
    igUserId,
    apiVersion,
  }).catch(() => null);
  const sourceMetadata: Record<string, string | number | boolean | null> = {
    partial: follower === null,
  };
  if (follower === null) {
    sourceMetadata.reason = sourceMetadata.reason ?? "below_provider_threshold";
  }
  const observedAt = new Date();
  const hash = hashSnapshot([
    apiVersion,
    requestIdHint,
    igUserId,
    follower,
    media,
    following,
    insights?.views ?? null,
    insights?.reach ?? null,
    insights?.engagedAccounts ?? null,
    insights?.interactions ?? null,
  ]);
  return {
    observedAt,
    followerCount: follower,
    followingCount: following,
    mediaCount: media,
    likesCount: null,
    reach: insights?.reach ?? null,
    views: insights?.views ?? null,
    engagedAccounts: insights?.engagedAccounts ?? null,
    interactions: insights?.interactions ?? null,
    providerApiVersion: apiVersion,
    providerRequestId: requestId,
    responseHash: hash,
    sourceMetadata,
  };
}

async function fetchMetaIgAccountDailyInsights(args: {
  accessToken: string;
  igUserId: string;
  apiVersion: string;
}): Promise<{
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
} | null> {
  const url = new URL(`${graphBaseUrl(args.apiVersion)}/${args.igUserId}/insights`);
  // `metric_type=total_value` is required for `profile_views`,
  // `accounts_engaged`, and `total_interactions` (these are daily
  // total metrics, not time-series). Without it, the Graph API returns
  // `(#100) The following metrics (...) should be specified with
  // parameter metric_type=total_value`, and the function would surface
  // `null` for every IG account. `reach` accepts either `metric_type`
  // value, so setting it globally is safe and matches the API docs.
  // Pre-flight verification 2026-08-27: this was a latent bug; the
  // existing Food Game IG connection was silently missing
  // `accounts_engaged` and `total_interactions` until this fix.
  url.searchParams.set("metric", "reach,profile_views,accounts_engaged,total_interactions");
  url.searchParams.set("period", "day");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("access_token", args.accessToken);
  let parsed: PageInsightsResponse;
  try {
    const { body } = await providerRequest(url.toString());
    parsed = JSON.parse(body) as PageInsightsResponse;
  } catch (err) {
    if (isSocialProviderError(err) && err.code === "permission_denied") return null;
    throw err;
  }
  const find = (name: string) => parsed.data.find((m) => m.name === name)?.values?.[0]?.value;
  return {
    reach: typeof find("reach") === "number" ? (find("reach") as number) : null,
    views: typeof find("profile_views") === "number" ? (find("profile_views") as number) : null,
    engagedAccounts:
      typeof find("accounts_engaged") === "number" ? (find("accounts_engaged") as number) : null,
    interactions:
      typeof find("total_interactions") === "number"
        ? (find("total_interactions") as number)
        : null,
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────

/**
 * The Meta adapter implements the `SocialProviderAdapter` contract
 * from `src/lib/social/types.ts`. The cron worker resolves this
 * adapter from the connection's `provider` column and calls these
 * methods. The application layer never knows about the Graph API
 * version or endpoint shape.
 */
export const metaAdapter: SocialProviderAdapter = {
  provider: "meta",

  async discoverProfiles(credentials: SocialCredentials, appCredentials) {
    return discoverMetaPages({
      appId: appCredentials.appId,
      appSecret: appCredentials.appSecret,
      accessToken: credentials.accessToken,
    });
  },

  async refreshCredentials(
    credentials: SocialCredentials,
    appCredentials,
  ): Promise<RefreshedCredentials> {
    // Meta's long-lived user access token is refreshed by re-running
    // the short→long exchange. The user access token (top-level) is
    // what backs every Page access token in
    // `profileAccessTokens`, so a single refresh suffices.
    const short = await exchangeShortLivedForLongLivedToken({
      appId: appCredentials.appId,
      appSecret: appCredentials.appSecret,
      shortLivedToken: credentials.accessToken,
    });
    return {
      credentials: {
        accessToken: short.accessToken,
        ...(credentials.profileAccessTokens
          ? { profileAccessTokens: credentials.profileAccessTokens }
          : {}),
      },
      accessTokenExpiresAt: short.accessTokenExpiresAt,
      refreshTokenExpiresAt: null,
    };
  },

  async fetchSnapshot(
    profile: ConnectedProfileRef,
    credentials: SocialCredentials,
    appCredentials,
  ): Promise<ProfileSnapshot> {
    // The snapshot path only needs the access token (carried in the
    // per-connection SocialCredentials envelope). The Graph API
    // version comes from the per-agency app config; null falls
    // back to the compile-time default.
    const accessToken =
      credentials.profileAccessTokens?.[profile.providerAccountId] ?? credentials.accessToken;
    const apiVersion = resolveGraphVersion(appCredentials.graphApiVersion);
    const requestIdHint = createHash("sha256")
      .update(`${profile.providerAccountId}:${apiVersion}:${Date.now()}`)
      .digest("hex")
      .slice(0, 16);
    if (profile.platform === "facebook") {
      return fetchMetaFacebookPageSnapshot({
        accessToken,
        pageId: profile.providerAccountId,
        apiVersion,
        requestIdHint,
      });
    }
    if (profile.platform === "instagram") {
      return fetchMetaInstagramSnapshot({
        accessToken,
        igUserId: profile.providerAccountId,
        apiVersion,
        requestIdHint,
      });
    }
    throw new SocialProviderError("permission_denied", false, null);
  },

  async revoke(credentials: SocialCredentials, _appCredentials): Promise<void> {
    // Best-effort revoke per the adapter contract. We DELETE the
    // user access token; Page tokens are children of the user token
    // and become invalid automatically. Errors are swallowed because
    // the application is about to mark the connection revoked
    // locally anyway.
    try {
      const url = new URL(`${graphBaseUrl(_appCredentials.graphApiVersion)}/me/permissions`);
      url.searchParams.set("access_token", credentials.accessToken);
      await providerRequest(url.toString(), { method: "DELETE" });
    } catch {
      // intentional swallow
    }
  },
};
