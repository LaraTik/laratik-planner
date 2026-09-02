import "server-only";
import { createHash } from "node:crypto";
import {
  isSocialProviderError,
  providerRequest,
  SocialProviderError,
  type MetaRateLimitUsage,
} from "@/lib/social/http";
import { captureError } from "@/lib/observability/sentry";
import { logError } from "@/lib/observability/logger";
import type { SocialCredentials } from "@/lib/social/crypto";
import type {
  ConnectedProfile,
  RefreshedCredentials,
  SocialProviderAdapter,
  SocialSourceMetadata,
} from "@/lib/social/types";
import type { MetricStatus, SocialMetric } from "@/lib/social/metrics";

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

// Read-only scopes requested in the Facebook Login for Business
// dialog. The scope list is the contract for what the access token
// will be authorized to read; missing scopes show up as
// `permission_denied` errors at fetch time.
//
// `read_insights` was removed 2026-08-28: Meta deprecated it for
// new apps and rejects the dialog with `Invalid Scopes:
// read_insights` when the Login for Business config or the OAuth
// URL still includes it. The four remaining scopes cover every
// metric the social pipeline reads:
//   - `pages_show_list` + `pages_read_engagement` → Page metadata,
//     fan_count, page-level insights (impressions, reach, views,
//     post engagements)
//   - `instagram_basic` + `instagram_manage_insights` → IG business
//     account metadata, followers/media counts, and IG account
//     insights (reach, profile_views, accounts_engaged,
//     total_interactions)
//
// Pre-flight verification on the Food Game IG and Just Halal tr IG
// accounts (run on the same `pages_show_list` + `pages_read_engagement`
// + `instagram_basic` + `instagram_manage_insights` set) confirmed
// all four required endpoints return the expected shape; removing
// `read_insights` does not regress any data the pipeline reads.
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
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
  sourceMetadata: SocialSourceMetadata;
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
   * only need id + like/comment counts to seed a future
   * per-post engagement feature. Deeper fields (caption,
   * thumbnail, etc.) are fetched on demand from `/{media-id}`
   * or `/{media-id}/insights`.
   */
  media?: {
    data: Array<{
      id: string;
      like_count?: number;
      comments_count?: number;
      permalink?: string;
      timestamp?: string;
    }>;
  };
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
 * isolate the failure: a Page whose `page_views` is not in the
 * allowlist now still gets `reach` and `interactions` captured.
 */
async function fetchMetaInsightsMetric(args: {
  baseUrl: string;
  accessToken: string;
  metricName: string;
}): Promise<{
  value: number | null;
  errorCode: "not_configured" | "permission_denied" | null;
  requestId: string | null;
  usage: MetaRateLimitUsage;
}> {
  const url = new URL(args.baseUrl);
  url.searchParams.set("metric", args.metricName);
  url.searchParams.set("period", "day");
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
      if (err.code === "not_configured" || err.code === "permission_denied") {
        return {
          value: null,
          errorCode: err.code,
          requestId: err.requestId,
          usage: { app: null, business: null },
        };
      }
    }
    throw err;
  }
}

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
  // Triply visible per-metric failures from the inner helper. Each
  // failed metric is logged + Sentry'd so an operator can see which
  // specific metric is missing for this Page.
  for (const e of insightsResultErrors) {
    logError("social.meta.page_insights_metric_failed", {
      pageId,
      accessTokenLast4: accessToken.slice(-4),
      metric: e.metric,
      errorCode: e.code,
      requestId: e.requestId,
    });
    captureError(
      "social.meta.page_insights_metric_failed",
      new Error(`Meta insights metric "${e.metric}" returned ${e.code}`),
      {
        pageId,
        accessTokenLast4: accessToken.slice(-4),
        metric: e.metric,
        errorCode: e.code,
        requestId: e.requestId,
      },
    );
  }
  if (insightsResultErrors.length > 0) {
    // First failed metric wins for the row's `providerErrorCode` so
    // the existing UI / DB-query diagnostic path keeps working. The
    // full list of failed metrics is also surfaced as a comma-joined
    // string for operators who want all of them at a glance.
    const first = insightsResultErrors[0]!;
    insightsErrorCode = first.code;
    insightsErrorRequestId = first.requestId;
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
      // 2026-08-28: surface the actual error code in the saved
      // row so a DB query shows why the insights are null. For
      // Sentry-less operators, this is the fastest diagnostic —
      // see tests/unit/social-analytics.test.ts for the contract.
      // 2026-09-02: the code is now the first failed metric's
      // errorCode, NOT an aggregation of all per-metric failures.
      // Operators who want the full list of failed metrics read
      // `failedMetrics` below.
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
  };
}

export type MetaInsightsError = {
  metric: "reach" | "views" | "engagedAccounts" | "interactions";
  code: "not_configured" | "permission_denied";
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
    return {
      status: "error",
      providerErrorCode: error.code,
      ...(error.requestId ? { providerRequestId: error.requestId } : {}),
    };
  }
  return { status: value === null ? "no_data" : "available" };
}

const PAGE_INSIGHTS_METRICS = [
  { name: "page_impressions_unique", field: "reach" as const },
  { name: "page_views", field: "views" as const },
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
  // 2026-08-28: field-expand `media.limit(10){...}` onto the basic
  // call so the response carries the 10 most recent posts. This is
  // a future-proofing change — per-post engagement is out of scope
  // for M4, but when it lands the basic call will already return
  // the post list and we will only need a per-post
  // `/{media-id}/insights` call for posts first seen in the last
  // 24h. The Meta doc's "fan-out for new posts only" strategy
  // requires this expansion today to be a zero-cost upgrade later.
  // The expansion adds 0 calls now (we already call this endpoint);
  // it just widens the response shape. `media_count` is a
  // top-level field unaffected by the expansion.
  url.searchParams.set(
    "fields",
    "followers_count,media_count,follows_count,username,name,media.limit(10){id,like_count,comments_count,permalink,timestamp}",
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
  // 2026-08-28: the most recent post (if any) is now available
  // because of the field expansion. We surface the id + like/comment
  // counts on sourceMetadata so a future per-post job can read
  // them without an extra call. The snapshot's return shape is
  // unchanged — per-post engagement is still out of scope for M4.
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
    // Future-proofing: per-post engagement is out of scope for M4
    // (locked in grill-me round 1), but the field-expanded basic
    // call returns the most recent post. Surface its id + counts
    // on the row so a future per-post job can read them without
    // re-calling the API. Ignored by the analytics page for now.
    sourceMetadata.latestPostId = latestPost.id;
    if (typeof latestPost.like_count === "number") {
      sourceMetadata.latestPostLikeCount = latestPost.like_count;
    }
    if (typeof latestPost.comments_count === "number") {
      sourceMetadata.latestPostCommentCount = latestPost.comments_count;
    }
  }
  const observedAt = new Date();
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
