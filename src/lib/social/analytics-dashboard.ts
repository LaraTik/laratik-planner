import {
  parseSocialMetric,
  parseSocialWindow,
  seriesInWindow,
  SOCIAL_METRICS,
  type MetricSeriesPoint,
  type SocialMetric,
  type SocialWindow,
} from "./analytics";
import { getSupportedSocialMetrics } from "./metrics";
import type { SocialPlatform } from "./types";

export type AnalyticsDashboardChannel = {
  id: string;
  platform: Extract<SocialPlatform, "facebook" | "instagram" | "tiktok">;
  accountName: string;
  handle: string | null;
  lastSyncedAt: string | null;
  lastSyncErrorCode: string | null;
  latestProviderErrorCode: string | null;
  series: MetricSeriesPoint[];
};

export type AnalyticsSelection = {
  window: SocialWindow;
  metric: SocialMetric;
  platforms: AnalyticsDashboardChannel["platform"][];
  channelIds: string[];
};

export function filterAnalyticsChannels(
  channels: AnalyticsDashboardChannel[],
  platforms: AnalyticsDashboardChannel["platform"][],
  channelIds: string[],
): AnalyticsDashboardChannel[] {
  const platformFilter = new Set(platforms);
  const channelFilter = new Set(channelIds);
  return channels.filter(
    (channel) =>
      (platformFilter.size === 0 || platformFilter.has(channel.platform)) &&
      (channelFilter.size === 0 || channelFilter.has(channel.id)),
  );
}

export function commonMetricsForChannels(channels: AnalyticsDashboardChannel[]): SocialMetric[] {
  if (channels.length === 0) return [];
  return SOCIAL_METRICS.filter((metric) =>
    channels.every((channel) => getSupportedSocialMetrics(channel.platform).includes(metric)),
  );
}

export function encodeAnalyticsSelection(selection: AnalyticsSelection): string {
  const params = new URLSearchParams();
  params.set("window", String(selection.window));
  params.set("metric", selection.metric);
  if (selection.platforms.length > 0) params.set("platforms", selection.platforms.join(","));
  if (selection.channelIds.length > 0) params.set("channels", selection.channelIds.join(","));
  return params.toString();
}

export function parseAnalyticsSelection(value: string): AnalyticsSelection {
  const params = new URLSearchParams(value);
  const platforms =
    params
      .get("platforms")
      ?.split(",")
      .filter(
        (platform): platform is AnalyticsDashboardChannel["platform"] =>
          platform === "facebook" || platform === "instagram" || platform === "tiktok",
      ) ?? [];
  return {
    window: parseSocialWindow(params.get("window")),
    metric: parseSocialMetric(params.get("metric")),
    platforms,
    channelIds: params.get("channels")?.split(",").filter(Boolean) ?? [],
  };
}

export type ComparisonLine = {
  channelId: string;
  label: string;
  platform: AnalyticsDashboardChannel["platform"];
  values: Array<number | null>;
};

export function buildComparisonSeries(
  channels: AnalyticsDashboardChannel[],
  windowDays: number,
  metric: SocialMetric,
): { dates: string[]; lines: ComparisonLine[] } {
  const windowed = channels.map((channel) => ({
    channel,
    series: seriesInWindow(channel.series, windowDays),
  }));
  const observedDates = [
    ...new Set(windowed.flatMap(({ series }) => series.map((point) => point.metricDate))),
  ].sort();
  const dates: string[] = [];
  const firstDate = observedDates[0];
  const lastDate = observedDates[observedDates.length - 1];
  if (firstDate && lastDate) {
    for (
      let date = new Date(`${firstDate}T00:00:00Z`);
      date <= new Date(`${lastDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      dates.push(date.toISOString().slice(0, 10));
    }
  }
  return {
    dates,
    lines: windowed.map(({ channel, series }) => {
      const values = new Map(
        series.map((point) => [point.metricDate, point[metric] as number | null]),
      );
      return {
        channelId: channel.id,
        label: channel.accountName,
        platform: channel.platform,
        values: dates.map((date) => values.get(date) ?? null),
      };
    }),
  };
}
