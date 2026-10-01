import "server-only";
import { createHash } from "node:crypto";
import {
  isSocialProviderError,
  providerRequest,
  SocialProviderError,
  type MetaRateLimitUsage,
} from "@/lib/social/http";
import { captureError } from "@/lib/observability/sentry";
import { logError, logWarn } from "@/lib/observability/logger";
import type { SocialCredentials } from "@/lib/social/crypto";
import type {
  ConnectedProfile,
  RefreshedCredentials,
  SocialProviderAdapter,
  SocialPostObservation,
  SocialSourceMetadata,
} from "@/lib/social/types";
import type { MetricStatus, SocialMetric } from "@/lib/social/metrics";
import {
  mergeMetaPublicationCandidates,
  normalizeMetaPublication,
  type MetaPublicationCandidate,
  type MetaPublicationCandidateRaw,
  type MetaPublicationPlatform,
} from "@/lib/social/meta-publications";

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
 *   - The Graph API version is supplied by the agency provider configuration
 *     and defaults to `v25.0` when that optional field is empty.
 */

// Read-only scopes requested in the Facebook Login for Business
// dialog. The scope list is the contract for what the access token
// will be authorized to read; missing scopes show up as
// `permission_denied` errors at fetch time.
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
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
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

type MetaPublicationCollectionResponse = {
  data?: unknown[];
  paging?: { cursors?: { after?: string }; next?: string };
};

export type MetaPublicationCandidatePage = {
  candidates: MetaPublicationCandidate[];
  nextCursor: string | null;
  scheduledCoverage: "complete" | "published_only";
};

export type FetchMetaPublicationCandidatesInput = {
  platform: MetaPublicationPlatform;
  accountId: string;
  credentials: SocialCredentials;
  apiVersion?: string | null;
  now?: Date;
  publishedSince: Date;
  after?: string | null;
  limit?: number;
};

type FacebookPublicationCursor = {
  version: 1;
  scheduledAfter: string | null;
  feedAfter: string | null;
};

function encodeFacebookPublicationCursor(cursor: FacebookPublicationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeFacebookPublicationCursor(
  value: string | null | undefined,
): FacebookPublicationCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<FacebookPublicationCursor>;
    if (
      parsed.version !== 1 ||
      (parsed.scheduledAfter !== null && typeof parsed.scheduledAfter !== "string") ||
      (parsed.feedAfter !== null && typeof parsed.feedAfter !== "string")
    ) {
      throw new Error("invalid cursor");
    }
    return {
      version: 1,
      scheduledAfter: parsed.scheduledAfter ?? null,
      feedAfter: parsed.feedAfter ?? null,
    };
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
}

function parsePublicationCollection(body: string): MetaPublicationCollectionResponse {
  let parsed: MetaPublicationCollectionResponse;
  try {
    parsed = JSON.parse(body) as MetaPublicationCollectionResponse;
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
  if (!Array.isArray(parsed.data)) {
    throw new SocialProviderError("invalid_response", false, null);
  }
  return parsed;
}

async function fetchPublicationCollection(args: {
  url: URL;
  platform: MetaPublicationPlatform;
  now: Date;
}): Promise<Omit<MetaPublicationCandidatePage, "scheduledCoverage">> {
  const { body, requestId } = await providerRequest(args.url.toString());
  try {
    const parsed = parsePublicationCollection(body);
    return {
      candidates: (parsed.data ?? []).flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        try {
          return [
            normalizeMetaPublication(args.platform, entry as MetaPublicationCandidateRaw, args.now),
          ];
        } catch {
          return [];
        }
      }),
      nextCursor: parsed.paging?.cursors?.after ?? null,
    };
  } catch (error) {
    if (error instanceof SocialProviderError) {
      throw new SocialProviderError(error.code, error.retryable, requestId ?? error.requestId);
    }
    throw error;
  }
}

/**
 * Fetch the first candidate page for a linked Facebook Page or Instagram
 * professional account. The returned DTO contains no access token or raw
 * provider response. Facebook uses separate feed and scheduled-post edges;
 * Instagram media is returned through the account's media edge.
 */
