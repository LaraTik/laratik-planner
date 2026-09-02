import type { SocialPlatform } from "./types";

/**
 * The normalized fields remain provider-neutral, but their availability is
 * platform-specific. Keep this registry as the single source of truth for
 * providers, calculations, tables, and exports.
 */
export const UNIVERSAL_SOCIAL_METRICS = [
  "followerCount",
  "reach",
  "views",
  "interactions",
] as const;

export const SOCIAL_METRIC_CAPABILITIES = {
  facebook: UNIVERSAL_SOCIAL_METRICS,
  instagram: [...UNIVERSAL_SOCIAL_METRICS, "engagedAccounts"],
  tiktok: ["followerCount"],
} as const satisfies Record<SocialPlatform, readonly string[]>;

export type SocialMetric =
  (typeof SOCIAL_METRIC_CAPABILITIES)[keyof typeof SOCIAL_METRIC_CAPABILITIES][number];

export type MetricAvailability = "available" | "unsupported" | "error" | "no_data";

export type MetricStatus = {
  status: MetricAvailability;
  providerErrorCode?: string;
  providerRequestId?: string;
};

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue | undefined };

export type SocialSourceMetadata = {
  schemaVersion?: number;
  partial?: boolean;
  reason?: string;
  failedMetrics?: SocialMetric[];
  metricStatuses?: Partial<Record<SocialMetric, MetricStatus>>;
  providerErrorCode?: string;
  providerRequestId?: string;
  [key: string]: JsonValue | undefined;
};

export function resolveMetricStatus(args: {
  platform: SocialPlatform;
  metric: SocialMetric;
  value: number | null;
  sourceMetadata?: SocialSourceMetadata | null | undefined;
}): MetricStatus {
  if (!isSocialMetricSupported(args.platform, args.metric)) {
    return { status: "unsupported" };
  }

  const stored = args.sourceMetadata?.metricStatuses?.[args.metric];
  if (stored) return stored;

  return { status: args.value === null ? "no_data" : "available" };
}

export function getUniversalSocialMetrics(): readonly SocialMetric[] {
  return UNIVERSAL_SOCIAL_METRICS;
}

export function getSupportedSocialMetrics(platform: SocialPlatform): readonly SocialMetric[] {
  return SOCIAL_METRIC_CAPABILITIES[platform];
}

export function isSocialMetricSupported(
  platform: SocialPlatform,
  metric: string,
): metric is SocialMetric {
  return getSupportedSocialMetrics(platform).includes(metric as SocialMetric);
}

export function resolveSocialMetric(
  value: string | null | undefined,
  platform: SocialPlatform,
): SocialMetric {
  if (isSocialMetricSupported(platform, value ?? "")) {
    return value as SocialMetric;
  }

  return getSupportedSocialMetrics(platform)[0] ?? "followerCount";
}
