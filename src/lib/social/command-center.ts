import {
  calculateEngagementRate,
  calculateGrowth,
  type EngagementRate,
  type Growth,
  type MetricSeriesPoint,
} from "./analytics";
import type { SocialPlatform } from "./types";

export type CommandCenterChannel = {
  id: string;
  platform: Extract<SocialPlatform, "facebook" | "instagram" | "tiktok">;
  accountName: string;
  lastSyncedAt: Date | null;
  lastSyncErrorCode: string | null;
  latestProviderErrorCode: string | null;
  series: MetricSeriesPoint[];
};

export type CommandCenterHealth = {
  healthy: number;
  degraded: number;
  stalled: number;
};

export type CommandCenterTrendPoint = {
  metricDate: string;
  followerCount: number | null;
  reach: number | null;
  views: number | null;
  interactions: number | null;
  partial: boolean;
};

export type CommandCenterLeader = {
  id: string;
  platform: CommandCenterChannel["platform"];
  accountName: string;
  interactions: number | null;
  views: number | null;
};

export type CommandCenterChannelPerformance = CommandCenterLeader & {
  followers: number | null;
  reach: number | null;
};

export type CommandCenterAccountHealth = {
  id: string;
  platform: CommandCenterChannel["platform"];
  accountName: string;
  status: keyof CommandCenterHealth;
  lastSyncedAt: Date | null;
};

export type CommandCenterPost = {
  id: string;
  channelId: string;
  platform: CommandCenterChannel["platform"];
  accountName: string;
  permalink: string | null;
  /**
   * Provider-hosted preview image, or null when the provider returned none
   * (and for every row written before the column existed). The UI must render
   * a branded placeholder instead of assuming a URL.
   */
  thumbnailUrl: string | null;
  /** Post text as the provider exposes it, or null. */
  caption: string | null;
  publishedAt: Date | null;
  mediaType: "image" | "video" | "carousel" | "reel" | "story" | "unknown";
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  interactions: number | null;
  durationSeconds: number | null;
};

export type CommandCenterBestTime = {
  dayOfWeek: number;
  hour: number;
  sampleSize: number;
  averageViews: number;
  reliable: boolean;
};

export type CommandCenterTimeSlot = CommandCenterBestTime;

export type CommandCenterLengthBandKey = "under15" | "15to30" | "30to60" | "over60";

export type CommandCenterLengthBand = {
  key: CommandCenterLengthBandKey;
  sampleSize: number;
  averageViews: number;
  medianViews: number;
  relativePerformance: number;
  reliable: boolean;
};

export type CommandCenterContent = {
  sampleSize: number;
  averageViews: number | null;
  posts: Array<CommandCenterPost & { outlierScore: number | null }>;
  topPosts: Array<CommandCenterPost & { outlierScore: number | null }>;
  outliers: Array<CommandCenterPost & { outlierScore: number | null }>;
  bestTime: CommandCenterBestTime | null;
  timeSlots: CommandCenterTimeSlot[];
  lengthBands: CommandCenterLengthBand[];
};

export type CommandCenterSummary = {
  channelCount: number;
  channelsWithData: number;
  currentFollowers: number | null;
  followerGrowth: Growth;
  currentReach: number | null;
  currentViews: number | null;
  currentInteractions: number | null;
  engagementRate: EngagementRate;
  latestMetricDate: string | null;
  lastSyncedAt: Date | null;
  health: CommandCenterHealth;
  partial: boolean;
  trend: CommandCenterTrendPoint[];
  leaders: CommandCenterLeader[];
  channelPerformance: CommandCenterChannelPerformance[];
  accountHealth: CommandCenterAccountHealth[];
  content: CommandCenterContent;
};

const WINDOW_DAYS = 30;
const STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000;
/** Three observations keeps planning signals useful without overfitting one post. */
export const COMMAND_CENTER_MIN_SIGNAL_SAMPLE_SIZE = 3;

/**
 * The timing heatmap renders six three-hour rows (06:00, 09:00 … 21:00).
 * Bucketing happens HERE, in the domain, rather than in the component,
 * because the previous design keyed slots by the EXACT published hour
 * (`dayOfWeek:hour`) while the grid only drew those six rows. A post
 * published at 14:23 produced a slot at hour 14 that no row could ever
 * render, so the heatmap came out blank even with a full history of
 * observations — and the same mismatch silently emptied `bestTime`.
 *
 * Bucketing to the band fixes both: every observation now lands in a
 * cell the grid draws, and samples per band rise fast enough for
 * `COMMAND_CENTER_MIN_SIGNAL_SAMPLE_SIZE` to be reachable on real
 * workspaces (exact hours almost never reach 3 same-hour posts).
 */