export async function fetchMetaPublicationCandidatesPage(
  input: FetchMetaPublicationCandidatesInput,
): Promise<MetaPublicationCandidatePage> {
  const apiVersion = resolveGraphVersion(input.apiVersion);
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const accessToken =
    input.platform === "facebook"
      ? await acquirePageAccessToken(input.credentials, input.accountId, apiVersion)
      : (input.credentials.profileAccessTokens?.[input.accountId] ?? input.credentials.accessToken);

  if (input.platform === "facebook") {
    const fields = [
      "id",
      "message",
      "created_time",
      "scheduled_publish_time",
      "is_published",
      "permalink_url",
      "from{id}",
      "attachments{media_type,media_url,thumbnail_url}",
    ].join(",");
    const cursor = decodeFacebookPublicationCursor(input.after);
    const scheduledUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}/scheduled_posts`);
    scheduledUrl.searchParams.set("fields", fields);
    scheduledUrl.searchParams.set("limit", String(limit));
    scheduledUrl.searchParams.set("access_token", accessToken);
    if (cursor?.scheduledAfter) scheduledUrl.searchParams.set("after", cursor.scheduledAfter);

    const feedUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}/feed`);
    feedUrl.searchParams.set("fields", fields);
    feedUrl.searchParams.set("limit", String(limit));
    feedUrl.searchParams.set("since", String(Math.floor(input.publishedSince.getTime() / 1000)));
    feedUrl.searchParams.set("access_token", accessToken);
    if (cursor?.feedAfter) feedUrl.searchParams.set("after", cursor.feedAfter);

    const scheduledRequest =
      cursor?.scheduledAfter === null
        ? Promise.resolve({ candidates: [], nextCursor: null })
        : fetchPublicationCollection({ url: scheduledUrl, platform: "facebook", now });
    const feedRequest =
      cursor?.feedAfter === null
        ? Promise.resolve({ candidates: [], nextCursor: null })
        : fetchPublicationCollection({ url: feedUrl, platform: "facebook", now });
    const [scheduled, published] = await Promise.all([scheduledRequest, feedRequest]);
    const nextCursor =
      scheduled.nextCursor || published.nextCursor
        ? encodeFacebookPublicationCursor({
            version: 1,
            scheduledAfter: scheduled.nextCursor,
            feedAfter: published.nextCursor,
          })
        : null;
    return {
      candidates: mergeMetaPublicationCandidates([
        ...scheduled.candidates,
        ...published.candidates,
      ]),
      nextCursor,
      scheduledCoverage: "complete",
    };
  }

  const mediaUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}/media`);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url",
  );
  mediaUrl.searchParams.set("limit", String(limit));
  mediaUrl.searchParams.set("since", String(Math.floor(input.publishedSince.getTime() / 1000)));
  mediaUrl.searchParams.set("access_token", accessToken);
  if (input.after) mediaUrl.searchParams.set("after", input.after);
  const page = await fetchPublicationCollection({ url: mediaUrl, platform: "instagram", now });
  return { ...page, scheduledCoverage: "published_only" };
}

export async function fetchMetaPublicationCandidates(
  input: FetchMetaPublicationCandidatesInput,
): Promise<MetaPublicationCandidate[]> {
  const page = await fetchMetaPublicationCandidatesPage(input);
  return page.candidates;
}

export async function fetchMetaPublicationById(input: {
  platform: MetaPublicationPlatform;
  accountId: string;
  publicationId: string;
  credentials: SocialCredentials;
  apiVersion?: string | null;
  now?: Date;
}): Promise<MetaPublicationCandidate | null> {
  const apiVersion = resolveGraphVersion(input.apiVersion);
  const accessToken =
    input.platform === "facebook"
      ? await acquirePageAccessToken(input.credentials, input.accountId, apiVersion)
      : (input.credentials.profileAccessTokens?.[input.accountId] ?? input.credentials.accessToken);
  const url = new URL(`${graphBaseUrl(apiVersion)}/${input.publicationId}`);
  url.searchParams.set(
    "fields",
    input.platform === "facebook"
      ? "id,message,created_time,scheduled_publish_time,is_published,permalink_url,from{id}"
      : "id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url,username",
  );
  url.searchParams.set("access_token", accessToken);
  const { body } = await providerRequest(url.toString());
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SocialProviderError("invalid_response", false, null);
  }
  const raw = parsed as MetaPublicationCandidateRaw;
  if (input.platform === "facebook") {
    const owner = raw.from;
    const ownerId =
      owner && typeof owner === "object" && typeof (owner as { id?: unknown }).id === "string"
        ? (owner as { id: string }).id
        : null;
    if (ownerId !== input.accountId) return null;
  } else {
    const mediaUsername = typeof raw.username === "string" ? raw.username : null;
    if (!mediaUsername) return null;
    const accountUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}`);
    accountUrl.searchParams.set("fields", "id,username");
    accountUrl.searchParams.set("access_token", accessToken);
    const accountResponse = await providerRequest(accountUrl.toString());
    let account: { id?: unknown; username?: unknown };
    try {
      account = JSON.parse(accountResponse.body) as { id?: unknown; username?: unknown };
    } catch {
      throw new SocialProviderError("invalid_response", false, accountResponse.requestId);
    }
    if (
      account.id !== input.accountId ||
      typeof account.username !== "string" ||
      account.username.toLocaleLowerCase() !== mediaUsername.toLocaleLowerCase()
    ) {
      return null;
    }
  }
  try {
    return normalizeMetaPublication(input.platform, raw, input.now ?? new Date());
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
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
  sourceMetadata: SocialSourceMetadata;
  postObservations?: SocialPostObservation[];
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

/**
 * Write the most recent Meta rate-limit usage to the snapshot's
 * sourceMetadata. The basic-fields call always runs; the insights
 * call may have errored (permission_denied, etc.) and produced no
 * usage. We prefer the insights usage (most recent) when both are
 * present, and fall back to the basic-fields usage when only that
 * one ran.
 *
 * The app-level and business-level usage are written as separate
 * flat keys (`appUsageCallCount`, `appUsageCpu`, `appUsageTime`,
 * `businessUsageMaxCallCount`) so a SQL query can read them
 * without parsing nested JSON. The business usage is collapsed to
 * the max call_count across all business ids × asset types — the
 * cron worker only needs a single at-a-glance number to decide
 * whether to throttle.
 */
function writeRateLimitUsage(
  sourceMetadata: SocialSourceMetadata,
  latestUsage: MetaRateLimitUsage,
  fallbackUsage: MetaRateLimitUsage,
): void {
  const pickUsage = (u: MetaRateLimitUsage) => {
    if (u.app || u.business) return u;
    return null;
  };
  const chosen = pickUsage(latestUsage) ?? pickUsage(fallbackUsage);
  if (!chosen) return;
  if (chosen.app) {
    sourceMetadata.appUsageCallCount = chosen.app.call_count;
    sourceMetadata.appUsageCpu = chosen.app.total_cputime;
    sourceMetadata.appUsageTime = chosen.app.total_time;
  }
  if (chosen.business) {
    let maxUsage = 0;
    for (const business of Object.values(chosen.business)) {
      for (const asset of business) {
        if (asset.call_count > maxUsage) maxUsage = asset.call_count;
      }
    }
    if (maxUsage > 0) {
      sourceMetadata.businessUsageMaxCallCount = maxUsage;
    }
  }
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
  /**
   * Present when the request was field-expanded to include
   * `media.limit(10){...}`. The IG profile exposes this as a
   * nested `data` array of posts. The first element is the
   * most recent post. Each post is intentionally narrow — we
   * only need identity, basic engagement, and video duration for the
   * bounded post-observation slice. Deeper fields (caption,
   * thumbnail, etc.) are fetched on demand from `/{media-id}`
   * or `/{media-id}/insights`.
   */
  media?: {
    data: IgMediaSummary[];
  };
};

type IgMediaSummary = {
  id: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
  video_duration?: number;
};

type PageInsightsResponse = {
  data: Array<{
    name: string;
    period: string;
    title?: string;
    description?: string;
    id?: string;
    /**
     * Cumulative value when the request included `metric_type=total_value`.
     * Meta returns this instead of `values[]` for total/cumulative metrics
     * (e.g. `profile_views` with `metric_type=total_value`). When this
     * field is present, `values` is absent and the pre-fix parser
     * (which only read `values?.[0]?.value`) returned `undefined`.
     * `readMetricValue` (below) prefers this field.
     */
    total_value?: { value?: number };
    /**
     * Time-series values when the request did NOT include
     * `metric_type=total_value`. Meta returns one entry per day (or
     * per week, depending on `period`). For a single-day snapshot we
     * take the most recent entry via `values?.[0]?.value`.
     */
    values?: Array<{ value: number; end_time?: string }>;
  }>;
};

export type MetaMediaInsightMetricStatus = {
  status: "available" | "unsupported" | "no_data" | "error";
  value?: number;
  providerErrorCode?: string;
  providerRequestId?: string;
};

export type MetaMediaInsightProbe = {
  status: "available" | "no_media" | "error";
  mediaId: string | null;
  mediaType: string | null;
  mediaProductType: string | null;
  publishedAt: string | null;
  permalink: string | null;
  metrics: Record<string, MetaMediaInsightMetricStatus>;
  providerApiVersion: string;
  providerRequestId: string | null;
  providerErrorCode?: string;
};

/**
 * Extract a single numeric value from a Meta /insights data entry.
 *
 * Meta's `/insights` endpoint returns TWO different shapes depending
 * on whether the request included `metric_type=total_value`:
 *  - **Cumulative** (the shape the IG / Page snapshot uses): each
 *    data entry has `{ total_value: { value: <number> } }` and
 *    NO `values` field at all.
 *  - **Time series** (the shape a `metric_type=`-less request
 *    returns for reach, follower_count, etc.): each data entry has
 *    `{ values: [{ value, end_time }, …] }` with one entry per day.
 *
 * The pre-fix parser only read `values?.[0]?.value`, which is
 * `undefined` for the cumulative shape — so every cumulative
 * metric came back as `null` and the row was marked `partial: true`
 * with `ig_insights_unavailable` / `page_insights_unavailable` and
 * no `providerErrorCode`, surfacing on the Re-test button as
 * "Meta returned an unrecognized response" even though Meta
 * returned a perfectly valid 200. This helper prefers the
 * cumulative shape and falls back to the time-series shape so
 * both work.
 *
 * Returns `null` for missing metrics, missing values, or
 * non-numeric values (the canonical "absent" sentinel for the
 * snapshot — the outer code maps `null` to `partial: true`).
 */
function readMetricValue(entry: PageInsightsResponse["data"][number] | undefined): number | null {
  if (!entry) return null;
  if (typeof entry.total_value?.value === "number") return entry.total_value.value;
  const first = entry.values?.[0]?.value;
  return typeof first === "number" ? first : null;
}

/**
 * Fetch a single Meta Insights metric. Returns `value: null` and a
 * `not_configured` / `permission_denied` errorCode for the two
 * "silent" failure modes the outer snapshot already documents
 * (metric name not in the account allowlist, or scope missing).
 * Any other provider error is re-thrown so the outer caller can
 * route it to the channel-failed path.
 *
 * 2026-09-02: introduced as part of the Rice n Spices fix. The
 * pre-fix implementation requested all 3 Page (or 4 IG) metrics
 * in a single URL, so a single bad metric name made Meta return
 * `error.code: 100` for the whole request and the outer code
 * nulled reach/views/interactions together. Per-metric calls
 * isolate the failure: a Page whose current metric is not in the
 * allowlist now still gets the other metrics captured.
 */
async function fetchMetaInsightsMetric(args: {
  baseUrl: string;
  accessToken: string;
  metricName: string;
  period?: "day" | "lifetime";
}): Promise<{
  value: number | null;
  errorCode: SocialProviderError["code"] | null;
  requestId: string | null;
  usage: MetaRateLimitUsage;
}> {
  const url = new URL(args.baseUrl);
  url.searchParams.set("metric", args.metricName);
  url.searchParams.set("period", args.period ?? "day");
  url.searchParams.set("metric_type", "total_value");
  url.searchParams.set("access_token", args.accessToken);
  try {
    const { body, requestId, usage } = await providerRequest(url.toString());
    let parsed: PageInsightsResponse;
    try {
      parsed = JSON.parse(body) as PageInsightsResponse;
    } catch {
      throw new SocialProviderError("invalid_response", false, requestId);
    }
    if (!Array.isArray(parsed.data)) {
      throw new SocialProviderError("invalid_response", false, requestId);
    }
    return {
      value: readMetricValue(parsed.data[0]),
      errorCode: null,
      requestId,
      usage,
    };
  } catch (err) {
    if (isSocialProviderError(err)) {
      return {
        value: null,
        errorCode: err.code,
        requestId: err.requestId,
        usage: { app: null, business: null },
      };
    }
    // providerRequest normally normalizes transport failures, but keep
    // the per-metric contract total so one unexpected failure cannot
    // discard successful sibling metrics.
    return {
      value: null,
      errorCode: "provider_unavailable",
      requestId: null,
      usage: { app: null, business: null },
    };
  }
}

const MEDIA_INSIGHTS_METRICS = ["views", "reach", "saved", "shares", "total_interactions"] as const;
const FACEBOOK_POST_INSIGHTS_METRICS = ["post_media_view", "post_total_media_view_unique"] as const;

/**
 * Read-only setup probe for the first owned Instagram media item. This is
 * deliberately not part of the normal sync path: it proves which post-level
 * metrics this token/app/version can read before we add durable observations.
 */
export async function probeMetaRecentInstagramMediaInsights(args: {
  accessToken: string;
  igUserId: string;
  apiVersion: string;
}): Promise<MetaMediaInsightProbe> {
  const apiVersion = resolveGraphVersion(args.apiVersion);
  const mediaUrl = new URL(`${graphBaseUrl(apiVersion)}/${args.igUserId}/media`);
  mediaUrl.searchParams.set("fields", "id,media_type,media_product_type,timestamp,permalink");
  mediaUrl.searchParams.set("limit", "1");
  mediaUrl.searchParams.set("access_token", args.accessToken);

  try {
    const { body, requestId } = await providerRequest(mediaUrl.toString());
    const parsed = JSON.parse(body) as {
      data?: Array<{
        id?: unknown;
        media_type?: unknown;
        media_product_type?: unknown;
        timestamp?: unknown;
        permalink?: unknown;
      }>;
    };
    const media = parsed.data?.[0];
    if (!media || typeof media.id !== "string") {
      return {
        status: "no_media",
        mediaId: null,
        mediaType: null,
        mediaProductType: null,
        publishedAt: null,
        permalink: null,
        metrics: {},
        providerApiVersion: apiVersion,
        providerRequestId: requestId,
      };
    }

    const metricResults = await Promise.all(
      MEDIA_INSIGHTS_METRICS.map(async (metricName) => {
        const result = await fetchMetaInsightsMetric({
          baseUrl: `${graphBaseUrl(apiVersion)}/${media.id}/insights`,
          accessToken: args.accessToken,
          metricName,
        });
        const status: MetaMediaInsightMetricStatus =
          typeof result.value === "number"
            ? {
                status: "available",
                value: result.value,
                ...(result.requestId ? { providerRequestId: result.requestId } : {}),
              }
            : result.errorCode === "metric_unavailable"
              ? { status: "unsupported", providerErrorCode: result.errorCode }
              : result.errorCode
                ? {
                    status: "error",
                    providerErrorCode: result.errorCode,
                    ...(result.requestId ? { providerRequestId: result.requestId } : {}),
                  }
                : { status: "no_data" };
        return [metricName, status] as const;
      }),
    );

    return {
      status: "available",
      mediaId: media.id,
      mediaType: typeof media.media_type === "string" ? media.media_type : null,
      mediaProductType:
        typeof media.media_product_type === "string" ? media.media_product_type : null,
      publishedAt: typeof media.timestamp === "string" ? media.timestamp : null,
      permalink:
        typeof media.permalink === "string" && media.permalink.startsWith("https://")
          ? media.permalink
          : null,
      metrics: Object.fromEntries(metricResults),
      providerApiVersion: apiVersion,
      providerRequestId: requestId,
    };
  } catch (error) {
    return {
      status: "error",
      mediaId: null,
      mediaType: null,
      mediaProductType: null,
      publishedAt: null,
      permalink: null,
      metrics: {},
      providerApiVersion: apiVersion,
      providerRequestId: isSocialProviderError(error) ? error.requestId : null,
      providerErrorCode: isSocialProviderError(error) ? error.code : "provider_unavailable",
    };
  }
}

/**
 * Read-only capability probe for one owned Facebook Page post. Meta retired
 * the legacy post-impression metrics in Graph API v25; keep the replacement
 * viewer metrics opt-in until a real Page proves the response and permissions.
 */
export async function probeMetaRecentFacebookPagePostInsights(args: {
  accessToken: string;
  pageId: string;
  apiVersion: string;
}): Promise<MetaMediaInsightProbe> {
  const apiVersion = resolveGraphVersion(args.apiVersion);
  const feedUrl = new URL(`${graphBaseUrl(apiVersion)}/${args.pageId}/feed`);
  feedUrl.searchParams.set(
    "fields",
    "id,status_type,created_time,permalink_url,attachments{media_type}",
  );
  feedUrl.searchParams.set("limit", "1");
  feedUrl.searchParams.set("access_token", args.accessToken);

  try {
    const { body, requestId } = await providerRequest(feedUrl.toString());
    const parsed = JSON.parse(body) as {
      data?: Array<{
        id?: unknown;
        status_type?: unknown;
        created_time?: unknown;
        permalink_url?: unknown;
        attachments?: { data?: Array<{ media_type?: unknown }> };
      }>;
    };
    const post = parsed.data?.[0];
    if (!post || typeof post.id !== "string") {
      return {
        status: "no_media",
        mediaId: null,
        mediaType: null,
        mediaProductType: null,
        publishedAt: null,
        permalink: null,
        metrics: {},
        providerApiVersion: apiVersion,
        providerRequestId: requestId,
      };
    }

    const metricResults = await Promise.all(
      FACEBOOK_POST_INSIGHTS_METRICS.map(async (metricName) => {
        const result = await fetchMetaInsightsMetric({
          baseUrl: `${graphBaseUrl(apiVersion)}/${post.id}/insights`,
          accessToken: args.accessToken,
          metricName,
          period: "lifetime",
        });
        const status: MetaMediaInsightMetricStatus =
          typeof result.value === "number"
            ? {
                status: "available",
                value: result.value,
                ...(result.requestId ? { providerRequestId: result.requestId } : {}),
              }
            : result.errorCode === "metric_unavailable"
              ? { status: "unsupported", providerErrorCode: result.errorCode }
              : result.errorCode
                ? {
                    status: "error",
                    providerErrorCode: result.errorCode,
                    ...(result.requestId ? { providerRequestId: result.requestId } : {}),
                  }
                : { status: "no_data" };
        return [metricName, status] as const;
      }),
    );

    return {
      status: "available",
      mediaId: post.id,
      mediaType:
        typeof post.attachments?.data?.[0]?.media_type === "string"
          ? post.attachments.data[0].media_type
          : typeof post.status_type === "string"
            ? post.status_type
            : null,
      mediaProductType: null,
      publishedAt: typeof post.created_time === "string" ? post.created_time : null,
      permalink:
        typeof post.permalink_url === "string" && post.permalink_url.startsWith("https://")
          ? post.permalink_url
          : null,
      metrics: Object.fromEntries(metricResults),
      providerApiVersion: apiVersion,
      providerRequestId: requestId,
    };
  } catch (error) {
    return {
      status: "error",
      mediaId: null,
      mediaType: null,
      mediaProductType: null,
      publishedAt: null,
      permalink: null,
      metrics: {},
      providerApiVersion: apiVersion,
      providerRequestId: isSocialProviderError(error) ? error.requestId : null,
      providerErrorCode: isSocialProviderError(error) ? error.code : "provider_unavailable",
    };
  }
}

const POST_OBSERVATION_LIMIT = 10;

function postMetricStatus(
  result: Awaited<ReturnType<typeof fetchMetaInsightsMetric>>,
): MetricStatus {
  if (typeof result.value === "number") return { status: "available" };
  if (result.errorCode === "metric_unavailable") {
    return { status: "unsupported", providerErrorCode: result.errorCode };
  }
  if (result.errorCode) {
    return {
      status: "error",
      providerErrorCode: result.errorCode,
      ...(result.requestId ? { providerRequestId: result.requestId } : {}),
    };
  }
  return { status: "no_data" };
}

/**
 * Collect a bounded set of Instagram post observations from the media
 * expansion already used by the account snapshot. The same read-only metrics
 * proven by the setup probe are copied into the provider-neutral observation;
 * unsupported metrics stay nullable and never fail the account snapshot.
 */
async function fetchMetaInstagramPostObservations(args: {
  media: IgMediaSummary[];
  accessToken: string;
  apiVersion: string;
  observedAt: Date;
}): Promise<SocialPostObservation[]> {
  const media = args.media.slice(0, POST_OBSERVATION_LIMIT);
  const observations = await Promise.all(
    media.map(async (item) => {
      const candidate = normalizeMetaPublication("instagram", {
        id: item.id,
        permalink: item.permalink,
        timestamp: item.timestamp,
        media_type: item.media_type,
        media_product_type: item.media_product_type,
      });
      const results = await Promise.all(
        MEDIA_INSIGHTS_METRICS.map(async (metricName) => ({
          metricName,
          result: await fetchMetaInsightsMetric({
            baseUrl: `${graphBaseUrl(args.apiVersion)}/${item.id}/insights`,
            accessToken: args.accessToken,
            metricName,
          }),
        })),
      );
      const resultFor = (metricName: (typeof MEDIA_INSIGHTS_METRICS)[number]) =>
        results.find((entry) => entry.metricName === metricName)!.result;
      const viewsResult = resultFor("views");
      const reachResult = resultFor("reach");
      const savedResult = resultFor("saved");
      const sharesResult = resultFor("shares");
      const interactionsResult = resultFor("total_interactions");
      const likes = typeof item.like_count === "number" ? item.like_count : null;
      const comments = typeof item.comments_count === "number" ? item.comments_count : null;
      const fallbackInteractions =
        likes !== null || comments !== null ? (likes ?? 0) + (comments ?? 0) : null;
      const metricStatuses = {
        views: postMetricStatus(viewsResult),
        reach: postMetricStatus(reachResult),
        interactions: postMetricStatus(interactionsResult),
      } satisfies SocialSourceMetadata["metricStatuses"];
      const sourceMetadata: SocialSourceMetadata = {
        schemaVersion: 1,
        metricStatuses,
        ...(viewsResult.value === null ? { partial: true, reason: "post_views_unavailable" } : {}),
      };
      return {
        provider: "meta",
        externalPostId: item.id,
        permalink: candidate.permalink,
        publishedAt: candidate.publishedAt ?? candidate.createdAt,
        mediaType: candidate.mediaType,
        mediaProductType: item.media_product_type ?? null,
        durationSeconds: typeof item.video_duration === "number" ? item.video_duration : null,
        views: viewsResult.value,
        reach: reachResult.value,
        likes,
        comments,
        saved: savedResult.value,
        shares: sharesResult.value,
        interactions: interactionsResult.value ?? fallbackInteractions,
        observedAt: args.observedAt,
        providerApiVersion: args.apiVersion,
        providerRequestId: viewsResult.requestId,
        sourceMetadata,
      } satisfies SocialPostObservation;
    }),
  );
  return observations;
}

type FacebookFeedPostSummary = {
  id?: unknown;
  created_time?: unknown;
  permalink_url?: unknown;
  status_type?: unknown;
  attachments?: { data?: Array<{ media_type?: unknown }> };
  reactions?: { summary?: { total_count?: unknown } };
  comments?: { summary?: { total_count?: unknown } };
  shares?: { count?: unknown };
};

function countValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Collect a bounded, metadata-only Facebook Page feed. The content body is
 * intentionally never persisted; only the source pointer, type, timestamp,
 * and aggregate engagement counts enter the provider-neutral observation row.
 */
async function fetchMetaFacebookPostObservations(args: {
  pageId: string;
  accessToken: string;
  apiVersion: string;
  observedAt: Date;
}): Promise<SocialPostObservation[]> {
  const url = new URL(`${graphBaseUrl(args.apiVersion)}/${args.pageId}/feed`);
  url.searchParams.set(
    "fields",
    "id,created_time,permalink_url,status_type,attachments{media_type},reactions.limit(0).summary(true),comments.limit(0).summary(true),shares",
  );
  url.searchParams.set("limit", String(POST_OBSERVATION_LIMIT));
  url.searchParams.set("access_token", args.accessToken);
  const { body, requestId } = await providerRequest(url.toString());
  let parsed: { data?: FacebookFeedPostSummary[] };
  try {
    parsed = JSON.parse(body) as { data?: FacebookFeedPostSummary[] };
  } catch {
    throw new SocialProviderError("invalid_response", false, requestId);
  }
  if (!Array.isArray(parsed.data)) {
    throw new SocialProviderError("invalid_response", false, requestId);
  }

  return parsed.data.flatMap((item) => {
    if (typeof item.id !== "string") return [];
    let candidate;
    try {
      candidate = normalizeMetaPublication("facebook", {
        id: item.id,
        created_time: item.created_time,
        permalink_url: item.permalink_url,
        status_type: item.status_type,
        attachments: item.attachments,
      });
    } catch {
      return [];
    }
    const likes = countValue(item.reactions?.summary?.total_count);
    const comments = countValue(item.comments?.summary?.total_count);
    const shares = countValue(item.shares?.count);
    const interactions =
      likes !== null || comments !== null || shares !== null
        ? (likes ?? 0) + (comments ?? 0) + (shares ?? 0)
        : null;
    return [
      {
        provider: "meta",
        externalPostId: item.id,
        permalink: candidate.permalink,
        publishedAt: candidate.publishedAt ?? candidate.createdAt,
        mediaType: candidate.mediaType,
        mediaProductType: null,
        durationSeconds: null,
        views: null,
        reach: null,
        likes,
        comments,
        saved: null,
        shares,
        interactions,
        observedAt: args.observedAt,
        providerApiVersion: args.apiVersion,
        providerRequestId: requestId,
        sourceMetadata: {
          schemaVersion: 1,
          partial: true,
          reason: "facebook_post_insights_not_requested",
        },
      } satisfies SocialPostObservation,
    ];
  });
}

export async function fetchMetaFacebookPageSnapshot(args: {
  accessToken: string;
  pageId: string;
  apiVersion: string;
  requestIdHint: string;
}): Promise<MetaPageSnapshot> {
  const { accessToken, pageId, apiVersion, requestIdHint } = args;
  const fields = "id,fan_count,followers_count";
  const url = new URL(`${graphBaseUrl(apiVersion)}/${pageId}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const { body, requestId, usage: basicFieldsUsage } = await providerRequest(url.toString());
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
  //
  // 2026-08-28: the previous shape was `.catch(() => null)` which
  // silently swallowed the real error code. The operator can no
  // longer diagnose why insights are missing (permission_denied vs
  // invalid_response vs network). The error is now triply visible:
  // Sentry (captureError), stdout JSON line (logError), and the
  // saved row's sourceMetadata (visible in the analytics page's
  // "partial" cell + any DB query). Operators without Sentry
  // access can grep the container log or query the row directly.
  let insights: MetaDailyInsights = {
    reach: null,
    views: null,
    engagedAccounts: null,
    interactions: null,
  };
  let insightsErrorCode: string | null = null;
  let insightsErrorRequestId: string | null = null;
  // 2026-08-28: capture the per-call rate-limit usage from the most
  // recent providerRequest. We surface it on the saved row so a DB
  // query (or the future rate-limit dashboard) can see which
  // channels contributed to the cumulative app/business quota.
  let latestUsage: MetaRateLimitUsage = { app: null, business: null };
  // 2026-09-02 (Rice n Spices fix): the inner helper now isolates
  // per-metric failures and returns a `partial: true` insights
  // object plus an `errors[]` array for the metrics Meta would not
  // serve. The outer try/catch now only sees network / 5xx /
  // `invalid_response` errors that the inner helper decided were
  // not safe to swallow. The `not_configured` and
  // `permission_denied` cases the old code special-cased here are
  // already inside `insightsResult.errors`.
  let insightsResultErrors: MetaInsightsError[] = [];
  try {
    const insightsResult = await fetchMetaPageDailyInsights({
      accessToken,
      pageId,
      apiVersion,
    });
    insights = insightsResult.insights;
    latestUsage = insightsResult.usage;
    insightsResultErrors = insightsResult.errors;
  } catch (insightsErr) {
    const code = isSocialProviderError(insightsErr) ? insightsErr.code : "unknown";
    insightsErrorCode = code;
    insightsErrorRequestId = isSocialProviderError(insightsErr) ? insightsErr.requestId : null;
    logError("social.meta.page_insights_failed", {
      pageId,
      accessTokenLast4: accessToken.slice(-4),
      errorCode: code,
      requestId: insightsErrorRequestId,
    });
    captureError("social.meta.page_insights_failed", insightsErr, {
      pageId,
      accessTokenLast4: accessToken.slice(-4),
      errorCode: code,
      requestId: insightsErrorRequestId,
    });
    throw insightsErr;
  }
  // Blocking per-metric failures are logged + Sentry'd. The accepted
  // capability gap is only a warning so it does not create error noise.
  for (const e of insightsResultErrors) {
    const context = {
      pageId,
      accessTokenLast4: accessToken.slice(-4),
      metric: e.metric,
      errorCode: e.code,
      requestId: e.requestId,
    };
    if (e.code === "metric_unavailable") {
      logWarn("social.meta.page_insights_metric_unsupported", context);
      continue;
    }
    logError("social.meta.page_insights_metric_failed", {
      ...context,
    });
    captureError(
      "social.meta.page_insights_metric_failed",
      new Error(`Meta insights metric "${e.metric}" returned ${e.code}`),
      context,
    );
  }
  if (insightsResultErrors.length > 0) {
    // `metric_unavailable` is a non-retryable capability gap, not a
    // channel-level provider failure. Keep it on the metric status so
    // the row remains visibly partial without making the channel look
    // degraded or scheduling pointless retries.
    const firstBlockingError = insightsResultErrors.find(
      (error) => error.code !== "metric_unavailable",
    );
    if (firstBlockingError) {
      insightsErrorCode = firstBlockingError.code;
      insightsErrorRequestId = firstBlockingError.requestId;
    }
  }
  // The `partial` flag is set when ANY field the worker tried to
  // capture is null. Pre-2026-08-28 the flag was set only when the
  // follower was null, which made the analytics page's "partial"
  // pill invisible in the common case where insights are missing
  // but the follower is captured. The page-level insights call
  // frequently returns null for brand-new pages or for pages whose
  // access token is missing a scope, and the operator needs to see
  // that. 2026-09-02: `insights` is no longer nullable — every field
  // is individually nullable, so the `insights === null` branch
  // is gone.
  const insightsPartial =
    insights.reach === null || insights.views === null || insights.interactions === null;
  const metricStatuses = {
    followerCount: {
      status: follower === null ? "no_data" : "available",
    } satisfies MetricStatus,
    reach: statusForInsight("reach", insights.reach, insightsResultErrors),
    views: statusForInsight("views", insights.views, insightsResultErrors),
    interactions: statusForInsight("interactions", insights.interactions, insightsResultErrors),
    engagedAccounts: { status: "unsupported" },
  } satisfies SocialSourceMetadata["metricStatuses"];
  const failedMetrics = (["followerCount", "reach", "views", "interactions"] as const).filter(
    (metric) => metricStatuses[metric]?.status !== "available",
  ) as SocialMetric[];
  const sourceMetadata: SocialSourceMetadata = {
    partial: follower === null || insightsPartial,
    metricStatuses,
    ...(failedMetrics.length > 0 ? { failedMetrics } : {}),
  };
  if (follower === null && !insightsPartial) {
    sourceMetadata.reason = "fan_count_unavailable";
  } else if (insightsPartial) {
    sourceMetadata.reason = "page_insights_unavailable";
    if (insightsErrorCode) {
      // Surface blocking provider codes in the saved row so a DB
      // query shows why the insights are null. For Sentry-less
      // operators, this is the fastest diagnostic. A
      // `metric_unavailable` capability gap is kept at metric level
      // instead of being promoted to a channel error below.
      // 2026-09-02: the code is the first blocking metric's
      // errorCode, NOT an aggregation of all per-metric failures.
      // `metric_unavailable` is intentionally omitted here because
      // it is already represented as `unsupported` on that metric.
      // Operators who want the full list of unavailable metrics read
      // `failedMetrics` and `metricStatuses` below.
      sourceMetadata.providerErrorCode = insightsErrorCode;
      if (insightsErrorRequestId) {
        sourceMetadata.providerRequestId = insightsErrorRequestId;
      }
    }
  }
  // 2026-08-28: surface rate-limit usage from the most recent
  // successful call so the cron worker can drive proactive
  // backoff and a future dashboard can show per-channel
  // contributions. Prefer the insights call's usage (most
  // recent) over the basic-fields call's usage; fall back to
  // the basic-fields usage if insights never ran.
  writeRateLimitUsage(sourceMetadata, latestUsage, basicFieldsUsage);
  const observedAt = new Date();
  let postObservations: SocialPostObservation[] = [];
  try {
    postObservations = await fetchMetaFacebookPostObservations({
      pageId,
      accessToken,
      apiVersion,
      observedAt,
    });
  } catch (postError) {
    const code = isSocialProviderError(postError) ? postError.code : "provider_unavailable";
    logError("social.meta.facebook_post_observations_failed", {
      pageId,
      accessTokenLast4: accessToken.slice(-4),
      errorCode: code,
      requestId: isSocialProviderError(postError) ? postError.requestId : null,
    });
  }
  const hash = hashSnapshot([
    apiVersion,
    requestIdHint,
    pageId,
    follower,
    insights.reach ?? null,
    insights.views ?? null,
  ]);
  return {
    observedAt,
    followerCount: follower,
    followingCount: null,
    mediaCount: null,
    likesCount: null,
    reach: insights.reach ?? null,
    views: insights.views ?? null,
    engagedAccounts: insights.engagedAccounts ?? null,
    interactions: insights.interactions ?? null,
    providerApiVersion: apiVersion,
    providerRequestId: requestId,
    responseHash: hash,
    sourceMetadata,
    ...(postObservations.length > 0 ? { postObservations } : {}),
  };
}

export type MetaInsightsError = {
  metric: "reach" | "views" | "engagedAccounts" | "interactions";
  code: SocialProviderError["code"];
  requestId: string | null;
};

export type MetaDailyInsights = {
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
};

export type FetchMetaInsightsResult = {
  insights: MetaDailyInsights;
  errors: MetaInsightsError[];
  usage: MetaRateLimitUsage;
};

function statusForInsight(
  metric: MetaInsightsError["metric"],
  value: number | null,
  errors: readonly MetaInsightsError[],
): MetricStatus {
  const error = errors.find((candidate) => candidate.metric === metric);
  if (error) {
    if (error.code === "metric_unavailable") {
      return {
        status: "unsupported",
        providerErrorCode: error.code,
        ...(error.requestId ? { providerRequestId: error.requestId } : {}),
      };
    }
    return {
      status: "error",
      providerErrorCode: error.code,
      ...(error.requestId ? { providerRequestId: error.requestId } : {}),
    };
  }
  return { status: value === null ? "no_data" : "available" };
}

const PAGE_INSIGHTS_METRICS = [
  // Meta deprecated `page_impressions_unique` above Graph API v25.
  // `page_total_media_view_unique` is the current Page-level unique
  // viewer replacement; `page_views_total` is the current profile
  // view metric. Keep our normalized fields stable for the dashboard.
  { name: "page_total_media_view_unique", field: "reach" as const },
  { name: "page_views_total", field: "views" as const },
  { name: "page_post_engagements", field: "interactions" as const },
] as const;

export async function fetchMetaPageDailyInsights(args: {
  accessToken: string;
  pageId: string;
  apiVersion: string;
}): Promise<FetchMetaInsightsResult> {
  const baseUrl = `${graphBaseUrl(args.apiVersion)}/${args.pageId}/insights`;
  // 2026-09-02 (Rice n Spices fix): request each Page metric in its
  // own URL so a single bad metric name (Meta `error.code: 100`,
  // "value must be a valid insights metric") only nulls that one
  // field. The previous all-in-one URL (`metric=reach,views,interactions`)
  // made the whole request fail when any one of them was missing
  // from the Page's allowlist, so the row's reach/views/interactions
  // went null together even though Meta was happy to serve the
  // other two. `engagedAccounts` is not requested for Pages — see
  // `metaAdapter.fetchDailySnapshot` notes for the rationale (Page
  // has no direct equivalent of IG's `accounts_engaged`).
  const results = await Promise.all(
    PAGE_INSIGHTS_METRICS.map(async (m) => {
      const r = await fetchMetaInsightsMetric({
        baseUrl,
        accessToken: args.accessToken,
        metricName: m.name,
      });
      return { field: m.field, ...r };
    }),
  );
  const insights: MetaDailyInsights = {
    reach: null,
    views: null,
    engagedAccounts: null,
    interactions: null,
  };
  const errors: MetaInsightsError[] = [];
  let latestUsage: MetaRateLimitUsage = { app: null, business: null };
  for (const r of results) {
    insights[r.field] = r.value;
    if (r.errorCode) {
      errors.push({ metric: r.field, code: r.errorCode, requestId: r.requestId });
    }
    if (r.usage.app || r.usage.business) {
      latestUsage = r.usage;
    }
  }
  return { insights, errors, usage: latestUsage };
}

export async function fetchMetaInstagramSnapshot(args: {
  accessToken: string;
  igUserId: string;
  apiVersion: string;
  requestIdHint: string;
}): Promise<MetaPageSnapshot> {
  const { accessToken, igUserId, apiVersion, requestIdHint } = args;
  const url = new URL(`${graphBaseUrl(apiVersion)}/${igUserId}`);
  // Fetch the 10 most recent media objects as part of the account call;
  // the bounded post-observation fan-out below uses this same response.
  url.searchParams.set(
    "fields",
    "followers_count,media_count,follows_count,username,name,media.limit(10){id,like_count,comments_count,permalink,timestamp,media_type,media_product_type,video_duration}",
  );
  url.searchParams.set("access_token", accessToken);
  const { body, requestId, usage: basicFieldsUsage } = await providerRequest(url.toString());
  let parsed: IgBusinessResponse;
  try {
    parsed = JSON.parse(body) as IgBusinessResponse;
  } catch {
    throw new SocialProviderError("invalid_response", false, requestId);
  }
  const follower = typeof parsed.followers_count === "number" ? parsed.followers_count : null;
  const media = typeof parsed.media_count === "number" ? parsed.media_count : null;
  const following = typeof parsed.follows_count === "number" ? parsed.follows_count : null;
  // Keep the latest-post fields in source metadata for backwards-compatible
  // diagnostics; durable post observations are stored separately below.
  const latestPost = parsed.media?.data?.[0] ?? null;
  // Account-level daily insights: views, reach, engaged accounts,
  // interactions. Empty datasets are `null`, never `0`.
  // 2026-08-28: same triply-visible error handling as the Page
  // branch (Sentry + stdout JSON + sourceMetadata in the row).
  let insights: MetaDailyInsights = {
    reach: null,
    views: null,
    engagedAccounts: null,
    interactions: null,
  };
  let insightsErrorCode: string | null = null;
  let insightsErrorRequestId: string | null = null;
  // 2026-08-28: capture the per-call rate-limit usage; same logic
  // as the Page branch. The IG basic+insights pair runs at most
  // 2 calls per snapshot.
  let latestUsage: MetaRateLimitUsage = { app: null, business: null };
  // 2026-09-02 (Rice n Spices / Just Halal tr fix): mirror of the
  // Page branch. The inner helper isolates per-metric failures and
  // returns a partial insights object plus an errors[] array. The
  // outer try/catch only sees network / 5xx / `invalid_response`
  // errors that are not safe to swallow.
  let insightsResultErrors: MetaInsightsError[] = [];
  try {
    const igResult = await fetchMetaIgAccountDailyInsights({
      accessToken,
      igUserId,
      apiVersion,
    });
    insights = igResult.insights;
    latestUsage = igResult.usage;
    insightsResultErrors = igResult.errors;
  } catch (insightsErr) {
    const code = isSocialProviderError(insightsErr) ? insightsErr.code : "unknown";
    insightsErrorCode = code;
    insightsErrorRequestId = isSocialProviderError(insightsErr) ? insightsErr.requestId : null;
    logError("social.meta.ig_insights_failed", {
      igUserId,
      accessTokenLast4: accessToken.slice(-4),
      errorCode: code,
      requestId: insightsErrorRequestId,
    });
    captureError("social.meta.ig_insights_failed", insightsErr, {
      igUserId,
      accessTokenLast4: accessToken.slice(-4),
      errorCode: code,
      requestId: insightsErrorRequestId,
    });
    throw insightsErr;
  }
  // Triply visible per-metric failures from the inner helper.
  for (const e of insightsResultErrors) {
    logError("social.meta.ig_insights_metric_failed", {
      igUserId,
      accessTokenLast4: accessToken.slice(-4),
      metric: e.metric,
      errorCode: e.code,
      requestId: e.requestId,
    });
    captureError(
      "social.meta.ig_insights_metric_failed",
      new Error(`Meta insights metric "${e.metric}" returned ${e.code}`),
      {
        igUserId,
        accessTokenLast4: accessToken.slice(-4),
        metric: e.metric,
        errorCode: e.code,
        requestId: e.requestId,
      },
    );
  }
  if (insightsResultErrors.length > 0) {
    const first = insightsResultErrors[0]!;
    insightsErrorCode = first.code;
    insightsErrorRequestId = first.requestId;
  }
  // Same partial-flag rule as the Page branch: ANY null field
  // makes the row partial, not just the follower. 2026-09-02:
  // `insights` is no longer nullable.
  const insightsPartial =
    insights.reach === null ||
    insights.views === null ||
    insights.engagedAccounts === null ||
    insights.interactions === null;
  const metricStatuses = {
    followerCount: {
      status: follower === null ? "no_data" : "available",
    } satisfies MetricStatus,
    reach: statusForInsight("reach", insights.reach, insightsResultErrors),
    views: statusForInsight("views", insights.views, insightsResultErrors),
    engagedAccounts: statusForInsight(
      "engagedAccounts",
      insights.engagedAccounts,
      insightsResultErrors,
    ),
    interactions: statusForInsight("interactions", insights.interactions, insightsResultErrors),
  } satisfies SocialSourceMetadata["metricStatuses"];
  const failedMetrics = (
    ["followerCount", "reach", "views", "engagedAccounts", "interactions"] as const
  ).filter((metric) => metricStatuses[metric]?.status !== "available") as SocialMetric[];
  const sourceMetadata: SocialSourceMetadata = {
    partial: follower === null || insightsPartial,
    metricStatuses,
    ...(failedMetrics.length > 0 ? { failedMetrics } : {}),
  };
  if (follower === null && !insightsPartial) {
    sourceMetadata.reason = "below_provider_threshold";
  } else if (insightsPartial) {
    sourceMetadata.reason = "ig_insights_unavailable";
    if (insightsErrorCode) {
      // Mirror the Page branch: surface the actual provider error
      // in the saved row so a DB query reveals why the IG
      // insights are null without needing Sentry.
      sourceMetadata.providerErrorCode = insightsErrorCode;
      if (insightsErrorRequestId) {
        sourceMetadata.providerRequestId = insightsErrorRequestId;
      }
    }
  }
  // 2026-08-28: surface rate-limit usage from the most recent
  // successful call so the cron worker can drive proactive
  // backoff and a future dashboard can show per-channel
  // contributions. Same logic as the Page branch: prefer the
  // insights call's usage, fall back to the basic-fields usage
  // if insights never ran.
  writeRateLimitUsage(sourceMetadata, latestUsage, basicFieldsUsage);
  if (latestPost) {
    sourceMetadata.latestPostId = latestPost.id;
    if (typeof latestPost.like_count === "number") {
      sourceMetadata.latestPostLikeCount = latestPost.like_count;
    }
    if (typeof latestPost.comments_count === "number") {
      sourceMetadata.latestPostCommentCount = latestPost.comments_count;
    }
  }
  const observedAt = new Date();
  let postObservations: SocialPostObservation[] = [];
  if (parsed.media?.data?.length) {
    // ponytail: bounded 10-post fan-out; move older media to a queued
    // backfill job if rate-limit usage or account coverage requires it.
    try {
      postObservations = await fetchMetaInstagramPostObservations({
        media: parsed.media.data,
        accessToken,
        apiVersion,
        observedAt,
      });
    } catch (postError) {
      const code = isSocialProviderError(postError) ? postError.code : "provider_unavailable";
      logError("social.meta.post_observations_failed", {
        igUserId,
        accessTokenLast4: accessToken.slice(-4),
        errorCode: code,
        requestId: isSocialProviderError(postError) ? postError.requestId : null,
      });
    }
  }
  const hash = hashSnapshot([
    apiVersion,
    requestIdHint,
    igUserId,
    follower,
    media,
    following,
    insights.views ?? null,
    insights.reach ?? null,
    insights.engagedAccounts ?? null,
    insights.interactions ?? null,
  ]);
  return {
    observedAt,
    followerCount: follower,
    followingCount: following,
    mediaCount: media,
    likesCount: null,
    reach: insights.reach ?? null,
    views: insights.views ?? null,
    engagedAccounts: insights.engagedAccounts ?? null,
    interactions: insights.interactions ?? null,
    providerApiVersion: apiVersion,
    providerRequestId: requestId,
    responseHash: hash,
    sourceMetadata,
    ...(postObservations.length > 0 ? { postObservations } : {}),
  };
}

const IG_INSIGHTS_METRICS = [
  { name: "reach", field: "reach" as const },
  { name: "profile_views", field: "views" as const },
  { name: "accounts_engaged", field: "engagedAccounts" as const },
  { name: "total_interactions", field: "interactions" as const },
] as const;

export async function fetchMetaIgAccountDailyInsights(args: {
  accessToken: string;
  igUserId: string;
  apiVersion: string;
}): Promise<FetchMetaInsightsResult> {
  const baseUrl = `${graphBaseUrl(args.apiVersion)}/${args.igUserId}/insights`;
  // 2026-09-02 (Rice n Spices / Just Halal tr fix): per-metric calls
  // (parallel `Promise.all`) for the same reason as the Page branch.
  // The previous all-in-one URL meant a single bad metric name
  // nulled the whole row, so the analytics page's partial-pill
  // hid the fact that 3 of 4 metrics were actually available.
  // `metric_type=total_value` is required for `profile_views`,
  // `accounts_engaged`, and `total_interactions` (daily total
  // metrics, not time-series). `reach` accepts either shape, so
  // setting it globally is safe and matches the API docs. The
  // helper `fetchMetaInsightsMetric` always sets it.
  const results = await Promise.all(
    IG_INSIGHTS_METRICS.map(async (m) => {
      const r = await fetchMetaInsightsMetric({
        baseUrl,
        accessToken: args.accessToken,
        metricName: m.name,
      });
      return { field: m.field, ...r };
    }),
  );
  const insights: MetaDailyInsights = {
    reach: null,
    views: null,
    engagedAccounts: null,
    interactions: null,
  };
  const errors: MetaInsightsError[] = [];
  let latestUsage: MetaRateLimitUsage = { app: null, business: null };
  for (const r of results) {
    insights[r.field] = r.value;
    if (r.errorCode) {
      errors.push({ metric: r.field, code: r.errorCode, requestId: r.requestId });
    }
    if (r.usage.app || r.usage.business) {
      latestUsage = r.usage;
    }
  }
  return { insights, errors, usage: latestUsage };
}

// ─── Adapter ──────────────────────────────────────────────────────────────

/**
 * Module-level cache of page access tokens acquired at sync time from
 * the user access token. Page access tokens don't expire (the user
 * can revoke them server-side, but the lifetime is effectively
 * permanent for our use case). Caching avoids a 1-extra-Meta-API-call
 * per page per cron tick.
 *
 * Key shape: `pageId → { token, expires }`. `expires` is set to
 * `Number.MAX_SAFE_INTEGER` (effectively never) because page tokens
 * don't have a known TTL. If Meta ever returns a TTL we can switch
 * to honoring it; until then the cache only resets on process restart
 * or on an auth_expired 401 from Meta.
 */
const pageAccessTokenCache = new Map<string, { token: string; expires: number }>();

/**
 * Acquire a Page access token from the user access token. The
 * `/<page-id>?fields=access_token&access_token=<user_token>` endpoint
 * returns a long-lived page access token when the user manages the
 * page. This is the workaround for legacy Meta connections where
 * the OAuth flow did not persist per-page access tokens in
 * `credentials.profileAccessTokens` (pre-discoverMetaPages refactor
 * or connections created via a different code path).
 *
 * 2026-08-28: Added because the Food Game Facebook channel was
 * failing with `(#190) This method must be called with a Page
 * Access Token` — the connection's `accessToken` is a long-lived
 * user token, and the stored `profileAccessTokens[pageId]` was
 * empty (legacy connection). Without this helper, every page
 * snapshot call would either fail (current code) or require the
 * user to disconnect + reconnect (the alternative, which loses
 * historical metrics).
 */
async function acquirePageAccessToken(
  credentials: SocialCredentials,
  pageId: string,
  apiVersion: string,
): Promise<string> {
  // 1. Honor the static map first (the modern OAuth path stores
  //    per-page tokens here during the connect flow).
  const stored = credentials.profileAccessTokens?.[pageId];
  if (stored) return stored;

  // 2. Honor the in-process cache to avoid the extra Meta call on
  //    every snapshot.
  const cached = pageAccessTokenCache.get(pageId);
  if (cached && cached.expires > Date.now()) return cached.token;

  // 3. Acquire a fresh page access token from the user token.
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
    // Meta returned 200 but no `access_token` — the user does not
    // manage this page on this app. Treat as permission_denied so
    // the outer code can write a clear `providerErrorCode`.
    throw new SocialProviderError("permission_denied", false, null);
  }
  pageAccessTokenCache.set(pageId, {
    token: parsed.access_token,
    expires: Number.MAX_SAFE_INTEGER,
  });
  return parsed.access_token;
}

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
      ...(appCredentials.graphApiVersion !== undefined
        ? { graphApiVersion: appCredentials.graphApiVersion }
        : {}),
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
      ...(appCredentials.graphApiVersion !== undefined
        ? { graphApiVersion: appCredentials.graphApiVersion }
        : {}),
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
    //
    // 2026-08-28: For Facebook Page channels, the user access token
    // (the one stored in `credentials.accessToken`) is NOT enough
    // for page-level calls — Meta returns `(#190) This method must
    // be called with a Page Access Token`. We try the per-page
    // token in `credentials.profileAccessTokens[pageId]` first
    // (set by the modern OAuth flow), then fall back to acquiring
    // one at call time from the user token (the legacy-connection
    // workaround). For Instagram, the user token is enough — IG
    // business-account calls accept the user's long-lived token.
    const apiVersion = resolveGraphVersion(appCredentials.graphApiVersion);
    const requestIdHint = createHash("sha256")
      .update(`${profile.providerAccountId}:${apiVersion}:${Date.now()}`)
      .digest("hex")
      .slice(0, 16);
    if (profile.platform === "facebook") {
      const accessToken = await acquirePageAccessToken(
        credentials,
        profile.providerAccountId,
        apiVersion,
      );
      return fetchMetaFacebookPageSnapshot({
        accessToken,
        pageId: profile.providerAccountId,
        apiVersion,
        requestIdHint,
      });
    }
    if (profile.platform === "instagram") {
      // IG business-account endpoints accept the user long-lived
      // token directly (no Page-token exchange needed). The
      // profileAccessTokens map is still useful as a per-IG-account
      // override (set by the OAuth picker when the user picks an
      // IG account from a non-default Page).
      const accessToken =
        credentials.profileAccessTokens?.[profile.providerAccountId] ?? credentials.accessToken;
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
