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
  RefreshedCredentials,
  SocialProviderAdapter,
  SocialPostObservation,
  SocialSourceMetadata,
} from "@/lib/social/types";
import type { MetricStatus, SocialMetric } from "@/lib/social/metrics";
import {
  acquirePageAccessToken,
  discoverMetaPages,
  exchangeShortLivedForLongLivedToken,
  graphBaseUrl,
  resolveGraphVersion,
} from "./meta-connection";
import {
  fetchMetaFacebookPostObservations,
  fetchMetaIgAccountDailyInsights,
  fetchMetaInstagramPostObservations,
  fetchMetaPageDailyInsights,
  statusForInsight,
  type MetaDailyInsights,
  type MetaInsightsError,
  type MetaInstagramMediaSummary,
} from "./meta-insights";
export * from "./meta-connection";
export * from "./meta-publication-reads";
export {
  fetchMetaIgAccountDailyInsights,
  fetchMetaPageDailyInsights,
  probeMetaRecentFacebookPagePostInsights,
  probeMetaRecentInstagramMediaInsights,
} from "./meta-insights";
export type {
  FetchMetaInsightsResult,
  MetaDailyInsights,
  MetaInsightsError,
  MetaMediaInsightMetricStatus,
  MetaMediaInsightProbe,
} from "./meta-insights";

/**
 * M2 — Meta (Facebook Login for Business) provider adapter.
 *
 * Implements the four-method `SocialProviderAdapter` contract from
 * `src/lib/social/types.ts`. The Meta provider is the first production
 * adapter; TikTok ships in M4.
 *
 * Safety properties concentrated in this file:
 *
 *   - Connection scopes, OAuth token exchanges, and managed Page discovery
 *     live in `meta-connection.ts`; publication history reads live in
 *     `meta-publication-reads.ts`; provider insight reads and bounded post
 *     observations live in `meta-insights.ts`; this file composes account
 *     snapshots and owns the provider adapter.
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
 *     and defaults to `v26.0` when that optional field is empty.
 */

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

type IgMediaSummary = MetaInstagramMediaSummary;

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
   * most recent post. Each post carries identity, basic
   * engagement, video duration, caption and thumbnail — all
   * requested on this one account call, so the bounded
   * post-observation slice needs no extra round trip.
   */
  media?: {
    data: IgMediaSummary[];
  };
};

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
  let insightsErrorMessage: string | null = null;
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
    insightsErrorMessage = isSocialProviderError(insightsErr) ? insightsErr.providerMessage : null;
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
      ...(e.providerMessage ? { providerMessage: e.providerMessage } : {}),
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
      insightsErrorMessage = firstBlockingError.providerMessage;
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
      if (insightsErrorMessage) {
        sourceMetadata.providerErrorMessage = insightsErrorMessage;
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
    "followers_count,media_count,follows_count,username,name,media.limit(10){id,like_count,comments_count,permalink,timestamp,media_type,media_product_type,video_duration,caption,thumbnail_url}",
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
  let insightsErrorMessage: string | null = null;
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
    insightsErrorMessage = first.providerMessage;
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
      if (insightsErrorMessage) {
        sourceMetadata.providerErrorMessage = insightsErrorMessage;
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