export const COMMAND_CENTER_TIME_BAND_HOURS = [6, 9, 12, 15, 18, 21] as const;

/**
 * Map an exact hour to its heatmap band start hour. Hours before the
 * first band (00:00–05:59) fold into the 06:00 band rather than being
 * dropped, so no observation is silently discarded.
 */
export function toTimeBandHour(hour: number): number {
  const first: number = COMMAND_CENTER_TIME_BAND_HOURS[0];
  if (hour < first) return first;
  let band = first;
  for (const candidate of COMMAND_CENTER_TIME_BAND_HOURS) {
    if (hour >= candidate) band = candidate;
  }
  return band;
}

function classifyHealth(channel: CommandCenterChannel, now: Date): keyof CommandCenterHealth {
  if (channel.lastSyncErrorCode || channel.latestProviderErrorCode) return "degraded";
  if (
    !channel.lastSyncedAt ||
    now.getTime() - channel.lastSyncedAt.getTime() > STALE_THRESHOLD_MS
  ) {
    return "stalled";
  }
  return "healthy";
}

function latestValue(series: MetricSeriesPoint[], field: keyof MetricSeriesPoint): number | null {
  const point = [...series].reverse().find((row) => typeof row[field] === "number");
  const value = point?.[field];
  return typeof value === "number" ? value : null;
}

function sumKnown(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function timeParts(date: Date, timezone: string): { dayOfWeek: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday ?? "");
  return {
    dayOfWeek: dayOfWeek === -1 ? 0 : dayOfWeek,
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
  };
}

function lengthBandKey(durationSeconds: number): CommandCenterLengthBandKey {
  if (durationSeconds < 15) return "under15";
  if (durationSeconds < 30) return "15to30";
  if (durationSeconds < 60) return "30to60";
  return "over60";
}

