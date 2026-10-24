import "server-only";
import {
  isSocialProviderError,
  providerRequest,
  SocialProviderError,
  type MetaRateLimitUsage,
} from "@/lib/social/http";
import { normalizeMetaPublication } from "@/lib/social/meta-publications";
import { blankToNull, httpsOrNull } from "@/lib/social/media-fields";
import type { MetricStatus } from "@/lib/social/metrics";
import type { SocialPostObservation, SocialSourceMetadata } from "@/lib/social/types";
import { graphBaseUrl, resolveGraphVersion } from "./meta-connection";

export type MetaInstagramMediaSummary = {
  id: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
  video_duration?: number;
  /**
   * Post text and preview image. Both ride along on the SAME account
   * request as the engagement fields, so they cost no extra round trip —
   * the earlier "fetched on demand" note only applies to per-media
   * `/{media-id}` calls.
   */
  caption?: string;
  thumbnail_url?: string;
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
  providerMessage?: string;
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
  providerMessage: string | null;
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
      providerMessage: null,
      usage,
    };
  } catch (err) {
    if (isSocialProviderError(err)) {
      return {
        value: null,
        errorCode: err.code,
        requestId: err.requestId,
        providerMessage: err.providerMessage,
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
      providerMessage: null,
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
                ...(result.providerMessage ? { providerMessage: result.providerMessage } : {}),
              }
            : result.errorCode === "metric_unavailable"
              ? {
                  status: "unsupported",
                  providerErrorCode: result.errorCode,
                  ...(result.providerMessage ? { providerMessage: result.providerMessage } : {}),
                }
              : result.errorCode
                ? {
                    status: "error",
                    providerErrorCode: result.errorCode,
                    ...(result.requestId ? { providerRequestId: result.requestId } : {}),
                    ...(result.providerMessage ? { providerMessage: result.providerMessage } : {}),
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
 * the legacy post-impression metrics in Graph API v26.0 and later; keep the
 * replacement viewer metrics opt-in until a real Page proves the response and
 * permissions.
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
                ...(result.providerMessage ? { providerMessage: result.providerMessage } : {}),
              }
            : result.errorCode === "metric_unavailable"
              ? {
                  status: "unsupported",
                  providerErrorCode: result.errorCode,
                  ...(result.providerMessage ? { providerMessage: result.providerMessage } : {}),
                }
              : result.errorCode
                ? {
                    status: "error",
                    providerErrorCode: result.errorCode,
                    ...(result.requestId ? { providerRequestId: result.requestId } : {}),
                    ...(result.providerMessage ? { providerMessage: result.providerMessage } : {}),
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
export async function fetchMetaInstagramPostObservations(args: {
  media: MetaInstagramMediaSummary[];
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
        thumbnailUrl: httpsOrNull(item.thumbnail_url),
        caption: blankToNull(item.caption),
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
  /** Post text. Facebook calls this `message`. */
  message?: unknown;
  /** Page-post preview image. */
  full_picture?: unknown;
  attachments?: { data?: Array<{ media_type?: unknown; thumbnail_url?: unknown }> };
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
export async function fetchMetaFacebookPostObservations(args: {
  pageId: string;
  accessToken: string;
  apiVersion: string;
  observedAt: Date;
}): Promise<SocialPostObservation[]> {
  const url = new URL(`${graphBaseUrl(args.apiVersion)}/${args.pageId}/feed`);
  url.searchParams.set(
    "fields",
    "id,created_time,permalink_url,status_type,message,full_picture,attachments{media_type,thumbnail_url},reactions.limit(0).summary(true),comments.limit(0).summary(true),shares",
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
        // A page post has no media object of its own; the preview image
        // lives on the attachment, with `full_picture` as the fallback.
        thumbnailUrl:
          httpsOrNull(item.attachments?.data?.[0]?.thumbnail_url) ?? httpsOrNull(item.full_picture),
        caption: blankToNull(item.message),
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

export type MetaInsightsError = {
  metric: "reach" | "views" | "engagedAccounts" | "interactions";
  code: SocialProviderError["code"];
  requestId: string | null;
  providerMessage: string | null;
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

export function statusForInsight(
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
        ...(error.providerMessage ? { providerMessage: error.providerMessage } : {}),
      };
    }
    return {
      status: "error",
      providerErrorCode: error.code,
      ...(error.requestId ? { providerRequestId: error.requestId } : {}),
      ...(error.providerMessage ? { providerMessage: error.providerMessage } : {}),
    };
  }
  return { status: value === null ? "no_data" : "available" };
}

const PAGE_INSIGHTS_METRICS = [
  // Meta deprecated `page_impressions_unique` in Graph API v26.0 and later.
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
      errors.push({
        metric: r.field,
        code: r.errorCode,
        requestId: r.requestId,
        providerMessage: r.providerMessage,
      });
    }
    if (r.usage.app || r.usage.business) {
      latestUsage = r.usage;
    }
  }
  return { insights, errors, usage: latestUsage };
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
      errors.push({
        metric: r.field,
        code: r.errorCode,
        requestId: r.requestId,
        providerMessage: r.providerMessage,
      });
    }
    if (r.usage.app || r.usage.business) {
      latestUsage = r.usage;
    }
  }
  return { insights, errors, usage: latestUsage };
}
