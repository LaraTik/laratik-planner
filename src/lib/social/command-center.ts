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

/** Which denominator an account's engagement rate was computed from. */
export type CommandCenterRateDenominator = "reach" | "followers";

/**
 * One account's engagement rate over the analysis window.
 *
 * The rate is the ONLY basis "Strongest accounts" ranks and displays. An
 * earlier version ranked on `views ?? interactions ?? reach` per row while
 * rendering `interactions ?? views`, so the row order and the printed number
 * were computed in opposite precedence: an account with views=100 and
 * interactions=2 outranked one with views=null and interactions=50 and then
 * printed 2 above 50. Comparing Instagram (which reports views) against a
 * Facebook Page (which does not) mixed two different quantities in one column.
 *
 * `denominator` is carried so the UI can name the basis it actually used
 * instead of implying a single fixed one.
 */
export type CommandCenterAccountRate = {
  /** interactions ÷ denominator as a percentage, or null when not computable. */
  percent: number | null;
  denominator: CommandCenterRateDenominator | null;
  /** Interactions summed across the window — the numerator. */
  interactions: number | null;
  /** The summed denominator the rate divided by. */
  denominatorValue: number | null;
  /** Metric days that contributed to the sums. */
  daysObserved: number;
  /** Last metric date that contributed, so the UI can state the window. */
  metricDate: string | null;
};

export type CommandCenterLeader = {
  id: string;
  platform: CommandCenterChannel["platform"];
  accountName: string;
  /** The single ranking AND display basis for the row. */
  rate: CommandCenterAccountRate;
};

