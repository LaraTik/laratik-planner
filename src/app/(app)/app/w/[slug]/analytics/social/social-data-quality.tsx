import {
  getSupportedSocialMetrics,
  resolveMetricStatus,
  type SocialMetric,
  type SocialSourceMetadata,
} from "@/lib/social/metrics";
import type { SocialPlatform } from "@/lib/social/types";

type MetricValues = Partial<Record<SocialMetric, number | null>>;

export function SocialDataQuality({
  platform,
  values,
  sourceMetadata,
  labels,
}: {
  platform: SocialPlatform;
  values: MetricValues;
  sourceMetadata?: SocialSourceMetadata | null;
  labels: {
    partial: string;
    metrics: string;
    unavailableReason: string;
    metricLabels: Record<SocialMetric, string>;
    statusLabels: { error: string; noData: string };
  };
}) {
  const supported = getSupportedSocialMetrics(platform);
  const statuses = supported.map((metric) => ({
    metric,
    status: resolveMetricStatus({
      platform,
      metric,
      value: values[metric] ?? null,
      sourceMetadata,
    }),
  }));
  const availableCount = statuses.filter(({ status }) => status.status === "available").length;
  const missing = statuses.filter(({ status }) => status.status !== "available");
  const isPartial = sourceMetadata?.partial === true || missing.length > 0;
  if (!isPartial) return null;

  return (
    <aside
      className="border-warning/30 bg-warning/5 text-warning rounded-md border px-3 py-2"
      data-testid="social-data-quality"
      aria-live="polite"
    >
      <p className="text-label font-semibold">
        {labels.partial} · {availableCount}/{supported.length} {labels.metrics}
      </p>
      {missing.length > 0 ? (
        <p className="text-label mt-0.5">
          {labels.unavailableReason}:{" "}
          {missing
            .map(
              ({ metric, status }) =>
                `${labels.metricLabels[metric]} (${status.status === "error" ? labels.statusLabels.error : labels.statusLabels.noData})`,
            )
            .join(", ")}
        </p>
      ) : null}
    </aside>
  );
}