function buildCommandCenterContent(
  observations: CommandCenterPost[],
  timezone: string,
): CommandCenterContent {
  const ranked = observations.flatMap((post) => {
    const fallbackInteractions =
      post.likes !== null || post.comments !== null
        ? (post.likes ?? 0) + (post.comments ?? 0)
        : null;
    const score = post.views ?? post.interactions ?? fallbackInteractions;
    return score === null ? [] : [{ ...post, score }];
  });
  const viewRows = ranked.filter((post): post is (typeof ranked)[number] & { views: number } => {
    return typeof post.views === "number";
  });
  const averageViews =
    viewRows.length > 0
      ? viewRows.reduce((sum, post) => sum + post.views, 0) / viewRows.length
      : null;
  const averageScore =
    ranked.length > 0 ? ranked.reduce((sum, post) => sum + post.score, 0) / ranked.length : null;
  const withScores = ranked
    .map((post) => ({
      ...post,
      outlierScore: averageScore && averageScore > 0 ? post.score / averageScore : null,
    }))
    .sort(
      (a, b) =>
        b.score - a.score || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  const timeBuckets = new Map<string, { dayOfWeek: number; hour: number; views: number[] }>();
  for (const post of ranked) {
    if (!post.publishedAt || post.views === null) continue;
    const { dayOfWeek, hour } = timeParts(post.publishedAt, timezone);
    // Bucket to the heatmap band start hour so the rendered grid and the
    // data share one definition (see COMMAND_CENTER_TIME_BAND_HOURS).
    const bandHour = toTimeBandHour(hour);
    const key = `${dayOfWeek}:${bandHour}`;
    const bucket = timeBuckets.get(key) ?? { dayOfWeek, hour: bandHour, views: [] };
    bucket.views.push(post.views);
    timeBuckets.set(key, bucket);
  }
  const timeSlots = [...timeBuckets.values()]
    .map((bucket) => ({
      dayOfWeek: bucket.dayOfWeek,
      hour: bucket.hour,
      sampleSize: bucket.views.length,
      averageViews: bucket.views.reduce((sum, value) => sum + value, 0) / bucket.views.length,
      reliable: bucket.views.length >= COMMAND_CENTER_MIN_SIGNAL_SAMPLE_SIZE,
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);
  const bestTime =
    [...timeSlots]
      .filter((bucket) => bucket.reliable)
      .sort((a, b) => b.averageViews - a.averageViews || b.sampleSize - a.sampleSize)[0] ?? null;

  const bands = new Map<CommandCenterLengthBandKey, number[]>();
  for (const post of ranked) {
    if (typeof post.durationSeconds !== "number" || post.views === null) continue;
    const key = lengthBandKey(post.durationSeconds);
    const values = bands.get(key) ?? [];
    values.push(post.views);
    bands.set(key, values);
  }
  const lengthBands = [...bands.entries()]
    .map(([key, values]) => ({
      key,
      sampleSize: values.length,
      averageViews: values.reduce((sum, value) => sum + value, 0) / values.length,
      medianViews: median(values),
      relativePerformance:
        averageViews && averageViews > 0
          ? values.reduce((sum, value) => sum + value, 0) / values.length / averageViews
          : 0,
      reliable: values.length >= COMMAND_CENTER_MIN_SIGNAL_SAMPLE_SIZE,
    }))
    .sort((a, b) => b.averageViews - a.averageViews);

  return {
    sampleSize: ranked.length,
    averageViews,
    posts: withScores,
    topPosts: withScores.slice(0, 5),
    outliers: withScores.filter((post) => (post.outlierScore ?? 0) >= 3).slice(0, 5),
    bestTime,
    timeSlots,
    lengthBands,
  };
}

function aggregateTrend(
  channels: CommandCenterChannel[],
  windowDays: number,
): CommandCenterTrendPoint[] {
  const byDate = new Map<string, CommandCenterTrendPoint>();
  for (const channel of channels) {
    for (const point of channel.series.slice(-Math.max(1, Math.floor(windowDays)))) {
      const current = byDate.get(point.metricDate) ?? {
        metricDate: point.metricDate,
        followerCount: null,
        reach: null,
        views: null,
        interactions: null,
        partial: false,
      };
      current.followerCount = sumKnown([current.followerCount, point.followerCount]);
      current.reach = sumKnown([current.reach, point.reach]);
      current.views = sumKnown([current.views, point.views]);
      current.interactions = sumKnown([current.interactions, point.interactions]);
      current.partial ||= point.partial === true;
      byDate.set(point.metricDate, current);
    }
  }
  return [...byDate.values()].sort((a, b) => a.metricDate.localeCompare(b.metricDate));
}

export function buildCommandCenterSummary(
  channels: CommandCenterChannel[],
  now: Date = new Date(),
  postObservations: CommandCenterPost[] = [],
  timezone = "UTC",
  windowDays = COMMAND_CENTER_WINDOW_DAYS,
): CommandCenterSummary {
  const trend = aggregateTrend(channels, windowDays);
  const metricSeries: MetricSeriesPoint[] = trend.map((point) => ({
    ...point,
    engagedAccounts: null,
  }));
  const channelPerformance = channels
    .map((channel) => ({
      id: channel.id,
      platform: channel.platform,
      accountName: channel.accountName,
      followers: latestValue(channel.series, "followerCount"),
      reach: latestValue(channel.series, "reach"),
      interactions: latestValue(channel.series, "interactions"),
      views: latestValue(channel.series, "views"),
    }))
    .filter(
      (channel) =>
        channel.followers !== null ||
        channel.reach !== null ||
        channel.interactions !== null ||
        channel.views !== null,
    )
    .sort(
      (a, b) =>
        (b.views ?? b.interactions ?? b.reach ?? -1) - (a.views ?? a.interactions ?? a.reach ?? -1),
    );
  const accountHealth = channels.map((channel) => ({
    id: channel.id,
    platform: channel.platform,
    accountName: channel.accountName,
    status: classifyHealth(channel, now),
    lastSyncedAt: channel.lastSyncedAt,
  }));
  const latest = trend[trend.length - 1];
  const health = channels.reduce<CommandCenterHealth>(
    (counts, channel) => {
      counts[classifyHealth(channel, now)] += 1;
      return counts;
    },
    { healthy: 0, degraded: 0, stalled: 0 },
  );
  const lastSyncedAt = channels.reduce<Date | null>((latestSync, channel) => {
    if (!channel.lastSyncedAt) return latestSync;
    return !latestSync || channel.lastSyncedAt > latestSync ? channel.lastSyncedAt : latestSync;
  }, null);

  return {
    channelCount: channels.length,
    channelsWithData: channels.filter((channel) => channel.series.length > 0).length,
    currentFollowers: latest?.followerCount ?? null,
    followerGrowth: calculateGrowth(metricSeries),
    currentReach: latest?.reach ?? null,
    currentViews: latest?.views ?? null,
    currentInteractions: latest?.interactions ?? null,
    engagementRate: calculateEngagementRate(metricSeries),
    latestMetricDate: latest?.metricDate ?? null,
    lastSyncedAt,
    health,
    partial: trend.some((point) => point.partial) || health.degraded > 0 || health.stalled > 0,
    trend,
    leaders: channelPerformance.slice(0, 5),
    channelPerformance: channelPerformance.slice(0, 5),
    accountHealth,
    content: buildCommandCenterContent(postObservations, timezone),
  };
}

export const COMMAND_CENTER_WINDOW_DAYS = WINDOW_DAYS;