export type CommandCenterChannelPerformance = {
  id: string;
  platform: CommandCenterChannel["platform"];
  accountName: string;
  followers: number | null;
  reach: number | null;
  views: number | null;
  interactions: number | null;
  rate: CommandCenterAccountRate;
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

/**
 * How much weight a recommendation can carry.
 *
 * `low`   — at or just above the three-post gate; a hypothesis to test.
 * `early` — enough posts to see a pattern.
 * `good`  — enough posts to act on without hedging.
 */
export type CommandCenterConfidence = "low" | "early" | "good";

export type CommandCenterBestTime = {
  dayOfWeek: number;
  hour: number;
  sampleSize: number;
  averageViews: number;
  reliable: boolean;
  /**
   * `averageViews ÷ overall averageViews`, or null when the workspace has no
   * baseline. This is what separates a real recommendation from a slot that
   * merely has the highest number — a slot 2% above average is not actionable
   * however many posts it has.
   */
  liftRatio: number | null;
  /** Sample-size tier, downgraded when the lift is marginal. */
  confidence: CommandCenterConfidence | null;
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
 * Sample sizes at which a timing recommendation earns the next confidence
 * tier. Deliberately high relative to the three-post gate: with seven days and
 * six bands there are 42 cells, so a young workspace will live at `low` for a
 * while. That is the honest state, and the UI now says so instead of
 * presenting three posts as a finding.
 */
export const COMMAND_CENTER_CONFIDENCE_SAMPLE_THRESHOLDS = { good: 8, early: 5 } as const;

/**
 * How far above the workspace average a slot must sit to count as signal
 * rather than noise. Below this the tier drops one step regardless of n.
 */
export const COMMAND_CENTER_MIN_SIGNALING_LIFT = 1.15;

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

/**
 * Aggregate one account's series over the analysis window.
 *
 * Followers are a STOCK and must not be summed — adding five daily snapshots
 * inflates the number fivefold. Reach, views and interactions are FLOWS, so
 * they sum. `latestValue` previously fed the "Strongest accounts" panel a
 * single day's figures while the panel header named a month, which is the same
 * page/panel contradiction ADR 0017 was written to remove.
 */
function windowAggregate(series: MetricSeriesPoint[]): {
  followers: number | null;
  reach: number | null;
  views: number | null;
  interactions: number | null;
  daysObserved: number;
  metricDate: string | null;
} {
  return {
    followers: latestValue(series, "followerCount"),
    reach: sumKnown(series.map((point) => point.reach)),
    views: sumKnown(series.map((point) => point.views)),
    interactions: sumKnown(series.map((point) => point.interactions)),
    daysObserved: series.length,
    metricDate: series.at(-1)?.metricDate ?? null,
  };
}

/**
 * Engagement rate for one account over the window. Reach is the preferred
 * denominator (the people actually exposed); followers is the fallback that
 * keeps Facebook and TikTok meaningful. A zero denominator yields null rather
 * than Infinity or 0, matching `calculateEngagementRate`.
 */
function accountEngagementRate(
  aggregate: ReturnType<typeof windowAggregate>,
): CommandCenterAccountRate {
  const { interactions } = aggregate;
  const denominator =
    aggregate.reach !== null && aggregate.reach > 0
      ? { name: "reach" as const, value: aggregate.reach }
      : aggregate.followers !== null && aggregate.followers > 0
        ? { name: "followers" as const, value: aggregate.followers }
        : null;
  return {
    percent: interactions !== null && denominator ? (interactions / denominator.value) * 100 : null,
    denominator: denominator?.name ?? null,
    interactions,
    denominatorValue: denominator?.value ?? null,
    daysObserved: aggregate.daysObserved,
    metricDate: aggregate.metricDate,
  };
}

/**
 * Sample-size tier for a recommendation, downgraded one step when the slot
 * does not clear `COMMAND_CENTER_MIN_SIGNALING_LIFT`. Never goes below "low".
 */
export function commandCenterConfidence(
  sampleSize: number,
  liftRatio: number | null,
): CommandCenterConfidence {
  const { good, early } = COMMAND_CENTER_CONFIDENCE_SAMPLE_THRESHOLDS;
  const tier: CommandCenterConfidence =
    sampleSize >= good ? "good" : sampleSize >= early ? "early" : "low";
  if (liftRatio !== null && liftRatio < COMMAND_CENTER_MIN_SIGNALING_LIFT) {
    return tier === "good" ? "early" : "low";
  }
  return tier;
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
  const timeSlots: CommandCenterTimeSlot[] = [...timeBuckets.values()]
    .map((bucket) => {
      const slotAverageViews =
        bucket.views.reduce((sum, value) => sum + value, 0) / bucket.views.length;
      // Lift is relative to the workspace baseline across ALL posts with views,
      // not just the well-supported ones. Without it the top cell is only a
      // ranking, not a recommendation: a slot 2% above average is not worth
      // acting on however many posts it has.
      const liftRatio =
        averageViews !== null && averageViews > 0 ? slotAverageViews / averageViews : null;
      return {
        dayOfWeek: bucket.dayOfWeek,
        hour: bucket.hour,
        sampleSize: bucket.views.length,
        averageViews: slotAverageViews,
        reliable: bucket.views.length >= COMMAND_CENTER_MIN_SIGNAL_SAMPLE_SIZE,
        liftRatio,
        confidence: commandCenterConfidence(bucket.views.length, liftRatio),
      };
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);
  // The recommendation is the highest-average slot that clears the sample gate.
  // Its lift and tier are already computed above, so the pill and the grid
  // cannot disagree about which cell won or how much weight it carries.
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
  // Every per-account number is aggregated over the SAME window the trend
  // uses, so the two panels cannot disagree about which days they describe.
  const windowed = channels.map((channel) => {
    const aggregate = windowAggregate(channel.series.slice(-Math.max(1, Math.floor(windowDays))));
    return { channel, aggregate, rate: accountEngagementRate(aggregate) };
  });
  const channelPerformance = windowed
    .map(({ channel, aggregate, rate }) => ({
      id: channel.id,
      platform: channel.platform,
      accountName: channel.accountName,
      followers: aggregate.followers,
      reach: aggregate.reach,
      views: aggregate.views,
      interactions: aggregate.interactions,
      rate,
    }))
    .filter(
      (channel) =>
        channel.followers !== null ||
        channel.reach !== null ||
        channel.interactions !== null ||
        channel.views !== null,
    )
    // Ordered by VIEWS, which is the bar length this panel draws, with
    // accounts that report no views last rather than on top. It was previously
    // sorted by the shared `leaders` basis, so re-ranking the strongest
    // accounts silently reordered the channel-performance readout too.
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.interactions! - a.interactions!);
  /**
   * "Strongest accounts" ranks on engagement rate ONLY, and shows the same
   * number it ranked on. Accounts whose rate cannot be computed (no reach and
   * no followers) are excluded rather than shown with an invented zero.
   */
  const leaders = windowed
    .filter(({ rate }) => rate.percent !== null)
    .map(({ channel, rate }) => ({
      id: channel.id,
      platform: channel.platform,
      accountName: channel.accountName,
      rate,
    }))
    .sort(
      (a, b) =>
        (b.rate.percent ?? -1) - (a.rate.percent ?? -1) ||
        (b.rate.interactions ?? -1) - (a.rate.interactions ?? -1),
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
    leaders: leaders.slice(0, 5),
    channelPerformance: channelPerformance.slice(0, 5),
    accountHealth,
    content: buildCommandCenterContent(postObservations, timezone),
  };
}

export const COMMAND_CENTER_WINDOW_DAYS = WINDOW_DAYS;
