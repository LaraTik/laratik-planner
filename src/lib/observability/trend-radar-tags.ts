import { getRequestId } from "@/lib/observability/request-context";
import { captureError as baseCaptureError } from "@/lib/observability/sentry";

/**
 * Trend Radar — Sentry tags + capture helper.
 *
 * Per the plan §25, every Trend Radar surface error should land in
 * Sentry with the following tags so the on-call view can filter by
 * capability, platform, source, and the cumulative cost in cents:
 *
 *   capability=trend_radar
 *   platform={x | tiktok | youtube | …}
 *   source={tiktok_tamnd | youtube | …}
 *   costCents={integer}
 *
 * Privacy: this module never touches the trend label, source URL,
 * raw payload, or any other personally-identifying field. The
 * `extra` payload carries only the actor id + workspace id (already
 * known quantities for the audit log).
 *
 * The Next.js app does not have a `prometheus_client` runtime
 * dependency; the four named metrics
 * (`ai_trend_signals_total`, `ai_trend_extraction_duration_seconds`,
 * `ai_trend_cost_cents_total`, `ai_trend_source_status`) live in the
 * Python sidecar at `app.observability`. They share the same
 * `capability=trend_radar` tag so a Grafana panel pivoted on
 * `capability` shows both surfaces side-by-side.
 */

export const TREND_RADAR_CAPABILITY = "trend_radar" as const;

export type TrendRadarTags = {
  capability: typeof TREND_RADAR_CAPABILITY;
  platform: string;
  source: string;
  costCents: number;
};

export function buildTrendRadarTags(input: {
  platform: string;
  source: string;
  costCents?: number;
}): TrendRadarTags {
  return {
    capability: TREND_RADAR_CAPABILITY,
    platform: input.platform,
    source: input.source,
    costCents: Math.max(0, Math.trunc(input.costCents ?? 0)),
  };
}

/**
 * Capture a Trend Radar error with the canonical tag set. The
 * signature mirrors `captureError` from `@/lib/observability/sentry`
 * so existing callers can swap one-for-one.
 *
 * @param scope   Short scope tag (e.g. `'trends.source.test'`).
 *                Becomes a Sentry tag `scope` AND the log `event`.
 * @param err     The thrown value or error to report.
 * @param tags    The Trend Radar tag set (platform + source + costCents).
 *                `capability=trend_radar` is always set automatically.
 * @param ctx     Optional context map. Goes into both Sentry `extra`
 *                and the JSON log line. Sensitive keys are redacted
 *                by the logger.
 */
export function captureTrendRadarError(
  scope: string,
  err: unknown,
  tags: { platform: string; source: string; costCents?: number },
  ctx: Record<string, unknown> = {},
): void {
  const full = buildTrendRadarTags(tags);
  const requestId = getRequestId();
  // The base captureError attaches `scope` and `requestId` to the
  // Sentry tags. We pass the Trend Radar tags through `ctx` so the
  // base call doesn't drop them; the Sentry SDK's `extra` payload
  // is searchable in the issue view's "Additional Data" section.
  baseCaptureError(scope, err, { ...ctx, trendRadarTags: full, requestId });
}
